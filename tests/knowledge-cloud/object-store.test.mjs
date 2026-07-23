import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTencentCosObjectStore } from "../../server/knowledge-cloud/object-store/tencent-cos.mjs";

const config = {
  secretId: "AKID-server-secret-id-123456",
  secretKey: "server-secret-key-123456",
  bucket: "knowledge-test-1250000000",
  region: "ap-guangzhou",
  uploadGrantTtlSeconds: 900
};

test("COS grants are restricted to one generated object and expose only temporary credentials", async () => {
  const calls = [];
  const sts = {
    getPolicy(scopes) {
      calls.push({ type: "policy", scopes });
      return { version: "2.0", statement: [] };
    },
    async getCredential(options) {
      calls.push({ type: "credential", options });
      return {
        startTime: 100,
        expiredTime: 1000,
        credentials: {
          tmpSecretId: "temporary-id",
          tmpSecretKey: "temporary-key",
          sessionToken: "temporary-token"
        }
      };
    }
  };
  class FakeCos {
    constructor(options) {
      this.options = options;
      calls.push({ type: "cos-client", options });
    }
    getObjectUrl(input, callback) {
      calls.push({ type: "signed-url", input, options: this.options });
      callback(null, {
        Url: `https://${input.Bucket}.cos.${input.Region}.myqcloud.com/${input.Key}?q-signature=temporary-signature&x-cos-security-token=temporary-token`
      });
    }
  }
  const store = createTencentCosObjectStore(config, { sts, CosClient: FakeCos });
  const objectKey = "knowledge/account/base/document/source/opaque";
  const grant = await store.createUploadGrant({ objectKey });

  assert.deepEqual(calls.find((call) => call.type === "policy").scopes, [{
    action: "name/cos:PutObject",
    bucket: config.bucket,
    region: config.region,
    prefix: objectKey
  }]);
  const credentialCall = calls.find((call) => call.type === "credential");
  assert.equal(credentialCall.options.durationSeconds, 900);
  assert.equal(credentialCall.options.secretId, config.secretId);
  assert.equal(grant.objectKey, objectKey);
  assert.equal(grant.credentials.tmpSecretKey, "temporary-key");
  const signedUrlCall = calls.find((call) => call.type === "signed-url");
  assert.deepEqual(signedUrlCall.options, {
    SecretId: "temporary-id",
    SecretKey: "temporary-key",
    SecurityToken: "temporary-token"
  });
  assert.equal(signedUrlCall.input.Key, objectKey);
  assert.equal(signedUrlCall.input.Method, "PUT");
  assert.equal(signedUrlCall.input.Expires, 900);
  assert.match(grant.uploadUrl, new RegExp(`/${objectKey.replaceAll("/", "\\/")}\\?`));
  assert.equal("secretId" in grant, false);
  assert.equal(JSON.stringify(grant).includes(config.secretKey), false);
});

test("COS HEAD and delete normalize authoritative object metadata", async () => {
  const calls = [];
  class FakeCos {
    async headObject(input) {
      calls.push({ type: "head", input });
      return {
        ETag: '"etag-value"',
        VersionId: "version-1",
        headers: {
          "content-length": "128",
          "content-type": "text/plain",
          "x-cos-checksum-sha256": "a".repeat(64)
        }
      };
    }
    async deleteObject(input) {
      calls.push({ type: "delete", input });
      return {};
    }
  }
  const store = createTencentCosObjectStore(config, {
    sts: { getPolicy() {}, getCredential() {} },
    CosClient: FakeCos
  });
  const head = await store.headObject({ objectKey: "exact-key", versionId: "version-1" });
  assert.deepEqual(head, {
    objectKey: "exact-key",
    bytes: 128,
    contentType: "text/plain",
    etag: "etag-value",
    versionId: "version-1",
    checksumSha256: "a".repeat(64)
  });
  await store.deleteObject({ objectKey: "exact-key", versionId: "version-1" });
  assert.equal(calls[0].input.Key, "exact-key");
  assert.equal(calls[1].input.VersionId, "version-1");
});

test("COS source URLs use a bounded signed GET and expose an exact expiry", async () => {
  const calls = [];
  class FakeCos {
    constructor(options) {
      calls.push({ type: "client", options });
    }
    getObjectUrl(input, callback) {
      calls.push({ type: "signed-url", input });
      callback(null, {
        Url: `https://${input.Bucket}.cos.${input.Region}.myqcloud.com/${input.Key}?q-signature=temporary`
      });
    }
  }
  const store = createTencentCosObjectStore(
    { ...config, sourceUrlTtlSeconds: 120 },
    {
      sts: { getPolicy() {}, getCredential() {} },
      CosClient: FakeCos,
      clock: () => new Date("2026-07-22T00:00:00.000Z")
    }
  );
  const signed = await store.createSourceDownloadUrl({
    objectKey: "knowledge/account/base/document/source/opaque",
    versionId: "version-1",
    disposition: "attachment",
    downloadName: "产品手册 O'Reilly.pdf",
    expiresSeconds: 900
  });
  const urlCall = calls.find((call) => call.type === "signed-url");
  assert.equal(urlCall.input.Method, "GET");
  assert.equal(urlCall.input.Query.versionId, "version-1");
  assert.match(urlCall.input.Query["response-content-disposition"], /^attachment; filename\*=UTF-8''/);
  assert.match(urlCall.input.Query["response-content-disposition"], /O%27Reilly\.pdf$/);
  assert.equal(urlCall.input.Expires, 120);
  assert.equal(signed.expiresInSeconds, 120);
  assert.equal(signed.expiresAt, "2026-07-22T00:02:00.000Z");
  assert.equal(JSON.stringify(signed).includes(config.secretKey), false);
});

test("COS worker downloads are file-bounded and normalized artifacts upload from server-only streams", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xi-ai-cos-test-"));
  const destinationPath = path.join(directory, "source.bin");
  const normalizedPath = path.join(directory, "normalized.ndjson");
  const source = Buffer.from("source bytes", "utf8");
  const calls = [];
  class FakeCos {
    async getObject(input) {
      calls.push({ type: "get", input: { ...input, Output: "[stream]" } });
      input.Output.end(source);
      return { ETag: '"source-etag"', VersionId: "source-version" };
    }
    async putObject(input) {
      const chunks = [];
      for await (const chunk of input.Body) chunks.push(chunk);
      calls.push({ type: "put", input: { ...input, Body: Buffer.concat(chunks).toString("utf8") } });
      return { ETag: '"normalized-etag"', VersionId: "normalized-version" };
    }
  }
  const store = createTencentCosObjectStore(config, {
    sts: { getPolicy() {}, getCredential() {} },
    CosClient: FakeCos
  });
  try {
    const downloaded = await store.downloadObjectToFile({
      objectKey: "source-key",
      versionId: "source-version",
      destinationPath,
      maxBytes: source.byteLength
    });
    assert.equal(downloaded.bytes, source.byteLength);
    assert.equal(downloaded.checksumSha256, crypto.createHash("sha256").update(source).digest("hex"));
    assert.deepEqual(await fs.readFile(destinationPath), source);

    await fs.writeFile(normalizedPath, '{"text":"normalized"}\n');
    const uploaded = await store.putObjectFromFile({
      objectKey: "normalized-key",
      filePath: normalizedPath,
      bytes: 22,
      contentType: "application/x-ndjson; charset=utf-8"
    });
    assert.equal(uploaded.etag, "normalized-etag");
    assert.equal(calls[1].input.Key, "normalized-key");
    assert.equal(calls[1].input.Body, '{"text":"normalized"}\n');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("COS failures are typed and omit permanent credentials", async () => {
  class FailingCos {
    async headObject() {
      const error = new Error(`upstream ${config.secretKey}`);
      error.code = "InternalError";
      error.statusCode = 500;
      throw error;
    }
  }
  const store = createTencentCosObjectStore(config, {
    sts: { getPolicy() {}, getCredential() {} },
    CosClient: FailingCos
  });
  await assert.rejects(
    store.headObject({ objectKey: "exact-key" }),
    (error) => {
      assert.equal(error.code, "KB_OBJECT_STORE_UNAVAILABLE");
      assert.equal(error.status, 502);
      assert.equal(JSON.stringify(error.details).includes(config.secretKey), false);
      return true;
    }
  );
});
