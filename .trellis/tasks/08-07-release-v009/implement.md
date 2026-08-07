# Release v0.0.9 Implementation Plan

## P0. Inventory and Release Boundary

- [x] Verify `v0.0.8` is the latest immutable local and remote release.
- [x] Separate committed Chat work from the pending P0 diagnostics work.
- [x] Confirm the GitHub container workflow publishes branch, SHA, and tag
      image metadata.

## P1. Integrate P0 Diagnostics

- [x] Review the pending P0 diagnostics, smoke scripts, tests,
      runtime version projection, Docker runtime files, and documentation.
- [x] Preserve their explicit real-provider and online-deployment validation
      gaps.

## P2. Version and Release Material

- [x] Bump package and lockfile versions to `0.0.9`.
- [x] Pin root Compose templates and README to `v0.0.9`.
- [x] Add `v0.0.9` release notes with upgrade and rollback guidance.

## P3. Verification

- [x] Run type-check, build, privacy, UI contracts, feature audit, provider,
      Chat/search, security, server, runtime UI, and release checks.
- [x] Review the final diff, release tag target, and credential scan.

## P4. Tag and Push

- [ ] Create annotated `v0.0.9` tag on the release commit.
- [ ] Push `master` and `v0.0.9` to GitHub using the validated temporary proxy
      transport.
- [ ] Confirm the remote branch and tag refs point to the expected commits.
