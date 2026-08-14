# Knowledge production and RAG quality roadmap

## Goal

Bring the existing private cloud knowledge subsystem from a well-tested implementation foundation to a production-gated, observable, and tunable RAG experience. Preserve the current product model: the public workspace remains account-free, knowledge uses a separate private account, one account owns multiple private knowledge bases, and Chat may select at most three bases.

## Confirmed Boundaries

- PostgreSQL remains the only metadata, queue, full-text, and vector database. pgvector stores embeddings.
- Tencent COS stores source files and normalized parsing artifacts; it is not a vector database.
- OpenAI and Qwen are the only embedding vendors in this task.
- Users provide API Keys only. Client-provided upstream URLs are forbidden; Admin-managed upstream routing remains authoritative.
- Embedding credentials may exist only in browser `sessionStorage` and transient request memory. They must never enter PostgreSQL, COS, jobs, logs, audits, exports, or analytics.
- Knowledge data is private to the account owner. Sharing, invitations between users, team roles, and collaboration remain out of scope.
- FastGPT, Dify, RAGFlow, and MaxKB are behavioral references only. No code, UI, storage topology, or licensing surface is copied.
- No MongoDB, Elasticsearch, Redis, MinIO, GraphRAG, RAPTOR, crawler, or third-party document sync is introduced.

## Requirements

### P0 Production Gate

- When knowledge is enabled, `/api/ready` must include runtime availability, migration/vector readiness, worker freshness, and object-store probe state.
- Production knowledge sessions require HTTPS. Loopback HTTP remains allowed only in development/test.
- PostgreSQL TLS must support certificate verification; production deployment guidance must use a restricted runtime role and a separate migration role.
- Worker heartbeat and bounded COS put/head/delete canary probes must be observable without exposing object keys or credentials.
- Add an explicit, credential-gated staging acceptance command for real PostgreSQL + pgvector, COS, OpenAI/Qwen embedding, retrieval, citation, cleanup, and recovery checks. Missing credentials must report SKIP, never PASS.
- Define the 5 GiB default as logical billable capacity: current source object, normalized artifact, chunk text, and active/shadow vector bytes. Backups, COS historical versions, row overhead, and physical indexes are excluded and must be disclosed.

### P1 Documents And Chunks

- Knowledge owners can inspect normalized document chunks, locators, token estimates, status, and capacity attribution.
- Owners can disable or edit a chunk and rebuild through a shadow index without mutating the active index in place.
- Provide bounded chunk strategy presets with preview. Do not expose arbitrary regular-expression execution.
- Existing active indexes remain readable throughout rebuild; failed rebuilds do not replace them.

### P2 Retrieval Lab

- Add a knowledge-owner-only retrieval test surface and API.
- Return the original query, effective query, retrieval mode, candidate stages, scores, filters, final citations, timing, profile fingerprints, context/token budget, and truncation state.
- Test parameters are request-scoped and cannot silently mutate production defaults.
- Empty or below-threshold results are explicit and do not become ungrounded knowledge answers.

### P3 Retrieval Quality

- Add PostgreSQL full-text recall and combine it with pgvector recall using standard reciprocal-rank fusion.
- Support vector, full-text, and hybrid modes with bounded candidate counts and minimum relevance.
- Add optional query rewrite and rerank adapters behind Admin feature flags. Both default off.
- Query rewrite and rerank use transient BYOK credentials, managed upstream routing, redacted errors, strict timeouts, and bounded text. Rerank failure may fall back to RRF only when the request explicitly allows it.
- Final context is constrained by a token budget rather than chunk count alone.

### P4 Chat Integration

- Chat distinguishes logged out, unavailable, partially ready, ready, missing embedding key, retrieving, no reliable match, citation-open failure, and expired knowledge session states.
- A base with an active index and at least one ready document may be selected while newer documents continue processing.
- Knowledge entry points remain discoverable when logged out or unavailable.
- Desktop and mobile layouts preserve keyboard access, focus, scroll ownership, and 44px touch targets.

### P5 OCR, Operations, And Evaluation

- Add an OCR provider boundary and queue state for scanned PDFs. OCR is disabled by default and must not persist request credentials.
- Report worker freshness, queue age, retry/dead-letter rate, embedding latency, pending index age, quota drift, and COS/database reconciliation state.
- Provide backup/restore and rebuild drill commands/documentation without destructive automation against production.
- Add a deterministic RAG evaluation harness for Recall@K, MRR, no-answer behavior, citation correctness, and latency.

## Acceptance Criteria

- [x] Existing knowledge account, quota, upload, embedding, retrieval, citation, Admin, and Chat tests remain green.
- [x] `KNOWLEDGE_ENABLED=false` leaves all public non-knowledge modules unchanged.
- [x] Enabled-but-unavailable knowledge makes readiness fail with sanitized reason codes.
- [x] Real integration tests distinguish PASS, FAIL, and SKIP and never print secrets.
- [x] Cross-account access fails before COS, embedding, rerank, or model providers are called.
- [x] Browser-controlled credentials are absent from persistent storage except the approved session-only key record.
- [x] Active indexes remain available during chunk changes, reindex, OCR, and failed enhancement stages.
- [x] Retrieval Lab explains every final citation and every filtered candidate without exposing document text to Admin logs.
- [x] Vector-only behavior remains the default after deployment; hybrid, rewrite, rerank, and OCR require explicit enablement.
- [x] Unit tests, PostgreSQL integration tests, Playwright knowledge tests, `npm run check`, `npm run build`, `npm run privacy`, and release checks pass or have an explicit external-credential validation gap.

## Out Of Scope

- Main-site accounts, knowledge sharing, team permissions, public knowledge APIs, third-party sync, web crawling, image embeddings, GraphRAG, RAPTOR, and real-time collaborative editing.
