# Implementation Plan

## P0 - Contracts And Safety Core

- [x] Add artifact types, limits, sanitizer, immutable version helpers, and
      safe HTML preview document builder.
- [x] Add pure contract tests for kinds, bounds, unsafe markup removal,
      duplicate/invalid versions, source immutability, and export metadata.

## P1 - Workspace Persistence

- [x] Add the IndexedDB `artifacts` store at schema version 4.
- [x] Extend workspace snapshot/archive/repository, counts, merge/replace,
      progress-sync, and legacy missing-field compatibility.
- [x] Add storage/privacy regression coverage and quota/error behavior.

## P2 - Chat Integration

- [x] Add explicit `保存为作品` to fenced code blocks and forward a local draft
      callback through `ChatSessionBlock` to `ChatModule`.
- [x] Add the `作品` Chat heading action and hydration-gated artifact state.

## P3 - Artifact Workspace UI

- [x] Build the shared-dialog artifact library/editor with list, kind/language,
      bounded content editor, current-version selection, preview, explicit
      new-version save, and current-version export.
- [x] Add stable desktop/mobile/dark-mode styles, focus behavior, one scroll
      owner, and no-document-overflow checks.

## P4 - Verification And Finish

- [x] Add desktop/mobile E2E for save, reload, version append, safe preview,
      export, zero requests, keyboard/focus, and workspace round trips.
- [x] Run `npm run check`, `chat-local-contracts`,
      `workspace-storage-contracts`, `ui-contract`, `privacy`, `feature-audit`,
      `test:server`, focused Playwright, `build`, `git diff --check`, and task
      validation.
- [x] Update frontend state/component specs, run Trellis check, commit, and
      archive the task.

## Rollback Points

- After P0: retain only pure artifact helpers if UI scope is deferred.
- After P1: remove the store and snapshot field; legacy snapshots remain valid.
- After P2: hide Chat actions without changing existing message rendering.
- After P3: remove the dialog while preserving explicit local records.
