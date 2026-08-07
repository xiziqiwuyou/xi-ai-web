# Release v0.0.11

## Goal

Publish the verified Claude native-streaming and model-aware output-limit
repair as immutable `v0.0.11`, with a multi-architecture GHCR image produced
by the repository's existing GitHub Actions workflow.

## Requirements

- Include commits `35eb687`, `8114e66`, and their Trellis bookkeeping after
  `v0.0.10`.
- Set package and lockfile versions to `0.0.11`.
- Pin root Compose templates and deployment documentation to
  `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.11`.
- Add release notes describing Claude native streaming, buffered delivery,
  model-aware `max_tokens`, Admin configuration, verification, upgrade, and
  rollback.
- Preserve the administrator-managed `https://api.xi-ai.cn` upstream and BYOK
  privacy boundaries.
- Create annotated tag `v0.0.11`, push `master` and the tag, then wait for the
  container workflow to publish `linux/amd64` and `linux/arm64` manifests.
- Do not claim a real Claude Provider smoke or deployed reverse-proxy latency
  check without corresponding evidence.

## Acceptance Criteria

- [ ] Package, lockfile, Compose templates, README, and release notes identify
      `v0.0.11` consistently.
- [ ] Static, privacy, Provider, server, build, and release checks pass after
      the version update.
- [ ] No API Key, proxy credential, prompt, model output, or deployment secret
      enters the release commit, tag, workflow logs, or task records.
- [ ] Remote `master` contains the release commit and remote `v0.0.11` resolves
      to that immutable commit.
- [ ] GitHub Actions completes successfully and publishes the
      `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.11` multi-architecture image.
- [ ] Release task bookkeeping is archived and synchronized to remote
      `master` without moving the immutable release tag.

## Out Of Scope

- Production deployment, DNS, reverse-proxy configuration, or a real Claude
  request using a customer API Key.
- New models, Provider protocols, migrations, UI changes, or unrelated
  refactors.
- Local Docker builds; Docker is unavailable on this workstation, so image
  construction and publication are delegated to the verified GitHub Actions
  workflow.
