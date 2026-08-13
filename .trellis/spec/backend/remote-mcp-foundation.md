# Remote MCP Secure Foundation

This contract governs administrator-managed remote MCP discovery and the
disabled-by-default Chat execution path. It is not a general MCP proxy: the
server owns every endpoint and allowlist, and every remote tool invocation
requires a short-lived user approval.

## Scope / Trigger

- Trigger: changes to `server/mcp/**`, `mcpServers`, `mcpExecution`, Admin MCP
  routes, the Chat MCP selector, or approval handling.
- In scope: public HTTPS JSON-RPC discovery, bounded `tools/call`, Admin
  allowlists, process-local approval records, and Chat function-tool follow-up.
- Out of scope: Agents, Workflows, OAuth, custom headers, cookies, credentials,
  stdio, WebSocket, SSE MCP transport, resources, prompts, sampling, blanket
  approval, and multi-instance approval coordination.

## Server-Owned Signatures

```text
GET    /api/admin/mcp-servers
POST   /api/admin/mcp-servers
PATCH  /api/admin/mcp-servers/:id
DELETE /api/admin/mcp-servers/:id
POST   /api/admin/mcp-servers/:id/discover
PUT    /api/admin/mcp-servers/:id/execution
PATCH  /api/admin/mcp-execution

GET    /api/chat/mcp/session
POST   /api/chat/mcp/approvals/:id/approve
POST   /api/chat/mcp/approvals/:id/reject
POST   /api/chat/mcp/approvals/:id/cancel
POST   /api/chat/mcp/connections { endpoint }
DELETE /api/chat/mcp/connections/:id {}
POST   /api/chat/stream { mcpToolIds?: string[] }
```

The legacy Admin `/:id/tools/call` route remains a hard
`501 MCP_EXECUTION_NOT_AVAILABLE` gate. Browsers cannot call a remote MCP tool
directly; execution exists only inside the approved Chat stream.

## Persisted Contract

```ts
type McpServerProfile = {
  id: string;
  label: string;
  endpoint: string;
  enabled: boolean;
  executionEnabled: boolean;
  allowedToolNames: string[];
  createdAt: string;
  updatedAt: string;
};

type McpExecutionSettings = { enabled: boolean };
```

- `mcpExecution.enabled`, every profile's `executionEnabled`, and every tool
  allowlist default to closed.
- Approval records, CSRF values, session tokens, raw arguments, raw results,
  discovery responses, and remote MCP session IDs are never persisted.
- Metadata import cannot set the global execution switch. Backup restore keeps
  the live switch. Imported profiles are credential-scanned and revalidated.
- Process-local approval state supports only a single application instance or
  sticky routing. Multi-instance deployment requires a separately reviewed
  shared approval store.

## Endpoint And Transport Invariants

- Production accepts only public HTTPS endpoints on port `443` or `8443`, with
  no URL credentials, query, fragment, or credential-like path state such as
  `/token`, `/api-key`, `sk-...`, or JWT-shaped segments. Local HTTP overrides
  work only outside production through the explicit test flags.
- Every discovery and call revalidates syntax and DNS, pins one validated
  address for the handshake, rejects redirects, and forwards no Provider API
  Key, Cookie, authorization header, or custom header.
- Each operation creates a fresh MCP session: `initialize`,
  `notifications/initialized`, then `tools/list` or `tools/call` as required.
- Arguments and JSON-RPC responses are depth-, item-, byte-, and time-bounded.
  Results are HTML-escaped, non-navigable, marked `untrusted`, and projected as
  external tool output rather than instructions.

## Approval Invariants

- The browser first receives an anonymous HttpOnly `SameSite=Strict` Chat
  session cookie and a CSRF proof kept only in browser/server memory.
- An approval is opaque, single-use, expires after 60 seconds, and binds the
  session, Chat turn, profile, tool, provider alias, and stable argument digest.
- Approval capacity is bounded to 256 records. Remote MCP calls are serialized
  within one Chat turn and capped at eight calls.
- Reject, cancel, expiry, disconnect, profile/tool disable, and global disable
  invalidate the pending call before remote execution.
- A successful approval is rechecked against live profile and allowlist state
  immediately before the call. Replay and wrong-session/context submissions
  return stable errors and execute zero calls.
- Turning execution off or clearing a profile allowlist must succeed without a
  remote discovery request, so an unavailable MCP service cannot block
  rollback. Enabling execution always performs fresh discovery and allowlist
  validation first.

## Public Projection

- Public bootstrap exposes only `{ enabled, tools }`, where each tool contains
  an opaque selector, profile label, tool name/label, `requiresApproval: true`,
  and `untrusted: true`.
- Public bootstrap never exposes endpoints, input schemas, headers, discovery
  bodies, approval state, arguments, or results.
- MCP arguments/results do not enter existing local-tool traces, workspace
  exports, IndexedDB, cross-device sync, analytics, or audit logs.

## Anonymous User Connections

- `mcpExecution.userConnectionsEnabled` is a separate, default-off Admin
  policy. Public bootstrap exposes only the boolean policy state.
- The browser owns the user's label. Connection requests contain only an
  endpoint, and the server/provider projection uses a generic user-service
  label so browser metadata never crosses the boundary.
- Remembered profiles use the dedicated `xi-ai-web-user-mcp` IndexedDB and
  session profiles use a dedicated `sessionStorage` key. Only `id`, `label`,
  `endpoint`, `createdAt`, and `updatedAt` may be stored.
- Endpoint validation applies the same credential-like path rule in the
  browser and server. Normal public route paths such as `/mcp` remain valid;
  capability URLs that embed authentication material are rejected before
  persistence or network access.
- The process-local connection store retains only a session digest, normalized
  endpoint, bounded descriptors, opaque IDs, and expiry. It is TTL/capacity
  bounded and never enters metadata, backup, import, logs, or audit.
- User tool selectors use the `umcp_tool_` namespace, resolve only in the bound
  anonymous session, and reuse the existing per-call approval path. Expiry,
  disconnect, policy disable, or session mismatch invalidates pending calls.
- Loading browser profiles performs no network access. Only an explicit
  Connect action performs SSRF-safe discovery. Each later `tools/call`
  revalidates endpoint and DNS safety again.

## Error Matrix

| Condition | Required result |
| --- | --- |
| Unsafe endpoint or DNS answer | `MCP_ENDPOINT_INVALID`, `MCP_ENDPOINT_UNSAFE`, or `MCP_DNS_UNSAFE` before I/O |
| Global/profile/tool execution disabled | `MCP_EXECUTION_DISABLED` or `MCP_TOOL_NOT_ALLOWED` before provider/MCP execution |
| Prompt invocation mode or model without function tools | bounded `400` capability error |
| Missing/expired Chat session or wrong CSRF | `403` approval-session/CSRF error |
| Wrong session/context, replay, reject, cancel, or expiry | stable approval error and zero remote calls |
| Redirect, unsupported response type, malformed JSON-RPC | bounded transport/protocol error |
| Upstream rate limit or timeout | `MCP_RATE_LIMITED` or `MCP_TIMEOUT` |
| Oversized/deep arguments or result | bounded contract error before provider follow-up |
| Direct Admin tools-call attempt | `501 MCP_EXECUTION_NOT_AVAILABLE` |

## Verification

- Contract tests cover closed schemas, selector forgery, argument/result bounds,
  preview redaction, public projection, and invocation-mode isolation.
- Server tests cover SSRF/DNS checks, fresh-session calls, no credential
  forwarding, wrong session/CSRF/context, replay, reject, cancel, expiry,
  invalidation, capacity, global disable, and exactly-once execution.
- Admin and Chat Playwright tests run at `1440x900`, `1280x800`, `390x844`, and
  `375x812`, including inline approval focus/visibility and zero/one-call
  assertions.
- Before release, run typecheck, build, privacy, security, provider/tool/local
  contracts, server tests, focused E2E, release-check, and `git diff --check`.
- Keep production execution disabled/operator-only until an operator completes
  a real public HTTPS MCP smoke test and verifies the global-switch rollback.

## Wrong Vs Correct

```js
// Wrong: browser-selected authority and credentials.
callMcpTool({ endpoint: req.body.endpoint, headers: req.body.headers });

// Correct: opaque selector resolves to live server-owned metadata.
const selector = selectMcpToolIds({ profiles: db.mcpServers, requestedIds });
const liveProfile = db.mcpServers.find((profile) => profile.id === selector.profileId);
```

```js
// Wrong: execute as soon as the provider emits a function call.
return callMcpTool(toolCall);

// Correct: issue one bound approval, wait for explicit user action, reload the
// live allowlist, then execute exactly once.
await pendingApproval.wait;
assertStillAllowed(liveProfile, toolCall);
return callMcpTool(toolCall);
```
