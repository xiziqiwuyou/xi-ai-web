import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWLEDGE_NODE_MIN_VERSION,
  assertKnowledgeNodeRuntime,
  knowledgeConfigSecrets,
  loadKnowledgeConfig
} from "../../server/knowledge-cloud/config.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  redactKnowledgeValue,
  toKnowledgeErrorPayload
} from "../../server/knowledge-cloud/errors.mjs";

const validEnvironment = {
  KNOWLEDGE_ENABLED: "true",
  KNOWLEDGE_TOKEN_SECRET: "knowledge-token-secret-0123456789abcdef",
  DATABASE_URL: "postgresql://knowledge:db-password@localhost:5432/knowledge",
  DATABASE_SSL_MODE: "disable",
  COS_SECRET_ID: "AKIDEXAMPLE1234567890",
  COS_SECRET_KEY: "cos-secret-value",
  COS_BUCKET: "knowledge-1250000000",
  COS_REGION: "ap-guangzhou",
  COS_APP_ID: "1250000000",
  PUBLIC_ORIGIN: "https://ai.example.com"
};

test("disabled knowledge ignores database and COS configuration", () => {
  assert.deepEqual(loadKnowledgeConfig({ KNOWLEDGE_ENABLED: "false" }), { enabled: false });
});

test("enabled knowledge validates all required environment fields", () => {
  assert.throws(
    () => loadKnowledgeConfig({ KNOWLEDGE_ENABLED: "true" }),
    (error) =>
      error instanceof KnowledgeError &&
      error.code === KNOWLEDGE_ERROR_CODES.CONFIG_MISSING &&
      error.details.missing.includes("DATABASE_URL") &&
      error.details.missing.includes("COS_SECRET_KEY")
  );
});

test("valid configuration is normalized and keeps secrets out of projections", () => {
  const config = loadKnowledgeConfig(validEnvironment);
  assert.equal(config.enabled, true);
  assert.equal(config.database.poolMax, 10);
  assert.equal(config.cos.appId, "1250000000");
  assert.equal(config.cos.uploadGrantTtlSeconds, 900);
  assert.equal(config.cos.sourceUrlTtlSeconds, 300);
  assert.equal(config.cos.probeEnabled, true);
  assert.equal(config.cos.probeIntervalSeconds, 60);
  assert.equal(config.cos.probeTimeoutMs, 5000);
  assert.equal(config.publicOrigin, "https://ai.example.com");
  assert.equal(config.auth.sessionTtlSeconds, 1209600);
  assert.equal(config.embedding.leaseSeconds, 120);
  assert.equal(config.embedding.requestTimeoutMs, 60000);
  assert.equal(config.retrieval.enhancementTimeoutMs, 15000);
  assert.equal(config.worker.heartbeatIntervalSeconds, 10);
  assert.equal(config.worker.staleAfterSeconds, 45);
  assert.deepEqual(config.ocr, { enabled: false, provider: "disabled" });
  assert.deepEqual(knowledgeConfigSecrets(config), [
    validEnvironment.DATABASE_URL,
    validEnvironment.KNOWLEDGE_TOKEN_SECRET,
    validEnvironment.COS_SECRET_ID,
    validEnvironment.COS_SECRET_KEY
  ]);
});

test("OCR remains opt-in and keeps its server credential in the runtime secret set", () => {
  const configured = loadKnowledgeConfig({
    ...validEnvironment,
    KNOWLEDGE_OCR_ENABLED: "true",
    KNOWLEDGE_OCR_PROVIDER: "http-json-v1",
    KNOWLEDGE_OCR_ENDPOINT: "https://ocr.example.com/v1/recognize",
    KNOWLEDGE_OCR_API_KEY: "ocr-server-secret"
  });
  assert.equal(configured.ocr.enabled, true);
  assert.equal(configured.ocr.provider, "http-json-v1");
  assert.equal(configured.ocr.requestTimeoutMs, 60000);
  assert.equal(configured.ocr.maxOutputBytes, 8 * 1024 * 1024);
  assert(knowledgeConfigSecrets(configured).includes("ocr-server-secret"));

  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_OCR_ENABLED: "true",
      KNOWLEDGE_OCR_PROVIDER: "http-json-v1",
      KNOWLEDGE_OCR_ENDPOINT: "https://ocr.example.com/v1/recognize"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_MISSING &&
      error.details.missing.includes("KNOWLEDGE_OCR_API_KEY")
  );
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_OCR_ENABLED: "true",
      KNOWLEDGE_OCR_PROVIDER: "http-json-v1",
      KNOWLEDGE_OCR_ENDPOINT: "http://192.0.2.10/recognize",
      KNOWLEDGE_OCR_API_KEY: "ocr-server-secret"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID &&
      error.details.field === "KNOWLEDGE_OCR_ENDPOINT"
  );
});

test("embedding request timeout remains shorter than a bounded resumable lease", () => {
  const configured = loadKnowledgeConfig({
    ...validEnvironment,
    KNOWLEDGE_EMBEDDING_LEASE_SECONDS: "180",
    KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS: "45000"
  });
  assert.equal(configured.embedding.leaseSeconds, 180);
  assert.equal(configured.embedding.requestTimeoutMs, 45000);
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_EMBEDDING_LEASE_SECONDS: "10"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID &&
      error.details.field === "KNOWLEDGE_EMBEDDING_LEASE_SECONDS"
  );
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_EMBEDDING_LEASE_SECONDS: "30",
      KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS: "30000"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID &&
      error.details.field === "KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS"
  );
});

test("COS upload grants use a bounded short-lived TTL", () => {
  const configured = loadKnowledgeConfig({
    ...validEnvironment,
    KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS: "600"
  });
  assert.equal(configured.cos.uploadGrantTtlSeconds, 600);
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS: "86400"
    }),
    (error) =>
      error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID &&
      error.details.field === "KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS"
  );
});

test("COS source URLs use a separately bounded short-lived TTL", () => {
  const configured = loadKnowledgeConfig({
    ...validEnvironment,
    KNOWLEDGE_COS_SOURCE_URL_TTL_SECONDS: "90"
  });
  assert.equal(configured.cos.sourceUrlTtlSeconds, 90);
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      KNOWLEDGE_COS_SOURCE_URL_TTL_SECONDS: "3600"
    }),
    (error) =>
      error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID &&
      error.details.field === "KNOWLEDGE_COS_SOURCE_URL_TTL_SECONDS"
  );
});

test("enabled knowledge requires a private token secret and public origin", () => {
  const missingSecret = { ...validEnvironment };
  delete missingSecret.KNOWLEDGE_TOKEN_SECRET;
  assert.throws(
    () => loadKnowledgeConfig(missingSecret),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_MISSING && error.details.missing.includes("KNOWLEDGE_TOKEN_SECRET")
  );

  assert.throws(
    () => loadKnowledgeConfig({ ...validEnvironment, KNOWLEDGE_TOKEN_SECRET: "short" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID && error.details.field === "KNOWLEDGE_TOKEN_SECRET"
  );
});

test("production origins require HTTPS and development HTTP is loopback-only", () => {
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      NODE_ENV: "production",
      DATABASE_SSL_MODE: "verify-full",
      PUBLIC_ORIGIN: "http://127.0.0.1:8787"
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID && error.details.reason === "https_required"
  );
  assert.throws(
    () => loadKnowledgeConfig({ ...validEnvironment, PUBLIC_ORIGIN: "http://192.0.2.10:8787" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID && error.details.reason === "https_required"
  );
  assert.equal(
    loadKnowledgeConfig({ ...validEnvironment, PUBLIC_ORIGIN: "http://127.0.0.1:8787" }).publicOrigin,
    "http://127.0.0.1:8787"
  );
});

test("production database TLS is verified and URL TLS overrides are rejected", () => {
  assert.throws(
    () => loadKnowledgeConfig({ ...validEnvironment, NODE_ENV: "production" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID && error.details.reason === "verified_tls_required"
  );
  const verified = loadKnowledgeConfig({
    ...validEnvironment,
    NODE_ENV: "production",
    DATABASE_SSL_MODE: "verify-full"
  });
  assert.equal(verified.database.tlsVerification, "full");
  assert.throws(
    () => loadKnowledgeConfig({
      ...validEnvironment,
      DATABASE_URL: `${validEnvironment.DATABASE_URL}?sslmode=no-verify`
    }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.CONFIG_INVALID && error.details.parameter === "sslmode"
  );
});

test("knowledge runtime requires Node built-in Argon2id", () => {
  assert.throws(
    () =>
      assertKnowledgeNodeRuntime({
        nodeVersion: "22.0.0",
        cryptoModule: { argon2() {}, argon2Sync() {} }
      }),
    (error) =>
      error.code === KNOWLEDGE_ERROR_CODES.NODE_RUNTIME_UNSUPPORTED &&
      error.details.minimumNode === KNOWLEDGE_NODE_MIN_VERSION
  );
  assert.throws(
    () => assertKnowledgeNodeRuntime({ nodeVersion: "24.15.0", cryptoModule: {} }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.NODE_RUNTIME_UNSUPPORTED
  );
});

test("knowledge error projection redacts structured and inline secrets", () => {
  const secret = "very-secret-api-key";
  const error = new KnowledgeError(KNOWLEDGE_ERROR_CODES.CONFIG_INVALID, "bad config", {
    status: 503,
    details: {
      databaseUrl: "postgresql://user:password@db/knowledge",
      nested: { apiKey: secret },
      upstream: `Bearer ${secret}`
    }
  });
  const payload = toKnowledgeErrorPayload(error, {
    requestId: "request-12345678",
    secrets: [secret]
  });
  const serialized = JSON.stringify(payload);
  assert.equal(payload.status, 503);
  assert.equal(payload.body.error.code, KNOWLEDGE_ERROR_CODES.CONFIG_INVALID);
  assert(!serialized.includes(secret));
  assert(!serialized.includes("password@"));
  assert(serialized.includes("[redacted]"));
  assert.deepEqual(redactKnowledgeValue({ password: "hidden" }), { password: "[redacted]" });
});
