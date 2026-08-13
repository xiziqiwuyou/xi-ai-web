import assert from "node:assert/strict";
import test from "node:test";
import { createMcpSessionStore } from "../../server/mcp/session.mjs";

function deterministicBytes(size) {
  return Buffer.alloc(size, 7);
}

test("MCP sessions issue an HttpOnly-cookie bearer and rotate in-memory CSRF", () => {
  let current = 1_000;
  let sequence = 0;
  const store = createMcpSessionStore({
    ttlMs: 1_000,
    now: () => current,
    randomBytes: (size) => Buffer.alloc(size, ++sequence),
    randomUUID: () => "session-one"
  });
  const issued = store.issue();
  assert.equal(issued.created, true);
  assert.equal(issued.sessionId, "session-one");
  assert.ok(issued.cookieToken.length >= 32);
  assert.equal(store.verify(issued.cookieToken, issued.csrfToken).sessionId, "session-one");

  const refreshed = store.issue(issued.cookieToken);
  assert.equal(refreshed.created, false);
  assert.equal(refreshed.cookieToken, "");
  assert.notEqual(refreshed.csrfToken, issued.csrfToken);
  assert.throws(
    () => store.verify(issued.cookieToken, issued.csrfToken),
    (error) => error.code === "MCP_APPROVAL_CSRF_INVALID"
  );
  assert.equal(store.verify(issued.cookieToken, refreshed.csrfToken).sessionId, "session-one");

  current += 1_001;
  assert.throws(
    () => store.resolve(issued.cookieToken),
    (error) => error.code === "MCP_APPROVAL_SESSION_INVALID"
  );
  assert.equal(store.size, 0);
});

test("MCP session capacity evicts the least recently used session", () => {
  let current = 0;
  let sequence = 0;
  const store = createMcpSessionStore({
    ttlMs: 10_000,
    maxSessions: 2,
    now: () => current,
    randomBytes: (size) => Buffer.alloc(size, ++sequence),
    randomUUID: () => `session-${sequence}`
  });
  const first = store.issue();
  current += 1;
  const second = store.issue();
  current += 1;
  store.resolve(first.cookieToken);
  current += 1;
  const third = store.issue();

  assert.equal(store.resolve(first.cookieToken).sessionId, first.sessionId);
  assert.equal(store.resolve(third.cookieToken).sessionId, third.sessionId);
  assert.throws(
    () => store.resolve(second.cookieToken),
    (error) => error.code === "MCP_APPROVAL_SESSION_INVALID"
  );
  assert.equal(store.size, 2);
});

test("MCP session validation rejects malformed tokens without timing-sensitive comparisons", () => {
  const store = createMcpSessionStore({ randomBytes: deterministicBytes });
  const issued = store.issue();
  assert.throws(
    () => store.verify("short", issued.csrfToken),
    (error) => error.code === "MCP_APPROVAL_SESSION_INVALID"
  );
  assert.throws(
    () => store.verify(issued.cookieToken, "short"),
    (error) => error.code === "MCP_APPROVAL_CSRF_INVALID"
  );
});
