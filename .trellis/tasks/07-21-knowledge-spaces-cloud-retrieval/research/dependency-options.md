# Knowledge Subsystem Dependency Options

Research date: 2026-07-22

## Runtime Baseline

- Local runtime: Node `v24.15.0`.
- Node 24 exposes built-in `node:crypto.argon2` and `argon2Sync`, so password hashing does not require a native third-party package.
- The knowledge subsystem should declare and verify its minimum Node version rather than silently falling back to a weaker password algorithm.

## Recommended Minimal Dependencies

### PostgreSQL And Vectors

- `pg` (`node-postgres`, MIT): PostgreSQL pool, transactions and prepared queries.
- `pgvector` (`pgvector-node`, MIT): vector value serialization for node-postgres.
- Use repository-owned, checksum-tracked SQL migrations; do not add an ORM solely for this subsystem.

Official repositories:

- https://github.com/brianc/node-postgres
- https://github.com/pgvector/pgvector-node
- https://github.com/pgvector/pgvector

### Tencent COS

- `qcloud-cos-sts` (MIT): issue short-lived, path-scoped temporary credentials.
- `cos-js-sdk-v5` (ISC): browser direct upload with temporary credentials.
- `cos-nodejs-sdk-v5` (ISC): server/worker HEAD, read, delete and reconciliation operations.

Permanent SecretId/SecretKey values stay in server environment variables. The browser receives only a short-lived policy limited to one generated object key and required actions.

Official repositories:

- https://github.com/tencentyun/qcloud-cos-sts-sdk
- https://github.com/tencentyun/cos-js-sdk-v5
- https://github.com/tencentyun/cos-nodejs-sdk-v5

### Document Parsing

- `pdfjs-dist` (Apache-2.0): PDF text extraction with page locators.
- `mammoth` (BSD-2-Clause): DOCX semantic text extraction.
- `exceljs` (MIT): XLSX workbook/sheet/cell access.
- `fflate` (MIT) + `fast-xml-parser` (MIT): bounded PPTX ZIP/XML extraction with slide locators.
- `parse5` (MIT): HTML parsing without script execution.
- TXT, Markdown and JSON can use bounded standard-library paths. CSV should use a maintained streaming parser selected during implementation dependency lock.

Package versions and licenses must be rechecked when implementation starts. Parsing runs in the worker with byte, entry-count, decompression-ratio, XML-depth and time limits; library use does not replace those guards.

Official repositories:

- https://github.com/mozilla/pdf.js
- https://github.com/mwilliamson/mammoth.js
- https://github.com/exceljs/exceljs
- https://github.com/101arrowz/fflate
- https://github.com/NaturalIntelligence/fast-xml-parser
- https://github.com/inikulin/parse5

## Deferred Dependencies

- No Redis/message broker in MVP. PostgreSQL owns durable jobs and leases through `FOR UPDATE SKIP LOCKED`.
- No ORM. Explicit SQL keeps pgvector indexes, quota locking and leases reviewable.
- No OCR SDK in MVP.
- No Tencent VectorDB SDK in MVP; pgvector remains behind a repository interface.
- No client-side permanent cloud credential package or server-side BYOK secret vault.
