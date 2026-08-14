# v0.0.15 Knowledge Production Release

## Goal

Publish the verified private knowledge and RAG implementation as an immutable
source tag and multi-architecture container image. Keep knowledge disabled by
default and distinguish artifact publication from real infrastructure
enablement.

## Requirements

- Advance package, lockfile, README, Compose, and release-note version surfaces
  from `0.0.14` to `0.0.15`.
- Pin deployment templates to `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.15`.
- Document the P0-P5 knowledge capabilities, secure defaults, migration range,
  upgrade steps, and rollback to `v0.0.14`.
- Run the complete quality gate and diff hygiene on the committed release
  snapshot.
- Push `master` and an annotated `v0.0.15` tag.
- Verify branch and tag GitHub Actions plus the amd64/arm64 GHCR manifest.
- Preserve `KNOWLEDGE_ENABLED=false` by default. Missing staging origin,
  PostgreSQL/pgvector, COS, OpenAI, Qwen, and OCR credentials remain explicit
  production-enablement blockers rather than release passes.

## Acceptance Criteria

- [ ] All version surfaces agree on `0.0.15`.
- [ ] Full QA, privacy, release checks, and diff hygiene pass on the release snapshot.
- [ ] `master` and annotated `v0.0.15` are pushed.
- [ ] Branch and tag container workflows complete successfully.
- [ ] GHCR publishes `v0.0.15`, the full SHA tag, and `latest` for amd64 and arm64.
- [ ] Release notes clearly separate published code from staging acceptance and production enablement.

## Out Of Scope

- Enabling knowledge, hybrid retrieval, rewrite, rerank, or OCR by default.
- Production server deployment or migration execution.
- Supplying or persisting real provider, database, or COS credentials.
- New runtime features beyond release metadata and documentation.
