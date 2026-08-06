# v0.0.7 Release Readiness Matrix

## Evidence classes

- Local contract: static checks, unit/server tests, or deterministic request assertions.
- Browser contract: Playwright desktop/mobile behavior with the repository API harness.
- Live evidence: a real upstream provider, external service, container registry, or deployed reverse proxy. No live evidence was available from this workstation.

## Public and operator surfaces

| Surface | Classification | Local evidence | Remaining operational gate |
| --- | --- | --- | --- |
| Manual BYOK | GA candidate | sessionStorage-only E2E, privacy scan, API URL is server-managed | Enter a real Key and confirm one Chat request after deployment |
| Chat | GA candidate | provider contracts, Chat settings, streaming, markdown/math/code, desktop/mobile E2E | Real provider SSE smoke test |
| Image generation/editing | GA candidate | image provider contracts, prompt optimization, preview actions, timing, desktop/mobile E2E | Real image model generation and edit smoke test |
| Admin and model catalog | GA candidate | admin auth/rotation, vendor/model CRUD and sorting, responsive E2E, server tests | Configure a production password and verify reverse-proxy access |
| Assistants | GA candidate | catalog migration, categories/avatars, Chat launch handoff, invalid launch fallback E2E | Real provider smoke test for one assistant |
| Agents | GA candidate | IndexedDB persistence, bounded `/api/agents/run`, tool compatibility, failure paths, desktop/mobile E2E | Real provider smoke test with one compatible model |
| Local Workflows | GA candidate | graph validation, cycle/port checks, ordered execution, export/import, failure propagation, desktop/mobile E2E | Real provider smoke test with one agent node |
| PPT | GA candidate | structured deck contract, presets, fallback parsing, browser preview/export, E2E | Real provider smoke test and downloaded PPTX inspection |
| Mind Map | GA candidate | versioned document normalization, local edits, AI expansion/reorganization, exports, server/E2E | Real provider smoke test |
| Text Translation | GA candidate | bounded model input, provider route, copy/result behavior, desktop/mobile E2E | Real provider smoke test; file upload is not advertised |
| Progress sync | Beta/operator-only | encrypted rendezvous, approval/reject, QR/manual paths, geometry and mobile E2E | HTTPS deployment plus two-device smoke test |
| Langflow | Beta/operator-only | isolated config, published-flow filtering, SSE/error/rate tests, admin/public E2E | Secured Langflow instance, API key, published-flow smoke test |
| Cloud Knowledge | Beta/operator-only | auth/recovery, PostgreSQL/pgvector/COS contracts, worker/retry/quota tests, E2E fixture | Provision PostgreSQL + pgvector + COS, run migrations/worker, test embedding/retrieval |
| Independent search / hosted tools | Beta/operator-only | provider/search contract tests and capability gating | Configure the selected provider service and test its credentials |
| OneAPI settings handoff | Disabled by default | isolated parser, URL scrubbing, session-only Key, `settings.url` ignored, E2E | Explicit Admin opt-in and operator risk acceptance |
| Shell JWT handoff | Integration-only | separate JWT exchange route and session-only result | Shell control-plane availability and integration smoke test |
| Audio / Video public modules | Hidden | removed from public menu and marked retired | Separate product work before re-exposure |

## Release blockers

- No reproducible P0/P1 code blocker remains in the audited local paths.
- Docker Compose rendering cannot be claimed locally because Docker CLI is unavailable on this workstation. The version strings were checked statically; the GitHub workflow is responsible for Linux image build verification.
- Real provider, Langflow, Knowledge Cloud, GHCR, and online reverse-proxy checks remain operator gates, not failures hidden by this release.

## Verification record

- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run ui-contract`
- `npm run feature-audit`
- `npm run provider-contracts`
- `npm run chat-local-contracts`
- `npm run workspace-storage-contracts`
- `npm run automation-contracts`
- `npm run search-contracts`
- `npm run prompt-tool-contracts`
- `npm run test:security` (11 passed)
- `npm run test:server` (81 passed)
- `npm run test:langflow` (17 passed)
- `npm run test:knowledge` (153 passed)
- desktop/mobile core E2E (54 passed, 4 skipped)
- desktop/mobile secondary E2E (93 passed, 1 skipped)
- progress-sync E2E (4 passed, 4 skipped)
- `docker compose config`: not run; Docker CLI unavailable
