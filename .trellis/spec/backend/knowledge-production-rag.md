# Knowledge Production RAG Contract

## 1. Scope / Trigger

Apply this contract to changes under `server/knowledge-cloud/`, `/api/kb/*`, `/api/admin/knowledge/*`, knowledge migrations, COS storage, retrieval, OCR, operations metrics, and the production acceptance/drill/evaluation scripts.

The public workspace remains account-free. Knowledge uses a separate private owner account and never adds sharing, invitations between owners, team roles, or a public knowledge API.

## 2. Signatures

```text
GET   /api/kb/documents/:documentId/chunks
POST  /api/kb/documents/:documentId/chunks/preview
PATCH /api/kb/chunks/:chunkId
POST  /api/kb/bases/:baseId/reindex
POST  /api/kb/retrieval

GET   /api/admin/knowledge/settings
PUT   /api/admin/knowledge/settings
GET   /api/admin/knowledge/readiness
```

```ts
type KnowledgeRetrievalRequest = {
  query: string;
  knowledgeBaseIds: string[]; // 1..3, owner scoped
  mode?: "vector" | "fulltext" | "hybrid"; // default vector
  embeddingConnections?: Partial<Record<"openai" | "qwen", { apiKey: string }>>;
  queryRewrite?: { enabled: boolean };
  rerank?: { enabled: boolean; allowFallback?: boolean };
  enhancementConnection?: { apiKey: string; modelId: string };
  trace?: boolean;
};
```

```sql
kb_runtime_settings.query_rewrite_enabled boolean NOT NULL DEFAULT false
kb_runtime_settings.rerank_enabled boolean NOT NULL DEFAULT false
```

Deployment commands:

```powershell
npm run knowledge:migrate
npm run knowledge:worker
npm run knowledge:acceptance
npm run knowledge:drill -- backup
npm run knowledge:rag-eval:sample
```

## 3. Contracts

- PostgreSQL + pgvector stores owner metadata, queue state, full text, chunks, and vectors. COS stores source, normalized, and OCR artifacts; COS never stores vectors.
- Logical billable capacity is source + normalized + chunk text + active/shadow vector bytes. Physical indexes, backups, row overhead, and COS version history are excluded.
- Chunk revisions append draft history. Reindex materializes enabled effective chunks into a shadow index, reserves capacity before provider work, and atomically cuts over only after every target chunk is ready. Failure or cancellation leaves the active index readable.
- A base is retrievable when it is active, has a valid active index, and has at least one ready document. Newer pending documents do not block reads from the active index.
- Vector-only is the compatibility default. Full-text, hybrid, query rewrite, rerank, and OCR are additive opt-in behavior.
- Query rewrite and rerank require both an Admin flag and an explicit request option. `enhancementConnection` accepts only `apiKey` and a configured enabled Chat `modelId`. It never accepts a URL.
- Enhancement and embedding Keys exist only in request memory. The managed upstream and catalog model mapping remain server-owned. Queries, candidate text, provider output, and credentials never enter audit, operations metrics, PostgreSQL, COS, or logs.
- Rewrite runs after owner/base authorization and before embedding/full-text recall. Rerank consumes a bounded candidate set after fusion. Rerank may return to RRF only when `allowFallback: true`; cancellation never falls back.
- OCR is disabled by default and uses server-owned provider configuration. OCR retry/cancel keeps the previous active index readable and re-enters the existing parser/index pipeline only after bounded normalized text is available.
- Readiness includes migrations/vector state, worker freshness, and bounded COS canary state without endpoint, key, object-name, document-text, or raw-provider-error projection.
- `KNOWLEDGE_RETRIEVAL_ENHANCEMENT_TIMEOUT_MS` defaults to `15000` and is bounded to `1000..60000`.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| More than three bases, duplicate IDs, invalid query/limits | `400` before provider access |
| Base belongs to another account | `404` before COS, embedding, rewrite, rerank, or recall |
| No active index or zero ready documents | `409 KB_INDEX_NOT_READY` |
| Rewrite/rerank requested while Admin flag is off | `403 KB_RETRIEVAL_ENHANCEMENT_DISABLED` |
| Missing enhancement Key/model | `400 KB_RETRIEVAL_ENHANCEMENT_CONNECTION_REQUIRED` |
| Disabled, unknown, or non-Chat enhancement model | `400 KB_RETRIEVAL_ENHANCEMENT_MODEL_INVALID` |
| Caller supplies an enhancement URL or unknown connection field | `400`; no provider request |
| Enhancement timeout | `504 KB_RETRIEVAL_ENHANCEMENT_TIMEOUT` |
| Invalid rewrite/rerank output | `502 KB_RETRIEVAL_ENHANCEMENT_OUTPUT_INVALID` |
| Rerank fails and fallback is false | Redacted failure; no context response |
| Rerank fails and fallback is true | Continue with RRF and trace status `fallback` |
| Shadow capacity exceeds account quota | Reject before embedding; active index unchanged |
| OCR is not enabled | Keep `needs_ocr`; no provider request |
| Acceptance credentials are absent | Emit only `SKIP` records; never report `PASS` |

## 5. Good / Base / Bad Cases

- Good: an owner enables a request-scoped hybrid test, supplies transient embedding/enhancement Keys, receives a trace and citations, and no secret or raw text appears in Admin telemetry.
- Base: a normal Chat retrieval uses the vector default while newer documents are processing and reads the previous active index.
- Bad: accepting `connection.baseUrl`, persisting a Key in a job payload, mutating active vectors for a chunk edit, silently falling back after a strict rerank failure, or treating missing staging credentials as a passing gate.

## 6. Tests Required

- `tests/knowledge-cloud/retrieval-service.test.mjs`: owner-first authorization, partial readiness, vector/full-text/hybrid recall, rewrite, rerank, explicit fallback, cancellation, bounds, and secret absence.
- `tests/knowledge-cloud/retrieval-enhancement-provider.test.mjs`: managed upstream, exact model mapping, connection allowlist, bounded output, and invalid model rejection.
- `tests/knowledge-cloud/embedding-service.test.mjs`: exact shadow reservation, failed-build preservation, complete cutover, and fully disabled draft behavior.
- `tests/knowledge-cloud/ocr-*.test.mjs` and operations tests: disabled default, retry/cancel, redaction, metrics projection, and non-destructive drills.
- `tests/knowledge-cloud/postgres.integration.mjs`: all forward migrations on isolated PostgreSQL + pgvector.
- Knowledge Playwright suites at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Required gates: `npm run check`, `npm run privacy`, `npm run test:knowledge`, `npm run test:knowledge:db`, `npm run qa`, and credential-gated `npm run knowledge:acceptance`.

## 7. Wrong vs Correct

```js
// Wrong: browser chooses the target and rewrite runs before ownership checks.
await rewrite({ apiKey: body.key, baseUrl: body.url, query: body.query });
await repository.findBasesForRetrieval(accountId, body.knowledgeBaseIds);

// Correct: authorize first, then resolve a catalog model against the managed upstream.
const bases = await repository.findBasesForRetrieval(accountId, baseIds);
assertOwnedAndReady(bases);
await enhancementProvider.rewrite({
  query,
  connection: { apiKey: requestKey, modelId },
  signal
});
```

```js
// Wrong: edit the vectors serving current Chat requests.
await updateActiveChunkAndVector(chunkId, draftText);

// Correct: append the draft, reserve shadow capacity, build, then atomically cut over.
await appendChunkRevision(chunkId, draftText);
await buildShadowIndex(baseId);
await cutoverOnlyWhenComplete(baseId);
```
