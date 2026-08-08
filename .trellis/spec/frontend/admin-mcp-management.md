# Admin MCP Management Contract

The Admin console exposes MCP only as a private configuration and discovery
surface. It is not a public menu, tool marketplace, or execution console.

## 1. Scope / Trigger

- Trigger: changes to `AdminMcpSection`, MCP entries in `adminConsoleConfig`,
  Admin bootstrap normalization, MCP API helpers, or the Admin stylesheet.
- Scope: responsive CRUD controls and display-only discovery results inside the
  existing Admin workbench and two-level navigation.

## 2. Signatures

```ts
type AdminMcpSectionProps = {
  profiles: McpServerProfile[];
  selectedProfileId: string | "new";
  form: { label: string; endpoint: string; enabled: boolean };
  onSelect(id: string): void;
  onCreate(): void;
  onChange(patch: Partial<typeof form>): void;
  onSubmit(event: FormEvent): void;
  onDelete(): void;
  onDiscover(): Promise<McpDiscoveryResult>;
};
```

The client API surface is limited to `listMcpServers`, `createMcpServer`,
`updateMcpServer`, `deleteMcpServer`, and `discoverMcpServer(id)`.

## 3. Contracts

- MCP appears under the existing Admin `AI capabilities` group as one second-
  level destination. It must not be added to public navigation or Chat tool
  menus.
- The form accepts only label, endpoint, and enabled state. The UI must not
  offer credential, cookie, custom-header, OAuth, or arbitrary URL fields.
- Discovery is disabled for a new or disabled profile and sends `{}` with the
  stored profile ID only. Selecting a profile, opening the menu, or editing a
  field never performs network discovery.
- Discovery results are explicitly labeled display-only. Render bounded name,
  label, description, and optional schema; never render an execute/call action
  or pass results to model state.
- Profile changes remain in Admin bootstrap state and are persisted through the
  authenticated Admin API. Endpoint validation and security errors come from
  the server and must be shown without reflecting secrets or raw upstream
  text.
- Reuse the Admin workbench geometry: one mounted section, one page scroll
  owner, stable form actions, visible keyboard focus, and containment at the
  four standard desktop/mobile viewports.

## 4. Validation & Error Matrix

| Condition | Required UI behavior |
| --- | --- |
| Empty label or endpoint | Block submit with local field feedback |
| Server rejects endpoint/profile | Keep the draft and show bounded server error |
| New or disabled profile | Keep Discover disabled |
| Discovery is running | Disable duplicate action and show progress state |
| Discovery succeeds | Show protocol, count, truncation state, and display-only rows |
| Discovery fails | Clear stale result, retain profile draft/selection, and show retryable error |
| Delete requested | Use the shared confirmation flow; never delete silently |
| Profile disappears after reload | Reset selection to `new` without mounting a public surface |
| Mobile or 1280px viewport | Keep actions and details reachable without horizontal overflow or clipped sticky controls |

## 5. Good / Base / Bad Cases

- Good: an operator selects a saved profile, explicitly clicks Discover, and
  sees a bounded untrusted list without a second dialog or execute button.
- Base: no profiles exist; the section opens in the new-profile form and the
  rest of the Admin console remains unchanged.
- Bad: discovery runs on select, the browser submits an endpoint or token,
  discovery results appear in public bootstrap, or a long schema expands the
  page beyond the single Admin scroll owner.

## 6. Tests Required

- Type and bootstrap tests assert the profile allowlist and legacy empty-array
  normalization.
- Admin E2E asserts CRUD, disabled/new action states, explicit discovery,
  display-only results, safe errors, keyboard focus, and geometry at
  `1440x900`, `1280x800`, `390x844`, and `375x812`.
- UI contract and privacy scans must continue to pass; request assertions must
  prove that no URL, credential, or discovery result enters public bootstrap.

## 7. Wrong vs Correct

```tsx
// Wrong: discover while the operator is merely browsing profiles.
onChange={(event) => {
  select(event.target.value);
  void discover(event.target.value);
}}

// Correct: selection is local; discovery is an explicit action.
onChange={(event) => select(event.target.value)}
<button type="button" onClick={() => void discover()}>Discover tools</button>
```

```tsx
// Wrong: offer an execution affordance for untrusted metadata.
<button onClick={() => callRemoteTool(tool.name)}>Run</button>

// Correct: communicate the current release boundary.
<span>Display only</span>
```
