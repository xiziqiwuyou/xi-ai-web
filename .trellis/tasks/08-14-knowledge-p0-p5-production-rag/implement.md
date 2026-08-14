# Implementation Plan

## P0 Production Gate

- [x] Extend config and readiness with production HTTPS, verified database TLS, knowledge runtime state, worker heartbeat, and COS canary state.
- [x] Add worker heartbeat persistence/refresh and stale detection.
- [x] Add bounded object-store probe and reconciliation metrics.
- [x] Add real-infrastructure acceptance runner with explicit PASS/FAIL/SKIP.
- [x] Update deployment and runtime documentation; add targeted tests.
- Rollback: disable knowledge or the new probe flags; no data migration rollback.

## P1 Documents And Chunks

- [x] Add forward migration for chunk enablement/revisions and chunk strategy metadata.
- [x] Add account-scoped list/preview/edit/disable routes and services.
- [x] Route edits through shadow reindex and preserve active index reads.
- [x] Add capacity breakdown and chunk preview UI with mobile coverage.
- Rollback: hide editing UI and keep existing active index; retain additive columns/history.

## P2 Retrieval Lab

- [x] Add trace-capable retrieval contract with request-only settings.
- [x] Build retrieval test UI as a separate component in the knowledge workspace.
- [x] Show stage timing, scores, filtering, token budget, citations, and no-result state.
- [x] Add authorization, redaction, desktop/mobile, and keyboard tests.
- Rollback: disable retrieval lab flag; normal Chat retrieval remains unchanged.

## P3 Retrieval Quality

- [x] Add PostgreSQL FTS migration and account/index-scoped repository queries.
- [x] Implement vector/full-text/hybrid modes and standard RRF.
- [x] Implement token-budget packing and minimum relevance.
- [x] Add optional rewrite/rerank adapters and Admin flags with strict BYOK/redaction boundaries.
- [x] Add deterministic unit and PostgreSQL integration tests.
- Rollback: force vector-only mode and disable rewrite/rerank.

## P4 Chat Integration

- [x] Support partial-base readiness and explicit knowledge state messages.
- [x] Keep knowledge entry discoverable when logged out or unavailable.
- [x] Handle session expiry, missing keys, no matches, cancellation, and citation failures locally.
- [x] Verify desktop/mobile focus, scroll, touch targets, and layout stability.
- Rollback: selector can be hidden independently without changing stored knowledge data.

## P5 OCR, Operations, And Evaluation

- [x] Add disabled-by-default OCR adapter/job transition and safe retry behavior.
- [x] Add operations metrics, worker/queue alerts, quota/COS reconciliation reporting.
- [x] Add non-destructive backup/restore/rebuild drill scripts and docs.
- [x] Add deterministic RAG fixture/evaluation runner and baseline report format.
- Rollback: disable OCR/metrics jobs; existing `needs_ocr` documents and vector retrieval remain intact.

## P6 Release Closure

- [x] Run the full local quality gate on the complete P0-P5 diff.
- [x] Run the knowledge owner, workspace, Admin, and Chat Playwright suites at all four configured viewports.
- [x] Run the real-infrastructure acceptance entry point and preserve missing credentials/origin as explicit release-blocking `SKIP` results.
- [x] Commit and archive the P0-P5 implementation after the release-readiness review reports no code blocker.
- [ ] Publish a versioned release only after the immutable release snapshot is prepared and its GitHub/GHCR workflows are verified.

## Validation

```powershell
npm run check
npm run build
npm run privacy
npm run test:knowledge
npm run test:knowledge:db
npm run test:frontend
npx playwright test tests/e2e/knowledge-*.spec.ts tests/e2e/chat-knowledge-integration.spec.ts
npm run qa
```

Real staging acceptance additionally requires `KNOWLEDGE_TEST_DATABASE_URL`, isolated COS test credentials/bucket prefix, and approved OpenAI/Qwen test keys. Missing values must produce SKIP and remain a release blocker for public enablement.

## Verification Evidence

- `npm run qa` passed on 2026-08-14 against the complete P0-P5 diff. The PostgreSQL + pgvector integration case was explicitly skipped because `KNOWLEDGE_TEST_DATABASE_URL` was absent.
- Knowledge owner, workspace, Admin, and Chat Playwright coverage passed `76/76` across `1440x900`, `1280x800`, `390x844`, and `375x812` after starting the local application on the configured Playwright origin.
- `npm run test:knowledge` passed `194/194` before the final preflight-order regression; the focused retrieval suite then passed `15/15` with that additional case.
- `npm run knowledge:acceptance` emitted seven `SKIP` records with `ACCEPTANCE_ORIGIN_MISSING`; PostgreSQL/pgvector, COS, OpenAI, Qwen, cleanup, and recovery remain external production-enablement gaps, not local passes.
- The release-readiness supervisor found and then verified the fix for cross-index-version embedding deduplication: identical embedding profiles at index versions 1 and 2 now produce one provider call, with sorted `indexVersions` diagnostics. The focused retrieval/enhancement suite passed `15/15` after the fix.
