# Release v0.0.11 Implementation Plan

## P0. Inventory

- [x] Confirm `v0.0.10` is the latest local release tag.
- [x] Confirm the worktree contains only committed Claude/Trellis progress.
- [x] Confirm remote `v0.0.11` does not exist through a command-scoped direct
      connection.
- [x] Confirm GitHub Actions is the authoritative multi-architecture image
      publisher and local Docker is unavailable.

## P1. Release Material

- [x] Bump package and lockfile to `0.0.11`.
- [x] Pin root Compose templates and README deployment references to
      `v0.0.11`.
- [x] Add `v0.0.11` release notes with verification gaps and rollback.

## P2. Verification

- [x] Run static, Provider, privacy, server, build, and release checks.
- [x] Review release paths and scan for credentials and secrets.

## P3. Publish

- [x] Commit the release preparation and create annotated `v0.0.11`.
- [x] Push `master` and `v0.0.11` without persisting transport overrides.
- [x] Confirm remote branch and peeled tag refs.
- [x] Wait for the GitHub Actions container workflow and verify the GHCR
      `linux/amd64` and `linux/arm64` manifests.
- [x] Archive and journal the release task, then synchronize final `master`.
