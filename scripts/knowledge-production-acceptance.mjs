import crypto from "node:crypto";

const CHECKS = Object.freeze([
  "readiness",
  "postgres-pgvector",
  "cos-canary",
  "openai-embedding-retrieval-citation",
  "qwen-embedding-retrieval-citation",
  "cleanup",
  "recovery"
]);
const results = [];

function report(status, check, code) {
  const record = { status, check, ...(code ? { code } : {}) };
  results.push(record);
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

class AcceptanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function sanitizedCode(error) {
  return /^[A-Z0-9_:-]{3,80}$/.test(String(error?.code || ""))
    ? String(error.code)
    : "ACCEPTANCE_FAILED";
}

async function main() {
  const originValue = String(process.env.KNOWLEDGE_ACCEPTANCE_ORIGIN || "").trim();
  let origin;
  try {
    origin = new URL(originValue);
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("invalid");
    }
  } catch {
    for (const check of CHECKS) report("SKIP", check, "ACCEPTANCE_ORIGIN_MISSING");
    process.exitCode = 2;
    return;
  }

  const timeoutMs = boundedInteger(process.env.KNOWLEDGE_ACCEPTANCE_TIMEOUT_MS, 120_000, 10_000, 600_000);
  const pollIntervalMs = boundedInteger(process.env.KNOWLEDGE_ACCEPTANCE_POLL_MS, 1_000, 250, 10_000);
  const inviteCode = String(process.env.KNOWLEDGE_ACCEPTANCE_INVITE_CODE || "").trim();
  const providerKeys = {
    openai: String(process.env.KNOWLEDGE_ACCEPTANCE_OPENAI_API_KEY || "").trim(),
    qwen: String(process.env.KNOWLEDGE_ACCEPTANCE_QWEN_API_KEY || "").trim()
  };
  let cookie = "";
  let csrfToken = "";

  async function request(path, { method = "GET", body, csrf = false, expected = [200] } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 30_000));
    try {
      const response = await fetch(new URL(path, origin), {
        method,
        headers: {
          Accept: "application/json",
          Origin: origin.origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-Knowledge-CSRF": csrfToken } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: controller.signal
      });
      const setCookies = response.headers.getSetCookie?.() || [];
      const setCookie = setCookies[0] || response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0];
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new AcceptanceError("RESPONSE_TOO_LARGE");
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { throw new AcceptanceError("INVALID_JSON"); }
      if (!expected.includes(response.status)) {
        throw new AcceptanceError(payload?.error?.code || `HTTP_${response.status}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof AcceptanceError) throw error;
      throw new AcceptanceError(error?.name === "AbortError" ? "REQUEST_TIMEOUT" : "REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }

  async function waitForDocument(baseId, documentId, expectedStatuses) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = await request(`/api/kb/bases/${encodeURIComponent(baseId)}/documents`);
      const document = list?.items?.find((item) => item.id === documentId);
      if (document?.status === "failed") throw new AcceptanceError(document.errorCode || "DOCUMENT_FAILED");
      if (document && expectedStatuses.has(document.status)) return document;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new AcceptanceError("DOCUMENT_TIMEOUT");
  }

  async function waitForBaseDeleted(baseId) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = await request("/api/kb/bases");
      if (!list?.items?.some((item) => item.id === baseId)) return;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new AcceptanceError("CLEANUP_TIMEOUT");
  }

  try {
    const readiness = await request("/api/ready");
    if (readiness?.ready !== true || readiness?.checks?.knowledge !== true) {
      throw new AcceptanceError("KNOWLEDGE_NOT_READY");
    }
    report("PASS", "readiness");
    if (
      readiness?.knowledge?.readiness?.checks?.database !== "ok" ||
      readiness?.knowledge?.readiness?.checks?.migrations !== "ok" ||
      readiness?.knowledge?.readiness?.checks?.vectorExtension !== "ok"
    ) throw new AcceptanceError("POSTGRES_PGVECTOR_NOT_READY");
    report("PASS", "postgres-pgvector");
    if (readiness?.knowledge?.readiness?.checks?.objectStore !== "ok") {
      throw new AcceptanceError("COS_CANARY_NOT_READY");
    }
    report("PASS", "cos-canary");

    const publicConfig = await request("/api/kb/public-config");
    if (publicConfig?.registrationMode === "disabled") throw new AcceptanceError("REGISTRATION_DISABLED");
    if (publicConfig?.registrationMode === "invite_only" && !inviteCode) {
      throw new AcceptanceError("INVITE_CODE_REQUIRED");
    }
    const suffix = crypto.randomBytes(6).toString("hex");
    const username = `p0-${suffix}`;
    const password = `P0-${crypto.randomBytes(18).toString("base64url")}`;
    const recoveredPassword = `P0R-${crypto.randomBytes(18).toString("base64url")}`;
    const registration = await request("/api/kb/auth/register", {
      method: "POST",
      body: { username, password, ...(inviteCode ? { inviteCode } : {}) },
      expected: [201]
    });
    csrfToken = registration?.csrfToken || "";
    const recoveryCode = registration?.recoveryCode || "";
    if (!csrfToken || !recoveryCode) throw new AcceptanceError("REGISTER_CONTRACT_INVALID");

    const providerProfiles = [
      { vendor: "openai", profileId: "openai-text-embedding-3-small" },
      { vendor: "qwen", profileId: "qwen-text-embedding-v4" }
    ];
    const basesToDelete = [];
    for (const provider of providerProfiles) {
      const check = `${provider.vendor}-embedding-retrieval-citation`;
      const apiKey = providerKeys[provider.vendor];
      if (!apiKey) {
        report("SKIP", check, `${provider.vendor.toUpperCase()}_KEY_MISSING`);
        continue;
      }
      try {
        const marker = `acceptance-${provider.vendor}-${suffix}`;
        const source = Buffer.from(`${marker}\nProduction knowledge acceptance document.\n`, "utf8");
        const created = await request("/api/kb/bases", {
          method: "POST",
          csrf: true,
          body: {
            name: `P0 ${provider.vendor} ${suffix}`,
            description: "staging acceptance",
            embeddingProfileId: provider.profileId
          },
          expected: [201]
        });
        const baseId = created.base.id;
        basesToDelete.push(baseId);
        const grant = await request(`/api/kb/bases/${baseId}/documents/upload-grant`, {
          method: "POST",
          csrf: true,
          body: {
            displayName: `${marker}.txt`,
            declaredMimeType: "text/plain",
            declaredBytes: source.byteLength,
            checksumSha256: crypto.createHash("sha256").update(source).digest("hex")
          },
          expected: [201]
        });
        const uploadResponse = await fetch(grant.upload.uploadUrl, {
          method: "PUT",
          body: source,
          headers: grant.upload.requiredHeaders,
          credentials: "omit",
          redirect: "error"
        });
        if (!uploadResponse.ok) throw new AcceptanceError(`COS_UPLOAD_HTTP_${uploadResponse.status}`);
        const finalized = await request(`/api/kb/documents/${grant.document.id}/finalize`, {
          method: "POST",
          csrf: true,
          body: {
            etag: uploadResponse.headers.get("etag")?.replace(/^"|"$/g, ""),
            versionId: uploadResponse.headers.get("x-cos-version-id") || undefined
          }
        });
        await waitForDocument(baseId, finalized.document.id, new Set(["awaiting_embedding", "embedding", "ready"]));
        let done = false;
        for (let batch = 0; batch < 50 && !done; batch += 1) {
          const embedded = await request(`/api/kb/documents/${finalized.document.id}/embedding-batches/next`, {
            method: "POST",
            csrf: true,
            body: {
              embeddingProfileId: provider.profileId,
              idempotencyKey: `acceptance:${suffix}:${provider.vendor}:${batch}`,
              connection: { apiKey }
            }
          });
          done = embedded.done === true;
        }
        if (!done) throw new AcceptanceError("EMBEDDING_BATCH_LIMIT");
        await waitForDocument(baseId, finalized.document.id, new Set(["ready"]));
        const retrieval = await request("/api/kb/retrieve", {
          method: "POST",
          csrf: true,
          body: {
            query: marker,
            knowledgeBaseIds: [baseId],
            topK: 3,
            embeddingConnections: { [provider.vendor]: { apiKey } }
          }
        });
        const citation = retrieval?.citations?.[0];
        if (!citation?.documentId || !citation?.chunkId) throw new AcceptanceError("CITATION_MISSING");
        const sourceResult = await request(
          `/api/kb/documents/${citation.documentId}/source-url?chunkId=${encodeURIComponent(citation.chunkId)}&disposition=inline`
        );
        if (new URL(sourceResult.source.url).protocol !== "https:") {
          throw new AcceptanceError("CITATION_URL_INVALID");
        }
        report("PASS", check);
      } catch (error) {
        report("FAIL", check, sanitizedCode(error));
      }
    }

    try {
      for (const baseId of basesToDelete) {
        const current = await request(`/api/kb/bases/${baseId}`);
        await request(`/api/kb/bases/${baseId}`, {
          method: "DELETE",
          csrf: true,
          body: { expectedVersion: current.base.version },
          expected: [202]
        });
        await waitForBaseDeleted(baseId);
      }
      report("PASS", "cleanup");
    } catch (error) {
      report("FAIL", "cleanup", sanitizedCode(error));
    }

    try {
      const recovered = await request("/api/kb/auth/recover", {
        method: "POST",
        body: { username, recoveryCode, newPassword: recoveredPassword }
      });
      csrfToken = recovered?.csrfToken || "";
      if (!csrfToken || !recovered?.recoveryCode) throw new AcceptanceError("RECOVERY_CONTRACT_INVALID");
      await request("/api/kb/auth/login", {
        method: "POST",
        body: { username, password: recoveredPassword }
      });
      report("PASS", "recovery");
    } catch (error) {
      report("FAIL", "recovery", sanitizedCode(error));
    }
  } catch (error) {
    const failedCheck = results.length < 3 ? CHECKS[results.length] : "recovery";
    report(error?.code === "INVITE_CODE_REQUIRED" ? "SKIP" : "FAIL", failedCheck, sanitizedCode(error));
    for (const check of CHECKS) {
      if (!results.some((result) => result.check === check)) report("SKIP", check, "PREREQUISITE_NOT_MET");
    }
  }

  if (results.some((result) => result.status === "FAIL")) process.exitCode = 1;
  else if (results.some((result) => result.status === "SKIP")) process.exitCode = 2;
}

await main();
