# Remote MCP Secure Connection Foundation

## Goal

Introduce the first clean-room slice of remote Model Context Protocol support
without turning xi-ai-web into an open proxy or an automatic tool runner.
Administrators may register public HTTPS MCP endpoints, validate them against
the existing SSRF boundary, and explicitly discover their advertised tools.
The result is a safe foundation for a later, separately reviewed execution
task.

## Confirmed Boundaries

- Preserve the existing React/Vite/Express, BYOK, admin-auth, tool ownership,
  and metadata-backup architecture.
- The browser submits a stable MCP profile ID only. It never submits an MCP
  URL, arbitrary headers, cookies, or a remote tool name to select a target.
- A profile is an administrator-owned allowlist entry. Its endpoint must be a
  public HTTPS URL without credentials, query strings, fragments, or hidden
  auth material. Production accepts only ports 443 and 8443.
- Remote calls happen only on the server through an admin-authenticated
  discovery action. Discovery is rate-limited and uses redirect rejection,
  DNS/private-address checks, a bounded timeout, and response-size limits.
- This task supports JSON-RPC `initialize` and `tools/list` discovery over a
  JSON HTTP response. Streamable HTTP SSE responses, stdio, WebSocket, OAuth,
  dynamic registration, resources, prompts, and arbitrary headers are explicit
  unsupported states with safe errors.
- Discovered tool metadata is untrusted display data. It is bounded, held in
  the current Admin request/UI only, and never sent to a model, persisted as a
  credential, or executed.
- No remote tool call is added to Chat, Agents, or Workflows in this task.
- No new public menu, marketplace, sharing, collaboration, or server-side
  user account is introduced.

## Requirements

### R1 - Administrator MCP Profiles

- Add a bounded `McpServerProfile` record with stable ID, display label,
  endpoint, enabled state, and timestamps. The record contains no secret,
  token, cookie, custom header, OAuth state, or raw discovery response.
- Add Admin CRUD through the existing authenticated Admin boundary. Creation
  and updates validate the endpoint before persistence; deletion is explicit
  and guarded when the profile is referenced by an in-flight discovery.
- Include profiles in Admin bootstrap/metadata round trips with strict
  allowlist normalization. Public bootstrap exposes no endpoint or secret.

### R2 - SSRF-Safe Endpoint Contract

- Reuse the project upstream security primitives and add MCP-specific checks:
  HTTPS in production, no userinfo/query/fragment, public DNS answers only,
  blocked loopback/link-local/private/metadata ranges, and no redirects.
- Revalidate the profile at discovery time, not only at save time. A DNS
  failure, private answer, unsupported port, invalid content type, or unsafe
  redirect must fail before any MCP request body is sent.
- Never include the endpoint, request headers, or remote response body in an
  audit entry or error shown to the browser. Audit only profile ID, result
  code, bounded duration, and tool count.

### R3 - Bounded Read-Only Discovery

- Send the minimum JSON-RPC handshake required for discovery, then request
  `tools/list`; include a fresh request ID and the supported protocol version.
- Accept only a bounded JSON response in this task. Reject SSE/multipart,
  redirects, oversized bodies, malformed JSON-RPC, duplicate tool names,
  missing names, and schemas/descriptions over their limits.
- Return a safe projection containing profile ID, protocol version, tool name,
  label/description, and a bounded JSON schema summary. Mark every result as
  untrusted and `requiresApproval: true` for the future execution phase.
- Abort on timeout, client cancellation, or server shutdown and classify
  errors as validation, network, timeout, protocol, unsupported-transport, or
  rate-limit without leaking secrets or raw remote text.

### R4 - Explicit Future-Execution Gate

- Add a shared contract indicating that discovered tools cannot be invoked in
  this release. Any attempted execution route must return a stable
  `MCP_EXECUTION_NOT_AVAILABLE` error and must not contact the remote server.
- Keep per-tool consent, argument validation, result bounds, prompt-injection
  isolation, and audit redaction in the next task's acceptance criteria; do
  not implement a partial bypass here.

## Acceptance Criteria

- [ ] Admin can create, update, list, disable, and delete bounded MCP profiles;
      malformed or credential-bearing endpoints are rejected.
- [ ] Metadata export/import round-trips profiles without secrets; public
      bootstrap contains neither endpoint URLs nor discovery data.
- [ ] Discovery accepts only an enabled administrator profile ID and performs
      no request for invalid, disabled, unknown, private, rebinding, or
      redirected targets.
- [ ] Valid JSON-RPC initialize/tools-list responses produce bounded,
      duplicate-free, untrusted tool projections; SSE and malformed responses
      return explicit safe errors.
- [ ] Timeout, cancellation, body-size, rate-limit, and upstream status errors
      are classified and redacted; audit records contain no URL, token, schema
      body, or response text.
- [ ] No MCP discovery or configuration path changes Chat/provider behavior,
      sends a model request, executes a remote tool, or persists credentials.
- [ ] Server contracts, Admin browser coverage, privacy scan, type check,
      build, and changed-scope E2E pass on desktop/mobile where UI is touched.

## Out Of Scope

- Remote `tools/call`, automatic model tool selection, Agent/Workflow runtime
  execution, stdio/Desktop MCP, OAuth or API-key storage, resource/prompt
  subscriptions, WebSocket transport, MCP marketplace, and collaboration.
