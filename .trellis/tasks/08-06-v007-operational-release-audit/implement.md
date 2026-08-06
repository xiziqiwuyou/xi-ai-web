# v0.0.7 Implementation Plan

## P0 - Freeze And Inventory

- Capture Git status, version, recent commits, tags, remotes and release workflows.
- Separate the sync-layout candidate from unrelated planning/tooling files.
- Create the feature inventory and define evidence classes.

## P1 - Parallel Audit

- Audit Chat/Image/BYOK/provider routing and production request paths.
- Audit secondary modules and classify GA/Beta/Hidden.
- Audit security/privacy/Admin/import/restore boundaries.
- Audit Docker/Compose/GitHub Actions/GHCR/release rollback.

## P2 - Baseline Verification

- Run static, build, privacy, provider, Chat, security, server and focused E2E suites.
- Record failures by severity and affected feature.
- Validate the pending sync-layout candidate independently.

## P3 - Release Blocker Repair

- Fix only reproducible P0/P1 issues.
- Add regression tests before or with each repair.
- Hide or disable features whose blocker cannot be safely fixed within this release.

## P4 - Full Release Check

- Repeat all required checks after repairs.
- Verify desktop/mobile core flows and Compose rendering.
- Produce the final feature status matrix and known-risk list.

## P5 - Package v0.0.7

- Update `package.json`/lock version and release documentation.
- Ensure Compose references `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.7`.
- Create a scoped release commit without unrelated worktree content.

## P6 - Publish And Verify

- Push the release commit and immutable `v0.0.7` tag.
- Verify GitHub Actions and GHCR build outcome.
- Report server pull, upgrade, health-check and rollback commands.

## Required Commands

- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run ui-contract`
- `npm run feature-audit`
- `npm run provider-contracts`
- `npm run chat-local-contracts`
- `npm run test:security`
- `npm run test:server`
- focused desktop/mobile Playwright suites
- `docker compose config`
- `git diff --check`

## Stop Conditions

- Stop publication if secrets appear in source/output, a P0/P1 gate remains open, the release diff includes unrelated changes, GitHub push fails, or the immutable image cannot be verified.
