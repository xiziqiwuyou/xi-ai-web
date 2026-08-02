import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRequestGuard } from "../../server/request-guard.mjs";
import {
  DEFAULT_UPSTREAM_BASE_URL,
  assertManagedUpstreamBaseUrl,
  assertSafePublicHttpsUrl,
  assertSafeUpstreamBaseUrl,
  isBlockedAddress,
  managedUpstreamPolicy,
  normalizeUpstreamBaseUrl
} from "../../server/upstream-security.mjs";

class TestResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = new Map();
    this.statusCode = 200;
    this.body = null;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
  }

  status(value) {
    this.statusCode = value;
    return this;
  }

  json(value) {
    this.body = value;
    return this;
  }
}

function request(ip = "203.0.113.10") {
  return { ip, socket: { remoteAddress: ip } };
}

test("managed upstream normalization rejects credentialed and private targets", async () => {
  assert.equal(DEFAULT_UPSTREAM_BASE_URL, "https://api.xi-ai.cn");
  for (const address of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "fc00::1"]) {
    assert.equal(isBlockedAddress(address), true, `expected ${address} to be blocked`);
  }
  assert.equal(normalizeUpstreamBaseUrl("http://127.0.0.1:8080", { fallback: "" }), "");
  assert.equal(normalizeUpstreamBaseUrl("https://user:pass@example.com", { fallback: "" }), "");
  assert.equal(normalizeUpstreamBaseUrl("https://example.com?target=internal", { fallback: "" }), "");
  await assert.rejects(
    assertSafeUpstreamBaseUrl("http://169.254.169.254/latest/meta-data", { production: false }),
    /not allowed|restricted|不被允许|限制/u
  );
});

test("managed upstream validation rejects domains that resolve to private addresses", async () => {
  await assert.rejects(
    assertSafeUpstreamBaseUrl("https://rebound.example.test", {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }]
    }),
    /restricted|限制/u
  );
  assert.equal(
    await assertSafeUpstreamBaseUrl("https://public.example.test", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }]
    }),
    "https://public.example.test"
  );
});

test("production upstream lock rejects admin and restore overrides", async () => {
  const env = {
    NODE_ENV: "production",
    UPSTREAM_BASE_URL: "https://api.xi-ai.cn"
  };
  assert.equal(managedUpstreamPolicy({ env, production: true }).locked, true);
  await assert.rejects(
    assertManagedUpstreamBaseUrl("https://other.example.test", {
      env,
      production: true,
      rejectOverride: true,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }]
    }),
    /locked/u
  );
  assert.equal(
    await assertManagedUpstreamBaseUrl("https://api.xi-ai.cn", {
      env,
      production: true,
      rejectOverride: true,
      lookup: async () => [{ address: "93.184.216.34", family: 4 }]
    }),
    "https://api.xi-ai.cn"
  );
});

test("public reference images reject private and DNS-rebound targets", async () => {
  await assert.rejects(assertSafePublicHttpsUrl("https://127.0.0.1/image.png"), /restricted/u);
  await assert.rejects(
    assertSafePublicHttpsUrl("https://image.example.test/a.png", {
      lookup: async () => [{ address: "169.254.169.254", family: 4 }]
    }),
    /restricted/u
  );
  assert.equal(
    await assertSafePublicHttpsUrl("https://image.example.test/a.png", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }]
    }),
    "https://image.example.test/a.png"
  );
});

test("local HTTP upstreams require the explicit local test switch", () => {
  assert.equal(
    normalizeUpstreamBaseUrl("http://127.0.0.1:8788", {
      fallback: "",
      production: true,
      allowLocal: true
    }),
    "http://127.0.0.1:8788"
  );
  assert.equal(
    normalizeUpstreamBaseUrl("http://public.example.test", {
      fallback: "",
      production: true,
      allowLocal: true
    }),
    ""
  );
});

test("request guard returns Retry-After after the per-IP window is exhausted", () => {
  const guard = createRequestGuard({ scope: "test-rate", windowMs: 60_000, maxRequests: 2, maxConcurrent: 2 });
  for (let index = 0; index < 2; index += 1) {
    const response = new TestResponse();
    let nextCalls = 0;
    guard(request(), response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    response.emit("finish");
  }
  const rejected = new TestResponse();
  guard(request(), rejected, () => assert.fail("rate-limited request must not continue"));
  assert.equal(rejected.statusCode, 429);
  assert(Number(rejected.headers.get("retry-after")) >= 1);
});

test("request guard releases the concurrency slot when a response finishes", () => {
  const guard = createRequestGuard({ scope: "test-concurrency", windowMs: 60_000, maxRequests: 10, maxConcurrent: 1 });
  const active = new TestResponse();
  guard(request(), active, () => {});

  const rejected = new TestResponse();
  guard(request("203.0.113.11"), rejected, () => assert.fail("concurrency-limited request must not continue"));
  assert.equal(rejected.statusCode, 429);
  assert.equal(rejected.headers.get("retry-after"), "5");

  active.emit("finish");
  const accepted = new TestResponse();
  let nextCalls = 0;
  guard(request("203.0.113.12"), accepted, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  accepted.emit("finish");
});

test("request guard falls back safely when configured limits are invalid", () => {
  const guard = createRequestGuard({
    scope: "test-invalid-config",
    windowMs: Number.NaN,
    maxRequests: Number.NaN,
    maxConcurrent: -1
  });
  const response = new TestResponse();
  let nextCalls = 0;
  guard(request(), response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  response.emit("finish");
});
