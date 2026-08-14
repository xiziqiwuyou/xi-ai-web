# v0.0.15 Release Plan

## P0 Version And Documentation

- [x] Update package, lockfile, README, Compose, and release notes.
- [x] Verify every supported deployment template is pinned to `v0.0.15`.

## P1 Verification

- [x] Run full QA and diff hygiene on the release candidate.
- [x] Confirm knowledge remains disabled by default and real acceptance gaps stay explicit.

Evidence:

- `npm run qa` passed on package version `0.0.15`.
- `git diff --check` passed; the remaining messages are Windows line-ending
  conversion notices rather than patch errors.
- Both Compose templates keep `KNOWLEDGE_ENABLED=false` by default.
- `npm run knowledge:acceptance` emitted seven expected `SKIP` records because
  no staging origin or external infrastructure credentials were supplied.

## P2 Publish

- [ ] Commit the immutable release snapshot.
- [ ] Push `master` and annotated `v0.0.15`.
- [ ] Verify branch/tag Actions and the multi-architecture GHCR manifest.

## P3 Close

- [ ] Record release evidence, archive the task, and record the session.

## Rollback

Pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.14`, run `docker compose pull`,
and restart the application. Do not roll migrations backward; keep knowledge
disabled until the previous runtime is restored and readiness is healthy.
