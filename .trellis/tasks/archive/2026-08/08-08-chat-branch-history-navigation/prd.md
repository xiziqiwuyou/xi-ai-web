# Conversation Branch History Navigation

## Goal

Let users understand and navigate the local history of a branched Chat
conversation without changing the conversation schema, provider request flow,
or default session ordering.

## Background

The completed message-actions task already persists optional branch provenance
on each child conversation:

```ts
type ConversationBranch = {
  parentConversationId: string;
  sourceMessageId: string;
  mode: "continue" | "edit" | "retry";
};
```

The conversation manager already owns local search, Active/Archived views,
archive/restore commands, dialog focus, and mobile containment. Branch history
navigation must extend this surface instead of creating another sidebar,
dialog, persistence layer, or server API.

## Requirements

### R1 - Derived Local Lineage

- Build branch families from the current in-memory `Conversation[]` using only
  `Conversation.id` and the sanitized optional `branch` record.
- Do not add a branch-tree field, branch index, server record, storage key, or
  migration. Existing IndexedDB and export formats remain authoritative.
- Include active and archived conversations so lineage does not disappear when
  one member is archived.
- Exclude neutral conversations that have neither branch provenance nor branch
  descendants from the branch view.
- Keep the input array and every conversation object immutable.

### R2 - Bounded And Defensive Graph Projection

- Cap the projected collection, traversal depth, and visible descendants using
  constants owned by the branch-history helper.
- Preserve deterministic order using the current conversation order with a
  stable timestamp fallback; never reorder the ordinary Chat session stack.
- Treat missing parents as orphan roots and expose a bounded missing-parent
  state instead of dropping the child.
- Detect self references and multi-record cycles even when malformed imported
  records bypass an older sanitizer. Break cycles deterministically, expose a
  bounded invalid-lineage state, and never recurse indefinitely.
- Duplicate IDs or invalid provenance are ignored only for the affected edge;
  unrelated conversations remain navigable.

### R3 - Conversation Manager Branch View

- Extend `ChatConversationManager` with a third real view named `branches` next
  to Active and Archived. Reuse the existing dialog, search field, list scroll
  owner, focus restoration, and responsive geometry.
- Show one compact family at a time with nested rows for root, children, and
  deeper descendants. Use progressive disclosure for families; do not render a
  permanent tree beside the Chat workspace.
- Mark the currently expanded Chat conversation with visible text and
  `aria-current`. Label branch modes as Continue, Edit, or Retry rather than
  exposing raw internal values.
- Search in the Branches view remains local and bounded. A matching descendant
  keeps its ancestors visible so users retain lineage context.
- Do not use tree ARIA roles unless full tree keyboard behavior is implemented.
  Nested semantic lists plus ordinary buttons and truthful `aria-expanded` are
  sufficient for this release.

### R4 - Navigation And Archive Semantics

- Opening an active node must call the existing managed-conversation handler:
  close the manager, collapse other sessions, and place the selected session at
  the top without changing pinning or `updatedAt`.
- An archived node must never restore implicitly. It shows an explicit Restore
  action that reuses the current restore handler and opens the restored session
  only after that action succeeds.
- Branch browsing, family expansion, and search remain available while a Chat
  request streams. Open and Restore stay disabled through the existing shared
  synchronous mutation guard, including handler-bypass protection.
- Navigation, filtering, and expansion issue zero Chat, search, knowledge,
  provider, MCP, or server requests.

### R5 - Compatibility And Privacy

- Preserve `ConversationBranch`, workspace archive, conversation archive,
  temporary sync, and IndexedDB contracts exactly as they are.
- Do not persist the selected Branches view, expanded family IDs, search query,
  current-node marker, graph diagnostics, or derived tree.
- Do not include message content, attachments, citations, API Keys, URLs,
  Skills/apps, search state, or session UI in lineage metadata.
- Missing parents caused by partial import or independent archival remain
  recoverable display states, not fatal hydration errors.

## Acceptance Criteria

- [ ] Pure helpers derive deterministic nested branch families without
      mutating input or changing ordinary session order.
- [ ] Orphans, invalid parents, duplicate IDs, depth limits, and cycles are
      bounded and rendered without crashes or infinite traversal.
- [ ] The existing manager exposes Active, Archived, and Branches views in one
      stable dialog at all four standard Playwright viewports.
- [ ] Branch search retains ancestor context and makes no network request.
- [ ] Active parent, sibling, and descendant nodes open through the current
      single-expanded-session behavior.
- [ ] Archived nodes require explicit Restore and never restore on row click.
- [ ] Streaming leaves read-only branch inspection available while disabling
      Open and Restore in UI and handler-bypass paths.
- [ ] No persistence or export schema changes are introduced, and privacy,
      local-chat, workspace, UI, build, and E2E checks pass.

## Out Of Scope

- Editing, merging, rebasing, deleting, renaming, pinning, or dragging branches.
- A graphical node canvas, timeline diff, message-level compare, or merge UI.
- Server-side branch APIs, cloud synchronization, collaboration, sharing, or
  multi-user branch ownership.
- Automatic restoration of archived records or automatic repair of imported
  provenance.
- Changes to Provider adapters, send payloads, message action semantics, or
  Remote MCP execution.
