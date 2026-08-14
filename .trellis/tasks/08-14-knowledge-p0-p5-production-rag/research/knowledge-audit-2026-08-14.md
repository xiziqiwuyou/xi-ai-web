# Knowledge Audit Summary

## Current Evidence

- The subsystem already includes independent accounts, recovery codes, invitation modes, PostgreSQL migrations, pgvector storage, COS direct upload, isolated parsing, resumable browser-driven embedding, retrieval/citations, Chat selection, quota accounting, Admin operations, and migration from legacy local documents.
- `npm run test:knowledge` passed 153 tests on 2026-08-14.
- `npm run test:knowledge:db` skipped because `KNOWLEDGE_TEST_DATABASE_URL` was absent.
- Existing Playwright knowledge coverage uses API fixtures and is not proof of real PostgreSQL/COS/provider interoperability.

## Highest-Risk Gaps

- Main readiness ignores enabled knowledge failure.
- Production config permits non-loopback HTTP origins and unverified PostgreSQL TLS `require` mode.
- Worker freshness and real object-store health are not represented.
- Retrieval is vector-only and lacks a user-facing test/trace surface.
- Chunking is parser-block plus maximum-byte splitting without overlap or revision UI.
- Scanned PDFs stop at `needs_ocr`.
- Browser-only BYOK embedding is resumable but cannot continue after the browser closes; this remains an explicit product constraint.

## Reference Mechanisms

- FastGPT: retrieval test, vector/full-text/hybrid modes, RRF, rerank, query enhancement, token-based reference budget.
- Dify: visible/editable chunks and parent-child retrieval patterns.
- RAGFlow: parser-result observability and OCR-oriented document handling.
- MaxKB: bounded segmentation presets and hit testing.

The project should borrow these mechanisms without importing their multi-tenant workspace models or additional storage infrastructure.
