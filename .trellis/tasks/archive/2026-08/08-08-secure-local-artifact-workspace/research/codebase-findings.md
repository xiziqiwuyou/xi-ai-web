# Codebase Findings

- `src/features/chat/ChatMessageContent.tsx` already renders fenced code with a
  Chat-owned toolbar and previews HTML in an empty `sandbox` iframe. Its local
  `htmlPreviewDocument` helper adds a basic CSP, but the preview is ephemeral,
  accepts no artifact callback, and has no version or export boundary.
- `src/features/chat/ChatSessionBlock.tsx` owns each persisted message row and
  forwards ChatMessageContent props. `src/features/chat/ChatModule.tsx` owns
  hydrated local conversations and is the narrowest existing owner for a Chat
  local artifact collection and manager dialog; `App` does not need a new global
  store or public route.
- `src/components/ui/Dialog.tsx` is the required overlay primitive. Existing
  dialogs use one scroll owner, shared focus trapping, and responsive 36/44px
  controls. Artifact UI should follow that pattern instead of adding a modal
  implementation.
- `src/features/workspace/workspaceDb.ts` has one typed store map and creates
  missing stores during `onupgradeneeded`. The current database version is 3;
  adding `artifacts` at version 4 is a compatible additive upgrade.
- `src/features/workspace/workspaceArchive.ts` owns the workspace snapshot
  sanitizer, counts, merge/replace, SHA-256 export integrity, and strict import
  validation. `WorkspaceSnapshot` is currently a required collection map, so
  the new collection must be added to every empty snapshot and legacy missing
  fields must default to `[]` before strict validation.
- `src/features/workspace/workspaceRepository.ts` wraps IndexedDB reads and the
  serialized write queue. A hydration-gated `loadWorkspaceArtifacts`/
  `saveWorkspaceArtifacts` pair can prevent an initial empty React state from
  clearing stored records.
- `WorkspaceDataDialog.tsx`, `progressSyncTypes.ts`, progress-sync count labels,
  and workspace E2E fixtures enumerate snapshot collections and need an
  `artifacts` entry. Existing full workspace sync already encrypts the complete
  workspace envelope, so no separate artifact protocol is needed.
- `src/features/chat/chatSessionSettings.ts` and `ChatMessageContent` use
  `react-markdown` with raw HTML disabled by default. Markdown artifact preview
  can reuse that safety boundary; text/code artifacts should remain escaped
  `pre` content.
- No server route, provider adapter, API client route, or package dependency is
  required for this feature. The primary risks are unsafe HTML, quota pressure,
  snapshot compatibility, initial hydration races, and nested dialog scrolling.
