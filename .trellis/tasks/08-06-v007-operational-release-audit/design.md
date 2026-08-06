# v0.0.7 Operational Release Audit Design

## Release Model

The release is evidence-driven. Each feature receives one status:

- `GA`: enabled by default and supported for initial operation.
- `Beta`: available only with an explicit Admin/operator choice or visible Beta classification.
- `Hidden`: disabled or removed from public navigation because a critical link is incomplete.

Automated contracts prove local behavior only. Real provider verification and live deployment checks remain separate evidence classes.

## Audit Surfaces

1. Browser: public routing, BYOK session state, Chat, Image, secondary modules, mobile layout.
2. Server: request guards, provider routing, SSE, media bytes, Admin settings, privacy, readiness.
3. Deployment: Docker image, Compose, health/readiness, persistent data, reverse proxy, rollback.
4. Release: package version, changelog/release notes, Git commit/tag, GitHub Actions and GHCR.

## Dirty Worktree Boundary

- `src/styles/rednote-flat-v2.modal.css` and `tests/e2e/progress-sync-cross-device.spec.ts` form one sync-layout candidate and must be accepted or excluded together.
- `.codex/agents/xi-ai-web-supervisor.toml` is tooling metadata, not runtime code; include only if its contract is valid and documented.
- Existing untracked v0.0.5/v0.0.6 task directories are planning evidence and are not release runtime dependencies.
- Never stage every worktree change with a broad `git add .`.

## Release Gates

1. Static: typecheck, production build, privacy, UI and feature contracts.
2. Server: provider, chat, security, server and deployment checks.
3. Browser: desktop/mobile core paths and feature-specific regression suites.
4. Container: Compose rendering, image build or published-image pull, health/readiness.
5. External: GitHub push, tag, Actions and GHCR confirmation.

Any failed P0/P1 gate blocks the affected feature. The smallest acceptable repair is preferred; otherwise downgrade it to Beta/Hidden.

## Rollback

- Preserve `v0.0.6` and its image tag.
- `v0.0.7` must be one reviewable release commit/tag above the audited code.
- Server rollback uses the previous immutable GHCR tag and the existing persistent data volume.
- Metadata format changes are forbidden in this release unless backward compatibility is proven.
