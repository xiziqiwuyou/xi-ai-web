# User-Local MCP Connections

## Goal

Let an anonymous Chat user connect a personally chosen public HTTPS MCP
service while preserving xi-ai-web's local-first, no-account data boundary.

## Product Boundary

- Admin-managed MCP profiles remain available as system presets.
- The Admin console owns the global execution kill switch and a separate
  switch controlling whether anonymous users may add custom MCP services.
- User profile labels and endpoint URLs are stored only in browser-local
  storage. They never enter `app-data.json`, metadata backup/import, audit,
  workspace export, progress sync, analytics, or logs.
- The server may hold a bounded endpoint and tool descriptor set only in a
  short-lived process-local record bound to the anonymous MCP session.
- Browser-local labels never enter the connection request, server runtime, or
  provider tool metadata; the server uses a generic user-service label.
- This phase supports public HTTPS Streamable HTTP/JSON-RPC MCP services with
  no authentication. Bearer tokens, OAuth, custom headers, cookies, local/NAS
  addresses, stdio, WebSocket, and SSE transport are out of scope.
- Every tool invocation retains the existing explicit per-call approval.

## Acceptance Criteria

- [ ] User custom connections are globally disabled by default and cannot be
      enabled through public requests, import, restore, or workspace sync.
- [ ] The Chat UI can add, remember locally, connect, select a tool, disconnect,
      and delete a user MCP profile without an account.
- [ ] A session-only profile expires with `sessionStorage`; a remembered profile
      stores only label and endpoint in a dedicated IndexedDB database.
- [ ] The browser sends an endpoint only to the explicit connection route. Chat
      requests send opaque connection tool IDs, never endpoint or schema.
- [ ] Server connection records are session-bound, short-lived, capacity
      bounded, process-local, non-exportable, and absent from logs/audit.
- [ ] Connection creation and every tool call revalidate endpoint/DNS safety,
      reject redirects, and forward no Provider API Key or browser Cookie.
- [ ] Expired, wrong-session, disconnected, disabled, forged, rejected, or
      cancelled paths perform zero remote tool calls.
- [ ] Admin presets, independent search, local tools, Agents, Workflows,
      workspace import/export, progress sync, and manual BYOK remain unchanged.
- [ ] Desktop/mobile E2E and a conditional public HTTPS smoke harness pass.

## Non-Goals

- No credential persistence or cross-device MCP synchronization.
- No automatic reconnect that performs network access on page load.
- No multi-instance shared connection/approval store.
- No release, tag, image publish, or remote push in this task.
