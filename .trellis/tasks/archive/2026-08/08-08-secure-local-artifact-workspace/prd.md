# Secure Local Artifact Workspace

## Goal

Turn the existing ephemeral fenced-HTML preview into an explicit browser-local
artifact workspace. Users can save a code block as a named artifact, inspect
safe previews, add bounded new versions, and export the current version. The
feature must remain useful without an account or provider request.

## Confirmed Constraints

- This is the P3 child of the clean-room LobeChat capability roadmap. Product
  behavior may inform the design, but no source, component tree, copy, asset,
  dependency, or visual implementation is copied from LobeChat.
- React/Vite/Express, the existing shared `Dialog`, IndexedDB workspace, import
  and export envelope, BYOK boundary, and Chat Markdown renderer remain the
  project primitives.
- Artifact data is browser-local. It is never sent to the server, provider,
  search service, analytics, or audit APIs.
- No arbitrary JavaScript execution, network loading, forms, navigation,
  embedded frames, or plugin content is permitted in previews.

## Requirements

### R1 - Explicit Artifact Records

- Add an allowlisted artifact kind: `html`, `markdown`, `text`, or `code`.
- An artifact has a bounded title, language, timestamps, and one to twenty
  immutable versions. Each version has a monotonic number, bounded source text,
  creation time, and optional local conversation/message provenance.
- Saving a code block opens the artifact workspace with its content prefilled;
  the user chooses a title and can create a new artifact or append a version
  to an existing artifact. Saving never sends a request.
- Artifact records persist in IndexedDB and survive reload. Legacy workspaces
  without an artifacts collection remain valid and load as empty.

### R2 - Safe Preview

- HTML previews use the existing empty `sandbox` iframe contract plus a strict
  CSP with scripts, network, forms, objects, frames, and top-level navigation
  disabled. Unsafe script/event-handler/external-resource markup is removed at
  the artifact preview boundary.
- Markdown is rendered with the existing Markdown pipeline with raw HTML
  disabled. Text and other code are displayed as inert escaped text.
- Preview content is never inserted into the parent document with
  `dangerouslySetInnerHTML`, never evaluated, and never syntax-executed.
- Preview geometry is bounded, keyboard reachable, dark-mode legible, and has
  one dialog scroll owner.

### R3 - Artifact Workspace UI

- Add a compact Chat heading action named `作品` plus the existing code-block
  action `保存为作品`.
- Reuse one shared Dialog for library, editor, version list, preview, and
  export. It supports desktop and mobile layouts without nested dialogs or
  document overflow.
- The dialog shows artifact rows, current version, kind/language, an editable
  bounded content area, preview, `保存新版本`, and `导出当前版本` actions.
- An empty library has a clear state. Closing or switching artifacts does not
  silently persist a draft; only the explicit save action creates a record or
  version.

### R4 - Workspace Compatibility

- Include artifacts in the existing workspace snapshot, counts, merge/replace
  restore, export/import integrity digest, and temporary cross-device sync.
- Increment the IndexedDB schema version only to create the new object store;
  no migration job or server schema is required.
- Bound total records and content before persistence and reject malformed or
  duplicate version records without dropping unrelated workspace collections.
- Exports contain artifact content only when the user explicitly exports the
  workspace or artifact; API Keys, transient drafts, and provider settings stay
  outside the artifact record.

## Acceptance Criteria

- [x] Code-block HTML can be saved locally, reloaded, previewed, and exported.
- [x] New artifact versions are explicit, ordered, bounded, and survive reload.
- [x] HTML, Markdown, text, and code previews remain inert and cannot issue
      network requests or execute scripts.
- [x] Malformed artifact metadata is rejected or normalized without losing
      unrelated workspace data; legacy snapshots without artifacts load cleanly.
- [x] Workspace export/import, merge/replace, counts, integrity, and temporary
      sync round-trip artifact records.
- [x] Chat actions and artifact management issue zero Chat/provider/search/API
      requests and never expose API Keys in artifact data.
- [x] Desktop/mobile, keyboard, dark mode, dialog containment, and one-scroll-
      owner tests pass.

## Out Of Scope

- Server-side artifacts, collaborative editing, cloud artifact sync, semantic
  search, AI artifact classification, arbitrary code execution, package
  installation, browser extensions, plugin runtimes, image/video editing,
  artifact sharing, and a new public navigation route.
