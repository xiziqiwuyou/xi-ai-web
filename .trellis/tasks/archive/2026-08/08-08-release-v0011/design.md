# Release v0.0.11 Design

## Boundary

`v0.0.11` is an immutable patch release after `v0.0.10`. Its product change is
the already committed and locally verified Claude native-streaming and
model-aware output-limit repair. Release edits are limited to version sources,
Compose image pins, deployment documentation, release notes, task records,
commit, tag, push, and workflow verification.

## Publish Flow

1. Update package/lock versions and every active root `v0.0.10` deployment pin
   to `v0.0.11`.
2. Add an evidence-bounded `v0.0.11` section to `RELEASE_NOTES.md`.
3. Run release checks and scan the staged release diff for credentials.
4. Commit as `release: prepare v0.0.11` and create annotated tag `v0.0.11`.
5. Push `master` and the tag using a command-scoped direct connection so the
   stale repository-local proxy setting is neither removed nor persisted into
   release artifacts.
6. Wait for `.github/workflows/publish-container.yml` and verify the GHCR tag
   contains `linux/amd64` and `linux/arm64` manifests.
7. Archive and journal the release task, then push bookkeeping commits to
   `master` without moving `v0.0.11`.

## Image Contract

The existing GitHub Actions pipeline owns the container build. It uses the
repository Dockerfile, publishes SBOM/provenance metadata, and pushes:

- `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.11`
- the immutable `sha-<release-commit>` tag
- `latest` from the default branch workflow

No registry credential is written into the repository; the workflow uses the
GitHub-provided package token.

## Rollback

Operators can pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.10`, pull, and restart.
The release does not require a metadata or database migration.
