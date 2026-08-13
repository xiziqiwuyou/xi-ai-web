# User-Local MCP Connection Design

## Data Ownership

- Dedicated browser database: remembered `{ id, label, endpoint, createdAt,
  updatedAt }` records only.
- Session storage: non-remembered profiles only. No endpoint is inserted into
  the workspace repository or archive schemas.
- Server memory: opaque connection ID, session digest, normalized endpoint,
  bounded discovered tools, creation/expiry timestamps. No disk writes.
- Chat memory: active connection projections and selected opaque tool IDs.

## API

```text
GET    /api/chat/mcp/session
POST   /api/chat/mcp/connections
       { endpoint } -> { id, profileId, tools, expiresAt }
DELETE /api/chat/mcp/connections/:id
       {} -> 204
POST   /api/chat/stream
       { mcpToolIds: [opaque preset or user tool IDs] }
```

The browser-local label never crosses this API boundary. All connection
mutations require the anonymous MCP HttpOnly Cookie and current
CSRF proof. The global execution switch and anonymous-user switch must both be
on before connection creation or user-tool resolution.

## Runtime Integration

1. The user explicitly presses Connect; profile loading never contacts a remote
   server.
2. Connection creation validates endpoint/DNS and discovers tools, then stores
   one short-lived record in process memory.
3. User tool IDs use a dedicated opaque prefix and resolve only inside the
   bound anonymous session.
4. Preset IDs continue through the persisted Admin profile resolver. User IDs
   resolve through the connection store and reuse the same provider projection,
   approval store, bounded `tools/call`, and result projection.
5. Immediately before execution, the connection is re-resolved against the
   current session and policy; `callMcpTool` revalidates endpoint/DNS again.
6. Disconnect, expiry, session mismatch, or either global policy switch blocks
   execution and invalidates matching pending approvals.

## Rollback

- Turn off `userConnectionsEnabled` to hide and reject custom connections while
  retaining Admin presets.
- Turn off global MCP execution to invalidate both preset and user approvals.
- Removing the user UI and connection routes requires no data migration because
  browser records are isolated and server grants are transient.
