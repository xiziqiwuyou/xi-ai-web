import assert from "node:assert/strict";
import test from "node:test";
import {
  createUserMcpProfile,
  loadSessionUserMcpProfiles,
  sanitizeUserMcpProfile,
  saveSessionUserMcpProfile,
  userMcpSessionStorageKey
} from "../../src/features/chat/userMcpProfiles.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function withWindow(run) {
  const previous = globalThis.window;
  globalThis.window = { sessionStorage: createMemoryStorage() };
  try {
    return run(globalThis.window);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("user MCP profile sanitizer keeps a closed persistence schema", () => {
  const profile = sanitizeUserMcpProfile({
    id: "local-mcp-test",
    label: "Browser tool",
    endpoint: "https://mcp.example.test/mcp",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
  assert.deepEqual(Object.keys(profile).sort(), ["createdAt", "endpoint", "id", "label", "updatedAt"]);
  assert.throws(
    () => sanitizeUserMcpProfile({ ...profile, token: "secret" }),
    /不允许保存的字段/u
  );
  assert.throws(
    () => createUserMcpProfile("Unsafe", "http://127.0.0.1/mcp"),
    /HTTPS/u
  );
  assert.throws(
    () => createUserMcpProfile("Credential path", "https://mcp.example.test/mcp/token/abc"),
    /credential-like/u
  );
});

test("session-only user MCP profiles stay bounded and contain no runtime grants", () => {
  withWindow((windowValue) => {
    for (let index = 0; index < 32; index += 1) {
      saveSessionUserMcpProfile(sanitizeUserMcpProfile({
        id: `local-mcp-session-${index}`,
        label: `Session ${index}`,
        endpoint: "https://mcp.example.test/mcp",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }));
    }
    assert.equal(loadSessionUserMcpProfiles().length, 32);
    assert.throws(
      () => saveSessionUserMcpProfile(sanitizeUserMcpProfile({
        id: "local-mcp-session-overflow",
        label: "Overflow",
        endpoint: "https://mcp.example.test/mcp",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })),
      /最多添加 32 个/u
    );
    const raw = windowValue.sessionStorage.getItem(userMcpSessionStorageKey);
    assert(raw);
    assert.doesNotMatch(raw, /token|secret|approval|argument|result|connection/iu);
  });
});
