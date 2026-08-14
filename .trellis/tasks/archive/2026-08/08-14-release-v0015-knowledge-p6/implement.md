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

- [x] Commit the immutable release snapshot.
- [x] Push `master` and annotated `v0.0.15`.
- [x] Verify branch/tag Actions and the multi-architecture GHCR manifest.

Evidence:

- Release commit: `77b32d104b54847b8197841a3d9ecfa832346dfb`.
- Annotated tag: `v0.0.15`, targeting the release commit above.
- Master workflow: `31771743055` (`success`).
- Tag workflow: `31771742886` (`success`).
- GHCR tags `v0.0.15`,
  `sha-77b32d104b54847b8197841a3d9ecfa832346dfb`, and `latest` resolve to
  `sha256:77ca22df214dd12408dfce902d4d83ded1428b04d7d087f4c13c511e5b211d4a`.
- Runtime manifests include `linux/amd64` and `linux/arm64`. The additional
  `unknown/unknown` descriptors are Buildx provenance/SBOM attestations.

## P3 Close

- [x] Record release evidence, archive the task, and record the session through
  the Trellis finish flow.

No code-spec update is required: P6 changes only release metadata and
documentation, while the knowledge runtime contracts were captured during
P0-P5. Real staging acceptance remains blocked on operator-provided origin,
PostgreSQL/pgvector, COS, OpenAI/Qwen, and OCR credentials.

## Rollback

Pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.14`, run `docker compose pull`,
and restart the application. Do not roll migrations backward; keep knowledge
disabled until the previous runtime is restored and readiness is healthy.
