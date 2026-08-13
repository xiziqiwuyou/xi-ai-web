# v0.0.14 Release Plan

## P0 - Version And Documentation

- [x] Confirm post-v0.0.13 changes are bookkeeping-only.
- [x] Update package, lockfile, README, Compose, and release notes.

## P1 - Verification

- [x] Run full QA and diff hygiene on the release candidate.

## P2 - Publish

- [x] Commit and push `master` at `ee08333`.
- [x] Create and push annotated `v0.0.14`.
- [x] Verify GitHub Actions runs `31682561509` and `31682571589` and the
      multi-architecture GHCR manifest
      `sha256:f725a3d813f15f4eb056f9c9538c662a1b23bd6e71858df8b61442fa1e20463c`.

## P3 - Close

- [x] Record immutable release evidence and archive this task.
