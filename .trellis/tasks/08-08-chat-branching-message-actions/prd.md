# Chat branching and message actions

## Goal

Add clean-room message actions and non-destructive conversation branching to the
existing AI Chat workbench. The feature must feel native to xi-ai-web, remain
browser-local, and preserve all existing BYOK, model, streaming, attachment,
search, knowledge, assistant, import/export, and session-stack behavior.

## Requirements

### Message actions

1. Every persisted user and assistant message exposes an accessible action bar.
2. Copy copies only the rendered message text and reports success/failure without
   leaking message content into logs or persistent state.
3. A user message supports **Edit and branch** through an inline editor. Confirming
   creates a new branch and sends the edited turn; the source conversation is not
   mutated.
4. An assistant message with a preceding user turn supports **Regenerate in new
   branch**. It recreates the preceding user turn and its valid attachments in a
   new branch, then performs one normal user-initiated Chat request.
5. Any persisted message supports **Continue from here**. It creates and opens a
   branch ending at that message without sending a request.
6. Synthetic welcome content has no branch actions.

### Branch behavior

1. A branch stores only `parentConversationId`, `sourceMessageId`, and
   `mode: continue | edit | retry` as provenance metadata.
2. Branch IDs are new client IDs. The branch is unpinned, titled from its source,
   inserted at the top, expanded, and all prior expanded sessions collapse.
3. The source conversation and source messages remain byte-for-byte unchanged.
4. The branch preserves only historical messages required by its branch point.
   Pending attachments, Skill/app selection, search provider, knowledge selection,
   request status, and notices are not inherited.
5. Edit/retry may stage the source turn's valid attachments in the new branch's
   ephemeral composer so the ordinary send pipeline applies existing limits and
   model capability checks.
6. The source session's selected model may be reused for continuity, but it is
   resolved from the current public model catalog and is never persisted as new
   branch metadata.

### Safety and interaction

1. Branch/edit/retry actions are disabled while any Chat response is streaming.
2. Only one inline editor may be open per session. Escape cancels; the editor has
   explicit Cancel and Create branch actions.
3. Empty edited content is rejected unless valid attachments exist.
4. If automatic send cannot start (missing Key, model removed, capability mismatch,
   or upstream error), keep the new branch, draft, attachments, and actionable
   notice so the user can recover.
5. Actions must work with mouse, keyboard, touch, desktop, mobile, light, and dark
   themes without changing message-track width or creating a new scroll owner.

### Persistence and compatibility

1. Branch metadata is sanitized through workspace storage and conversation
   import/export allowlists.
2. Legacy conversations without branch metadata continue to load unchanged.
3. Invalid, partial, oversized, or self-referential branch metadata is removed;
   it must never invalidate an otherwise valid conversation.
4. API keys, connection URLs, session search/knowledge state, and pending composer
   state remain excluded from conversation and workspace exports.

## Acceptance Criteria

- [ ] Copy works for user and assistant messages with Clipboard API fallback.
- [ ] Edit and branch creates one new branch, sends edited content once, and does
      not mutate the source conversation.
- [ ] Regenerate creates one branch from the preceding user turn and sends once.
- [ ] Continue creates an expanded top branch without an API request.
- [ ] Branch metadata survives IndexedDB save/load and allowed import/export.
- [ ] Legacy and malformed branch data are handled safely.
- [ ] Streaming disables all mutating message actions.
- [ ] Focus, labels, touch targets, mobile layout, and dark mode are covered.
- [ ] Targeted contracts, Playwright, type-check, privacy, server checks, and build
      pass with no new dependency.

## Out of Scope

- Branch tree visualization, branch switching, merge, compare, delete lineage,
  conversation search/archive/groups, Artifacts, MCP, and server-side sync.
- Copying LobeChat source, styles, component structure, text, icons, or assets.
- Changes to upstream provider request protocols or public server routes.
