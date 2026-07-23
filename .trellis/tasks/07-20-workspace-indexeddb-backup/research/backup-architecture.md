# Research: Repository-compatible workspace storage and backup architecture

- Query: Design full browser workspace persistence with IndexedDB now and future WebDAV, S3-compatible, and NAS backup adapters. Cover versioned manifests, transactional import, migration, credential exclusion, provider interfaces, auto-backup scheduling, retention, encryption, browser constraints, and testing.
- Scope: mixed
- Date: 2026-07-20

## Findings

### Executive recommendation

Use two explicit boundaries:

1. `WorkspaceRepository` is the authoritative, origin-local persistence layer in one versioned IndexedDB database.
2. `BackupProvider` stores and retrieves immutable backup objects but never knows the workspace schema or receives credentials inside the backup payload.

The recommended flow is:

```text
Feature-owned React state
        |
domain repository helpers + dataset codecs
        |
xi-ai-web-workspace (IndexedDB, authoritative)
        |
consistent readonly snapshot at workspaceRevision N
        |
manifest + dataset payload + binary assets
        |
optional client-side encryption
        |
BackupProvider
  |- local IndexedDB snapshots (automatic, same-origin protection only)
  |- manual browser download
  `- future same-origin gateway -> WebDAV / S3-compatible / NAS
```

This preserves the current rule that routed features own their live state and avoids introducing a global React store. The shared layer is persistence infrastructure, not application state management.

### Files found

| Path | Description |
| --- | --- |
| `package.json` | React/Vite/TypeScript application with Playwright and custom contract scripts; no IndexedDB wrapper, archive, encryption, WebDAV, or S3 dependency. |
| `src/features/knowledge/knowledgeDb.ts` | Existing native IndexedDB database and localStorage-to-IndexedDB fallback migration for knowledge documents. |
| `src/features/knowledge/knowledgeStore.ts` | Knowledge sanitizer, chunking, legacy localStorage format, size caps, and truncation behavior. |
| `src/features/chat/localConversationStore.ts` | Sanitized local conversation persistence with whole-array localStorage writes and bounded history. |
| `src/features/chat/conversationArchive.ts` | Existing schema/version export envelope, import preview, sanitization, merge, and replace logic. |
| `src/features/gallery/galleryStorage.ts` | Sanitized gallery persistence, including potentially large asset URLs and localStorage size trimming. |
| `src/features/media/mediaJobStorage.ts` | Sanitized local media-job persistence. |
| `src/features/settings/userProviderConfig.ts` | BYOK configuration stored only in sessionStorage. |
| `src/features/gallery/replayDraft.ts` | Ephemeral sessionStorage replay handoff that should remain outside durable backups. |
| `src/app/TopBar.tsx` | Theme preference stored in localStorage and suitable for an allowlisted preferences dataset. |
| `src/App.tsx` | Existing `App` ownership of provider state and gallery state, with persistence triggered by effects. |
| `src/types.ts` | Shared domain types for conversations, knowledge documents, gallery items, media jobs, assets, and provider settings. |
| `server/providers/registry.mjs` | Existing adapter-factory pattern that can be mirrored by future server-side backup adapters. |
| `src/api.ts` | Typed same-origin API-client pattern and existing admin backup endpoints. |
| `server/index.mjs` | Existing atomic temp-file rename, backup rotation, pre-restore backup, normalization, and audit patterns for server metadata. |
| `scripts/chat-local-contracts.mjs` | Pure contract-test pattern that transpiles TypeScript and verifies export/import and secret exclusion. |
| `scripts/privacy-scan.mjs` | Existing privacy gate for secret-like data and forbidden persisted keys. |
| `playwright.config.ts` | Chromium desktop/mobile E2E matrix; service workers are blocked in normal E2E runs. |
| `public/sw.js` | Current service worker only caches the application shell and does not schedule background work. |

### Existing code patterns and implications

- Native IndexedDB is already accepted in the repository. `knowledgeDb.ts` opens `cherry-web-knowledge-db`, creates a keyed object store during `onupgradeneeded`, and wraps operations in transactions (`src/features/knowledge/knowledgeDb.ts:4-48`). A unified workspace database can reuse this dependency-free direction, but needs `onblocked`, `onversionchange`, transaction abort handling, and multi-store transactions.
- Knowledge already migrates from localStorage only after the IndexedDB write succeeds, then falls back to localStorage if IndexedDB fails (`src/features/knowledge/knowledgeDb.ts:52-84`). The full migration should generalize this pattern and delay legacy-key deletion until a committed, verified migration.
- Current local stores sanitize unknown input before component state. Conversations do this at `src/features/chat/localConversationStore.ts:19-60`, gallery items at `src/features/gallery/galleryStorage.ts:15-43`, knowledge documents at `src/features/knowledge/knowledgeStore.ts:78-115`, and media jobs at `src/features/media/mediaJobStorage.ts:11-28`. These sanitizers should become dataset codecs used by load, migration, export, and import so validation is not duplicated.
- localStorage limits currently force silent record loss: conversations, gallery items, and knowledge documents repeatedly drop trailing records until serialized data fits about 4.2 million characters (`src/features/chat/localConversationStore.ts:98-124`, `src/features/gallery/galleryStorage.ts:60-88`, `src/features/knowledge/knowledgeStore.ts:148-176`). IndexedDB should remove this serialization ceiling; product-level retention limits should be explicit rather than quota-error trimming.
- Chat writes synchronously on each committed conversation change (`src/features/chat/ChatModule.tsx:202-210`). `App` writes gallery data from an effect (`src/App.tsx:163-166`), while knowledge already uses asynchronous hydration and saves after hydration (`src/features/knowledge/KnowledgeModule.tsx:103-126`). Migration to IndexedDB therefore needs asynchronous hydration wrappers for `App` and Chat, while preserving feature ownership.
- The conversation archive already separates an export schema identifier from an integer version (`src/features/chat/conversationArchive.ts:3-24`), previews and validates before replacement (`src/features/chat/conversationArchive.ts:109-145`), and separates merge from replace (`src/features/chat/conversationArchive.ts:147-177`). The workspace backup format should extend this pattern instead of inventing unversioned JSON.
- Secret exclusion is already tested by constructing an export from allowlisted conversations and proving unrelated API URL/key bait is absent (`scripts/chat-local-contracts.mjs:41-74`). Full-workspace backup must use the same allowlist principle; it must never enumerate every localStorage/sessionStorage key.
- BYOK data is intentionally session-only (`src/features/settings/userProviderConfig.ts:43-60`). Project specs explicitly prohibit copying it to localStorage, backend metadata, URLs, logs, or public bootstrap (`.trellis/spec/frontend/state-management.md:94-108`; `.trellis/spec/frontend/quality-guidelines.md:50`).
- Gallery assets are URL strings and may be data URLs or remote URLs (`src/types.ts:315-335`). Gallery persistence permits each URL to approach 900,000 characters (`src/features/gallery/galleryStorage.ts:3-27`). IndexedDB can store `Blob` values directly; a durable workspace should normalize captured data URLs into a binary asset store rather than preserving base64 inflation indefinitely.
- The server already demonstrates a safe restore shape: validate/normalize first, make a pre-restore backup, then replace data (`server/index.mjs:1571-1589`, `server/index.mjs:1600-1614`). It also writes metadata atomically through a temp file and rename (`server/index.mjs:323-328`) and rotates backups to a limit of 20 (`server/index.mjs:330-347`). These are useful behavioral precedents, although browser IndexedDB needs different mechanics.
- The existing provider registry is a small factory over provider-specific adapters (`server/providers/registry.mjs:1-19`). Future WebDAV/S3/NAS backup transports should follow a similar registry boundary, with a narrower storage-object contract.
- The current dependency set has no IndexedDB wrapper, ZIP implementation, cryptography package, or cloud SDK (`package.json:25-41`). The proposed v1 can use native IndexedDB, `Blob`, Fetch, and Web Crypto without adding a runtime dependency.

### Recommended local persistence model

Use one authoritative database named `xi-ai-web-workspace` and a separate local-backup database named `xi-ai-web-backups`.

Keeping local snapshots in a second database prevents an import transaction or workspace schema upgrade from mutating its own rollback material. It does not protect against the user clearing site data, browser eviction, profile loss, or device loss; manual or remote copies are still required for disaster recovery.

Recommended v1 workspace stores:

| Store | Key | Initial record shape |
| --- | --- | --- |
| `meta` | string | Workspace schema version, stable random workspace ID, revision, migration markers. |
| `conversations` | conversation ID | Existing sanitized `Conversation` aggregate, preserving embedded messages initially. |
| `galleryItems` | gallery item ID | Existing sanitized `GalleryItem`, with asset references normalized over time. |
| `knowledgeDocuments` | document ID | Existing sanitized `KnowledgeDocument`, preserving embedded chunks initially. |
| `mediaJobs` | job ID | Existing sanitized `MediaJob`. |
| `preferences` | preference key | Explicitly allowlisted durable preferences such as theme. |
| `assets` | SHA-256 content hash or UUID | `Blob`, MIME type, size, created time, and optional source metadata. |

Recommended backup-control stores in `xi-ai-web-backups`:

| Store | Purpose |
| --- | --- |
| `objects` | Immutable local backup `Blob` values keyed by backup ID. |
| `catalog` | Header metadata, provider status, size, revision, checksum, encryption state, pin state. |
| `scheduler` | Last successful revision per provider, retry time, lease/lock fallback, and last error category. |

Backup-control metadata must not increment the workspace revision and must not be included in workspace backups; otherwise each successful backup would make the workspace dirty again.

Each user-data write should update its domain store and increment `meta.workspaceRevision` in the same readwrite transaction. A backup reads all included stores plus the revision in one readonly transaction. After provider acknowledgement, only `xi-ai-web-backups.scheduler.lastSuccessfulRevision` is updated. If the workspace revision advanced during upload, the scheduler queues another backup instead of marking the newer state covered.

The repository API should remain feature-oriented rather than becoming a global state container:

```ts
interface WorkspaceRepository {
  loadConversations(): Promise<Conversation[]>;
  replaceConversations(items: Conversation[]): Promise<number>; // committed revision
  loadGalleryItems(): Promise<GalleryItem[]>;
  replaceGalleryItems(items: GalleryItem[]): Promise<number>;
  loadKnowledgeDocuments(): Promise<KnowledgeDocument[]>;
  replaceKnowledgeDocuments(items: KnowledgeDocument[]): Promise<number>;
  loadMediaJobs(): Promise<MediaJob[]>;
  replaceMediaJobs(items: MediaJob[]): Promise<number>;
  readSnapshot(): Promise<WorkspaceSnapshot>;
  replaceSnapshot(snapshot: CanonicalWorkspaceSnapshot): Promise<number>;
}
```

Initial adapters may preserve existing whole-aggregate writes for compatibility. Later optimization can add record-level upserts without changing feature components.

### Dataset registry and versioned manifest

Use one central dataset registry as the only backup allowlist and the only place that converts `unknown` data into canonical records:

```ts
interface WorkspaceDatasetCodec<T> {
  readonly name: WorkspaceDatasetName;
  readonly currentVersion: number;
  export(records: T[]): unknown;
  decode(payload: unknown, version: number): DatasetDecodeResult<T>;
  migrate(payload: unknown, fromVersion: number): unknown;
}
```

Keep four versions separate:

1. `formatVersion`: framing/container compatibility.
2. `manifestVersion`: manifest field compatibility.
3. `workspaceSchemaVersion`: local IndexedDB schema that produced the snapshot; informational during import.
4. `dataset.version`: semantic version of each dataset payload and its migration chain.

`appVersion` is informational and must not be used as a migration key.

Recommended logical manifest:

```ts
type WorkspaceBackupManifest = {
  schema: "xi-ai-web.workspace-backup";
  manifestVersion: 1;
  backupId: string;
  workspaceId: string;
  workspaceRevision: number;
  createdAt: string;
  appVersion: string;
  formatVersion: 1;
  datasets: Array<{
    name: WorkspaceDatasetName;
    version: number;
    recordCount: number;
    byteLength: number;
    sha256: string;
  }>;
  assets: Array<{
    id: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
  }>;
};
```

For encrypted backups, keep only a minimal outer header in plaintext: schema, container version, encryption algorithm/KDF parameters, backup ID, encrypted byte length, and ciphertext checksum. Put workspace ID, revision, dataset names/counts, application version, and asset metadata inside the encrypted payload to reduce metadata leakage.

Backups should be immutable objects. A provider may also maintain a small mutable `latest` pointer guarded by ETag/conditional write, but restore/listing must not depend solely on that pointer.

Suggested object key:

```text
xi-ai-workspace/<workspaceId>/<yyyy>/<mm>/<timestamp>-r<revision>-<backupId>.xiwb
```

The stable `workspaceId` must be randomly generated and must not be derived from the deployment origin, API endpoint, user name, or provider account.

### Transactional import and restore

Import must be preview-first and mutation-last:

1. Acquire the exclusive workspace-import lock.
2. Read the outer header and reject unsupported future container/manifest versions before any mutation.
3. Enforce file, dataset, record, and decompressed-size limits before allocating unbounded memory.
4. Decrypt, verify authentication tags/checksums, parse, migrate each dataset sequentially, and run the existing sanitizers/codecs.
5. Produce an import report: dataset counts, rejected records, missing optional datasets, warnings, source version, and whether replace is allowed.
6. Create and verify a pre-import backup of the current workspace revision in `xi-ai-web-backups`.
7. Start one IndexedDB `readwrite` transaction covering every authoritative store being replaced. Clear included stores, enqueue all `put` operations, update import provenance and `workspaceRevision`, and commit.
8. On any request error, call `transaction.abort()` and leave the current workspace untouched.
9. After `transaction.oncomplete`, notify other tabs and rehydrate feature state. Retain the pre-import backup until at least one later successful backup.

Do not perform network requests, decryption, file reads, or unrelated awaited work after starting the destination transaction. IndexedDB transactions are asynchronous but have an active lifetime tied to queued database requests; preflight must finish before the atomic replacement begins.

For the current capped data volumes, a fully decoded in-memory snapshot followed by one multi-store transaction is reasonable. If future workspaces become hundreds of megabytes, move to a staged-generation design: write records under a new generation ID in bounded transactions, then atomically switch one `meta.activeGeneration` pointer. That complexity is not required for v1.

Import modes:

- `replace` is the only full-workspace transactional restore mode in v1.
- Dataset-specific `merge` may be added later, using explicit collision rules per dataset. Do not apply the conversation ID-suffix behavior generically to knowledge, media jobs, assets, or preferences.
- A partially valid full backup should be previewable but not replaceable, matching the current `canReplace` contract in `conversationArchive.ts`.

### Local schema migration

Use `onupgradeneeded` only for structural IndexedDB changes such as stores and indexes. Keep data migrations sequential, explicit, and idempotent:

```text
dataset v1 -> v2 -> v3
```

Never skip directly from v1 to v3, and reject imports whose dataset version is newer than the latest supported version.

Initial legacy migration inventory:

| Legacy source | Target | Rule |
| --- | --- | --- |
| `cherry-web-local-conversations` localStorage | `conversations` | Parse with the existing conversation sanitizer and preserve current ordering/caps only as migration safety limits. |
| `cherry-web-gallery-items` localStorage | `galleryItems` and optionally `assets` | Sanitize; lift valid data URLs into `Blob` assets where practical. |
| `cherry-web-knowledge-documents` localStorage | `knowledgeDocuments` | Use only as fallback if the existing knowledge IndexedDB does not contain the record. |
| `cherry-web-knowledge-db/documents` IndexedDB | `knowledgeDocuments` | Prefer this source, sanitize, and deduplicate by ID/updated time. |
| `cherry-web-media-jobs` localStorage | `mediaJobs` | Sanitize using the existing media-job codec. |
| `aistudio-theme` localStorage | `preferences/theme` | Allowlist only `dark` or `light`. |

Migration sequence:

1. Read and sanitize all legacy sources without deleting them.
2. Write the unified stores and `meta.legacyMigrationVersion` in one transaction.
3. Re-read counts/checksums from the new database.
4. Only after successful verification remove migrated localStorage keys.
5. Keep the old knowledge database for one compatibility release or mark it migrated; delete it only after the new database has loaded successfully on a later startup.

Database-open handling must close connections on `versionchange` and surface an `onblocked` state so another open tab cannot silently stall an upgrade. A `BroadcastChannel` can request other tabs to close/reload.

### Credential and privacy boundary

Backup construction must be allowlist-based. The backup serializer receives a `WorkspaceSnapshot`, not `window.localStorage`, `window.sessionStorage`, browser cookies, server bootstrap payloads, or arbitrary application state.

Included in v1:

- Sanitized conversations and messages.
- Sanitized gallery items and captured assets.
- Sanitized knowledge documents/chunks.
- Sanitized media jobs.
- Explicit non-secret preferences such as theme.

Excluded in v1:

- Entire `cherry-web-user-provider` payload: `baseUrl`, `apiKey`, and `lastModelId`. Although `lastModelId` is not itself a credential, the current project contract treats the complete payload as session-only. A future spec change may split non-secret model preference from credentials.
- `cherry-web-replay-draft` and `aistudio-selected-assistant` session handoffs.
- Cookies, admin session state, server metadata, server audit records, and server metadata backups.
- Backup provider passwords, access keys, secrets, tokens, Authorization headers, presigned URLs, and remote endpoint credentials.
- Transient UI state such as open dialogs, busy flags, error notices, scroll state, abort controllers, and in-progress request streams.

Provider configuration should also be outside the workspace payload. Non-secret schedule/retention settings may live in `xi-ai-web-backups.scheduler`; credentials must be supplied through one of these boundaries:

1. Preferred self-hosted mode: a same-origin server gateway keeps WebDAV/S3/NAS credentials in deployment/admin secret storage and receives only encrypted backup bytes from the browser.
2. S3 direct-upload mode: the same-origin server issues a short-lived presigned URL; the browser never receives long-lived AWS credentials.
3. Browser-only direct mode: credentials remain memory/session scoped. Unattended backups after a reload are impossible until the user unlocks/re-enters them.

The existing privacy scan should be extended with serialized backup fixtures containing bait keys such as `apiKey`, `baseUrl`, `Authorization`, `secretAccessKey`, and WebDAV passwords. The test should assert that none survive manifest creation, including in error text and provider metadata.

### Backup provider interface

Keep providers as opaque object transports:

```ts
type BackupObjectRef = {
  key: string;
  etag?: string;
  byteLength: number;
  modifiedAt: string;
};

interface BackupProvider {
  readonly kind: "indexeddb" | "download" | "gateway" | "webdav" | "s3";
  readonly capabilities: {
    list: boolean;
    delete: boolean;
    conditionalWrite: boolean;
  };
  probe(signal?: AbortSignal): Promise<void>;
  put(key: string, body: Blob, options?: { ifMatch?: string; signal?: AbortSignal }): Promise<BackupObjectRef>;
  get(key: string, options?: { signal?: AbortSignal }): Promise<Blob>;
  list(prefix: string, options?: { signal?: AbortSignal }): Promise<BackupObjectRef[]>;
  remove?(key: string, options?: { signal?: AbortSignal }): Promise<void>;
}
```

Rules:

- The provider receives an already-framed, optionally encrypted `Blob` and never domain records.
- Provider instances receive credentials through construction/configuration, not through `put` payloads.
- Upload success requires a provider acknowledgement plus byte length/checksum or ETag verification where available.
- Use immutable unique object keys; use conditional writes only for mutable catalog/latest pointers.
- Treat not-found, authentication failure, quota/storage-full, conflict, offline, timeout, and corruption as separate typed errors so retry policy is correct.
- `AbortSignal` should be supported, matching existing API patterns in `src/api.ts:220-267` and server provider fetch helpers in `server/providers/types.mjs:151-223`.

Provider rollout:

1. `IndexedDbBackupProvider`: automatic local snapshots in `xi-ai-web-backups`; same-origin rollback only.
2. `DownloadBackupProvider`: user-initiated file download using the repository's existing `Blob`/object-URL pattern (`src/features/gallery/GalleryModule.tsx:46-55`; `src/features/mindmap/mindmapExport.ts:11-18`). Browser security prevents unattended writes to arbitrary local filesystem paths.
3. `GatewayBackupProvider`: same-origin HTTP API for encrypted objects. Server-side adapter registry selects WebDAV, S3-compatible object storage, or NAS transport.
4. Optional direct WebDAV/S3 providers only when deployment CORS and credential policy explicitly permit them.

For WebDAV, use immutable `PUT`, `GET`, `DELETE`, and listing through `PROPFIND`; retain ETag values and use conditional headers for mutable pointers. For S3-compatible storage, prefer presigned upload/download URLs or a server adapter rather than shipping cloud access keys to browser code. A NAS should normally be represented by its exposed WebDAV/S3 interface or by the same-origin server gateway, not a separate filesystem-specific browser API.

### Auto-backup scheduling

Use revision-driven scheduling, not periodic full serialization alone.

Recommended triggers:

- Mark dirty after a committed workspace transaction.
- Debounce an automatic backup after approximately 60 seconds of inactivity.
- While the app is open, run a stale check every 15 minutes.
- Re-check on startup, `online`, and when the document becomes visible.
- On `visibilitychange` to hidden or `pagehide`, persist a pending marker only; do not rely on starting or finishing a large network upload during unload.

Execution rules:

1. Compare current `workspaceRevision` with the provider's `lastSuccessfulRevision`.
2. Acquire `navigator.locks` under a stable name such as `xi-ai-workspace-backup:<workspaceId>:<provider>`. If Web Locks is unavailable, use an expiring lease row in `xi-ai-web-backups.scheduler` plus `BroadcastChannel` notifications.
3. Permit only one in-flight backup per workspace/provider.
4. Snapshot revision N in one readonly workspace transaction.
5. Frame/encrypt outside IndexedDB transactions.
6. Upload and verify.
7. Mark N successful. If the current revision is greater than N, schedule another run.
8. Retry transient failures with exponential backoff and jitter; do not retry authentication, unsupported-version, or local-corruption failures automatically.

Suggested retry delays are 1 minute, 5 minutes, 15 minutes, then 1 hour capped. Coalesce retries so only the newest unsaved revision matters.

Background Sync may be used later to retry an already prepared pending upload after connectivity returns, but it should not be the correctness mechanism or periodic clock. The current service worker only handles shell caching (`public/sw.js:1-34`), and the default Playwright configuration blocks service workers (`playwright.config.ts:24-27`).

### Retention

Retention is a policy over successfully verified immutable backups, never over failed or partially uploaded objects.

Recommended v1 default is `keepLast: 20`, matching the repository's existing server metadata backup limit (`server/index.mjs:330-347`). The interface should support a future tiered policy without changing providers:

```ts
type RetentionPolicy = {
  keepLast: number;
  keepDailyDays?: number;
  keepWeeklyWeeks?: number;
  keepMonthlyMonths?: number;
};
```

Pruning rules:

- Prune only after the new backup has uploaded and verified successfully.
- Never delete the newest successful backup, the last known-good backup, a pinned manual backup, or the pre-import rollback backup required by restore policy.
- Delete only objects under the current workspace namespace; never infer ownership from a broad provider prefix.
- Prefer oldest-first deletion and stop on the first provider error.
- If a provider cannot list or delete, report retention as unsupported rather than pretending it succeeded.
- Store tombstone/failure information locally so repeated deletion failures do not block new backups.
- Run retention under the same cross-tab/provider lock as backup creation.

### Encryption boundary

Keep the live IndexedDB workspace unencrypted in v1 so the application can search, render, and update records without an unlock ceremony. Browser-origin isolation is not equivalent to encrypted at rest; local device/profile compromise can still expose data.

Apply optional/required encryption after snapshot serialization and before `BackupProvider.put`. For remote providers, client-side encryption should be the default.

Recommended native-Web-Crypto envelope:

- AES-GCM for authenticated encryption.
- PBKDF2-SHA-256 via `SubtleCrypto.deriveKey()` for a user passphrase in the dependency-free v1.
- Random salt and explicit KDF parameters in the outer header.
- A unique random IV for every encrypted chunk; never reuse an IV with the same key.
- Authenticate stable outer-header fields as AES-GCM additional authenticated data.
- Keep the passphrase and derived `CryptoKey` in memory only by default.
- Include ciphertext checksum/length in the outer header and plaintext dataset checksums inside the encrypted manifest.

Large backups should be encrypted in independently authenticated chunks rather than one giant `ArrayBuffer`. The framing format should include chunk sequence, IV, ciphertext length, and tag per chunk. This bounds memory usage and allows corruption to be localized.

Unattended encryption has an unavoidable key-management tradeoff:

- Memory-only passphrase: end-to-end privacy, but automatic backups resume only after user unlock.
- Server-held encryption key: unattended backups, but the server can decrypt.
- Provider-side encryption only: operational protection but not end-to-end protection from the provider/operator.

The architecture should expose this policy explicitly and must not silently persist a recoverable passphrase beside the encrypted backup.

### Browser constraints

- IndexedDB and Cache API storage are origin-scoped and subject to browser quota and eviction. Private/incognito storage may disappear when the private session ends. Request `navigator.storage.persist()` after a user-facing explanation and inspect `navigator.storage.estimate()`, but handle denial because persistence is browser-controlled. See [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) and [MDN: StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).
- IndexedDB schema changes occur in `onupgradeneeded`; all data access is transactional, and transactions may be aborted. See [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) and [MDN: IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction).
- Multiple tabs can block a database upgrade or duplicate backups. Web Locks coordinates scripts across same-origin tabs/workers where supported; retain an IndexedDB lease fallback. See [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
- Browser timers are throttled or suspended in background tabs. One-shot Background Sync can defer work until connectivity returns but is not a reliable periodic scheduler and requires a service worker/secure context. See [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).
- Direct WebDAV/S3 requests are subject to Fetch/CORS rules. `PUT`, `PROPFIND`, `Authorization`, and credentialed requests commonly require successful preflight and explicit server CORS configuration. See [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
- AWS documents presigned URLs as time-limited upload/download access without giving the browser long-lived AWS credentials. See [AWS S3: Download and upload objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).
- WebDAV defines `PROPFIND`, `PUT`, `DELETE`, ETags, and conditional HTTP semantics, but individual NAS products vary in authentication, path behavior, locking, and CORS. See [RFC 4918: HTTP Extensions for Web Distributed Authoring and Versioning](https://www.rfc-editor.org/rfc/rfc4918).
- Web Crypto supports deriving keys and AES-GCM parameters in secure contexts. See [MDN: SubtleCrypto.deriveKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and [MDN: AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams).
- Automatic download to an arbitrary local path is not generally permitted. Manual file export can use a `Blob` download; local automatic backups therefore belong in IndexedDB unless the user explicitly grants a platform-specific file handle.
- A local snapshot in another IndexedDB database still shares origin quota and eviction fate with the workspace and service-worker cache. It is rollback protection, not a substitute for external backup.
- Existing external gallery URLs may expire or reject cross-origin fetching. A backup is self-contained only for assets captured as `Blob` data. The import preview should report unresolved external references.

### Testing strategy

Follow the repository's two existing test styles: fast custom contract scripts and Playwright browser tests.

#### Contract tests

Add a script analogous to `scripts/chat-local-contracts.mjs`, transpiling pure TypeScript codec/migration modules and using `node:assert/strict`.

Required cases:

- Manifest schema/version and deterministic dataset descriptors.
- Every dataset sanitizer accepts valid records and rejects/truncates malformed fields consistently with current behavior.
- Sequential migration fixtures for every supported historical dataset version.
- Future manifest/dataset versions are rejected before mutation.
- Secret bait is absent from plaintext manifests, encrypted headers, logs, and provider calls.
- Checksums detect changed records, missing chunks, reordered chunks, and truncated payloads.
- AES-GCM round trip, wrong passphrase, modified ciphertext/tag, and IV uniqueness.
- Retention selection with fixed timestamps, pins, pre-import protection, and provider delete failures.
- Provider registry and typed error classification.
- Revision scheduler coalesces multiple writes and never marks revision N+1 covered by a backup of N.

#### Playwright browser tests

Use real Chromium IndexedDB rather than a mock for integration behavior.

Required cases:

- Fresh database hydration and persistence across reload.
- Migration from each current localStorage key and the existing knowledge IndexedDB.
- Legacy keys remain when the migration transaction is forced to abort.
- Upgrade blocked by a second tab, followed by successful close/retry.
- One readonly snapshot is internally consistent while a later write advances the revision.
- Full replace import commits all stores or none when a request fails.
- Pre-import backup exists before the visible workspace changes.
- Multi-tab auto-backup produces one provider upload for a revision.
- Offline/transient failure persists retry state and resumes on `online`/visibility.
- Quota/storage-full error is surfaced without deleting the last successful backup.
- Manual download has the expected filename, MIME type, header, and encrypted/unencrypted behavior.
- Restore of an older supported backup migrates to the current canonical records.
- BYOK stays in sessionStorage and is not present in IndexedDB or exported backup bytes.

#### Provider tests

- Use an in-memory fake `BackupProvider` for scheduler and retention tests.
- Add a local Express fixture for WebDAV-like `PUT`/`GET`/`PROPFIND`/`DELETE`, ETag conflicts, auth errors, partial uploads, and timeouts; never use a real NAS credential.
- For S3 mode, test the same-origin presign/gateway contract and upload to a local fixture. Do not place cloud access keys in Playwright configuration or browser storage.
- Test gateway requests with encrypted opaque bytes and assert the server never needs the inner workspace manifest.

#### Existing gates to retain

- `npm run check`
- `npm run qa`
- `npm run test:e2e`
- `npm run smoke`
- `npm run release-check`
- `npm run privacy`

Storage changes must retain the BYOK browser test and privacy scan required by `.trellis/spec/frontend/type-safety.md:38` and `.trellis/spec/frontend/quality-guidelines.md:22-26`.

### Suggested implementation boundaries

Repository-compatible file placement for a later implement agent:

```text
src/features/workspace/
  db.ts
  repository.ts
  datasets.ts
  migration.ts
  manifest.ts
  import.ts
  encryption.ts
  scheduler.ts
  retention.ts
  backup/
    types.ts
    registry.ts
    indexedDbProvider.ts
    downloadProvider.ts
    gatewayProvider.ts
```

Future server gateway:

```text
server/backups/
  registry.mjs
  types.mjs
  webdav.mjs
  s3-compatible.mjs
```

Shared public API payload types should follow the existing `src/types.ts` convention. Internal workspace-only types may stay inside `src/features/workspace/` until they cross the frontend/server boundary.

### External references and versions

- Repository versions: React `^19.2.6`, TypeScript `^6.0.3`, Vite `^8.0.14`, Playwright `1.61.1`; no storage/cloud SDK is present (`package.json:25-41`).
- [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) - database version upgrades, object stores, and transactions.
- [MDN: IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) - read/write transaction and abort semantics.
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) - origin quotas, best-effort/persistent storage, and eviction.
- [MDN: StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) - browser-controlled persistent-storage request.
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - same-origin tab/worker coordination.
- [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) - deferred service-worker synchronization after connectivity returns.
- [MDN: SubtleCrypto.deriveKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) - native key derivation including PBKDF2.
- [MDN: AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) - AES-GCM encryption parameters.
- [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) - time-limited object upload/download without exposing AWS credentials.
- [RFC 4918 WebDAV](https://www.rfc-editor.org/rfc/rfc4918) - WebDAV methods, ETags, and authentication considerations.

### Related specs

- `.trellis/spec/frontend/state-management.md:5-16` - state ownership boundaries and no global store.
- `.trellis/spec/frontend/state-management.md:94-108` - BYOK session-only storage and exclusion from persistent/server surfaces.
- `.trellis/spec/frontend/type-safety.md:26-38` - storage must pass through sanitizer/load/save helpers; storage changes require BYOK/privacy validation.
- `.trellis/spec/frontend/quality-guidelines.md:22-29` - deterministic Playwright fixtures and browser-test conventions.
- `.trellis/spec/frontend/quality-guidelines.md:50-65` - forbidden credential persistence and BYOK contract.
- `.trellis/spec/guides/cross-layer-thinking-guide.md:19-44` - map data flow and define boundary contracts.
- `.trellis/spec/guides/cross-layer-thinking-guide.md:86-99` - decode once at the data boundary and expose typed projections.
- `.trellis/spec/guides/code-reuse-thinking-guide.md:59` - one source of truth for shared constants/contracts.

## Caveats / Not Found

- The active task `prd.md` still contains only `TBD`, so exact product scope, UI, default schedule, default retention, and mandatory-vs-optional encryption are not yet approved requirements.
- No shared workspace repository, backup UI, backup provider configuration, scheduler, encryption layer, remote adapter, or IndexedDB integration test currently exists.
- The repository has no fake IndexedDB/unit-test dependency. Real IndexedDB behavior should be tested in Playwright; pure codecs can use the existing TypeScript-transpile contract-script pattern.
- Current Playwright coverage is Chromium-only. Safari/WebKit and Firefox quota, persistence, backgrounding, and IndexedDB upgrade behavior remain unverified.
- Browser-only unattended remote backup cannot simultaneously keep provider credentials and encryption keys memory-only across reloads. A same-origin credential gateway or an explicit unlock step is required.
- Direct WebDAV/NAS compatibility cannot be guaranteed generically because CORS, authentication, ETag, path, locking, and TLS behavior vary by product.
- Existing localStorage caps may already have discarded old records. Migration cannot recover data previously trimmed by `saveLocalConversations`, `saveGalleryItems`, or `saveKnowledgeDocuments`.
- Existing gallery items that contain expiring or inaccessible remote URLs cannot be made self-contained retroactively unless the asset can still be fetched or was already stored as a data URL.
- The existing server metadata backups under `data/backups` are admin/server configuration backups, not browser workspace backups. They should remain separate in API, storage, and UI terminology.
