import assert from "node:assert/strict";
import test from "node:test";
import {
  exchangeShellJwt,
  ShellJwtExchangeError
} from "../../server/shell-jwt-exchange.mjs";

const jwt = "header.payload.signature-value-for-tests";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("Shell JWT exchange refreshes login and returns the normalized default API Key", async () => {
  const calls = [];
  const result = await exchangeShellJwt({
    token: jwt,
    upstreamBaseUrl: "https://api.xi-ai.cn/v1",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/user/login/refresh")) {
        return jsonResponse({ success: true, token: "refreshed.jwt.token-value" });
      }
      return jsonResponse({ success: true, data: { key: "default-key-1234" } });
    }
  });

  assert.deepEqual(result, { apiKey: "sk-default-key-1234" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.xi-ai.cn/api/user/login/refresh");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new Headers(calls[0].init.headers).get("x-s-token"), jwt);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[1].url, "https://api.xi-ai.cn/api/token/default");
  assert.equal(calls[1].init.method, "GET");
  assert.equal(new Headers(calls[1].init.headers).get("x-s-token"), "refreshed.jwt.token-value");
  assert.equal(calls[1].init.redirect, "error");
});

test("Shell JWT exchange preserves an existing sk- prefix", async () => {
  const result = await exchangeShellJwt({
    token: jwt,
    upstreamBaseUrl: "https://api.xi-ai.cn",
    fetchImpl: async (url) => String(url).endsWith("/login/refresh")
      ? jsonResponse({ success: true, token: "refreshed.jwt.token-value" })
      : jsonResponse({ success: true, data: { key: "sk-existing-key" } })
  });
  assert.equal(result.apiKey, "sk-existing-key");
});

test("Shell JWT exchange rejects malformed input before upstream access", async () => {
  let calls = 0;
  await assert.rejects(
    exchangeShellJwt({
      token: "short",
      upstreamBaseUrl: "https://api.xi-ai.cn",
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ success: true });
      }
    }),
    (error) => error instanceof ShellJwtExchangeError && error.status === 400
  );
  assert.equal(calls, 0);
});

test("Shell JWT exchange redacts upstream failures and supplied JWT values", async () => {
  const upstreamSecret = "upstream-echoed-private-value";
  await assert.rejects(
    exchangeShellJwt({
      token: jwt,
      upstreamBaseUrl: "https://api.xi-ai.cn",
      fetchImpl: async () => jsonResponse({
        success: false,
        message: `${upstreamSecret} ${jwt}`
      }, 401)
    }),
    (error) => {
      assert(error instanceof ShellJwtExchangeError);
      assert.equal(error.status, 401);
      assert.equal(error.message.includes(jwt), false);
      assert.equal(error.message.includes(upstreamSecret), false);
      return true;
    }
  );
});

test("Shell JWT exchange maps an aborted upstream request to a bounded timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    exchangeShellJwt({
      token: jwt,
      upstreamBaseUrl: "https://api.xi-ai.cn",
      signal: controller.signal,
      fetchImpl: async (_url, init) => {
        if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return jsonResponse({ success: true });
      }
    }),
    (error) => error instanceof ShellJwtExchangeError
      && error.status === 504
      && !error.message.includes(jwt)
  );
});
