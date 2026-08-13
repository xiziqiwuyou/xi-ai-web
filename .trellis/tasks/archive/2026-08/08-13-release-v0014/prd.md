# v0.0.14 Maintenance Release

## Goal

Publish a new immutable source tag and multi-architecture container image from
the current `master`, including the v0.0.13 runtime and its completed release
bookkeeping, without adding runtime behavior.

## Requirements

- Advance package and lockfile versions to `0.0.14`.
- Pin README and both Compose templates to `v0.0.14`.
- Add accurate maintenance release notes and rollback to `v0.0.13`.
- Run the complete quality gate on the committed release snapshot.
- Push `master` and an annotated `v0.0.14` tag.
- Verify the branch/tag GitHub Actions and amd64/arm64 GHCR image.
- Preserve disabled-by-default MCP execution and the deferred real endpoint
  acceptance gate.

## Acceptance Criteria

- [x] All version surfaces agree on `0.0.14`.
- [x] Full QA and diff hygiene pass.
- [x] `master` and annotated `v0.0.14` are pushed.
- [x] Branch and tag container workflows complete successfully.
- [x] GHCR publishes `v0.0.14`, the full SHA tag, and `latest`.
- [x] Release notes distinguish publication from production deployment.

## Out Of Scope

- New runtime features or protocol changes.
- Production server deployment.
- Real Provider or MCP endpoint calls.
- Enabling MCP execution by default.
