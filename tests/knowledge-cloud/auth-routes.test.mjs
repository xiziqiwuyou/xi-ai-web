import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { knowledgeClientContext } from "../../server/knowledge-cloud/auth/http.mjs";
import { createKnowledgeRouter } from "../../server/knowledge-cloud/routes.mjs";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../../server/knowledge-cloud/errors.mjs";

async function withAuthServer(auth, work) {
  const runtime = {
    enabled: true,
    available: true,
    state: "ready",
    reasonCode: null,
    schemaVersion: 3,
    vectorVersion: "0.8.1",
    config: {
      publicOrigin: "https://ai.example.com",
      auth: { tokenSecret: "server-only-token-secret" },
      database: {},
      cos: {}
    },
    auth
  };
  const app = express();
  app.use("/api/kb", createKnowledgeRouter(runtime));
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("knowledge client context uses Express trusted-proxy IP resolution", () => {
  const context = knowledgeClientContext({
    ip: "203.0.113.47",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "user-agent": "knowledge-proxy-test" }
  });
  assert.deepEqual(context, {
    ipPrefix: "203.0.113.0/24",
    userAgent: "knowledge-proxy-test"
  });
});

function authFixture(overrides = {}) {
  return {
    cookieName: "xi_kb_session",
    sessionTtlSeconds: 1209600,
    async publicConfig() {
      return {
        registrationMode: "open",
        accountRules: {
          usernameMinLength: 3,
          usernameMaxLength: 64,
          passwordMinLength: 10,
          passwordMaxLength: 128
        },
        recoveryCodeShownOnce: true
      };
    },
    async register() {
      return {
        token: "opaque-session-token",
        csrfToken: "csrf-token",
        recoveryCode: "XI-KB-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111-2222-3333",
        expiresAt: "2026-01-15T00:00:00.000Z",
        account: { id: "account-1", username: "Alice", status: "active" }
      };
    },
    async login() {
      return {
        token: "opaque-session-token",
        csrfToken: "csrf-token",
        expiresAt: "2026-01-15T00:00:00.000Z",
        account: { id: "account-1", username: "Alice", status: "active" }
      };
    },
    async session(token) {
      return token === "opaque-session-token"
        ? {
            authenticated: true,
            csrfToken: "rotated-csrf",
            expiresAt: "2026-01-15T00:00:00.000Z",
            account: { id: "account-1", username: "Alice", status: "active" }
          }
        : { authenticated: false };
    },
    async logout(token, csrf) {
      assert.equal(token, "opaque-session-token");
      assert.equal(csrf, "rotated-csrf");
      return { ok: true };
    },
    async regenerateRecoveryCode(token, csrf) {
      assert.equal(token, "opaque-session-token");
      assert.equal(csrf, "rotated-csrf");
      return {
        recoveryCode: "XI-KB-1111-2222-3333-4444-5555-6666-7777-8888-9999-AAAA",
        account: { id: "account-1", username: "Alice", status: "active" }
      };
    },
    async recover() {
      return {
        token: "recovered-session-token",
        csrfToken: "recovered-csrf",
        recoveryCode: "XI-KB-FFFF-EEEE-DDDD-CCCC-BBBB-AAAA-9999-8888-7777-6666",
        expiresAt: "2026-01-15T00:00:00.000Z",
        account: { id: "account-1", username: "Alice", status: "active" }
      };
    },
    async adminReset() {
      return {
        token: "admin-reset-session-token",
        csrfToken: "admin-reset-csrf",
        recoveryCode: "XI-KB-ABCD-EF01-2345-6789-ABCD-EF01-2345-6789-ABCD-EF01",
        expiresAt: "2026-01-15T00:00:00.000Z",
        account: { id: "account-1", username: "Alice", status: "active" }
      };
    },
    ...overrides
  };
}

test("knowledge auth routes enforce origin and never return the session token", async () => {
  await withAuthServer(authFixture(), async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/kb/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ username: "Alice", password: "long-password" })
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, KNOWLEDGE_ERROR_CODES.ORIGIN_INVALID);

    const response = await fetch(`${baseUrl}/api/kb/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://ai.example.com" },
      body: JSON.stringify({ username: "Alice", password: "long-password" })
    });
    assert.equal(response.status, 201);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /xi_kb_session=opaque-session-token/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api/);
    assert.match(cookie, /Secure/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.account.username, "Alice");
    assert.equal(body.recoveryCode.startsWith("XI-KB-"), true);
    assert.equal("token" in body, false);
    assert(!JSON.stringify(body).includes("opaque-session-token"));
  });
});

test("session refresh rotates CSRF and logout clears the scoped cookie", async () => {
  await withAuthServer(authFixture(), async (baseUrl) => {
    const session = await fetch(`${baseUrl}/api/kb/auth/session`, {
      headers: { Cookie: "xi_kb_session=opaque-session-token" }
    });
    const sessionBody = await session.json();
    assert.equal(sessionBody.authenticated, true);
    assert.equal(sessionBody.csrfToken, "rotated-csrf");

    const logout = await fetch(`${baseUrl}/api/kb/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=opaque-session-token",
        "X-Knowledge-CSRF": sessionBody.csrfToken
      },
      body: "{}"
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  });
});

test("authenticated recovery-code rotation returns the secret once without replacing the session cookie", async () => {
  await withAuthServer(authFixture(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/kb/auth/recovery-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ai.example.com",
        Cookie: "xi_kb_session=opaque-session-token",
        "X-Knowledge-CSRF": "rotated-csrf"
      },
      body: "{}"
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    assert.equal(body.recoveryCode.startsWith("XI-KB-"), true);
    assert.equal("token" in body, false);
  });
});

test("knowledge rate-limit errors include Retry-After without exposing credentials", async () => {
  const secretPassword = "private-login-password";
  await withAuthServer(
    authFixture({
      async login() {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "请求过于频繁，请稍后再试", {
          status: 429,
          details: { retryAfterSeconds: 45, password: secretPassword }
        });
      }
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/kb/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://ai.example.com" },
        body: JSON.stringify({ username: "Alice", password: secretPassword })
      });
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "45");
      const serialized = JSON.stringify(await response.json());
      assert(!serialized.includes(secretPassword));
      assert(serialized.includes("[redacted]"));
    }
  );
});

test("Admin reset consumption returns a fresh recovery code but never the session token", async () => {
  await withAuthServer(authFixture(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/kb/auth/admin-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://ai.example.com" },
      body: JSON.stringify({
        username: "Alice",
        resetCode: "XI-KB-RESET-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111-2222-3333",
        newPassword: "new-admin-reset-password"
      })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /xi_kb_session=admin-reset-session-token/);
    const body = await response.json();
    assert.match(body.recoveryCode, /^XI-KB-/);
    assert.equal("token" in body, false);
    assert(!JSON.stringify(body).includes("admin-reset-session-token"));
  });
});
