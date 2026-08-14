# Cloud Knowledge Runtime

Cloud knowledge is an optional subsystem. The public BYOK workspace remains account-free and continues to use JSON only for developer-managed metadata. PostgreSQL and COS are used exclusively by cloud knowledge routes.

## Runtime Requirements

- Node.js `>=24.7.0`. The knowledge identity phase uses built-in `node:crypto` Argon2id and will not fall back to a weaker password hash.
- PostgreSQL 17 or a compatible managed PostgreSQL service.
- pgvector installed in the target database.
- A Tencent COS bucket using the `BucketName-APPID` name format.

`KNOWLEDGE_ENABLED` defaults to `false`. When it is `true`, the application validates Node Argon2id support, PostgreSQL connectivity, migration checksums, the `vector` extension, the `KNOWLEDGE_TOKEN_SECRET`, `PUBLIC_ORIGIN`, and required COS environment variables. A failed check closes only `/api/kb/*`; `/api/health` and non-knowledge modules remain available.

Production knowledge sessions require an HTTPS `PUBLIC_ORIGIN`. Plain HTTP is accepted only for `localhost`, `127.0.0.0/8`, or `::1` in development/test; production rejects loopback HTTP as well. Put TLS termination in front of the loopback-bound Web container and preserve the original `Origin` header.

`DATABASE_SSL_MODE` is `disable`, `require`, or `verify-full`. Both TLS-enabled values use Node certificate-chain and hostname verification; the runtime never sets `rejectUnauthorized: false`. TLS query parameters in `DATABASE_URL` are rejected so they cannot override `DATABASE_SSL_*`. Production rejects `disable` unless the operator explicitly sets `KNOWLEDGE_ALLOW_INSECURE_DATABASE=true`; that escape hatch is for isolated local diagnostics, not a production recommendation. `DATABASE_SSL_CA` may contain the trusted PEM chain when the server certificate is not rooted in the platform trust store.

## Locked Runtime Dependencies

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| `pg` | `8.22.0` | MIT | PostgreSQL pooling, prepared queries, and transactions |
| `pgvector` | `0.3.0` | MIT | Fixed-dimension vector serialization in later embedding/retrieval phases |
| `cos-nodejs-sdk-v5` | `3.0.0` | MIT | Server-side COS HEAD/download/upload/delete operations |
| `qcloud-cos-sts` | `3.1.3` | MIT | Exact-object temporary browser upload credentials |
| `pdfjs-dist` | `6.1.200` | Apache-2.0 | PDF page text extraction with JavaScript evaluation disabled |
| `yauzl` | `3.4.0` | MIT | Lazy, size-validated OOXML ZIP access |
| `saxes` | `6.0.0` | ISC | Bounded streaming XML parsing for DOCX/XLSX/PPTX |
| `csv-parse` | `7.0.1` | MIT | Bounded CSV record parsing |
| `parse5` | `8.0.1` | MIT | Inert HTML parsing without resource loading |
| `file-type` | `22.0.1` | MIT | Content-signature validation at the parser boundary |

The browser receives only short-lived COS STS credentials for one generated source-object path. Permanent COS credentials remain server-side. Parser dependencies are exact-version production dependencies; test-only OOXML fixtures use exact-version `yazl`.

## Migrations

Production startup never auto-migrates. Apply forward-only migrations as a separate deployment step:

```powershell
npm run knowledge:migrate
npm run knowledge:migrate:check
```

Set `KNOWLEDGE_MIGRATION_DATABASE_URL` when migrations use a role separate from the Web/Worker `DATABASE_URL`. The migration URL is used only by the migration command. Passwords embedded in either URL must be URL-encoded.

The migration runner:

- normalizes SQL line endings before SHA-256 checksumming;
- holds a PostgreSQL advisory lock on one dedicated connection;
- applies and records each migration in its own transaction;
- rejects changed checksums and databases newer than the application;
- never runs automatic down migrations.

Migration `0001` enables pgvector. Migration `0002` creates the knowledge identity, tenancy, document, chunk, job, quota, and index-version foundation. Migration `0003` adds shared authentication rate-limit storage and fixed-size secret-hash constraints. Migrations `0004` and `0005` add the Admin control plane and direct-upload lifecycle. Migration `0006` adds expired-lease and document-chunk indexes for the durable parser Worker. Migration `0007` adds resumable embedding-batch state, per-account embedding concurrency, and fixed 1024/1536/3072-dimensional pgvector tables with cosine HNSW indexes. Migration `0011` adds process-level Worker heartbeats. The 3072-dimensional table uses `halfvec(3072)` because pgvector HNSW supports at most 2000 dimensions for `vector` and 4000 for `halfvec`.

Use separate PostgreSQL login roles in production. The migration role owns schema changes and pgvector extension setup and is supplied only to `npm run knowledge:migrate`. The Web and Worker share a restricted runtime role with `CONNECT`, schema `USAGE`, table `SELECT/INSERT/UPDATE/DELETE`, and required sequence `USAGE/SELECT`, but no database/schema creation or migration-table mutation grants. Configure default privileges from the migration owner so future tables and sequences receive the same runtime grants. Never put the migration-role URL in the Web or Worker environment.

## Durable Parsing Worker

Run `npm run knowledge:worker` as a process separate from Web/API. Worker concurrency and lease duration are controlled by `KNOWLEDGE_WORKER_CONCURRENCY` and `KNOWLEDGE_WORKER_LEASE_SECONDS`. Jobs are claimed with `FOR UPDATE SKIP LOCKED`; active jobs heartbeat, expired leases are reclaimable, retryable failures use bounded exponential delay, and exhausted jobs remain visible as failed jobs for Admin retry or cancellation.

The Worker also records a process heartbeat while idle. `KNOWLEDGE_WORKER_HEARTBEAT_SECONDS` defaults to `10`; `KNOWLEDGE_WORKER_STALE_SECONDS` defaults to `45` and must be larger. Readiness reports only fresh/stale counts and the latest timestamp, never the Worker ID or lease owner. Graceful shutdown removes the row; a crashed Worker becomes stale after the configured threshold.

Every parse runs in an ephemeral OS directory and a resource-limited Node worker thread. The implementation caps source bytes, ZIP entries, decompressed bytes, compression ratio, XML depth/nodes, PDF pages, slides, spreadsheet rows/cells, normalized bytes, chunks, and wall-clock duration. The temp directory is removed in `finally` on success, retry, cancellation, timeout, and parser failure.

Supported formats and citation locations:

- PDF: page number; empty image-only PDFs enter `needs_ocr`.
- DOCX: paragraph ordinal and heading path.
- XLSX: worksheet, row and cell range; formulas are never executed.
- PPTX: slide and text-shape ordinal.
- TXT/Markdown: line range and Markdown heading path.
- CSV: row/line range plus bounded header context.
- JSON: JSON path.
- HTML: inert heading/content blocks; scripts, styles, templates and remote resources are ignored.

Successful parsing uploads a deterministic NDJSON normalized artifact to COS, persists chunks and source locators, settles `normalized` and `chunk_text` logical bytes, completes the job, and moves the document to `awaiting_embedding` in one PostgreSQL transaction. The Worker never receives a user Embedding API key. Admin can retry terminal jobs or cancel queued/running/retry jobs only with an audited reason.

## Resumable BYOK Embedding

Embedding remains browser-driven so the Worker and deployment environment never receive user provider credentials. OpenAI and Qwen URL/Key pairs are stored only in the knowledge portal's `sessionStorage` record and are sent only to `POST /api/kb/documents/:documentId/embedding-batches/next`. The server registers those request values for error redaction, but never writes them to PostgreSQL, COS, jobs, audit, bootstrap, or exports.

Each batch uses two short transactions around one external provider call:

1. Lock account capacity, release expired leases, enforce the effective concurrency limit, select chunks with `FOR UPDATE SKIP LOCKED`, reserve exact vector bytes, and commit a batch lease.
2. Call the approved OpenAI/Qwen endpoint outside the transaction.
3. Re-lock and verify the exact batch/session lease, validate count/order/dimensions, insert into the fixed physical table, settle quota, and mark chunks/documents ready atomically.

`KNOWLEDGE_EMBEDDING_LEASE_SECONDS` defaults to `120`; `KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS` defaults to `60000` and must remain shorter than the lease. The Admin runtime limit `maxConcurrentEmbeddingsPerAccount` defaults to `2` and supports per-account overrides.

Query rewrite and candidate reranking are separate retrieval enhancements. Both Admin feature flags default to off. A request must explicitly enable an enhancement and supply only a transient `apiKey` plus an enabled Chat `modelId`; the server ignores no caller URL because no URL field is accepted and always uses the administrator-managed upstream. `KNOWLEDGE_RETRIEVAL_ENHANCEMENT_TIMEOUT_MS` defaults to `15000` and is bounded to `1000..60000`. Rerank failures fall back to RRF only when that request explicitly sets `allowFallback: true`. No enhancement credential, query, candidate text, or model output is written to PostgreSQL, COS, audit data, or operations metrics.

Model changes on non-empty knowledge bases use a shadow index. Reindex creation reserves the complete cloned chunk and target vector footprint before copying any chunk. The active version remains readable until every shadow vector is committed; cutover, target reservation settlement, old-version quota release, and old vector/chunk deletion occur in one PostgreSQL transaction.

`KNOWLEDGE_TOKEN_SECRET` is a server-only, randomly generated secret used for domain-separated HMACs of sessions, CSRF values, recovery codes, invites, and rate-limit subjects. It must never be sent to the browser or included in metadata exports. `PUBLIC_ORIGIN` is required for same-origin validation of knowledge state changes.

Knowledge JSON requests are capped at `64kb` before route handling. Authentication rate limits use the client IP prefix resolved by Express. Keep `TRUST_PROXY_HOPS=0` for direct deployments; set it to the exact number of trusted reverse-proxy hops (normally `1` for a single Nginx or 1Panel proxy) so forwarded client addresses are used without trusting arbitrary headers from direct clients.

All `/api/kb/*` responses include `Cache-Control: no-store`. Reverse proxies must preserve this header and must not cache account, session, recovery, metadata, document, or retrieval responses.

## Failure Contract

`GET /api/health` always describes the optional knowledge state without exposing secrets. `GET /api/kb/health` returns its own request ID and reports `503` when knowledge was enabled but failed validation. Other `/api/kb/*` requests fail closed with the stable envelope:

```json
{
  "error": {
    "code": "KB_UNAVAILABLE",
    "message": "云知识库服务暂时不可用",
    "requestId": "...",
    "details": {}
  }
}
```

Database URLs, passwords, COS credentials, cookies, session values, and BYOK keys are redacted from knowledge logs and error responses. Later knowledge routes must register any transient request credential with the exported request context helper before calling provider or COS adapters; the helper never persists the value.

## Operations Runbook

Knowledge Admin APIs live under `/api/admin/knowledge`; the Admin page is available only at `/xizi2333` and requires the existing Admin session plus exact-origin mutation checks. Public navigation must not link to the page.

Operational endpoints:

- `GET /api/admin/knowledge/readiness`: returns database, migration, pgvector, object-store configuration, queue, usage, auth and cleanup metrics. It is a read model only and must not include passwords, hashes, BYOK credentials, COS object keys, document text, lease owners, or raw provider errors.
- `POST /api/admin/knowledge/maintenance/cleanup-stale`: releases expired upload reservations, revokes expired sessions, expires old invites/admin resets, runs pending upload cleanup, and finalizes deleting accounts whose resources are gone.
- `POST /api/admin/knowledge/maintenance/reconcile`: queues `reconcile` jobs for one account or a bounded batch of accounts. Workers use the existing quota reconciliation path to recompute counters from the append-only ledger.
- `DELETE /api/admin/knowledge/accounts/:accountId`: marks an account `deleting`, revokes sessions/resets, marks owned bases/documents `deleting`, and queues an account-level `cleanup` job. The worker delegates that job to operations, which cleans deleting bases through the existing base cleanup flow. Maintenance finalizes the account only after no bases, documents, or active jobs remain.

Every mutation requires a non-empty Admin reason and writes `kb_admin_audit`. Audit metadata is bounded and redacted.

`GET /api/ready` includes knowledge only when `KNOWLEDGE_ENABLED=true`. Enabled knowledge is ready only when the runtime, migrations, pgvector, a fresh Worker, and the COS canary are ready. The canary writes 32 random bytes below a server-generated reserved prefix, verifies the exact size with HEAD, and deletes the exact version immediately. Results are cached for `KNOWLEDGE_COS_PROBE_INTERVAL_SECONDS` (default `60`) and each SDK request is bounded by `KNOWLEDGE_COS_PROBE_TIMEOUT_MS` (default `5000`). `KNOWLEDGE_COS_PROBE_ENABLED=false` is an explicit rollback switch and is projected as `disabled`; readiness never exposes the object key, bucket credentials, or raw COS error.

## Staging Acceptance

Run the real-infrastructure gate only against an isolated HTTPS staging deployment:

```powershell
$env:KNOWLEDGE_ACCEPTANCE_ORIGIN = "https://staging.example.com"
$env:KNOWLEDGE_ACCEPTANCE_INVITE_CODE = "<one-time staging invite>"
$env:KNOWLEDGE_ACCEPTANCE_OPENAI_API_KEY = "<disposable key>"
$env:KNOWLEDGE_ACCEPTANCE_QWEN_API_KEY = "<disposable key>"
npm run knowledge:acceptance
```

The runner emits newline-delimited records containing only `PASS`, `FAIL`, or `SKIP`, check names, and fixed error codes. It verifies application readiness, real PostgreSQL migrations/pgvector, the COS canary plus direct upload, Worker parsing, each configured OpenAI/Qwen embedding path, vector retrieval, signed citation opening, asynchronous base cleanup, and account recovery. Missing origin, invite, or provider credentials produce `SKIP`, never `PASS`; exit code `2` means at least one skipped gate, `1` means failure, and `0` means every gate passed. It never prints credentials, signed URLs, document text, cookies, recovery codes, usernames, or object keys.

## Logical Billable Capacity

The default `5 GiB` (`5,368,709,120` bytes) is a logical billable limit, not physical disk usage. It includes the current source object, the current normalized artifact, persisted chunk text, and active plus shadow vector bytes. Shadow rebuild capacity is reserved before work and counts until cutover cleanup releases the retired index.

PostgreSQL row/page overhead, physical B-tree/GIN/HNSW indexes, WAL, replicas, database backups, COS historical versions/delete markers, multipart-upload residue, provider traffic, and operational canary objects are excluded. Operators must budget those separately; a `5 GiB` account can consume more than `5 GiB` of physical PostgreSQL/COS/backup capacity.

## Backup, Restore And Rebuild

PostgreSQL:

- Use a managed PostgreSQL backup plan with point-in-time recovery when available. At minimum, run encrypted scheduled dumps for the application database and verify restore into a staging database on a recurring schedule.
- Backup scope must include `kb_accounts`, sessions/reset/invite metadata, runtime settings, audit, bases, documents, chunks, vector tables, jobs, embedding batches and usage ledger rows.
- Restore drill: restore PostgreSQL to staging, run `npm run knowledge:migrate:check`, start Web with `KNOWLEDGE_ENABLED=true`, run `GET /api/admin/knowledge/readiness`, then queue reconciliation for a bounded account batch.

Tencent COS:

- Enable COS versioning for the knowledge bucket before production writes.
- Add lifecycle rules for aborted multipart uploads, expired temporary artifacts, old normalized artifacts after successful reindex cleanup, and retained deleted-object versions according to the deployment's recovery window.
- Use COS inventory or bucket listing in an operational reconciliation job to compare expected `knowledge/{accountId}/{baseId}/{documentId}/...` objects against PostgreSQL document metadata. Never trust a browser-supplied object key.

Vectors:

- pgvector rows are backed up with PostgreSQL.
- If vector tables are lost but source/normalized text and metadata survive, rebuild by marking affected documents/base indexes as requiring embedding and asking the account owner to provide a compatible OpenAI/Qwen BYOK embedding connection. The server must not invent or persist a replacement key.

Rollback:

1. Disable new registration/uploads in Admin.
2. Keep login, reads and deletion available so users can recover or remove data.
3. Hide cloud selectors from Chat/Agent/Workflow if retrieval is unhealthy.
4. Stop the worker only after active leases expire or are cancelled.
5. Roll back application code without dropping knowledge tables or deleting COS prefixes.

## Threat Review Checklist

- Credential stuffing: PostgreSQL-backed login/register/recovery limits must remain shared across Web replicas; unknown-account login still runs the password-cost path.
- Account enumeration: login, recovery and Admin reset consumption use generic public failures. Admin-only lists require an Admin session.
- CSRF/origin: every knowledge/Admin mutation requires exact `Origin === PUBLIC_ORIGIN`; authenticated knowledge mutations also require `X-Knowledge-CSRF`.
- IDOR: all knowledge-base, document, chunk, citation and source-open queries bind authenticated `account_id`; client owner IDs are ignored.
- Quota races: account capacity is locked before reservations, settlements, uploads, parse output, reindex and cleanup usage changes.
- ZIP bombs and active content: parser limits cover decompressed size, entry count, XML depth/nodes and timeout; Office macros/formulas, PDF JavaScript and HTML scripts/resources are never executed.
- SSRF/object-key abuse: browser uploads use server-generated exact COS keys and short-lived scoped credentials; parsers never load remote resources from user documents.
- Prompt injection from documents: retrieval context is bounded, citation-tagged and marked as untrusted knowledge before it reaches the main model. It must not override system, Admin or tool-safety instructions.
- Secret persistence: BYOK main-model/search/embedding URL and Key values are request/session-only and must not enter PostgreSQL, COS, jobs, audit, exports, logs or bootstrap.

## Deployment

See [`deploy/knowledge/compose.yaml`](../deploy/knowledge/compose.yaml). The production example pins Node 24.15.0, requires an external PostgreSQL/pgvector service with verified TLS, runs a one-shot migration role, then starts Web/API and independent Worker processes with the restricted runtime role. The Web port binds only to loopback for an HTTPS reverse proxy. The migration container receives only its database configuration; the Worker does not receive Admin credentials. COS remains an external managed service, and permanent COS credentials stay in deployment secrets.
