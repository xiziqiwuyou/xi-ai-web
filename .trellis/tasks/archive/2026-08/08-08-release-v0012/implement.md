# Release Implementation Plan

## P0 - Baseline And Scope

- [x] Confirm `master` is based on `v0.0.11`, enumerate post-release commits,
      and classify the existing roadmap metadata change.
- [x] Confirm no secrets, local data, or generated artifacts are included.

## P1 - Version And Documentation

- [x] Update package and lockfile versions to `0.0.12`.
- [x] Pin root/deployment Compose templates to `v0.0.12`.
- [x] Add the v0.0.12 release notes with shipped, operator-only, verification,
      upgrade, and rollback sections.
- [x] Update the roadmap bookkeeping only if its scope is confirmed.

## P2 - Quality Gate

- [x] Run check, build, privacy, UI/feature/provider contracts, security and
      server tests, release-check, and diff hygiene.
- [x] Review release diff and generated version surfaces.

## P3 - Publish

- [x] Commit the release changes with the repository's existing commit style.
- [x] Archive this task and record the session journal.
- [x] Create and push `v0.0.12`; push `master` to `origin`.
- [x] Verify remote refs and report the GHCR workflow trigger.

## Rollback

Use `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.11` in Compose if the new image or
deployment verification fails.
