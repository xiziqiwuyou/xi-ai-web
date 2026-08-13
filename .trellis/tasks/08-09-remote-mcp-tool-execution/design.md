# Remote MCP Execution Design

## Existing Contracts To Reuse

- `server/mcp/contract.mjs` owns profile, descriptor, bounds, and stable error
  codes. Add call arguments/results and approval records there rather than
  creating a parallel schema.
- `server/mcp/client.mjs` owns pinned DNS, no-redirect transport, JSON-RPC
  framing, timeout, cancellation, and redacted MCP errors. Add a bounded
  `callMcpTool` beside discovery.
- `server/mcp/routes.mjs` owns Admin profile CRUD and the current explicit
  execution-denial route. Keep Admin mutation and execution authorization
  separate.
- Existing Chat provider adapters and tool runner own prompt/function rounds.
  MCP should enter through the same resolved-tool interface after approval,
  not through a second provider loop.

## Approval Flow

1. Chat resolves a user-selected, server-published MCP tool ID and asks the
   server to create an approval record for the current turn.
2. The server validates the profile/tool allowlist, bounds and hashes the
   arguments for audit, stores only an opaque record with an expiry and the
   session/turn binding, and returns a non-sensitive approval projection.
3. The existing SSE stream emits `mcp_approval_required` and ends or enters a
   resumable approval phase without contacting MCP.
4. The user approves or rejects through the existing Chat request boundary.
   The server compares session, turn, tool, argument digest, CSRF/session
   proof, expiry, and one-time state before calling the remote server.
5. The server performs one bounded `tools/call`, projects the result as
   untrusted tool output, and resumes the existing provider round if the
   provider protocol supports it.

Approval state should remain process-local and bounded in this phase. It must
not be written to `app-data.json`, IndexedDB, workspace exports, logs, or
cross-device sync payloads. A future multi-instance deployment needs a
separate shared approval store and is not part of this task.

## Security Invariants

- Client IDs are selectors, never authority. Server-owned profile and tool
  metadata is reloaded for every approval and call.
- An MCP description is untrusted data. It cannot alter system prompts, choose
  another tool, request credentials, or bypass approval.
- One approval consumes exactly one call. A second submit receives a stable
  replay error and sends no request.
- All request and result limits are enforced before provider/MCP I/O. Remote
  tool output cannot contain executable HTML, scripts, navigation, or frames.
- Every error projection is fixed-code and redacted. Audit records contain
  identifiers and bounded metrics only.

## Rollback

The execution switch stays false by default. A release can remove the Chat
registration and call route while retaining discovery profiles and the
execution-denial response. No data migration is required because approval
records are transient and the persisted allowlist is backward-compatible.
