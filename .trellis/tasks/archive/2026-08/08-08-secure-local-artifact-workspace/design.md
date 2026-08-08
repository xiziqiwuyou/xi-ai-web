# Technical Design

## Boundary

The browser owns artifact records and editor state. Chat emits a local draft
when a user explicitly selects `保存为作品`; the artifact feature owns
normalization, persistence, versioning, preview, and export. The server and all
provider adapters remain untouched.

## Data Model

Add `ArtifactRecord`, `ArtifactVersion`, and `ArtifactKind` to the shared type
contract. A record stores at most 20 versions and each version stores bounded
plain source text. The record's `currentVersion` is an integer pointing to one
sanitized version. Optional provenance contains only conversation and message
IDs, never message attachments, credentials, or provider payloads.

`src/features/chat/artifactWorkspace.ts` is the single owner for:

- kind/language/title/content limits and runtime allowlists;
- HTML safety normalization and the CSP-wrapped `srcDoc` document;
- record creation, current-version projection, and immutable version append;
- artifact filename and download MIME/extension selection.

The pure layer returns new objects and never mutates source records. It is used
by both IndexedDB/workspace sanitizers and UI handlers so import, local save,
and preview share one contract.

## Persistence And Archive Flow

Add an `artifacts` object store at IndexedDB version 4. Extend
`WorkspaceSnapshot`, `WorkspaceDataCounts`, `workspaceDataStoreNames`, the
snapshot sanitizer, counts, merge, export/import integrity, workspace dialog
counts, and progress-sync counts. Missing `artifacts` in a legacy snapshot is
treated as an empty collection; malformed artifact entries are rejected at the
same collection boundary as existing records.

`loadWorkspaceArtifacts` and `saveWorkspaceArtifacts` wrap the existing write
queue. Chat loads artifacts after mount and writes only after hydration, so an
empty initial state cannot erase persisted records. The artifact dialog keeps
title, selected record, content, and preview state in React memory; only an
explicit save calls the repository.

## Chat And UI Flow

`ChatMessageContent` exposes `onSaveArtifact` for fenced code blocks. The
callback supplies inert source text and the inferred HTML/Markdown/code kind.
`ChatSessionBlock` forwards the callback and `ChatModule` owns the artifact
collection and dialog open state. A `作品` heading action opens the same dialog
without a draft. No new public route or global store is introduced.

`ArtifactWorkspaceDialog` uses one shared `Dialog` with a stable desktop
two-column list/detail frame and a single scrollable body. On mobile it becomes
one column with 44px controls. Selecting an existing artifact loads its current
version into a draft; `保存新版本` appends an immutable version. Export creates
a Blob for the selected current version and revokes its object URL after the
download. Closing discards unsaved edits.

`ArtifactPreview` renders HTML in an empty-sandbox iframe with a restrictive
CSP, Markdown through `ReactMarkdown` without raw HTML, and text/code in a
`pre`. The artifact sanitizer strips script/style-dangerous tags, inline event
handlers, JavaScript URLs, external resource attributes, and NUL characters
before preview and persistence. The iframe has no `allow` permissions and no
same-origin relaxation.

## Compatibility And Rollback

- IndexedDB version 4 creates only the new store; existing stores and records
  remain untouched.
- Workspace export version stays 1 because the snapshot gains a backward-
  compatible collection with a missing-field default.
- Removing the artifact UI leaves valid optional/empty workspace data; rollback
  can remove the Chat action and dialog while retaining the sanitizer/store.
- No provider request path consumes artifact content.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| HTML payload escapes the parent UI | Empty sandbox iframe, CSP, no raw HTML insertion, boundary stripping |
| Artifact content contains credentials | Local-only storage, no network path, explicit export only, privacy contract |
| A reload races an initial empty save | Hydration gate before save effect |
| Large versions exhaust IndexedDB | Per-version, per-record, and collection bounds; surface quota errors |
| New snapshot field breaks old sync/export | Missing-field defaults and compatibility tests |
| Nested scrollbars or mobile overflow | One Dialog scroll owner and responsive containment E2E |
