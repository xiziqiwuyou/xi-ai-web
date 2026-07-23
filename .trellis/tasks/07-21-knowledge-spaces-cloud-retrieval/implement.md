# Knowledge Accounts And Cloud Retrieval Implementation Plan

## Phase 01 - Runtime Foundation

- [x] Lock and document dependency versions/licenses; add Node engine check for built-in Argon2id.
- [x] Add PostgreSQL, pgvector and COS configuration validation with `KNOWLEDGE_ENABLED` fail-closed behavior.
- [x] Add checksum-tracked SQL migration runner and initial knowledge schema/extension migrations.
- [x] Add typed knowledge errors, request IDs and secret-redaction helpers.
- [x] Add repository/service boundaries and database transaction test harness.
- [x] Add deployment example for web, worker, pgvector PostgreSQL and external COS.

Validation gate:

- Startup without knowledge config leaves public modules healthy and reports knowledge unavailable.
- Enabled startup rejects missing migrations/vector extension/COS secrets.
- Migration up/down policy and schema checksum contracts pass on a clean PostgreSQL database.

Local verification note: contract tests, PostgreSQL syntax parsing, and a clean in-memory PostgreSQL execution of the foundation schema passed. The optional real PostgreSQL + pgvector integration test is present but was skipped because this workstation has no Docker, `psql`, or configured `KNOWLEDGE_TEST_DATABASE_URL`.

## Phase 02 - Knowledge Identity And Registration

- [x] Implement Argon2id password hashing and domain-separated hashes for recovery/session/invite/reset codes.
- [x] Implement opaque HttpOnly knowledge sessions, CSRF/origin validation, expiry, revocation and shared rate limiting.
- [x] Implement register/login/logout/session/recovery endpoints and one-time recovery-code response contract.
- [x] Implement `disabled` / `invite_only` / `open` modes and transactional single-use invite consumption.
- [x] Add login/register/recovery UI and mandatory recovery-code copy/download acknowledgement.
- [x] Add auth privacy, timing, brute-force, session-fixation and multi-device tests.

Validation gate:

- Knowledge cookies do not authenticate Admin or alter public auth status.
- Password/recovery reset revokes all prior sessions and secrets.
- Invite races create at most one account.
- Passwords/codes never appear in logs, bootstrap, browser persistence or API read models.

Local verification note: `npm run qa`, production `release-check`, smoke, 43 knowledge tests, 20 knowledge-auth Playwright checks, and the full 284-case desktop/mobile Playwright matrix passed (`249` passed, `35` viewport-conditional skips, `0` failed). The real PostgreSQL + pgvector integration test remains present but skips without `KNOWLEDGE_TEST_DATABASE_URL`, Docker, or local PostgreSQL tooling.

## Phase 03 - Admin Knowledge Control Plane

- [x] Add Admin expandable destinations for overview, accounts, registration/invites, limits, jobs/storage and audit.
- [x] Add validated runtime-limit settings and public projection of registration state only.
- [x] Add paginated account list, search/status filters, freeze, session revocation and account overrides.
- [x] Add 15-minute single-use admin reset flow with mandatory reason and audit.
- [x] Add invite create/revoke/status UI with one-time plaintext display.
- [x] Add Admin contract and desktop/mobile E2E coverage.

Validation gate:

- Admin responses never expose hashes, tokens, BYOK data, COS keys or document bodies.
- Lower limits preserve existing data and active jobs while blocking new excess work.
- Every privileged mutation writes an immutable audit outcome.

Local verification note: `npm run qa`, `npm run check`, production build, 56 knowledge tests, and the full 300-case desktop/mobile Playwright matrix passed (`265` passed, `35` viewport-conditional skips, `0` failed). The real PostgreSQL + pgvector integration test remains present but skips without `KNOWLEDGE_TEST_DATABASE_URL`, Docker, or local PostgreSQL tooling.

## Phase 04 - Knowledge Bases, Quotas And COS Upload

- [x] Implement knowledge-base CRUD and approved OpenAI/Qwen embedding-profile snapshots.
- [x] Implement global defaults, per-account overrides and authoritative effective-limit resolution.
- [x] Implement usage ledger, transactional reservations/settlement/release and reconciliation primitives.
- [x] Implement pending document creation and exact-path short-lived COS upload credentials.
- [x] Implement direct upload, finalize HEAD verification, orphan cleanup and deletion jobs.
- [x] Add quota/concurrency/race tests and COS adapter contract tests with deterministic fakes.

Validation gate:

- Cross-account/base IDs fail before COS/database mutation.
- Concurrent requests cannot exceed quota or invitation/document counts.
- A malicious client cannot choose an object key or permanently retain cloud credentials.

Local verification note: `npm run qa` passed with 80 knowledge tests, deterministic COS fakes, privacy and all repository contracts. The real PostgreSQL + pgvector integration test remains present but skips without `KNOWLEDGE_TEST_DATABASE_URL`, Docker, or local PostgreSQL tooling; live Tencent COS credentials were not used in local validation.

## Phase 05 - Durable Parsing Worker

- [x] Add PostgreSQL job leases, heartbeat, retry/dead-letter behavior and separate worker entrypoint.
- [x] Implement bounded parser interface and source-locator schema.
- [x] Add PDF, DOCX, XLSX, PPTX, TXT, Markdown, CSV, JSON and HTML parsers.
- [x] Add ZIP/XML/parser resource limits and ephemeral temp-file cleanup.
- [x] Persist chunks and normalized artifacts transactionally, settle quota and enter `awaiting_embedding`.
- [x] Add `needs_ocr`, parser failure and admin retry/cancel flows.
- [x] Add parser fixtures covering malformed, encrypted, oversized, empty, script-bearing and compressed-bomb inputs.

Validation gate:

- Worker restart/lease expiry does not duplicate chunks or usage.
- No parser executes active content or loads remote resources.
- Source locators survive persistence and are suitable for citations.

Local verification note: `npm run qa` passed with 99 knowledge tests; the full desktop/mobile Playwright matrix passed (`269` passed, `35` viewport-conditional skips, `0` failed). Exact parser dependencies have zero npm audit vulnerabilities. The optional real PostgreSQL + pgvector integration test remains present but skips without `KNOWLEDGE_TEST_DATABASE_URL`, Docker, or local PostgreSQL tooling; live Tencent COS credentials were not used.

## Phase 06 - Resumable BYOK Embedding And Pgvector

- [x] Extend model catalog with validated embedding dimensions/profile metadata for approved OpenAI/Qwen entries.
- [x] Add session-only knowledge embedding connection storage and readiness UI.
- [x] Provision fixed-dimension pgvector tables/HNSW indexes for approved profiles.
- [x] Implement leased/idempotent next-batch embedding endpoint using transient connection payloads.
- [x] Implement pause/resume, progress, provider-error redaction, vector-byte settlement and ready transition.
- [x] Implement reindex shadow version, capacity preflight, atomic cutover and old-version cleanup.
- [x] Add OpenAI/Qwen embedding request contracts and restart/concurrency/idempotency tests.

Validation gate:

- No transient URL/Key reaches database, COS, jobs, audit, export, logs or bootstrap.
- Closing/reloading resumes without duplicate provider calls for committed batches.
- Mixed model/dimension vectors can never enter the wrong physical index.

Local verification note: the complete knowledge test suite passed with retryable idempotency, expired leases, provider redaction, fixed-dimension routing, shadow attribution and cleanup coverage. Real PostgreSQL + pgvector execution remains optional locally and skips without `KNOWLEDGE_TEST_DATABASE_URL`.

## Phase 07 - Cloud Knowledge UI And Local Migration

- [x] Replace the current knowledge screen with account-aware catalog/detail/document/indexing states.
- [x] Add capacity meter, effective limits, upload queue, parser status, waiting-Key messaging and continue-index action.
- [x] Add model selection, model-change/reindex confirmation and insufficient-headroom handling.
- [x] Add explicit local IndexedDB migration preview/progress/resume flow.
- [x] Preserve local documents until cloud documents are ready and user explicitly deletes local copies.
- [x] Add responsive/accessibility E2E for login, recovery, catalog, upload, pause/resume, errors and migration.

Validation gate:

- UI never calls an unfinished document searchable.
- Navigation/close messaging accurately states parsing vs embedding behavior.
- Migration failure leaves original IndexedDB records intact.

Local verification note: `knowledge-workspace.spec.ts` passed all 8 desktop/mobile cases, and the knowledge auth/embedding regression matrix passed all 28 cases. The migration failure case retains both the IndexedDB source and resumable checkpoint.

## Phase 08 - Knowledge Retrieval And Citations

- [x] Implement authorized 1-3 knowledge-base retrieval preflight.
- [x] Group by embedding profile, embed query once per group and enforce mandatory base/index filters.
- [x] Implement deterministic score normalization/fusion, adjacent-chunk deduplication and final topK cap.
- [x] Implement bounded knowledge context and citation response schema.
- [x] Implement short-lived source-open/download authorization.
- [x] Add cross-account, missing-key, partial-failure, stale-index and citation contract tests.

Validation gate:

- Any selected-base failure occurs before main-model access.
- Results never cross account/base/index-version boundaries.
- Every injected chunk maps to one returned source citation.

Local verification note: `npm run qa` passed with 137 knowledge tests. Retrieval tests cover unique 1-3 base selection, read-only effective limits, PostgreSQL rate limiting, exact pgvector scope, partial provider failure, deterministic fusion, bounded context, one-to-one citations, active-source reauthorization and COS-signed object version/disposition. The real PostgreSQL + pgvector test remains present but skipped locally without `KNOWLEDGE_TEST_DATABASE_URL`; live COS credentials were not used.

## Phase 09 - Chat, Agent And Workflow Integration

- [x] Add up-to-three knowledge-base selector to Chat and persist only stable IDs in conversation UI state.
- [x] Extend Chat stream payload/preflight with selected IDs and request-only embedding connections.
- [x] Migrate Agent knowledge references from local document IDs to cloud base IDs while retaining local compatibility during rollout.
- [x] Migrate Workflow knowledge nodes to the shared server retrieval contract and preflight all references before provider calls.
- [x] Clear live cloud selections/connections on knowledge logout without deleting conversations or main BYOK settings.
- [x] Add exact request, no-partial-answer, source display and local/cloud compatibility E2E.

Validation gate:

- Chat/Agent/Workflow use the same retrieval service and authorization rules.
- Main-model provider receives bounded context/citations but never knowledge Embedding credentials.
- Public modules still work without a knowledge account.

Local verification note: `npm run qa`, `npm run test:e2e`, `npm run smoke`, `npm run release-check`, targeted Chat/Automation knowledge E2E, and `git diff --check` passed. The full Playwright matrix reported `309` passed and `35` viewport-conditional skips. The optional PostgreSQL + pgvector integration test remains present and skipped locally without `KNOWLEDGE_TEST_DATABASE_URL`.

## Phase 10 - Operations, Security And Release

- [x] Add health/readiness, queue/usage/auth metrics and structured secret-free logs.
- [x] Add reconciliation jobs for COS, usage ledger, stale reservations/uploads/sessions and vector completeness.
- [x] Document PostgreSQL backup/PITR, COS versioning/lifecycle and restore/rebuild runbooks.
- [x] Add account deletion and reliable full-resource cleanup flow.
- [x] Run threat review for credential stuffing, account enumeration, CSRF, IDOR, quota races, ZIP bombs, SSRF and prompt injection from documents.
- [x] Update privacy scan, feature audit, storage/provider/automation contracts, smoke and release checks.
- [x] Run full desktop/mobile Playwright and production deployment smoke tests.

Validation gate:

- `npm run check`, `npm run qa`, knowledge integration tests, full E2E, smoke, release-check, Trellis validation and `git diff --check` pass.
- Rollout/rollback drill preserves data and keeps non-knowledge modules available.

Local verification note: Phase 10 operations, cleanup, readiness and Admin fixtures were completed. `npm run check`, `npm run qa`, `npm run test:e2e` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8787`, `npm run smoke`, `npm run release-check` and `git diff --check` passed. The optional real PostgreSQL + pgvector test remains present and skipped locally without `KNOWLEDGE_TEST_DATABASE_URL`.

## Ordered Delivery

Phases are sequential at the contract level. UI work may begin against fakes after the owning API schema is locked, but no downstream phase is considered complete before its prerequisite validation gate passes.

Recommended deploy increments:

1. Foundation + identity + Admin behind `KNOWLEDGE_ENABLED=false` publicly.
2. Private beta for CRUD/upload/parsing/embedding on invited accounts.
3. Knowledge UI and local migration.
4. Retrieval and Chat integration.
5. Agent/Workflow integration and general release.

## Rollback Points

- Before Phase 04: disable subsystem; no user content exists.
- After upload: disable new writes, retain login/read/delete and worker cleanup.
- After embedding: retain PostgreSQL/COS; disable selectors without deleting indexes.
- After integration: feature-flag cloud selectors and restore local knowledge path.
- Never roll back by dropping knowledge tables, deleting COS prefixes or clearing IndexedDB automatically.

## Required Final Verification

```powershell
npm run check
npm run qa
npm run test:e2e
npm run smoke
npm run release-check
python ./.trellis/scripts/task.py validate 07-21-knowledge-spaces-cloud-retrieval
git diff --check
```
