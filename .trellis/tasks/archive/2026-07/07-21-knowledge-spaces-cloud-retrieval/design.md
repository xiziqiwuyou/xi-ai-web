# Knowledge Accounts And Cloud Retrieval Design

## 1. Scope And Invariants

This subsystem adds cloud knowledge accounts without converting xi-ai-web into an account-based application.

Hard invariants:

1. Public Chat, Image, Agents, Workflows, PPT, Mind Map, Assistants and Translation remain usable without a knowledge account.
2. Admin authentication stays isolated at `/admin`.
3. Knowledge identity protects only cloud knowledge resources and requests that reference them.
4. Main-model, search and knowledge-embedding BYOK credentials remain browser-session data and are never persisted by the server.
5. PostgreSQL + pgvector is the authoritative knowledge metadata/vector store; COS is the authoritative original-file store.
6. One account owns many knowledge bases. There is no space, membership, invitation-to-library or public-sharing layer.
7. Every server query derives `account_id` from the authenticated opaque session, never from a trusted client owner field.

## 2. Deployment Topology

```text
Browser
  |-- public BYOK requests --------------------> Web/API
  |-- knowledge auth and metadata ------------> Web/API
  |-- temporary COS credential request -------> Web/API
  |-- direct file bytes -----------------------> Tencent COS
  |-- online embedding batch + transient key -> Web/API -> OpenAI/Qwen
  |-- knowledge-aware chat --------------------> Web/API -> pgvector -> main model

Web/API <------------ PostgreSQL + pgvector ------------> Knowledge Worker
                                                               |
                                                               +---- read/delete objects ----> Tencent COS
```

Processes:

- `web`: existing Express/Vite server plus `/api/kb/*` and knowledge-aware execution.
- `knowledge-worker`: durable parsing, cleanup and reconciliation jobs. It never receives or stores user Embedding API keys.
- `postgres`: knowledge identity, sessions, settings, quotas, metadata, jobs, chunks, vectors and audit.
- `cos`: originals and optional normalized extraction artifacts; no permanent app-server upload directory.

MVP does not require Redis. PostgreSQL jobs use leases and `FOR UPDATE SKIP LOCKED`. Production runs the worker separately; development may start an in-process worker only behind an explicit flag.

## 3. Configuration And Failure Mode

Server environment:

- `KNOWLEDGE_ENABLED`
- `DATABASE_URL`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `COS_APP_ID` when required by the SDK
- worker lease/concurrency and public origin settings

COS permanent credentials never enter Admin JSON metadata. Secrets remain environment/deployment secrets.

When `KNOWLEDGE_ENABLED=true`, startup validates PostgreSQL connectivity, required migrations, `vector` extension, COS configuration and Node Argon2 support. A missing prerequisite marks only the cloud knowledge subsystem unavailable; public non-knowledge routes remain available. Production must not silently use browser IndexedDB as a cloud fallback.

## 4. Module Boundaries

Suggested backend layout:

```text
server/knowledge-cloud/
  config.mjs
  db.mjs
  migrations/
  auth/
  accounts/
  admin/
  quotas/
  object-store/
  documents/
  parsers/
  jobs/
  embeddings/
  retrieval/
  citations/
  routes.mjs
  worker.mjs
```

Suggested frontend layout:

```text
src/features/knowledge-cloud/
  api.ts
  types.ts
  auth/
  library/
  documents/
  embedding-connections/
  migration/
  components/
```

Existing `src/features/knowledge/` becomes a compatibility/migration source and is incrementally replaced. Existing `server/knowledge/retrieval.mjs` stays available for local request-scoped knowledge until cloud callers migrate.

## 5. PostgreSQL Data Model

All IDs are server-generated UUIDs. All timestamps are UTC. Mutable records include an optimistic `version` or use row locks for state transitions.

### Identity And Control

- `kb_accounts`
  - normalized unique login name, password hash, recovery-code hash
  - status (`active`, `frozen`, `deleting`)
  - `quota_bytes`, `used_bytes`, `reserved_bytes`
  - optional per-account limit overrides
  - password/session generation, created/last-login timestamps
- `kb_sessions`
  - account ID, opaque token hash, CSRF token hash, expiry, last-seen, revoked timestamp
  - IP prefix hash and bounded user-agent metadata for audit only
- `kb_invites`
  - code hash, expiry, consumed/revoked state, creator, optional initial overrides
- `kb_admin_resets`
  - reset-code hash, 15-minute expiry, consumed/revoked state, reason and admin audit reference
- `kb_runtime_settings`
  - registration mode, global default limits and schema version
- `kb_admin_audit`
  - immutable operation, target, reason, result and bounded metadata; never document body or secret

### Knowledge Data

- `kb_knowledge_bases`
  - owner account, name/description, status
  - embedding vendor, catalog model ID, snapshotted actual request model, dimensions
  - profile fingerprint, chunk/index version, active/pending index version
- `kb_documents`
  - owner and knowledge-base IDs
  - generated COS object key/version, original display name, MIME, checksum, verified bytes
  - parse status, parser version, normalized artifact key/bytes, error code
- `kb_chunks`
  - owner, knowledge-base, document and index-version IDs
  - ordinal, bounded text, UTF-8 bytes, token estimate, structured source locator
  - embedding state and deterministic content hash
- fixed-dimension vector tables/indexes
  - MVP provisions approved OpenAI/Qwen dimensions through migrations
  - each row references one chunk/profile/index version and has a cosine HNSW index
  - arbitrary request-controlled dimensions never become dynamic SQL identifiers
- `kb_jobs`
  - parse, cleanup, reconciliation and reindex orchestration
  - status, attempts, lease owner/expiry, progress, bounded error code/detail
- `kb_embedding_batches`
  - chunk range/profile/index version, lease/idempotency key, completion and provider usage metadata
- `kb_usage_ledger`
  - reservation/settlement/release entries by account and resource component

The exact initial vector dimensions are derived from approved OpenAI/Qwen model profiles and locked in migrations. Adding another dimension is an admin/deployment migration, not a user request side effect.

## 6. Password, Recovery And Session Security

- Passwords use Node built-in Argon2id with versioned parameters and per-value salts.
- Recovery, invite, session and admin-reset codes use cryptographically random bytes; only keyed/domain-separated hashes are stored.
- Login names are NFKC-normalized and case-normalized before unique lookup; display and normalized forms remain separate.
- The knowledge session is an opaque random token in `HttpOnly; Secure; SameSite=Lax` cookie `xi_kb_session`, scoped to `/api` so knowledge-aware Chat can authorize it.
- State-changing requests require same-origin validation and an in-memory CSRF value returned by the authenticated session endpoint.
- Login/register/recovery/reset are rate-limited using PostgreSQL-backed counters so multiple web replicas share enforcement.
- Password or recovery reset increments session generation, revokes all sessions and creates a new one-time recovery code.
- Registration recovery-code UI cannot navigate away until the user explicitly acknowledges saving it; copy and text-download actions are provided.

Admin-assisted reset never recovers an old secret. It issues one 15-minute reset code, invalidates sessions/recovery, and records the admin reason. Only one reset flow can be active per account.

## 7. Registration Modes

`kb_runtime_settings.registration_mode`:

- `disabled`: login only.
- `invite_only`: default; register requires one valid code.
- `open`: self-registration without code, with stricter server rate limits and abuse controls.

Invite consumption and account creation occur in one transaction with a row lock. Invite plaintext is shown once. Public bootstrap exposes only the mode and safe password/account-name rules.

## 8. Quota Model

Default limits match the PRD. Account overrides are nullable fields layered over global defaults.

Logical capacity components:

- verified COS original bytes
- separately stored normalized extraction bytes
- UTF-8 chunk text bytes
- vector payload bytes (`dimensions * bytes_per_component` per stored vector)

Relationship metadata and physical PostgreSQL/HNSW overhead are excluded from user-visible quota but monitored operationally.

Quota transaction:

1. Lock account usage row.
2. Verify `used + reserved + requested <= quota` and count/rate limits.
3. Append reservation ledger entry and increment `reserved_bytes`.
4. Perform external or async work.
5. Verify actual size, settle used bytes and release reservation in one transaction.
6. Failure/expiry appends release entry. Reconciliation recomputes counters from resources and ledger.

Reindex reserves the complete new vector/chunk footprint while old index remains readable. Insufficient headroom blocks reindex. Lowering limits never deletes data; it blocks new additions until usage is compliant.

## 9. COS Upload And Object Lifecycle

Object key pattern:

```text
knowledge/{accountId}/{knowledgeBaseId}/{documentId}/source/{opaqueObjectId}
knowledge/{accountId}/{knowledgeBaseId}/{documentId}/normalized/{version}
```

The server generates every key. Original filenames stay metadata and never form a path.

Upload flow:

1. Authenticated client creates a pending document with declared size/checksum.
2. Server reserves quota and returns short-lived STS credentials restricted to the exact generated object and required upload action.
3. Browser uploads directly with the official COS browser SDK.
4. Client finalizes; server performs COS HEAD, verifies key, size/checksum/ETag as available, and queues parsing.
5. Expired pending uploads release reservations and best-effort delete orphan objects.

Enable COS versioning and lifecycle policies operationally. Deletes are durable jobs; quota returns only after the deletion workflow reaches a verifiable state.

## 10. Parsing And Citation Locators

Worker safety limits include input bytes, decompressed bytes, ZIP entry count, compression ratio, XML depth/node count, row/cell count, page/slide count and wall-clock timeout.

Parsers:

- PDF: page text and page number.
- DOCX: headings/paragraphs and ordinal locator.
- XLSX: workbook sheet and cell range.
- PPTX: slide number and text-shape order.
- TXT/Markdown: line ranges and heading path where available.
- CSV: row ranges and header context.
- JSON: bounded JSON path/record locator.
- HTML: parsed headings/paragraphs; scripts, styles and remote loads are ignored.

No parser executes macros, scripts, formulas or embedded external content. A file with no meaningful extractable text enters `needs_ocr`; no vectors are generated.

## 11. Resumable BYOK Embedding

Parsing ends at `awaiting_embedding`. The worker never has a BYOK key.

Browser session storage owns `KnowledgeEmbeddingConnection` records keyed by approved profile/vendor. These records are separate from main-model and independent-search settings.

Embedding batch flow:

1. Client requests the next batch with knowledge-base ID, model catalog ID and transient connection.
2. Server verifies account ownership, exact profile snapshot, limits and document/index state.
3. A short transaction leases unembedded chunks and commits the lease.
4. Server calls the resolved OpenAI/Qwen adapter outside the transaction.
5. A second transaction verifies lease/idempotency, writes vectors, settles vector bytes and marks chunks complete.
6. Provider error releases/retries the batch without persisting connection data.
7. When all chunks complete, the document/index becomes `ready` atomically.

Closing the page pauses after the current request. Completed vectors remain. Expired leases become claimable. The UI shows `awaiting_embedding`, progress, errors and a prominent `缁х画绱㈠紩` action.

## 12. Retrieval And Multi-Knowledge Fusion

A request may select 1-3 knowledge bases.

Preflight before any main-model call:

1. Validate knowledge session and ownership of every ID.
2. Require every selected base and document index to be `ready`.
3. Resolve an exact compatible transient connection for every embedding profile.
4. Group bases by profile; embed the query once per group.
5. Search each base with mandatory account/base/index-version filters.
6. Fuse normalized results deterministically, deduplicate adjacent chunks and cap final results at configured `maxRetrievalTopK` (default 20).
7. Format bounded untrusted knowledge context with stable citation IDs.

Any failed group aborts before the main model. Partial silent knowledge answers are forbidden.

Response citations contain knowledge-base ID/name, document ID/name, chunk ID, locator, score/mode and a short-lived authorized source URL generated only when opened.

## 13. Frontend Experience

Knowledge route states:

- subsystem unavailable
- register/login/recover
- one-time recovery-code confirmation
- knowledge-base catalog
- knowledge-base detail with documents, usage, model and indexing queue
- create/edit/reindex dialogs
- migration from local IndexedDB documents

The public shell does not become authenticated. Only knowledge-specific controls show account state.

Chat/Agent/Workflow selectors show up to three cloud knowledge bases only when a knowledge session exists. Logging out clears live selections and embedding connections but does not delete unrelated local conversations or BYOK main-model settings.

Status copy must distinguish upload, parsing, waiting for Key, embedding, ready, OCR required, failure and deletion. Before upload and navigation during active embedding, the UI states that parsing continues but embedding pauses safely.

## 14. Local Knowledge Migration

Existing IndexedDB documents remain readable until explicit migration succeeds.

Migration:

1. User logs into knowledge account and chooses target knowledge base.
2. UI previews document count/bytes and quota impact.
3. Each source is uploaded/created through normal cloud APIs and tracked in a migration manifest.
4. Parsing/embedding follows normal state machines.
5. Local data is never auto-deleted. After all selected documents are ready, the user may explicitly remove local copies.

Export/import continues to cover local workspace data only. Cloud knowledge content is referenced in future exports by metadata IDs, never duplicated with server documents or credentials.

## 15. Admin Experience

Add expandable Admin destinations:

- Knowledge overview
- Accounts
- Registration and invites
- Runtime limits
- Jobs and storage health
- Audit log

Account actions: freeze/unfreeze, revoke sessions, quota overrides, one-time reset, inspect counts/usage/status. No API returns password/recovery hashes, sessions, BYOK connections, COS keys or document bodies.

## 16. API Surface

Representative routes:

```text
GET    /api/kb/public-config
POST   /api/kb/auth/register
POST   /api/kb/auth/login
GET    /api/kb/auth/session
POST   /api/kb/auth/logout
POST   /api/kb/auth/recover
POST   /api/kb/auth/admin-reset

GET    /api/kb/bases
POST   /api/kb/bases
GET    /api/kb/bases/:baseId
PATCH  /api/kb/bases/:baseId
DELETE /api/kb/bases/:baseId
POST   /api/kb/bases/:baseId/reindex

GET    /api/kb/bases/:baseId/documents
POST   /api/kb/bases/:baseId/documents/upload-grant
POST   /api/kb/documents/:documentId/finalize
DELETE /api/kb/documents/:documentId
POST   /api/kb/documents/:documentId/embedding-batches/next

GET    /api/admin/knowledge/settings
PUT    /api/admin/knowledge/settings
GET    /api/admin/knowledge/accounts
PATCH  /api/admin/knowledge/accounts/:accountId
POST   /api/admin/knowledge/accounts/:accountId/revoke-sessions
POST   /api/admin/knowledge/accounts/:accountId/reset
GET    /api/admin/knowledge/invites
POST   /api/admin/knowledge/invites
DELETE /api/admin/knowledge/invites/:inviteId
GET    /api/admin/knowledge/jobs
GET    /api/admin/knowledge/audit
```

Existing Chat and Agent payloads gain bounded `knowledgeBaseIds` and request-only embedding connections. Shared types use stable IDs; raw owner IDs and server storage keys never appear as writable client fields.

## 17. Error Contract

Knowledge APIs return a stable shape:

```json
{
  "error": {
    "code": "KB_QUOTA_EXCEEDED",
    "message": "鐭ヨ瘑搴撳閲忎笉瓒?,
    "requestId": "...",
    "details": {}
  }
}
```

Codes distinguish authentication, frozen account, invite, quota, upload, parser, OCR-required, missing BYOK connection, model mismatch, index-not-ready, rate limit and retryable upstream errors. Details are bounded and secret-free. Provider errors redact all transient keys.

## 18. Operations, Backup And Reconciliation

- PostgreSQL: managed backups or scheduled encrypted dumps with point-in-time recovery where available.
- COS: versioning, lifecycle and inventory/reconciliation.
- Vectors: backed up with PostgreSQL and rebuildable from normalized text/chunk metadata plus the same embedding model when a compatible BYOK key is supplied.
- Worker: lease expiry, retry caps, dead-job visibility and admin retry/cancel.
- Reconciliation: COS objects vs documents, chunks/vectors vs usage ledger, stale sessions/reservations/uploads, and deleted-resource cleanup.
- Metrics: auth failures, registrations, storage usage, queue age, parser failures, waiting-for-key counts, embedding latency/errors, retrieval latency/recall samples and quota denials.

## 19. Rollout And Rollback

Rollout is feature-flagged. Local knowledge remains operational until cloud phases pass migration and E2E checks.

Rollback order:

1. Disable new registration/uploads.
2. Keep authenticated reads and deletion available.
3. Disable cloud selectors in Chat/Automation while retaining local knowledge.
4. Stop worker after leases expire.
5. Roll back application code without dropping migrations or deleting COS data.

Database migrations are forward-only and additive until final cutover. Destructive cleanup requires a separate reviewed operation.
