# v0.0.12 Verified Feature Release

## Goal

Publish the already implemented and locally verified post-v0.0.11 features as
an immutable `v0.0.12` source and container release. This is a release and
documentation task; it must not add new product behavior.

## Requirements

- Advance `package.json` and `package-lock.json` from `0.0.11` to `0.0.12`.
- Pin the root and deployment Compose templates to the immutable
  `v0.0.12` image tag while retaining the `latest` option only where the
  existing template intentionally provides it.
- Add release notes that accurately summarize the verified post-v0.0.11
  work: local conversation branching and retrieval/archive, local artifact
  workspace, secure administrator MCP discovery, and branch-history navigation.
- Document the release verification boundary, optional integrations that still
  require operator configuration, upgrade commands, and rollback to `v0.0.11`.
- Preserve the existing administrator-managed upstream boundary, BYOK/session
  storage contract, and production container hardening.
- Preserve the pending LobeChat roadmap metadata update rather than silently
  discarding it; include it only in a clearly scoped bookkeeping commit if it
  remains the sole unrelated dirty path.
- Create Git tag `v0.0.12` and push the release commit(s), `master`, and the tag
  to `origin` after all local checks pass.

## Acceptance Criteria

- [ ] Version metadata, runtime `APP_VERSION`, Compose image references, and
      release notes agree on `v0.0.12`.
- [ ] The release notes distinguish shipped/local-verified functionality from
      operator-only or unverified integrations.
- [ ] Type-check, production build, privacy scan, contract suites, server
      tests, release check, and `git diff --check` pass.
- [ ] Release commits contain no API keys, credentials, generated local data,
      or unrelated source changes.
- [ ] `v0.0.12` exists locally and on `origin`; `master` is pushed; GitHub
      Actions is configured to publish the matching GHCR tag.
- [ ] The final report includes commit/tag references, verification evidence,
      deployment command, rollback command, and remaining risks.

## Out of Scope

- New Chat, image, MCP, LobeChat, or UI features.
- Real provider calls, production server deployment, or manual device testing.
- Changing the API gateway, authentication protocol, or storage model.
