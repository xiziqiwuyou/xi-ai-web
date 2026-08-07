# Release v0.0.10 Implementation Plan

## P0. Inventory

- [x] Confirm `v0.0.9` is the latest local release tag.
- [x] Confirm the worktree contains only committed DeepSeek/Trellis progress.
- [x] Confirm remote `v0.0.10` does not exist through the approved temporary
      transport.

## P1. Release Material

- [x] Bump package and lockfile to `0.0.10`.
- [x] Pin root Compose templates and README deployment references to
      `v0.0.10`.
- [x] Add `v0.0.10` release notes with verification gaps and rollback.

## P2. Verification

- [x] Run the release-specific static, contract, server, privacy, build,
      release-check, and focused E2E gates.
- [x] Review staged paths and scan for credentials and secrets.

## P3. Publish

- [x] Commit the release preparation.
- [x] Create annotated `v0.0.10` and push `master` plus the tag.
- [x] Confirm remote branch and peeled tag refs.
- [x] Archive and journal the release task, then synchronize final `master`.
