# Knowledge Operations Drills

These drills are planning and operator-verification procedures. The bundled command never runs `pg_dump`, `pg_restore`, COS mutations, rebuild requests, or cleanup. It also rejects `--execute`, `--apply`, and `--run`.

Generate a plan:

```powershell
npm run knowledge:drill -- backup --environment=production
npm run knowledge:drill -- restore --environment=staging
npm run knowledge:drill -- rebuild --environment=staging
```

Restore and rebuild plans are ineligible when `--environment=production`. Operators must use an empty isolated PostgreSQL database, a dedicated COS test prefix, separate restricted runtime and migration/restore roles, and the existing audited APIs. Never place database URLs, COS credentials, OCR/provider keys, object keys, document text, or signed URLs in drill evidence.

## Backup Evidence

Record the knowledge migration ledger, pgvector version, encrypted PostgreSQL custom-format dump checksum, COS inventory/version snapshot checksum, object/count totals, and retention timestamp. Creating artifacts is not a successful recovery test; only an isolated verified restore establishes recoverability.

## Restore Evidence

Verify manifest checksums before restore, restore PostgreSQL and COS only into isolated resources, run `npm run knowledge:migrate:check`, start one isolated Worker, and run the credential-gated knowledge acceptance command. Missing PostgreSQL, COS, embedding, or OCR provider credentials are `SKIP`, never `PASS`.

## Rebuild Evidence

Record the active index/citation baseline, reserve complete shadow capacity, and use the existing shadow rebuild path. During the drill, active retrieval must remain readable. Observe pending-index age, embedding latency, worker freshness, queue age, retry/dead-letter rates, quota drift, and reconciliation state. Injected failure must leave the active index unchanged.

## OCR Operations

OCR is disabled unless `KNOWLEDGE_OCR_ENABLED=true`. The initial provider contract is `http-json-v1` and requires server environment values for `KNOWLEDGE_OCR_ENDPOINT` and `KNOWLEDGE_OCR_API_KEY`. HTTP is allowed only for loopback development/test endpoints; production requires HTTPS. Requests contain a worker-created local file downloaded from the server-owned COS object. Browser request credentials never enter OCR jobs, PostgreSQL, COS metadata, logs, audits, exports, or analytics.

OCR request timeout, input bytes, response bytes, and normalized text bytes are bounded. The durable lifecycle is `needed -> queued -> running -> retry -> ready`, with exhausted/permanent failures entering `failed`. A ready OCR artifact queues the existing parser and indexing path; deleting the document also deletes the OCR artifact.

The `http-json-v1` adapter is contract-tested with a fake provider. A real external OCR service remains a staging acceptance gap until its credentials and endpoint are supplied in an isolated environment.
