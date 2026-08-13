import assert from "node:assert/strict";
import test from "node:test";
import { createMcpApprovalStore } from "../../server/mcp/approval.mjs";
import {
  MCP_ERROR_CODES,
  MCP_LIMITS,
  digestMcpToolArguments
} from "../../server/mcp/contract.mjs";

function binding(patch = {}) {
  return {
    sessionId: "session-secret-1",
    turnId: "turn-1",
    profileId: "mcp-profile",
    toolName: "search.web",
    providerAlias: "mcp_search_web",
    argumentsDigest: digestMcpToolArguments({ query: "release status" }),
    ...patch
  };
}

function deterministicIds() {
  let sequence = 0;
  return () => `mcp-approval-${String(++sequence).padStart(16, "0")}`;
}

test("MCP approval defaults are fixed at 60 seconds and 256 entries", () => {
  assert.equal(MCP_LIMITS.approvalTtlMs, 60_000);
  assert.equal(MCP_LIMITS.maxPendingApprovals, 256);
});

test("approval binds every execution identity while confirmation uses only session proof", async () => {
  const store = createMcpApprovalStore({ idFactory: deterministicIds() });
  const expected = binding();
  const created = store.create(expected);
  assert.deepEqual(created.approval, {
    id: created.approval.id,
    turnId: expected.turnId,
    profileId: expected.profileId,
    toolName: expected.toolName,
    providerAlias: expected.providerAlias,
    status: "pending",
    createdAt: created.approval.createdAt,
    expiresAt: created.approval.expiresAt
  });
  const serialized = JSON.stringify(created.approval);
  assert.equal(serialized.includes(expected.sessionId), false);
  assert.equal(serialized.includes(expected.argumentsDigest), false);
  assert.equal(serialized.includes("release status"), false);

  const approved = store.approve({ approvalId: created.approval.id, sessionId: expected.sessionId });
  assert.equal(approved.status, "approved");
  assert.equal((await created.wait).status, "approved");
  assert.throws(
    () => store.approve({ approvalId: created.approval.id, sessionId: expected.sessionId }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_REPLAYED
  );
  store.close();
});

test("wrong session never consumes an approval", async () => {
  const store = createMcpApprovalStore({ idFactory: deterministicIds() });
  const expected = binding();
  const created = store.create(expected);
  assert.throws(
    () => store.approve({ approvalId: created.approval.id, sessionId: "wrong-session" }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_SESSION_MISMATCH
  );
  assert.equal(store.pendingCount, 1);
  store.approve({ approvalId: created.approval.id, sessionId: expected.sessionId });
  await created.wait;
  store.close();
});

test("reject and cancel have stable terminal errors and cannot be replayed", async () => {
  const store = createMcpApprovalStore({ idFactory: deterministicIds() });
  const rejected = store.create(binding({ turnId: "turn-reject" }));
  assert.equal(store.reject({ approvalId: rejected.approval.id, sessionId: "session-secret-1" }).status, "rejected");
  await assert.rejects(rejected.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_REJECTED);
  assert.throws(
    () => store.approve({ approvalId: rejected.approval.id, sessionId: "session-secret-1" }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_REJECTED
  );

  const cancelled = store.create(binding({ turnId: "turn-cancel" }));
  assert.equal(store.cancel({ approvalId: cancelled.approval.id, sessionId: "session-secret-1" }).status, "cancelled");
  await assert.rejects(cancelled.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_CANCELLED);
  assert.throws(
    () => store.cancel({ approvalId: cancelled.approval.id, sessionId: "session-secret-1" }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_CANCELLED
  );
  store.close();
});

test("expiry is deterministic and rejects the waiting execution", async () => {
  let timestamp = 1_700_000_000_000;
  const store = createMcpApprovalStore({
    now: () => timestamp,
    idFactory: deterministicIds()
  });
  const expected = binding({ turnId: "turn-expire" });
  const created = store.create(expected);
  timestamp += MCP_LIMITS.approvalTtlMs + 1;
  assert.throws(
    () => store.approve({ approvalId: created.approval.id, sessionId: expected.sessionId }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_EXPIRED
  );
  await assert.rejects(created.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_EXPIRED);
  assert.equal(store.pendingCount, 0);
  store.close();
});

test("profile and tool invalidation affect only matching pending approvals", async () => {
  const store = createMcpApprovalStore({ idFactory: deterministicIds() });
  const first = store.create(binding({ turnId: "turn-first", toolName: "read.one" }));
  const second = store.create(binding({ turnId: "turn-second", toolName: "read.two" }));
  const third = store.create(binding({ turnId: "turn-third", profileId: "other-profile" }));

  assert.equal(store.invalidate({ profileId: "mcp-profile", toolName: "read.one" }), 1);
  await assert.rejects(first.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_INVALIDATED);
  assert.equal(store.pendingCount, 2);
  assert.equal(store.invalidate({ profileId: "mcp-profile" }), 1);
  await assert.rejects(second.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_INVALIDATED);
  assert.equal(store.pendingCount, 1);
  store.approve({
    approvalId: third.approval.id,
    sessionId: "session-secret-1"
  });
  await third.wait;
  store.close();
});

test("capacity is bounded and terminal tombstones yield room without evicting pending work", async () => {
  const store = createMcpApprovalStore({ capacity: 2, idFactory: deterministicIds() });
  const first = store.create(binding({ turnId: "turn-1" }));
  const second = store.create(binding({ turnId: "turn-2" }));
  assert.throws(
    () => store.create(binding({ turnId: "turn-3" })),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_CAPACITY
  );
  store.cancel({ approvalId: first.approval.id, sessionId: "session-secret-1" });
  await assert.rejects(first.wait, (error) => error.code === MCP_ERROR_CODES.APPROVAL_CANCELLED);
  const third = store.create(binding({ turnId: "turn-3" }));
  assert.equal(store.size, 2);
  assert.equal(store.pendingCount, 2);
  store.cancel({ approvalId: second.approval.id, sessionId: "session-secret-1" });
  store.cancel({ approvalId: third.approval.id, sessionId: "session-secret-1" });
  await Promise.allSettled([second.wait, third.wait]);
  store.close();
});

test("approval creation rejects previews, raw arguments, and credential-shaped extras", () => {
  const store = createMcpApprovalStore({ idFactory: deterministicIds() });
  for (const extra of [
    { argumentsPreview: "secret preview" },
    { arguments: { apiKey: "sk-secret" } },
    { apiKey: "sk-secret" }
  ]) {
    assert.throws(
      () => store.create({ ...binding(), ...extra }),
      (error) => error.code === MCP_ERROR_CODES.APPROVAL_INVALID
    );
  }
  assert.equal(store.size, 0);
  store.close();
});
