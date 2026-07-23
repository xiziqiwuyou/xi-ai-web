# Knowledge Space Storage Research

Research date: 2026-07-21

## Current Repository Findings

- `KnowledgeDocument` stores full text and chunks in browser IndexedDB; no vector array is persisted.
- `/api/generate/knowledge` embeds the query plus all submitted chunks on every request and falls back to lexical ranking when embeddings are unavailable.
- `/api/chat/stream` has no cloud knowledge-base contract today. Agents and workflows expand local document IDs to request-scoped chunks.
- Existing workspace export contains plaintext knowledge content but excludes session-only BYOK credentials.

Relevant code:

- `src/features/workspace/workspaceDb.ts:15-64,255-307`
- `src/features/knowledge/KnowledgeModule.tsx:240-275`
- `server/knowledge/retrieval.mjs:17-57`
- `server/index.mjs:2001-2260,2293-2329,2598-2657`
- `src/features/automation/AutomationModule.tsx:145-154,401-468,981-1018`

## Official Tencent Cloud Findings

### COS

- COS is the correct place for original files and can receive browser uploads without routing file bytes through the application server.
- Tencent recommends short-lived credentials and least-privilege resource/action scopes for browser direct uploads; permanent secrets must not be exposed to the browser.
- COS now exposes vector retrieval through Cloud Infinite MetaInsight. It can derive features from COS objects for semantic and multimodal retrieval.
- The COS documentation updated 2026-05-21 still marks document retrieval as an internal beta. It is useful as a future adapter, but it is not a stable first-production dependency for document RAG.

Official references:

- [COS browser direct-upload temporary credential security](https://cloud.tencent.com/document/product/436/40265)
- [COS vector retrieval overview](https://cloud.tencent.com/document/product/436/113337)
- [COS lifecycle overview](https://cloud.tencent.com/document/product/436/17028)
- [COS versioning overview](https://cloud.tencent.com/document/product/436/19883)

### Tencent Cloud VectorDB

- VectorDB is a managed service for storing, indexing and querying embedding vectors, with HNSW/IVF-family indexes and scalar metadata filters.
- Official limits currently include vector dimensions up to 4096 and up to 20 results per similarity search request.
- Collection limits depend on node memory. Therefore a collection per user or per knowledge base is the wrong tenancy model; prefer a shared collection per embedding model/dimension with mandatory `account_id` and `knowledge_base_id` filters.
- Access uses instance URL, database account and API key. These credentials belong only on the server and should preferably use private VPC connectivity.
- Billing combines instance memory, disk and optional embedding token usage. The fixed instance cost is materially higher than reusing PostgreSQL for a small MVP, so procurement should follow measured scale rather than precede it.

Official references:

- [What is Tencent Cloud VectorDB](https://cloud.tencent.com/document/product/1709/94945)
- [VectorDB usage limits](https://cloud.tencent.com/document/product/1709/103074)
- [Connection prerequisites and API key](https://cloud.tencent.com/document/product/1709/102333)
- [VectorDB pricing](https://cloud.tencent.com/document/product/1709/103016)
- [VectorDB backup overview](https://cloud.tencent.com/document/product/1709/118220)

## Other Official Options

### PostgreSQL + pgvector

- pgvector stores vectors with relational metadata and supports exact search, HNSW, IVFFlat, filters and hybrid use with PostgreSQL full-text search.
- It inherits PostgreSQL transactions, WAL replication, point-in-time recovery and joins.
- It is the lowest-complexity MVP because the same database can hold knowledge accounts, sessions, knowledge bases, documents, jobs and vectors.
- At larger vector volume, high-QPS workloads, or when independent scaling is required, the vector repository adapter can move to Tencent VectorDB without moving identity and metadata.

Official reference: [pgvector repository and documentation](https://github.com/pgvector/pgvector)

### Qdrant

- Qdrant is a capable self-hosted vector engine with payload filtering, hybrid search and a documented multitenancy pattern using a shared collection plus tenant payload partitions.
- It removes a managed vendor dependency but adds another stateful service, backup surface, security boundary and operational burden. It is not the simplest first deployment for this repository.

Official reference: [Qdrant multitenancy](https://qdrant.tech/documentation/guides/multitenancy/)

## Recommended Storage Evolution

### MVP

- PostgreSQL + pgvector: knowledge accounts, sessions, knowledge bases, document metadata, ingestion jobs, chunks and vectors.
- COS: original files and optionally normalized extracted text.
- Application server/worker: stateless API plus parsing/embedding jobs; no permanent local upload directory.
- IndexedDB: optional cache and explicit migration source only.

### Scale-Out

- Keep PostgreSQL for identity, ACL, metadata and jobs.
- Keep COS for originals.
- Move chunk vectors and retrieval to Tencent Cloud VectorDB through a `KnowledgeVectorRepository` adapter.
- Use one collection per embedding model/dimension, with mandatory account/knowledge-base filters; never one collection per tenant.

### Deferred Option

- Add a COS MetaInsight adapter when document retrieval exits beta and its filtering, citation, deletion, regional availability and cost contracts satisfy the product requirements.

## Key Architectural Constraint

Persistent vectors must be generated and queried with the same embedding model and compatible dimensions. Cross-device login cannot work from account/password alone if retrieval also depends on an unremembered per-device embedding credential. The product must explicitly choose between a server-managed embedding service with quotas or a BYOK embedding flow that requires users to reconfigure the same provider/model on each device.

## Confirmed Product Decision

- Use PostgreSQL + pgvector for knowledge identity, metadata, chunks and vectors.
- Use Tencent Cloud COS for original files and optional normalized extracted text, not as the primary vector store.
- Use the visitor's session-only BYOK connection for embedding.
- A knowledge base selects an OpenAI or Qwen embedding model from the public model catalog and persists only model identity, actual request model name, dimensions and index version.
- A new device can restore knowledge-base metadata after knowledge login, but semantic indexing/retrieval remains unavailable until the visitor configures a compatible embedding URL/Key for the selected model.
- The confirmed tenancy hierarchy is `KnowledgeAccount -> KnowledgeBase -> Document -> Chunk`; there is no space layer. Embedding model and index version belong to each knowledge base.
- Knowledge bases are private to the owning account. There are no members, invitations, shares or collaboration roles in MVP. Multiple devices may hold sessions for the same account, but audit records can distinguish sessions rather than the humans sharing credentials.
- Each account has a server-enforced 5 GiB total knowledge quota. Logical usage counts COS originals, separately stored normalized text, PostgreSQL chunk text and vector payload bytes; relation metadata and physical index overhead are excluded.
- Quota enforcement uses transactional `quota_bytes`, `used_bytes` and `reserved_bytes`. Upload, ingestion and reindex reserve capacity before work, settle against verified actual sizes, and release stale reservations after failure or expiry.
- Accounts use a unique login name, password and one-time recovery code without email or phone. Passwords and recovery codes are stored only as independent hashes.
- Registration must force an explicit recovery-code save acknowledgement and offer copy/download. Losing both password and recovery code requires an audited admin-assisted reset.
- Admin account management may list status, usage and operational metadata, freeze accounts, revoke sessions, change quotas and issue a short-lived one-time reset credential. It must never reveal or reconstruct passwords, recovery codes or their hashes.
- The confirmed admin recovery credential expires after 15 minutes, is single-use and is stored only as a hash. Issuance revokes active sessions and the previous recovery code; the account holder sets the replacement password.
- Knowledge registration is admin-controlled with `disabled`, `invite_only` and `open` modes; `invite_only` is the default. Invite codes are single-use, shown once, stored only as hashes and consumed atomically with account creation.
- Confirmed defaults are 5 GiB total capacity, 20 knowledge bases/account, 1,000 documents/account, 500 documents/knowledge base, 100 MiB/file, 100,000 active chunks/account, 3 concurrent uploads, 2 concurrent ingestions, 60 retrieval requests/minute/account and topK <= 20.
- Admin settings control global defaults and account-specific overrides. Lower limits never delete existing data or abort active work; they block new additions and queue new jobs until usage/concurrency is compliant.
- Confirmed MVP parsers cover PDF, DOCX, XLSX, PPTX, TXT, Markdown, CSV, JSON and HTML. Parsers preserve source locators and enforce archive/decompression limits. Scanned PDFs and images enter `needs_ocr`; automatic OCR is deferred behind a future provider adapter.
- Chat, knowledge QA, agents and workflows may select up to three knowledge bases. Retrieval groups bases by embedding profile, requires a matching session-only BYOK connection for each profile, and merges source-bearing results to a final topK <= 20.
- Parsing runs asynchronously without model credentials. Parsed documents enter `awaiting_embedding`; while the user is online, resumable idempotent batch requests carry a session-only BYOK key, embed unprocessed chunks and persist vectors. Closing the page pauses embedding without losing completed batches or storing the key.
