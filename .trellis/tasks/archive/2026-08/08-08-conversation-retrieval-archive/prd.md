# Local Conversation Retrieval And Archive

## Goal

Let users find and temporarily remove old local conversations without accounts,
server-side storage, provider calls, or permanent deletion. The active Chat
workspace must stay focused while archived conversations remain recoverable.

## Background

- P1 already provides local conversations, pinning, immutable branches,
  IndexedDB persistence, and import/export.
- Chat currently hydrates all conversations into one session stack. It has no
  retrieval surface or archive state.
- This task is the P2A child of the clean-room LobeChat capability roadmap.
  Product behavior may inform requirements; no source, component, copy, asset,
  dependency, schema, or visual implementation is copied.

## Requirements

### R1 - Local Retrieval

- Search only title, preview, and persisted message `content`.
- Ignore case for Latin text and support contiguous Chinese text.
- Trim and cap query length, rank title above preview above message body, and
  cap displayed results.
- Do not inspect attachment text/data URLs, knowledge citations, URLs, API Keys,
  drafts, tools, Skills/apps, or other transient session state.
- Opening, typing, filtering, and selecting search results make zero Chat,
  provider, search-provider, knowledge, or server requests.

### R2 - Archive Lifecycle

- `Conversation.archivedAt` is optional strict ISO metadata. Missing means active.
- Archive explicitly sets `archivedAt`, clears pinning, removes the record from
  the active session stack, and preserves messages and branch provenance.
- Restore explicitly clears `archivedAt`, keeps the conversation unpinned,
  updates its recency, expands it at the top, and collapses other sessions.
- Archive/restore never cascades between parent and child branches.
- Permanent deletion and batch operations are not part of this task.

### R3 - Conversation Manager

- Add one compact `管理会话` action to the Chat heading.
- Reuse the shared Dialog and its focus trap, Escape, inert background, and
  single scroll-owner contract.
- Provide a search input, Active/Archived segmented filter, count, and compact
  result rows with title, preview, timestamp, pin indicator, and context command.
- An active result opens the existing session. An archived result must be
  restored explicitly; selecting it cannot silently mutate data.
- Desktop and mobile geometry stays stable, dark mode remains legible, and
  mobile controls are at least 44px.

### R4 - State And Compatibility

- Persist only `archivedAt`; manager visibility, query, filter, focus, and scroll
  are component state and never enter IndexedDB or exports.
- Workspace and conversation archives allowlist valid `archivedAt`; malformed
  values are removed without dropping the conversation.
- Legacy data without `archivedAt` remains active with no migration job.
- If no active conversation remains, create the normal neutral new conversation
  even when archived records still exist.
- Any streaming Chat request disables archive, restore, and session-opening
  mutations; read-only search remains available.

## Acceptance Criteria

- [x] Search matches bounded title/preview/body content and excludes attachments.
- [x] Search and archive-manager interactions issue zero API requests.
- [x] Archive and restore persist through reload and workspace/conversation export.
- [x] Invalid archive metadata is non-fatal and privacy scans remain clean.
- [x] Active stack hides archived records without losing them from local storage.
- [x] Restored sessions appear expanded at the top; all others collapse.
- [x] Archiving the last active record creates one new neutral conversation.
- [x] Streaming locks every archive/restore/open mutation without corrupting state.
- [x] Branch parent/child archive state remains independent.
- [x] Desktop/mobile keyboard, dark-theme, touch-size, overflow, and focus tests pass.

## Out Of Scope

- Conversation groups/folders, nested hierarchy, drag ordering, permanent delete,
  batch operations, cloud sessions, accounts, sharing, real-time sync, AI
  classification, semantic/vector search, branch trees, Artifacts, and MCP.
