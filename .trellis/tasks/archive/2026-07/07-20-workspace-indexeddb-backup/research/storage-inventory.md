# Research: Browser-side persistence inventory

- Query: Audit every repository use of `localStorage`, `sessionStorage`, IndexedDB, and adjacent browser persistence; map schemas, owners, initialization, import/export, size-sensitive data, tests, and migration risks for a workspace IndexedDB backup design.
- Scope: mixed (repository-wide internal audit plus browser-platform reference pointers)
- Date: 2026-07-20

## Findings

### Executive summary

The repository currently defines five `localStorage` keys, three `sessionStorage` keys, one IndexedDB database with one object store, and one production CacheStorage cache:

| Medium | Name | Current status | Primary owner |
| --- | --- | --- | --- |
| `localStorage` | `aistudio-theme` | Active on every public page | `TopBar` |
| `localStorage` | `cherry-web-local-conversations` | Active on Chat | `ChatModule` + `localConversationStore` |
| `localStorage` | `cherry-web-gallery-items` | Active persistence, but management UI is retired/unreachable | `App` + `galleryStorage` |
| `localStorage` | `cherry-web-knowledge-documents` | Legacy/fallback data; current Knowledge UI is retired/unreachable | `knowledgeStore` + `knowledgeDb` |
| `localStorage` | `cherry-web-media-jobs` | Dormant helper with no call sites | `mediaJobStorage` |
| `sessionStorage` | `cherry-web-user-provider` | Active, security-sensitive, intentionally session-only | `App` + `userProviderConfig` |
| `sessionStorage` | `aistudio-selected-assistant` | Active one-shot Assistants-to-Chat handoff | `StudioModule` + `ChatModule` |
| `sessionStorage` | `cherry-web-replay-draft` | Dormant because Gallery and all current consumers are not routed together | `GalleryModule` + legacy feature modules |
| IndexedDB | `cherry-web-knowledge-db`, version `1` | Existing browser data may remain, but current public router cannot mount the owner | `knowledgeDb` |
| Object store | `documents`, key path `id` | Stores complete `KnowledgeDocument` objects | `knowledgeDb` |
| CacheStorage | `xi-ai-web-shell-v1` | Active only in production service-worker mode | `public/sw.js` |

The active public router exposes exactly Chat, Image, PPT, Mind Map, Assistants, and Translation (`src/app/publicRoutes.ts:5-12`, `src/app/ModuleRouter.tsx:63-103`). Knowledge, Gallery, Media, Agents, and Apps persistence code can therefore represent orphaned historical user data even though those screens are not currently reachable. A workspace backup that only follows active routes would miss that data.

There is no implemented whole-workspace export/import or backup/restore path. Conversation archive helpers are versioned and tested but not connected to Chat. Gallery Markdown export exists but its UI is unreachable. Knowledge accepts local files as content import but has no backup export. No code coordinates an atomic snapshot across Web Storage and IndexedDB.

### Files found

| File | Description |
| --- | --- |
| `src/App.tsx` | Root owner for provider session state and persisted gallery state; initializes both synchronously. |
| `src/types.ts` | Shared schemas for provider config, conversations, gallery items, knowledge documents/chunks, generation results, and media jobs. |
| `src/app/TopBar.tsx` | Direct theme `localStorage` read/write. |
| `src/app/publicRoutes.ts` | Canonical six-route public surface. |
| `src/app/ModuleRouter.tsx` | Shows which persistence owners can currently mount. |
| `src/features/settings/userProviderConfig.ts` | Sanitizer and `sessionStorage` helper for BYOK URL/key/model. |
| `src/features/chat/localConversationStore.ts` | Conversation sanitizer, limits, load/save, and eviction behavior. |
| `src/features/chat/ChatModule.tsx` | Conversation hydration/write orchestration and selected-assistant handoff consumption. |
| `src/features/chat/conversationArchive.ts` | Versioned conversation export/import/merge/replace helpers; currently disconnected. |
| `src/features/chat/attachmentUtils.ts` | Size limits and data-URL conversion for transient chat attachments. |
| `src/features/gallery/galleryStorage.ts` | Gallery sanitizer, limits, load/save, and eviction behavior. |
| `src/features/gallery/GalleryModule.tsx` | Markdown export and replay-draft producer; currently unreachable. |
| `src/features/gallery/replayDraft.ts` | One-shot session draft schema and consume behavior. |
| `src/features/studio/StudioModule.tsx` | Active generation producers for gallery items; selected-assistant producer; transient image inputs and result exports. |
| `src/features/knowledge/knowledgeDb.ts` | IndexedDB schema, whole-store transactions, legacy migration, and fallback. |
| `src/features/knowledge/knowledgeStore.ts` | Legacy/fallback localStorage schema, sanitization, chunking, and limits. |
| `src/features/knowledge/KnowledgeModule.tsx` | Async hydration/write effects and local file ingestion; currently unreachable. |
| `src/features/knowledge/documentExtractors.ts` | Browser-side file import limits and extracted-text behavior. |
| `src/features/media/mediaJobStorage.ts` | Dormant media-job localStorage schema and write behavior. |
| `src/features/media/MediaJobPanel.tsx` | Dormant UI claiming local media-job records. |
| `src/api.ts` | Browser API client returns `GenerationResult` and exposes embedding responses. |
| `server/index.mjs` | Produces gallery-sized result assets, including base64 data URLs, and performs request-time knowledge embeddings. |
| `server/knowledge/retrieval.mjs` | Creates query/chunk vectors transiently for ranking; does not persist them. |
| `server/knowledge/vector-store.mjs` | In-memory cosine similarity and ranking utilities. |
| `src/main.tsx` | Registers the production service worker. |
| `public/sw.js` | CacheStorage schema and network-first cache behavior. |
| `tests/e2e/byok-modal.spec.ts` | Direct session-only credential persistence test. |
| `tests/e2e/module-shell.spec.ts` | Selected-assistant consumption and conversation-localStorage write assertion. |
| `tests/e2e/support/app-fixture.ts` | Browser storage seed helpers and conversation fixture schema. |
| `scripts/chat-local-contracts.mjs` | Contract tests for disconnected conversation import/export helpers. |
| `scripts/feature-audit.mjs` | Enforces retired modules are absent from the public route order. |
| `playwright.config.ts` | Blocks service workers in E2E, leaving CacheStorage untested. |
| `README.md` | Documents several persistence features, including some no longer reachable. |
| `plans/20260530-1244-next-completion-roadmap/phase-05-knowledge-base-pro-storage-pdf.md` | Historical intended IndexedDB design; differs materially from implementation. |

### Storage inventory and schemas

#### 1. Theme: `localStorage["aistudio-theme"]`

- Owner: `TopBar`.
- Stored shape: scalar string, written as `"dark"` or `"light"` (`src/app/TopBar.tsx:69-75`). Any value other than exactly `"light"` is interpreted as dark on load (`src/app/TopBar.tsx:69`).
- Initialization: lazy React state initializer reads synchronously when the public shell mounts (`src/app/TopBar.tsx:65-75`).
- Write timing: effect writes after initial mount and after every toggle (`src/app/TopBar.tsx:71-75`).
- Error behavior: no `try/catch`; a denied or throwing Storage implementation can fail render or the effect.
- Import/export: none.
- Tests: no direct persistence, reload, corrupt-value, or disabled-storage test found.
- Backup relevance: preference-only. It should be optional metadata rather than a required workspace data record.

#### 2. BYOK provider: `sessionStorage["cherry-web-user-provider"]`

- Owner: `App` owns live state; `userProviderConfig.ts` owns storage parsing and sanitization (`src/App.tsx:71`, `src/features/settings/userProviderConfig.ts:3`).
- Stored JSON schema:

  ```ts
  {
    baseUrl: string;
    apiKey: string;
    lastModelId: string;
  }
  ```

  The shared type makes `lastModelId` optional through `UserConnectionConfig`, while the sanitizer always emits a string (`src/types.ts:214-220`, `src/features/settings/userProviderConfig.ts:12-28`). It also migrates a legacy `model` field into `lastModelId` (`src/features/settings/userProviderConfig.ts:27`).
- Initialization: `App` calls `loadUserProviderConfig` as a lazy state initializer before route branching, including on `/admin` (`src/App.tsx:63-73`). Invalid JSON or unavailable storage returns defaults (`src/features/settings/userProviderConfig.ts:43-51`).
- Write timing: an unconditional `App` effect saves the sanitized value on mount and every state change (`src/App.tsx:152-154`, `src/features/settings/userProviderConfig.ts:54-61`). Save failures are swallowed so in-memory use can continue.
- Security contract: repository specs require credentials to remain session-only and never enter localStorage, backend metadata, URLs, logs, or public bootstrap (`.trellis/spec/frontend/state-management.md`, BYOK Contract; `.trellis/spec/frontend/quality-guidelines.md`, Forbidden Patterns).
- Import/export: none. Admin metadata export is a separate server-side configuration surface and does not include this browser state (`README.md:83`).
- Tests: `tests/e2e/byok-modal.spec.ts:13-51` asserts live writes to sessionStorage, absence from localStorage, and survival across a same-tab reload. Seed helpers are at `tests/e2e/support/app-fixture.ts:527-533`.
- Migration risk: a “complete workspace backup” must not silently move this secret into durable IndexedDB or an unencrypted export. Treat it as excluded by default or as a separately consented, encrypted credential export.

#### 3. Conversations: `localStorage["cherry-web-local-conversations"]`

- Owner: `ChatModule` owns the live array; `localConversationStore.ts` owns persistence (`src/features/chat/ChatModule.tsx:173-177`, `src/features/chat/localConversationStore.ts:3`).
- Stored shape: unversioned JSON array of `Conversation` objects. Shared fields are defined at `src/types.ts:98-131`:
  - conversation: `id`, `title`, `assistantId`, `pinned`, `messageCount`, `preview`, `createdAt`, `updatedAt`, `messages`;
  - message: `id`, `role`, `content`, optional `model`, optional `providerId`, optional `status`, `createdAt`.
- Sanitization:
  - requires conversation `id` and `assistantId` (`src/features/chat/localConversationStore.ts:40-43`);
  - requires message `id` and role `user|assistant` (`src/features/chat/localConversationStore.ts:19-37`);
  - recomputes `messageCount`, clears persisted `preview`, caps messages, and normalizes dates (`src/features/chat/localConversationStore.ts:43-60`);
  - unknown fields are discarded.
- Limits: 40 conversations, 80 messages per conversation, 24,000 characters per message, 4,200,000 serialized characters for the whole key (`src/features/chat/localConversationStore.ts:4-7`).
- Initialization:
  1. Chat lazy state initializes from localStorage and sorts by `updatedAt` (`src/features/chat/ChatModule.tsx:153-176`).
  2. The helper parses, sanitizes, sorts pinned-first/newest-first, and truncates to 40 (`src/features/chat/localConversationStore.ts:77-95`).
  3. If no conversation exists and no assistant handoff is pending, Chat immediately creates and persists a blank conversation (`src/features/chat/ChatModule.tsx:259-268`).
- Write timing: every `commitConversations` call synchronously writes before updating React state and bootstrap summaries (`src/features/chat/ChatModule.tsx:202-210`). Creates, message stream events, edits, deletes, pinning, and clearing all converge on this function.
- Quota behavior: save serializes the sorted set, drops the last conversation until under the local cap and until `setItem` succeeds, then removes the key if nothing can be saved (`src/features/chat/localConversationStore.ts:98-124`). The last item is generally the least recent non-pinned conversation, but the loss is silent.
- Attachments: `ChatAttachment` can carry an image data URL or text (`src/types.ts:108-116`), with a 4 MiB image limit and data-URL conversion (`src/features/chat/attachmentUtils.ts:3-4`, `src/features/chat/attachmentUtils.ts:29-55`). Attachments live only in per-session UI state (`src/features/chat/ChatModule.tsx:77-82`) and are sent separately in the request (`src/features/chat/ChatModule.tsx:400-432`). `Message` has no attachment field, so attachment bytes are not written to conversation localStorage.
- Schema/versioning: the localStorage payload has no envelope, schema name, or version. Parsing is best-effort structural sanitization only.
- Tests:
  - E2E seeds a persisted conversation through `tests/e2e/support/app-fixture.ts:306-327` and `tests/e2e/support/app-fixture.ts:536-542`; Chat visual/settings tests therefore exercise initial hydration.
  - Assistants E2E verifies a handoff creates a local conversation with the selected `assistantId` (`tests/e2e/module-shell.spec.ts:839-851`).
  - No direct test executes localConversationStore quota trimming, malformed storage, write failure, deletion, multi-tab behavior, or mutation-then-reload round trips.

#### 4. Gallery: `localStorage["cherry-web-gallery-items"]`

- Owner: `App` owns live gallery state and invokes the storage helper (`src/App.tsx:73`, `src/App.tsx:163-166`).
- Producers: active Image, PPT, Mind Map, and Translation studios pass `GenerationResult + sourceModule + prompt + modelId` to `App` (`src/features/studio/StudioModule.tsx:545-550`, `src/features/studio/StudioModule.tsx:834`, `src/features/studio/StudioModule.tsx:1004-1009`, `src/features/studio/StudioModule.tsx:1286-1291`).
- Stored shape: unversioned JSON array of sanitized `GalleryItem` records. Shared definitions are at `src/types.ts:315-336`. Persisted fields are explicitly rebuilt as:
  - `id`, `module`, `sourceModule`, `title`, `status`, optional `text`, optional `assets`, `createdAt`, `prompt`, `modelId`, `favorite`, optional `tags` (`src/features/gallery/galleryStorage.ts:30-43`).
  - `GenerationResult.raw` is intentionally dropped because it is never copied into the sanitized object.
- Limits: 30 items, prompt 4,000 characters, result text 20,000 characters, four assets, each asset URL at most 900,000 characters, eight tags of 60 characters, total serialized key at most 4,200,000 characters (`src/features/gallery/galleryStorage.ts:4-8`, `src/features/gallery/galleryStorage.ts:19-42`).
- Initialization: `App` synchronously reads and sanitizes before bootstrap completes (`src/App.tsx:63-74`, `src/features/gallery/galleryStorage.ts:46-57`). This read also occurs when navigating directly to `/admin`, although the admin route skips gallery writes.
- Write timing: every `galleryItems` state change writes in an effect (`src/App.tsx:163-166`). New items are prepended and in-memory state is capped at 50 (`src/App.tsx:188-190`), but persistence caps at 30 (`src/features/gallery/galleryStorage.ts:63-66`), creating a deliberate-but-silent 50-live/30-after-reload mismatch.
- Quota behavior: like conversations, the helper drops tail items until both its own 4.2M-character cap and the browser write succeed, then removes the key if no item can be stored (`src/features/gallery/galleryStorage.ts:73-88`). Assets over 900,000 characters are discarded individually rather than shrinking the item (`src/features/gallery/galleryStorage.ts:19-28`).
- Size-sensitive assets: the server normalizer can turn provider inline bytes and `b64_json` into `data:*;base64,...` URLs (`server/index.mjs:815-860`), and active image generation persists those returned assets (`server/index.mjs:2013-2028`). Base64 expands binary content by roughly one third before JSON/string storage overhead, so high-resolution outputs are the dominant localStorage pressure.
- Current reachability:
  - persisted image assets are still read as Image Studio inspiration/history input (`src/features/studio/StudioModule.tsx:441-460`);
  - the Gallery management UI itself is not imported or rendered by the current router (`src/app/ModuleRouter.tsx:15-17`, `src/app/ModuleRouter.tsx:81-103`);
  - public tests explicitly require `.gallery-grid` to be absent (`tests/e2e/module-shell.spec.ts:909-936`).
- Consequence: PPT, Mind Map, and Translation records are persisted but have no current browser UI for listing, deleting, favoriting, or exporting after reload. Image records remain indirectly useful through the inspiration pool.
- Tests: no live gallery storage round-trip, sanitizer, cap, quota, data-URL, or recovery test found. `scripts/feature-audit.mjs:95-97` only proves Gallery is excluded from public navigation.

#### 5. Knowledge documents: IndexedDB `cherry-web-knowledge-db` / `documents` plus localStorage fallback

- Owner: `KnowledgeModule` owns live state; `knowledgeDb.ts` owns primary persistence; `knowledgeStore.ts` owns legacy/fallback persistence.
- Reachability: Knowledge is absent from public routes and ModuleRouter (`src/app/publicRoutes.ts:5-12`, `src/app/ModuleRouter.tsx:81-103`). Existing origin data can still remain from older releases even though the current UI cannot access it.
- IndexedDB physical schema:
  - database: `cherry-web-knowledge-db` (`src/features/knowledge/knowledgeDb.ts:4`);
  - version: `1` (`src/features/knowledge/knowledgeDb.ts:6`);
  - object store: `documents` (`src/features/knowledge/knowledgeDb.ts:5`);
  - key path: `id` (`src/features/knowledge/knowledgeDb.ts:14-19`);
  - no indexes, migration metadata, chunks store, embeddings store, or order store.
- Logical record schema: complete `KnowledgeDocument` objects (`src/types.ts:301-313`):
  - `id`, `name`, `type`, source `size`, full extracted `text`, nested `chunks`, optional `tags`, optional `indexedAt`, optional `embeddingModelId`, `createdAt`, `updatedAt`;
  - nested chunks contain `id`, optional document identity/name, `index`, `text`, optional `score` (`src/types.ts:292-299`).
- Primary read/write behavior:
  - load uses `getAll()` and returns immediately if any IDB records exist (`src/features/knowledge/knowledgeDb.ts:52-56`);
  - save opens a read-write transaction, clears the entire store, then puts every document (`src/features/knowledge/knowledgeDb.ts:67-72`);
  - clear clears the entire store (`src/features/knowledge/knowledgeDb.ts:78-85`);
  - each transaction opens and closes a new database connection (`src/features/knowledge/knowledgeDb.ts:26-49`).
- Module initialization:
  1. starts with an empty array and `hydrated=false` (`src/features/knowledge/KnowledgeModule.tsx:82-101`);
  2. async loads documents, selects all loaded IDs, then marks hydrated (`src/features/knowledge/KnowledgeModule.tsx:103-114`);
  3. every post-hydration document change rewrites the complete IDB store (`src/features/knowledge/KnowledgeModule.tsx:124-126`).
- Local file import: up to eight files per selection (`src/features/knowledge/KnowledgeModule.tsx:186-207`), individual file limit 8 MiB, supported TXT/Markdown/CSV/JSON/PDF, and only extracted text is retained (`src/features/knowledge/documentExtractors.ts:69-96`). Original binary files and PDF bytes are not stored.
- Text/chunk limits:
  - at most 18 documents in the module ingestion path (`src/features/knowledge/KnowledgeModule.tsx:203-206`);
  - full text capped at 160,000 characters (`src/features/knowledge/knowledgeStore.ts:5-8`, `src/features/knowledge/knowledgeStore.ts:117-131`);
  - chunk target 900 characters with 120-character overlap, individual chunk cap 2,400 (`src/features/knowledge/knowledgeStore.ts:24-75`);
  - full text and chunk text are both stored, so text is duplicated and overlap adds further amplification.
- Legacy/fallback localStorage:
  - key `cherry-web-knowledge-documents` (`src/features/knowledge/knowledgeStore.ts:4`);
  - unversioned JSON array, max 18 documents, 4,200,000 serialized characters (`src/features/knowledge/knowledgeStore.ts:5-8`, `src/features/knowledge/knowledgeStore.ts:134-176`);
  - the fallback sanitizer preserves basic identity/text/chunks but drops optional `tags`, `indexedAt`, and `embeddingModelId` because they are absent from the returned object (`src/features/knowledge/knowledgeStore.ts:92-114`).
- Legacy migration: when IDB is empty, load reads localStorage, saves it to IDB, then removes the localStorage key (`src/features/knowledge/knowledgeDb.ts:52-61`).
- Embeddings/vectors: despite `embeddingModelId` metadata, vectors are not persisted in IndexedDB. Selected chunks are sent to the server (`src/features/knowledge/KnowledgeModule.tsx:244-254`); the server requests query/chunk embeddings, attaches vectors only to temporary ranking objects, and returns ranked public chunks (`server/knowledge/retrieval.mjs:17-46`). The historical plan described separate `documents`, `chunks`, and `embeddings` stores (`plans/20260530-1244-next-completion-roadmap/phase-05-knowledge-base-pro-storage-pdf.md:40-51`), but implementation created only `documents`.
- Tests: no IndexedDB, migration, fallback, quota, transaction failure, ordering, corrupt record, or embedding-cache tests found. There is no `fake-indexeddb` dependency in `package.json`/`package-lock.json`.

Critical implementation risks in this path:

1. **Migration can delete the only fallback copy after an IDB failure.** `saveKnowledgeDocumentsAsync` catches an IDB write failure and writes back to localStorage (`src/features/knowledge/knowledgeDb.ts:67-75`), but the caller then unconditionally clears localStorage (`src/features/knowledge/knowledgeDb.ts:56-60`). The migration promise appears successful even when only the fallback succeeded.
2. **Stale IDB wins over newer fallback data.** If IDB already contains records, a later IDB save failure writes newer state to localStorage. On next load, non-empty IDB returns immediately and localStorage is ignored (`src/features/knowledge/knowledgeDb.ts:52-64`).
3. **Clear can resurrect fallback data.** A successful IDB clear does not clear the localStorage fallback (`src/features/knowledge/knowledgeDb.ts:78-85`). If both exist, the next empty-IDB load can migrate the stale fallback back into IDB.
4. **Fallback changes logical schema.** Optional tags and indexing metadata survive direct IDB writes but are stripped by localStorage sanitization (`src/types.ts:301-313`, `src/features/knowledge/knowledgeStore.ts:105-114`).
5. **Order is not explicitly persisted.** `getAll()` reads object-store records, while records only have `id`; there is no position field or index. The UI’s prepend order is therefore not a durable contract across reload/migration.
6. **Future DB upgrades have no coordination hooks.** No `onblocked` handler is attached to `indexedDB.open`, and opened databases do not register `onversionchange` (`src/features/knowledge/knowledgeDb.ts:8-23`).

#### 6. Media jobs: `localStorage["cherry-web-media-jobs"]`

- Owner: no active owner. `loadMediaJobs`, `saveMediaJobs`, `createMediaJob`, and `providerJobIdFrom` have no call sites outside their defining file.
- Stored shape: unversioned JSON array, max 20 (`src/features/media/mediaJobStorage.ts:3-5`). `MediaJob` contains job identity, module, model/endpoint/provider job ID, status, prompt, optional complete `GenerationResult`, failure, polling fields, and timestamps (`src/types.ts:338-354`).
- Sanitization: top-level strings are capped, but `status` is not enum-validated and nested `result` is copied as-is (`src/features/media/mediaJobStorage.ts:11-28`). A result may therefore retain arbitrary `raw` provider JSON and asset URLs/data URLs.
- Write behavior: one direct `localStorage.setItem` with no serialized-size cap and no `try/catch` (`src/features/media/mediaJobStorage.ts:85-95`).
- Reachability: neither `MediaJobPanel` nor storage helpers are imported by the current public router. Public routing explicitly omits audio/video (`src/app/publicRoutes.ts:5-12`, `src/app/ModuleRouter.tsx:81-103`).
- Import/export/tests: none found.
- Backup relevance: preserve the key during migration because older origins may still contain user jobs, but treat nested `result.raw` as untrusted/possibly large and sanitize before export.

#### 7. Replay handoff: `sessionStorage["cherry-web-replay-draft"]`

- Producer: `GalleryModule` serializes `{ moduleId, prompt, modelId? }` (`src/features/gallery/replayDraft.ts:3-20`, `src/features/gallery/GalleryModule.tsx:121-125`).
- Consumer: `consumeReplayDraft` reads JSON, checks only exact module equality, removes on successful match or parse failure, and leaves a mismatched draft in storage (`src/features/gallery/replayDraft.ts:23-35`).
- Error behavior: producer `setItem` has no `try/catch`; parser uses an unchecked cast.
- Reachability: GalleryModule is not routed. Consumers are legacy `GenerationModule`, `MindmapModule`, `AgentsModule`, and `KnowledgeModule`, none of which is mounted by the current ModuleRouter. The active `StudioModule` does not call `consumeReplayDraft`.
- Import/export/tests: none found.
- Backup relevance: ephemeral navigation state; exclude from durable workspace backup unless restoring an interrupted UI session is an explicit requirement.

#### 8. Assistant handoff: `sessionStorage["aistudio-selected-assistant"]`

- Producer: Assistants Studio writes the selected assistant ID and navigates to Chat (`src/features/studio/StudioModule.tsx:1141`).
- Consumer: Chat reads it, resolves the assistant, removes the key, creates a new local conversation, and expands it (`src/features/chat/ChatModule.tsx:243-257`). If the assistant is not yet found, it leaves the key for a later effect pass.
- Stored shape: raw assistant ID string, no version/envelope.
- Error behavior: direct producer/consumer storage calls have no `try/catch`.
- Tests: `tests/e2e/module-shell.spec.ts:839-851` proves the key is consumed and the resulting local conversation has the selected assistant.
- Backup relevance: one-shot navigation state; exclude from durable backup.

#### 9. CacheStorage: `xi-ai-web-shell-v1`

- Registration: production only, after window load (`src/main.tsx:12-15`).
- Cache schema: cache name `xi-ai-web-shell-v1`; install precaches `/`, `/manifest.webmanifest`, and `/pwa-icon.svg` (`public/sw.js:1-7`).
- Fetch behavior: same-origin non-API GET requests are network-first, then cloned into the cache; failures fall back to the request cache or `/` (`public/sw.js:18-32`). Activation deletes every cache with a different name (`public/sw.js:10-15`).
- User-data relevance: this is application-shell/resource persistence, not structured workspace state. It should normally be excluded from workspace export and rebuilt from the deployed application version.
- Tests: Playwright globally blocks service workers (`playwright.config.ts:24-30`), so cache installation, upgrades, cleanup, and offline fallback are not exercised.

### Initialization and data flow

#### Current public startup

1. `App` synchronously reads provider session state and gallery local state during initial render (`src/App.tsx:63-74`).
2. Public bootstrap loads from the server and resolves one of the six canonical routes (`src/App.tsx:80-125`, `src/app/publicRoutes.ts:48-68`).
3. `App` effects immediately save provider state and, on public routes, gallery state (`src/App.tsx:152-166`). This means even a clean load can rewrite sanitized storage without a user edit.
4. `TopBar` mounts, reads theme synchronously, applies root DOM attributes/classes, and writes the normalized value (`src/app/TopBar.tsx:65-75`).
5. Route module mounts:
   - Chat loads conversations, consumes any assistant handoff, and creates a blank persisted conversation when empty (`src/features/chat/ChatModule.tsx:153-177`, `src/features/chat/ChatModule.tsx:243-268`).
   - Image/PPT/Mind Map/Translation mount StudioModule; successful generation prepends a gallery item in App, whose effect persists it (`src/App.tsx:188-190`, `src/features/studio/StudioModule.tsx:545-550`).
   - Assistants may create the one-shot session handoff to Chat (`src/features/studio/StudioModule.tsx:1141`).

#### Dormant knowledge startup if the route is restored

1. KnowledgeModule begins empty and async loads IDB (`src/features/knowledge/KnowledgeModule.tsx:82-114`).
2. If IDB has records, they win; otherwise the localStorage legacy array is migrated (`src/features/knowledge/knowledgeDb.ts:52-64`).
3. After hydration, every state change rewrites the whole IDB store (`src/features/knowledge/KnowledgeModule.tsx:124-126`, `src/features/knowledge/knowledgeDb.ts:67-72`).

### Import/export and backup behavior

#### Whole workspace

- No whole-workspace export, import, backup manifest, schema version, checksum, encryption, conflict resolution, dry-run preview, or rollback implementation was found.
- No owner enumerates browser storage keys or IndexedDB databases.
- No code takes a consistent snapshot across synchronous Web Storage and asynchronous IndexedDB.

#### Conversations

- `conversationArchive.ts` defines envelope schema `xi-ai-web.conversation-export`, version `1`, export timestamp, conversations, and optional generated summaries (`src/features/chat/conversationArchive.ts:3-24`, `src/features/chat/conversationArchive.ts:91-106`).
- Import accepts either the versioned envelope or a legacy bare array, sanitizes each conversation, records rejected indices, allows replace only when every item is valid, and supports ID-renaming merge (`src/features/chat/conversationArchive.ts:109-176`).
- Markdown export and a summary artifact also exist (`src/features/chat/conversationArchive.ts:179-218`).
- No source file in `src/` calls these helpers; ChatModule does not import them. They are currently library code, not a user-visible backup path.
- `scripts/chat-local-contracts.mjs:41-111` tests envelope versioning, secret exclusion, malformed-item preview, replace refusal, merge ID collision, summaries, and Markdown. It does not test file selection/download UI or localStorage round trips.

#### Gallery

- GalleryModule can export one or many items as Markdown (`src/features/gallery/GalleryModule.tsx:23-57`, `src/features/gallery/GalleryModule.tsx:95-98`). Asset data is represented only as URL text (`src/features/gallery/GalleryModule.tsx:37-39`); there is no binary packaging, checksum, offline copy, or re-import.
- The Gallery UI is currently unreachable, so this export cannot be invoked through the public app.

#### Knowledge

- Local documents are imported from user-selected files into extracted text/chunks (`src/features/knowledge/KnowledgeModule.tsx:186-207`, `src/features/knowledge/documentExtractors.ts:69-96`). This is content ingestion, not storage backup import.
- No knowledge JSON export, restore preview, merge, replacement, schema version, or ID collision policy exists.

#### Active Studio exports

- Image results expose direct download links for returned asset URLs/data URLs (`src/features/studio/StudioModule.tsx:750-756`).
- PPT can download only the current result text as Markdown (`src/features/studio/StudioModule.tsx:842-850`, `src/features/studio/StudioModule.tsx:944-950`).
- Mind Map can export the current rendered tree as SVG (`src/features/studio/StudioModule.tsx:1106`).
- These are individual-result exports, not backups of persisted gallery state, and none can restore data.

#### Admin metadata

- Admin JSON metadata import/export and server backups are separate from browser workspace persistence. They cover backend-managed menu/model/assistant/app/prompt/tool metadata and must not be conflated with a browser workspace backup (`src/features/admin/AdminConsole.tsx:491-519`, `README.md:83`).

### Size-sensitive blobs, text, and vectors

| Data | Persisted? | Size controls | Risk |
| --- | --- | --- | --- |
| Gallery image/audio/video asset URL or data URL | Yes, localStorage | 900,000 characters per asset; four assets; 4.2M characters total key (`src/features/gallery/galleryStorage.ts:4-8`, `src/features/gallery/galleryStorage.ts:19-28`) | Base64 assets dominate quota; oversized assets silently disappear from persisted records. External/signed URLs may later expire even if the JSON survives. |
| Knowledge extracted full text | Yes, IDB; localStorage fallback | 160,000 characters per document; UI limit 18 (`src/features/knowledge/knowledgeStore.ts:5-8`, `src/features/knowledge/knowledgeStore.ts:117-131`) | Full text is duplicated by nested chunks; IDB path has no total-size guard or quota UX. |
| Knowledge chunks | Yes, nested in each document | About 900 characters with 120 overlap; 2,400-character sanitizer cap (`src/features/knowledge/knowledgeStore.ts:24-75`) | Duplication and overlap inflate backups; a normalized backup may want one canonical text source and derived chunks. |
| Knowledge embedding vectors | No | Request-time only (`server/knowledge/retrieval.mjs:25-39`) | Historical design expected a cache, but no vectors exist to back up. `embeddingModelId` is metadata only. |
| Chat image attachments | No; transient UI/request state | 4 MiB file; server data-URL length check 5.6M (`src/features/chat/attachmentUtils.ts:3`, `server/index.mjs:1053-1064`) | Do not assume conversation backup includes multimodal inputs; current message schema loses them by design. |
| Image edit input and mask | No; transient component state | source image 8 MiB; mask 4 MiB (`src/features/studio/StudioModule.tsx:379-397`, `src/features/studio/StudioModule.tsx:417-418`) | Not recoverable after navigation/reload; only provider outputs may enter gallery. |
| Media job nested result/raw | Potentially, in dormant key | No nested size cap and no write exception handling (`src/features/media/mediaJobStorage.ts:11-28`, `src/features/media/mediaJobStorage.ts:85-95`) | Legacy origins may contain unexpectedly large or sensitive provider response data. |
| Conversation text | Yes, localStorage | 24,000 characters/message, 80 messages/conversation, 40 conversations, 4.2M key (`src/features/chat/localConversationStore.ts:4-7`) | Aggregate origin quota competition can trigger silent conversation eviction even when the key is below its own cap. |

No use of `navigator.storage.estimate()`, `navigator.storage.persist()`, quota preflight, storage-pressure UI, or user-visible write failure reporting was found.

### Cross-cutting code patterns

1. **Unversioned arrays dominate.** Conversations, gallery, knowledge fallback, and media jobs are raw JSON arrays without a schema/version envelope (`src/features/chat/localConversationStore.ts:84-124`, `src/features/gallery/galleryStorage.ts:46-88`, `src/features/knowledge/knowledgeStore.ts:134-176`, `src/features/media/mediaJobStorage.ts:72-95`).
2. **Sanitize on load/save, but definitions are duplicated.** Conversation sanitization exists separately in localConversationStore and conversationArchive (`src/features/chat/localConversationStore.ts:19-60`, `src/features/chat/conversationArchive.ts:42-88`), creating drift risk.
3. **Errors are mostly swallowed.** Provider, conversation, gallery, and knowledge helpers generally fall back or silently discard data. Theme, assistant handoff, replay producer, and media save do not catch storage exceptions.
4. **Whole-collection replacement.** Knowledge clears and rewrites the object store; localStorage owners serialize complete arrays. There are no per-record revisions or compare-and-swap controls.
5. **No multi-tab synchronization.** No `storage` event, BroadcastChannel, or IDB change notification handling was found. Two tabs can overwrite each other with last-writer-wins snapshots.
6. **No aggregate quota coordination.** Conversation, gallery, and knowledge fallback each target roughly 4.2M characters independently, although they share one origin quota. Dormant media data and theme also consume the same localStorage area.
7. **Read paths can rewrite immediately.** App and TopBar effects normalize and write on mount; Chat can auto-create a conversation. Backup/restore must avoid mounting writers over a partially restored state.
8. **No storage abstraction registry.** Keys and DB names are file-local constants, so adding a backup requires an explicit inventory rather than discovering owners from one central module.

### Test coverage matrix

| Area | Existing evidence | Missing coverage material to migration |
| --- | --- | --- |
| BYOK session storage | Direct sessionStorage/localStorage assertions and reload (`tests/e2e/byok-modal.spec.ts:13-51`) | New-tab/session-boundary behavior, corrupt payload, disabled storage, backup exclusion/encryption. |
| Conversation hydration | E2E fixtures seed localStorage (`tests/e2e/support/app-fixture.ts:306-327`, `tests/e2e/support/app-fixture.ts:536-542`) | Mutation + reload, cap/eviction, malformed values, quota failure, imported legacy arrays, cross-tab conflicts. |
| Assistant handoff | Key consumption and local conversation creation (`tests/e2e/module-shell.spec.ts:839-851`) | Storage exceptions, missing assistant, stale handoff. |
| Conversation archive helpers | Static/transpiled contract script (`scripts/chat-local-contracts.mjs:41-111`) | Actual UI/file IO, storage merge/replace, large files, atomic rollback. |
| Gallery | No persistence test found | Sanitization, raw stripping, data URL limits, 50-to-30 reload behavior, quota loss, export/restore. |
| Knowledge IndexedDB | No test found | DB creation/version upgrade, migration success/failure, stale fallback precedence, clear resurrection, ordering, quota, concurrent tabs. |
| Media jobs | No test found | Legacy payload import, nested raw sanitization, quota exceptions. |
| Theme | No test found | Reload and disabled-storage behavior. |
| Replay draft | No test found | Consume semantics, mismatched module, current-router integration. |
| Service worker CacheStorage | E2E explicitly blocks service workers (`playwright.config.ts:24-30`) | Install/activate/cache upgrade/offline fallback. |

### Migration risks for a workspace IndexedDB backup

#### Critical

1. **Do not include credentials by default.** `cherry-web-user-provider` contains an API key and is contractually session-only. Moving it into IndexedDB or a normal JSON backup would violate current privacy specs.
2. **Preserve dormant/orphaned data.** Existing `cherry-web-knowledge-db`, `cherry-web-knowledge-documents`, `cherry-web-media-jobs`, gallery records from retired modules, and replay drafts may exist even though their UIs are not routed. Enumerate physical stores, not only visible features.
3. **Fix or bypass the knowledge fallback migration bug before reusing it.** The current fallback-save-then-clear sequence can erase the only valid copy after IDB failure (`src/features/knowledge/knowledgeDb.ts:56-60`, `src/features/knowledge/knowledgeDb.ts:67-75`).
4. **Restore must be staged before live writers mount.** App/TopBar normalize and save on mount, Chat may auto-create a conversation, and Knowledge rewrites after hydration. A restore performed after ordinary mount can be overwritten or mixed with auto-created data.

#### High

5. **Introduce a versioned backup envelope independent of legacy payloads.** Every durable browser dataset except the disconnected conversation archive is unversioned. Include backup schema version, app version, export time, origin identity policy, per-dataset version, and checksums.
6. **Define per-dataset merge/replace rules.** Conversations already have collision-renaming semantics; gallery, knowledge, and media do not. IDs can collide across imported browsers.
7. **Make restore atomic or recoverable.** IndexedDB can transactionally restore records inside one database, but Web Storage and multiple databases cannot participate in one transaction. Use staged validation, temporary stores/keys, commit markers, and rollback data.
8. **Account for aggregate quota and binary amplification.** Current per-key caps do not account for all origin data. Converting localStorage data into IDB may increase retained history and expose larger backups, especially base64 assets and duplicated knowledge chunks.
9. **Do not treat asset URLs as durable assets.** Data URLs are self-contained but large; remote/signed URLs are small but can expire. Backup format must state whether it embeds binary bytes, preserves URLs only, or marks unavailable assets.
10. **Resolve IDB/localStorage divergence explicitly.** For knowledge, “non-empty IDB wins” is not a safe conflict rule when fallback may be newer. Compare revision/export timestamps or migrate both into a conflict report.

#### Medium

11. **Preserve logical order explicitly.** Add stable position/order metadata rather than depending on object-store key order or current array order.
12. **Centralize sanitizers and schema decoders.** Conversation storage and archive already duplicate validation. A backup layer should call one canonical decoder per dataset.
13. **Surface partial loss.** Existing helpers silently trim or drop records/assets. A backup should report excluded, oversized, corrupt, or unsupported items rather than presenting a false “complete” result.
14. **Handle multi-tab coordination.** Pause writers or acquire a browser-level lease during export/restore; otherwise another tab can overwrite restored snapshots.
15. **Separate source data from derived data.** Knowledge chunks and index metadata are derived from full text; vectors are currently transient. Decide whether backup stores canonical documents only or also versioned derived indexes.
16. **Retain unknown legacy fields safely.** Current sanitizers discard unknown fields. This is useful for privacy but can destroy data during migration if newer/older fields are not recognized. Preview and report field loss before commit.
17. **Exclude CacheStorage from workspace semantics.** Cache entries are deploy-version artifacts and can be recreated. Restoring them risks mixing old application assets with new schemas.

### Recommended inventory boundary for implementation planning

A safe backup manifest should classify data before implementation:

| Class | Include by default | Datasets |
| --- | --- | --- |
| User-created durable content | Yes | conversations, gallery records/assets per explicit asset policy, knowledge documents, recoverable media jobs |
| User preferences | Optional | theme, possibly last selected model after removing credentials |
| Secrets | No | provider base URL/API key unless separately encrypted and explicitly requested |
| Ephemeral navigation/UI state | No | selected-assistant handoff, replay draft |
| Derived/rebuildable indexes | Usually no or separately versioned | knowledge chunks, future embedding vectors |
| Application cache | No | service-worker CacheStorage |

### External references and versions

Repository versions relevant to implementation are declared in `package.json:25-38`:

- React `^19.2.6`
- TypeScript `^6.0.3`
- Vite `^8.0.14`
- Playwright `1.61.1`
- No IndexedDB wrapper library (`idb`, Dexie, localForage) or IndexedDB test shim is installed.

Browser-platform references to consult during design:

- MDN Web Storage API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- MDN Storage quotas and eviction criteria: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN `IDBOpenDBRequest` blocked event: https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event
- MDN `IDBDatabase` versionchange event: https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/versionchange_event
- MDN `StorageManager.estimate()`: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- MDN `StorageManager.persist()`: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist

Live external retrieval was attempted on 2026-07-20 but the browsing service returned HTTP 503/auth unavailable. The repository audit and risks above are grounded in local code; the links are reference pointers and were not live-verified in this session.

### Related specs and project contracts

- `.trellis/spec/frontend/state-management.md`
  - App owns shared gallery and provider state.
  - BYOK must stay under `cherry-web-user-provider` in sessionStorage.
  - Existing browser storage helpers are the required boundaries.
- `.trellis/spec/frontend/type-safety.md`
  - Browser storage must pass through sanitizer/load/save helpers before component state.
  - Storage changes require BYOK browser tests and privacy verification.
- `.trellis/spec/frontend/quality-guidelines.md`
  - BYOK must remain session-only.
  - Browser tests must assert the storage boundary.
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - Backup/restore must define exact formats, validation ownership, and round-trip behavior at every boundary.
- `design-system/xi-ai-web/MASTER.md:11`
  - Theme persists under `aistudio-theme`.
- `design-system/xi-ai-web/MASTER.md:81-86`
  - The API dialog is the sole public credential entry and credentials remain session-only.

## Caveats / Not Found

- The active task PRD is still a TBD stub, so this audit infers “workspace backup” scope from the user query rather than finalized acceptance criteria (`.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md`).
- No whole-workspace browser backup/export/import implementation was found.
- No current public route mounts KnowledgeModule, GalleryModule, MediaJobPanel, AgentsModule, AppsModule, or the legacy GenerationModule/MindmapModule.
- No browser code persists embedding vectors; only document text/chunks and indexing metadata are stored.
- No chat attachment bytes are persisted with conversations.
- No test framework or dependency for isolated IndexedDB unit tests was found.
- No `navigator.storage.estimate`, persistent-storage request, quota UI, multi-tab lock, storage event listener, BroadcastChannel, migration journal, or rollback marker was found.
- Service-worker cache behavior is not covered by Playwright because service workers are blocked in the test configuration.
- README statements about visible Knowledge, Media, Gallery, replay, and export functionality are broader than the currently routed six-module UI (`README.md:12-15`, `README.md:88-94` versus `src/app/publicRoutes.ts:5-12`).
- Per the trellis-research scope, no source files, specs, task artifacts, or git state were modified; only this research file was written.
