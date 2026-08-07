# Release v0.0.9

## Goal

Publish a coherent `v0.0.9` patch release containing the completed Chat
capability/search changes and the P0 production-acceptance diagnostics.

## Requirements

- Include committed Chat image-capability gating and independent GLM/Kimi
  search changes, plus the pending P0 production-smoke and release-identity
  work.
- Set the package and lockfile version to `0.0.9`.
- Pin the root Compose templates and deployment documentation to the immutable
  `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.9` image.
- Add release notes with behavior changes, deployment checks, verification,
  known operational gaps, upgrade, and rollback guidance.
- Validate the release candidate with the project checks applicable to the
  changed frontend, backend, security, server, build, and release tooling.
- Create annotated tag `v0.0.9` on the final release commit and push `master`
  and the tag to `origin` using the working GitHub transport.

## Acceptance Criteria

- [ ] `package.json` and `package-lock.json` both report `0.0.9`.
- [ ] Root Compose templates and README name `v0.0.9` consistently.
- [ ] Release notes accurately summarize the release and do not claim a real
      provider or deployed online smoke passed without evidence.
- [ ] Type-check, build, privacy, provider, security, server, Chat/search,
      UI-runtime, and release checks pass.
- [ ] The release tag exists locally and on `origin` and points to the release
      commit.
- [ ] No API Key, proxy credential, generated image, or deployment secret is
      committed or included in release notes.

## Out Of Scope

- Server deployment, DNS, reverse-proxy configuration, or online smoke against
  a production instance.
- Real-provider smoke with an API Key.
- New product features, model providers, or changes to the P0 diagnostics
  protocol beyond release integration.
