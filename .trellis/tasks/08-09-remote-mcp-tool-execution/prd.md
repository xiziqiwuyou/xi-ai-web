# Remote MCP Tool Execution With Explicit Approval

## Goal

Extend the existing v0.0.12 remote MCP discovery foundation into a safe,
disabled-by-default execution path that can be consumed by Chat without making
xi-ai-web an open remote proxy or an automatic tool runner.

## Product Boundary

- Administrators own MCP profiles and the allowed tool names. The browser
  submits only stable profile/tool identifiers, never an endpoint, header,
  cookie, token, or arbitrary remote method.
- Only public HTTPS MCP endpoints already accepted by the discovery boundary
  are eligible. Credential-bearing endpoints, OAuth, custom headers, stdio,
  WebSocket, SSE-only transport, and local HTTP remain out of scope.
- Execution is disabled by default. An administrator must enable the global
  execution switch, enable a profile, and explicitly allow individual tools.
- Chat must ask the user for approval for every tool invocation by default.
  Approval is bound to one browser session, one conversation turn, one tool
  name, one bounded argument payload, and a short expiration. There is no
  blanket approval in this phase.
- A rejected, expired, cancelled, malformed, or unavailable approval must not
  contact the remote MCP server or the model provider for a follow-up round.
- Remote tool output is untrusted external context. It must be size-bounded,
  structurally projected, visibly marked, and isolated from system/developer
  instructions and API credentials before the model sees it.
- Do not integrate execution with Agents, Workflows, knowledge retrieval,
  public menus, marketplace features, or server-side user accounts.

## Requirements

### R1 - Administrator Allowlist

- Add an execution-enabled setting that is false by default and never changes
  through public bootstrap, workspace import, restore, or browser requests.
- Store only profile ID, enabled state, endpoint, and bounded allowed tool
  names. Do not persist discovery response bodies, remote credentials, or
  browser approval state.
- Admin discovery results remain untrusted and may be used to select a bounded
  tool allowlist only after the administrator confirms the exact tool name.
- Removing or disabling a profile/tool invalidates pending approvals.

### R2 - Safe `tools/call` Transport

- Revalidate the server-owned profile endpoint and pinned DNS result at call
  time, reject redirects, and use the existing timeout, body, concurrency,
  rate-limit, and cancellation guards.
- Send only JSON-RPC `tools/call` with the selected tool name and bounded JSON
  arguments. Reject unknown fields, unsupported argument types, oversized or
  deeply nested values before any network request.
- Accept only bounded JSON responses. Normalize text/content/resource results
  into a non-executable projection. Reject malformed JSON-RPC, duplicate or
  oversized content, unsupported transport, and upstream failures with stable
  redacted error codes.
- Never log or audit endpoint URLs, arguments, tool output, cookies, or API
  Keys. Audit only profile ID, tool name hash/label, result category, and
  bounded duration.

### R3 - Chat Approval State

- Represent a pending tool call as an explicit server-issued opaque approval
  record, bound to the session and conversation turn. It must be single-use,
  short-lived, cancellable, and replay-resistant.
- Stream a distinct approval event to the existing Chat UI; do not hide the
  request in assistant text or auto-confirm from a model response.
- On approval, the browser submits only the opaque approval ID and a CSRF/
  session proof already used by the current Chat boundary. The server reloads
  all tool/profile metadata and ignores client-supplied endpoint or schema.
- On reject, cancel, timeout, provider abort, or page disconnect, delete the
  pending record and make zero remote MCP calls.
- The approval view must expose the server label, tool label, a safe bounded
  arguments preview, expiration state, approve, reject, and cancel actions.
  It must work in desktop/mobile and dark mode without a new top-level modal
  flow.

### R4 - Model Follow-up Contract

- Preserve the existing prompt/function tool invocation modes. MCP tools are
  added only to a request that is explicitly enabled and authorized for the
  current turn.
- After a successful call, add the projected untrusted result as a tool-result
  message and continue the same provider protocol with the existing abort and
  token-buffer behavior.
- If the provider does not support function tools, do not silently execute an
  MCP call from prompt text. Return a clear unavailable capability state.
- Do not automatically fall back to local tools, hosted search, or another MCP
  profile on failure.

## Acceptance Criteria

- [ ] Execution remains off by default and cannot be enabled by public/import/
      restore paths.
- [ ] Unknown profile/tool IDs, forged endpoints, forged schemas, replayed
      approvals, expired approvals, wrong sessions, and oversized arguments
      fail before remote network access.
- [ ] Approval, rejection, cancellation, timeout, profile disable, and page
      disconnect produce deterministic zero/one remote-call behavior.
- [ ] Successful and failed `tools/call` results are bounded, redacted, marked
      untrusted, and preserved through the selected Chat protocol without
      leaking keys or endpoint data.
- [ ] Local Chat behavior, independent GLM/Kimi search, existing registered
      tools, Shell/OneAPI handoffs, and manual BYOK remain unchanged.
- [ ] Server contracts, security/privacy scans, Admin desktop/mobile E2E,
      Chat desktop/mobile E2E, keyboard paths, dark mode, and release-check
      pass before a version decision.

## Explicit Non-goals

- No automatic approval, per-profile blanket approval, or tool marketplace.
- No MCP resources, prompts, sampling, elicitation, subscriptions, OAuth,
  custom authentication headers, stdio, WebSocket, or SSE transport.
- No tool execution from Agents, Workflows, PPT, Mind Map, Knowledge, or image
  generation modules.
