# Technical Design

## Architecture

Keep the current account -> knowledge base -> document/chunk/vector hierarchy. Add capabilities through forward-only PostgreSQL migrations and feature flags. Existing vector-only retrieval remains the compatibility path.

## Data Changes

- Add worker heartbeat and infrastructure probe state owned by the knowledge runtime.
- Add chunk revision/enablement fields and immutable revision history sufficient to rebuild a shadow index.
- Add PostgreSQL generated/search-vector state and GIN indexes scoped by account/base/index/document readiness.
- Add retrieval trace projections. Persist only bounded metrics and IDs when history is required; request text and chunk text remain response-only by default.
- Add OCR job/provider status without storing provider credentials.

Every new table and query must include `account_id`. Metadata filters can only narrow an already authorized account/base scope.

## Retrieval Pipeline

1. Authenticate knowledge account and validate up to three owned bases.
2. Resolve active index snapshots and request-scoped settings.
3. Optionally rewrite a bounded query when explicitly enabled.
4. Generate one embedding per exact profile group.
5. Run vector and/or PostgreSQL full-text recall in parallel.
6. Fuse ranked lists with RRF and deduplicate adjacent chunks.
7. Optionally rerank a bounded text candidate set.
8. Apply minimum relevance and token-budget packing.
9. Return citations plus a safe retrieval trace.

Knowledge text remains untrusted data and must retain the existing prompt-injection boundary.

## Chunk Editing

Chunk edits never mutate active vector rows in place. The user edits a draft revision, then starts a shadow rebuild. Cutover is atomic only after every enabled chunk is embedded. Cancelling or failing the rebuild keeps the active index unchanged.

## OCR

The parser continues marking image-only PDFs as `needs_ocr`. An optional OCR job consumes the server-owned COS object, calls a configured provider through a bounded adapter, stores only normalized output, then re-enters parsing/indexing. Disabled OCR leaves the existing state intact.

## Capacity Contract

Logical billable bytes equal source + normalized + chunk_text + vector ledger components. Shadow reindex capacity is reserved before work and temporarily counts toward quota. Physical PostgreSQL indexes, backups, and COS version history are operational overhead, not account quota.

## Compatibility And Rollback

- All new capabilities are additive and disabled by default.
- A runtime switch restores vector-only retrieval without schema rollback.
- New migrations are forward-only; rollback does not drop data.
- OCR and rerank adapters are optional and fail closed or explicitly degrade according to request policy.
- Active indexes and existing citations remain readable across deployment rollback.

## Security

- Exact Origin + CSRF remains mandatory for owner mutations and retrieval tests.
- Admin cannot read chunk text through operations/audit APIs.
- COS canary objects use a dedicated server-generated prefix, bounded bytes, and immediate cleanup.
- Readiness projections expose state and timestamps, never endpoints, object keys, credentials, raw provider errors, or document text.
