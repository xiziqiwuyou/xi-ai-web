# Remote MCP Secure Foundation

This contract governs the administrator-only remote MCP discovery boundary.
It is intentionally narrower than a general MCP runtime: this release stores
public endpoint profiles and reads tool metadata, but never executes a remote
tool.

## 1. Scope / Trigger

- Trigger: changes to `server/mcp/**`, `mcpServers` metadata, the Admin MCP
  routes, or any future code that wants to call a remote MCP endpoint.
- Scope: administrator-managed HTTPS profiles, SSRF-safe read-only discovery,
  bounded untrusted projections, and an explicit execution gate.
- This is cross-layer infrastructure work. The browser may select a persisted
  profile ID, but it may not select an endpoint, header, cookie, credential, or
  remote tool name.

## 2. Signatures

```text
GET    /api/admin/mcp-servers
POST   /api/admin/mcp-servers
       { label, endpoint, enabled? }
PATCH  /api/admin/mcp-servers/:id
       { label?, endpoint?, enabled? }
DELETE /api/admin/mcp-servers/:id
POST   /api/admin/mcp-servers/:id/discover
       {}  // the body must be empty
POST   /api/admin/mcp-servers/:id/tools/call
       -> 501 MCP_EXECUTION_NOT_AVAILABLE
```

```ts
type McpServerProfile = {
  id: string;
  label: string;
  endpoint: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type McpToolDescriptor = {
  name: string;
  label: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  requiresApproval: true;
  untrusted: true;
};
```

Relevant bounded environment controls are:

- `MCP_ALLOW_LOCAL_ENDPOINTS=true` only enables local targets outside
  production; it never enables local targets in production.
- `MCP_ALLOW_INSECURE_HTTP=true` only has an effect with the local endpoint
  override outside production.
- `MCP_DISCOVERY_IP_RATE_LIMIT_MAX`, `MCP_DISCOVERY_MAX_CONCURRENT`,
  `MCP_DISCOVERY_RATE_LIMIT_WINDOW_MS`, and `MCP_DISCOVERY_RATE_LIMIT_MAX`
  control the existing request and per-profile discovery guards.

## 3. Contracts

- Persist only the six profile fields above. Never persist an API key, OAuth
  state, cookie, custom header, session ID, raw discovery response, or tool
  result.
- Profile labels and IDs are bounded and unique by case-insensitive label and
  endpoint. Legacy malformed rows are skipped during normalization; strict
  import rejects malformed or duplicate records.
- Endpoints have no URL credentials, query, or fragment. Production requires
  HTTPS on port `443` or `8443`. Restricted IPs are rejected both before DNS
  lookup and for every resolved DNS answer.
- Discovery revalidates the stored endpoint, pins the first validated DNS
  address for the complete handshake, rejects redirects, sends no cookies, and
  accepts only bounded JSON responses.
- The handshake is `initialize`, `notifications/initialized`, then
  `tools/list`, using protocol version `2025-06-18`. SSE and multipart
  transports are unsupported in this foundation.
- The server returns only a bounded projection with `untrusted: true` and
  `requiresApproval: true`. It is request-scoped and must not enter provider
  payloads, `allowedTools`, Chat, Agent, or Workflow execution.
- Public bootstrap contains neither MCP endpoint URLs nor discovery results.
  Metadata export/import may carry profiles but applies the credential scanner
  and revalidates every endpoint before persistence.
- Discovery is Admin-authenticated, rate-limited, cancellable, and audited only
  with profile ID, result code, bounded duration, and tool count. Error bodies
  never include the endpoint or remote response text.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing, malformed, credential-bearing, query-bearing, or fragment-bearing endpoint | `400 MCP_ENDPOINT_INVALID` |
| Restricted literal IP or private/link-local/metadata DNS answer | `400 MCP_ENDPOINT_UNSAFE` or `400 MCP_DNS_UNSAFE` |
| Production HTTP or port other than 443/8443 | `400 MCP_ENDPOINT_INVALID` |
| Unknown profile ID | `404 MCP_PROFILE_NOT_FOUND` |
| Disabled profile | `409 MCP_PROFILE_DISABLED` |
| Non-empty discovery request body | `400 MCP_PROFILE_INVALID` and no upstream request |
| Redirect, SSE, or multipart response | `501 MCP_TRANSPORT_UNSUPPORTED` |
| Malformed JSON-RPC, duplicate tool, oversized schema, or invalid bounds | `502 MCP_PROTOCOL_ERROR` |
| Upstream 401/403/404/405/415/5xx | `502 MCP_UPSTREAM_STATUS` |
| Upstream 429 | `502 MCP_RATE_LIMITED` |
| Timeout | `504 MCP_TIMEOUT` |
| Client abort | `499 MCP_DISCOVERY_CANCELLED` |
| Local discovery guard or in-flight profile collision | `429 MCP_RATE_LIMITED` or `409 MCP_DISCOVERY_IN_PROGRESS` |
| Any tools-call attempt | `501 MCP_EXECUTION_NOT_AVAILABLE`, with no remote request |

## 5. Good / Base / Bad Cases

- Good: an Admin saves a public HTTPS profile, discovery resolves a public
  address, performs the three JSON-RPC requests, and displays bounded tool
  names and schemas marked untrusted.
- Base: an old metadata file has no `mcpServers`; it loads as an empty array,
  while unrelated metadata remains usable.
- Bad: accepting a browser URL in the discovery body, fetching a DNS name
  after a separate unpinned validation, forwarding an authorization header,
  storing `Mcp-Session-Id`, treating a remote description as a system prompt,
  or falling back to a generic empty tool list after an error.

## 6. Tests Required

- Contract tests assert profile bounds, strict import allowlists, duplicate
  rejection, schema depth/size limits, JSON-RPC envelopes, and the execution
  gate.
- Server tests assert no network access for unsafe/unknown/disabled targets,
  DNS rebinding protection, redirect and transport rejection, response limits,
  timeout/cancellation, rate limits, deletion during discovery, redacted
  errors, and metadata round trips.
- Admin E2E covers CRUD, disabled state, discovery-only rendering, no execute
  button, request containment at `1440x900`, `1280x800`, `390x844`, and
  `375x812`, plus the existing Admin destinations.
- Run `npm run check`, `npm run test:server`, `npm run build`,
  `npm run ui-contract`, `npm run privacy`, `npm run feature-audit`, and
  `git diff --check` before committing.

## 7. Wrong vs Correct

```js
// Wrong: the browser chooses an arbitrary destination and credentials.
fetch("/api/admin/mcp-servers/discover", {
  method: "POST",
  body: JSON.stringify({ endpoint, headers: { Authorization: token } })
});

// Correct: the server resolves a stored profile and revalidates its endpoint.
fetch(`/api/admin/mcp-servers/${encodeURIComponent(profileId)}/discover`, {
  method: "POST",
  body: "{}"
});
```

```js
// Wrong: discovered metadata becomes executable model tooling.
providerRequest.tools = discovery.tools;

// Correct: keep the projection display-only until a separately reviewed
// execution contract supplies consent, argument validation, isolation, and audit.
renderUntrustedToolList(discovery.tools);
```

## Design Decisions

- Public HTTPS profiles plus server-side DNS pinning were chosen over a
  general-purpose browser proxy to keep SSRF and credential boundaries
  enforceable at one server-owned point.
- JSON-only discovery was chosen for this foundation. Supporting streamable
  HTTP, OAuth, stdio, or WebSocket would require independent lifecycle,
  authentication, and cancellation contracts.
- Tool execution is a hard 501 gate rather than a partial implementation so
  discovering prompt-injection-bearing metadata cannot silently become an
  arbitrary remote command path.
