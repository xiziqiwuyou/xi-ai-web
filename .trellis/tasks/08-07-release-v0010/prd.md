# Release v0.0.10

## Goal

Publish the verified DeepSeek Responses compatibility as immutable v0.0.10.

## Requirements

- Include the committed DeepSeek Responses compatibility and its Trellis
  bookkeeping commits after `v0.0.9`.
- Set package and lockfile versions to `0.0.10`.
- Pin root Compose templates and deployment documentation to
  `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.10`.
- Add release notes describing the DeepSeek Responses boundary, verification,
  upgrade, and rollback.
- Preserve existing administrator-edited DeepSeek endpoint selections; fresh
  presets use Responses only for `deepseek-v4-flash`.
- Create annotated tag `v0.0.10`, push `master` and the tag, then verify remote
  refs without persisting proxy credentials.

## Acceptance Criteria

- [ ] Package, lockfile, Compose templates, README, and release notes identify
      `v0.0.10` consistently.
- [ ] Release notes do not claim real-provider, Docker, deployed-online, or
      physical-device verification without evidence.
- [ ] Type-check, provider contracts, feature audit, privacy, server tests,
      build, release-check, and focused Admin E2E pass.
- [ ] No API Key, proxy credential, image output, or deployment secret enters
      the commit or tag.
- [ ] Remote `master` contains release bookkeeping and remote `v0.0.10`
      resolves to the release commit.

## Out Of Scope

- Production deployment, DNS, reverse-proxy changes, or a real DeepSeek API
  smoke with a customer Key.
- New providers, models, UI modules, migrations, or unrelated refactors.
- Rewriting administrator-persisted model endpoint choices.
