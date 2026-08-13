# Admin MCP Management Contract

The Admin console owns remote MCP configuration, discovery, and execution
allowlists. It is not a public marketplace or a direct remote-tool console.

## Scope / Trigger

- Trigger: changes to `AdminMcpSection`, MCP Admin bootstrap/types/API helpers,
  or MCP Admin styles.
- Scope: responsive profile CRUD, explicit discovery, the global execution
  switch, the separate anonymous user-connection switch, profile execution
  switch, and individual tool allowlists.

## Contracts

- MCP remains one second-level destination under the existing Admin AI group.
- The profile form accepts only display label, endpoint, and enabled state. It
  must not expose credentials, cookies, headers, OAuth, or arbitrary request
  fields.
- Discovery happens only after the operator presses Discover. Selecting or
  editing a profile never causes network access.
- The anonymous user-connection switch defaults off, remains disabled while
  global execution is off, and is not mutable through metadata import, backup
  restore, or public APIs. Turning either policy off clears ephemeral user
  connections and invalidates their pending approvals.
- Global execution defaults off. Profile execution and every tool checkbox also
  default off, and all three gates are required before Chat can see a tool.
- Saving an allowlist sends only tool names. The server performs fresh
  discovery and rejects names not currently returned by that profile when
  enabling execution. Disabling execution or clearing the allowlist remains
  available during remote outages.
- Disabling global/profile execution or deleting/changing a profile invalidates
  pending approvals. The UI must communicate this without exposing arguments
  or results.
- Discovery schemas remain untrusted display data. The Admin page never gains a
  Run button and never calls `/tools/call`.
- Reuse the Admin workbench geometry: one mounted section, one page scroll
  owner, stable action placement, visible keyboard focus, and no horizontal
  overflow at the four standard viewports.

## UI State Matrix

| Condition | Required UI behavior |
| --- | --- |
| No saved profile | Open the new-profile form; discovery and execution controls are unavailable |
| Empty label or endpoint | Preserve draft and block submit with clear feedback |
| New or disabled profile | Disable discovery and profile execution |
| Discovery running | Disable duplicate discovery and show bounded progress |
| Discovery succeeds | Show protocol/count and bounded untrusted tool rows |
| Tool allowlist edited | Keep changes local until the operator presses Save execution permissions |
| Server rejects stale tool name | Preserve draft, show bounded retryable error, do not enable execution |
| Global switch turned off | Refresh public bootstrap and state that pending calls were invalidated |
| Delete requested | Use the shared confirmation flow; never delete silently |
| Mobile/1280px viewport | Keep switches, checkboxes, and actions reachable without clipping or horizontal overflow |

## Client Surface

```ts
api.listMcpServers()
api.createMcpServer(profile)
api.updateMcpServer(id, profile)
api.deleteMcpServer(id)
api.discoverMcpServer(id)
api.updateMcpExecution(enabled)
api.updateMcpServerExecution(id, { executionEnabled, allowedToolNames })
```

The Admin client may send only persisted profile fields and bounded tool names.
Endpoint safety, discovery freshness, and final authorization remain server
responsibilities.

## Verification

- Bootstrap normalization defaults legacy profiles to execution disabled with
  an empty allowlist.
- Server tests prove public bootstrap hides profiles/endpoints/schemas and
  import/restore cannot alter the live global switch.
- Admin E2E covers create, discover, global enable, per-tool allow, profile
  enable, save, no direct tools-call, and geometry at `1440x900`, `1280x800`,
  `390x844`, and `375x812`.
- Privacy and UI contract scans must remain green.

## Wrong Vs Correct

```tsx
// Wrong: discovery runs while browsing profiles.
onChange={(event) => {
  select(event.target.value);
  void discover(event.target.value);
}}

// Correct: selection is local and discovery is explicit.
onChange={(event) => select(event.target.value)}
<button type="button" onClick={() => void discover()}>Discover tools</button>
```

```tsx
// Wrong: execute untrusted metadata from Admin.
<button onClick={() => callRemoteTool(tool.name)}>Run</button>

// Correct: save a server-revalidated allowlist; Chat still requires per-call approval.
<input type="checkbox" checked={allowedToolNames.includes(tool.name)} />
<button onClick={saveExecutionPermissions}>Save execution permissions</button>
```
