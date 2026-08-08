# Release Design

## Release Surface

The release contains only metadata and documentation changes on top of the
already committed feature set. Runtime behavior is inherited from `HEAD` and
must be validated before tagging.

## Version Flow

`package.json` is the source of truth for `server/app-version.mjs`. The lockfile
root manifest must match it. Compose templates use the immutable GHCR image
tag, so a fresh deployment can pull the exact release without rebuilding the
repository locally.

## Shipped Since v0.0.11

- Local Chat conversation branching and message-level branch actions.
- Local conversation retrieval, search, archive, restore, and bounded branch
  history navigation.
- Browser-local artifact workspace with import/export and metadata-safe writes.
- Secure administrator-managed remote MCP discovery, contract validation,
  SSRF/boundary checks, and MCP admin controls.
- Corresponding frontend, server, privacy, contract, and browser test coverage.

## Safety And Rollback

No credentials or user data are part of the release. Existing uncommitted
roadmap metadata is staged only after explicit path classification. The prior
immutable image `v0.0.11` remains the rollback target. A failed GitHub Actions
publish does not change application source; operators can continue using
`v0.0.11` until the tag workflow is green.

## Verification

Run the smallest relevant contracts first, then the complete release gate:
type-check, build, privacy, UI/feature contracts, security/server tests,
release-check, and diff hygiene. Do not claim a real provider or deployed
reverse-proxy smoke test from local deterministic fixtures.
