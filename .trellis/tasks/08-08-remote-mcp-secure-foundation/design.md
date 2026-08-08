# Technical Design

## Architecture Boundary

The Admin console owns profile configuration. The server owns endpoint
validation, DNS checks, JSON-RPC transport, response normalization, rate
limits, and audit-safe error mapping. The public browser never receives a
general-purpose proxy or a client-controlled destination.

## Data Model

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

`McpServerProfile` is the only persisted MCP record. It has no auth material or
remote response cache. Discovery projections are request-scoped. Use a stable
`mcpServers` metadata collection and normalize it at every load/import path.

## Server Modules And Routes

- `server/mcp/contract.mjs`: bounded profile and discovery projection
  normalization, closed error codes, and JSON-RPC shape checks.
- `server/mcp/security.mjs`: HTTPS/port/userinfo/query/fragment checks and
  public DNS/private-address validation built on `upstream-security.mjs`.
- `server/mcp/client.mjs`: one-shot `initialize` then `tools/list` JSON HTTP
  exchange. It uses `redirect: "error"`, a bounded `AbortSignal`, no cookies,
  and no caller-supplied headers.
- Authenticated Admin routes expose CRUD and `POST /mcp-servers/:id/discover`.
  The route resolves the server ID from `db.mcpServers`; it never accepts a
  destination URL from `req.body` for discovery.

The discovery request sequence is:

```text
POST configured endpoint: initialize
POST configured endpoint: notifications/initialized
POST configured endpoint: tools/list
```

Only JSON responses are accepted in this foundation. A `text/event-stream` or
`multipart/mixed` response returns `MCP_TRANSPORT_UNSUPPORTED`; no parser or
fallback is attempted.

## Security Controls

- Validate at profile write and immediately before every request.
- Reject non-HTTPS production endpoints, ports outside 443/8443, userinfo,
  query, fragment, blocked IP ranges, blocked DNS answers, and redirects.
- Cap endpoint label/URL, request body, response body, tool count, names,
  descriptions, and nested schema depth/keys. Abort at 8 seconds by default.
- Rate-limit Admin discovery by IP and profile ID. Do not include endpoint or
  response text in errors, logs, audit metadata, or client telemetry.
- Do not persist `Mcp-Session-Id`; if a server returns one during discovery it
  exists only within that request and is never exposed as a credential.
- Return descriptors as untrusted display data. They cannot enter `allowedTools`
  or provider payloads until a future execution task passes a separate consent
  and argument-validation gate.

## Compatibility And Rollback

- Missing `mcpServers` in old `app-data.json` normalizes to `[]`.
- Metadata import keeps the existing credential-like key scanner and rejects
  any attempted secret/header fields in MCP records.
- Removing the Admin section and routes leaves existing model/tool/provider
  behavior unchanged; no database migration or new dependency is required.

## Verification Shape

- Pure contract tests cover endpoint/profile/projection bounds and all error
  codes.
- Server tests use a fake fetch and DNS lookup to prove no upstream access on
  unsafe targets, malformed responses, disabled profiles, and execution calls.
- Admin E2E covers CRUD, discovery result rendering, redacted errors, and
  desktop/mobile containment. Request logs assert no client-controlled URL and
  no provider/Chat request.
