import assert from "node:assert/strict";
import test from "node:test";
import { MCP_ERROR_CODES } from "../../server/mcp/contract.mjs";
import {
  assertSafeMcpEndpoint,
  isMcpAllowedProductionPort,
  normalizeMcpEndpoint,
  pinnedLookup
} from "../../server/mcp/security.mjs";

const publicLookup = async () => [{ address: "203.0.113.10", family: 4 }];

test("MCP endpoint syntax rejects credentials, query state, unsafe schemes, and ports", () => {
  assert.throws(
    () => normalizeMcpEndpoint("http://mcp.example.test/tools", { production: true }),
    (error) => error.code === MCP_ERROR_CODES.ENDPOINT_INVALID
  );
  assert.throws(
    () => normalizeMcpEndpoint("https://user:pass@mcp.example.test/tools", { production: true }),
    (error) => error.code === MCP_ERROR_CODES.ENDPOINT_INVALID
  );
  assert.throws(
    () => normalizeMcpEndpoint("https://mcp.example.test/tools?token=secret", { production: true }),
    (error) => error.code === MCP_ERROR_CODES.ENDPOINT_INVALID
  );
  assert.throws(
    () => normalizeMcpEndpoint("https://mcp.example.test:9443/tools", { production: true }),
    (error) => error.code === MCP_ERROR_CODES.ENDPOINT_INVALID
  );
  assert.equal(isMcpAllowedProductionPort(443), true);
  assert.equal(isMcpAllowedProductionPort(8443), true);
  assert.equal(isMcpAllowedProductionPort(9443), false);
});
test("MCP endpoint validation rejects restricted literals and DNS answers", async () => {
  for (const value of [
    "https://127.0.0.1/tools",
    "https://169.254.169.254/tools",
    "https://[::1]/tools",
    "https://localhost/tools"
  ]) {
    await assert.rejects(
      assertSafeMcpEndpoint(value, { production: true, lookup: publicLookup }),
      (error) => error.code === MCP_ERROR_CODES.ENDPOINT_UNSAFE
    );
  }
  await assert.rejects(
    assertSafeMcpEndpoint("https://rebound.example.test/tools", {
      production: true,
      lookup: async () => [
        { address: "203.0.113.10", family: 4 },
        { address: "10.0.0.8", family: 4 }
      ]
    }),
    (error) => error.code === MCP_ERROR_CODES.DNS_UNSAFE
  );
});

test("validated MCP hostnames expose one pinned address for the transport", async () => {
  const target = await assertSafeMcpEndpoint("https://mcp.example.test/tools", {
    production: true,
    lookup: publicLookup
  });
  assert.equal(target.address, "203.0.113.10");
  const lookup = pinnedLookup(target);
  await new Promise((resolve, reject) => lookup("mcp.example.test", { all: false }, (error, address, family) => {
    try {
      assert.equal(error, null);
      assert.equal(address, "203.0.113.10");
      assert.equal(family, 4);
      resolve();
    } catch (caught) {
      reject(caught);
    }
  }));
});
