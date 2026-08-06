# Public AI Production Boundary

## BYOK Chat And Image Route Index

### Scope

- Trigger: any change to public Chat or image-generation payloads, `/api/chat/*`, `/api/image/optimize-prompt`, `/api/image/import`, `/api/generate/image`, model catalog routing, Provider adapters, request guards, managed upstream settings, readiness checks, or the bundled Docker deployment.
- The browser owns the user's session-only API Key and interaction state. The server owns the upstream origin, catalog lookup, request model name, endpoint protocol, capability checks, validation, Provider projection, timeouts, and public error shape.
- This contract does not cover knowledge accounts, Langflow, Agents, audio, video, PPT, mind maps, billing, or server-side storage of public API Keys.

### Routes

```text
GET  /api/health
GET  /api/ready
POST /api/chat/stream
POST /api/chat/title
POST /api/image/optimize-prompt
POST /api/image/import
GET  /api/image/timing-estimate
POST /api/generate/image
```

## Scenario: OneAPI Settings Direct-Key Handoff

### 1. Scope / Trigger

- Trigger: any change to `SiteSettings.oneapiSettingsHandoffEnabled`, public bootstrap settings, Admin site settings, metadata import/restore, or the browser `#/?settings=...` parser.
- This compatibility path accepts a model API Key directly in a browser fragment. It is not a server token-exchange route and is fully isolated from Shell type-3 JWT handling.

### 2. Contracts

- `oneapiSettingsHandoffEnabled` defaults to false and may be changed only through the authenticated Admin settings route. Public bootstrap exposes only the boolean capability flag.
- Metadata import and backup restore preserve the live administrator value instead of accepting the imported/restored value. Public routes cannot mutate it.
- The server never receives the OneAPI fragment, direct Key, or caller-supplied `settings.url`. No route, audit record, log, export payload, analytics record, or JSON metadata may receive the direct Key.
- Browser requests continue to use the administrator-managed `settings.upstreamBaseUrl`. A OneAPI `settings.url` value has no effect on SSRF policy, provider routing, or endpoint construction.
- Shell `#/jwt_auth?x_s_token=...` continues to use `/api/public/shell-token/exchange`; the OneAPI path must make zero exchange calls.

### 3. Validation & Tests

- Server tests cover the default-off value, authenticated enable/disable, public projection, and import/restore preservation.
- Desktop and mobile E2E cover raw and encoded JSON, URL cleanup, sessionStorage-only persistence, ignored external URL, disabled fallback, malformed/empty/oversized/invalid values, refresh behavior, and Shell/manual BYOK non-regression.
- `npm run privacy` remains a required gate because the compatibility URL can contain a real long-lived Key before the browser scrubs it.

## Scenario: Manual Cross-Device Workspace Snapshot

### 1. Scope / Trigger

- Trigger: any change to temporary-code workspace transfer, browser cryptography, workspace revision checks, opaque payload storage, or Admin progress-sync limits.
- This is a user-triggered point-in-time transfer. It is never an account, permanent pairing, background task, or real-time synchronization channel.

### 2. Signatures

```text
GET    /api/progress-sync/status
POST   /api/progress-sync/sessions
POST   /api/progress-sync/sessions/join
POST   /api/progress-sync/sessions/:id/status
POST   /api/progress-sync/sessions/:id/approve
POST   /api/progress-sync/sessions/:id/reject
POST   /api/progress-sync/sessions/:id/payload
POST   /api/progress-sync/sessions/:id/claim
DELETE /api/progress-sync/sessions/:id
```

```ts
captureStableWorkspaceArchive(): Promise<{ envelope: WorkspaceExportEnvelope; revision: number }>;
readWorkspaceRevision(): Promise<number>;
restoreWorkspaceArchive(envelope, mode, expectedRevision?): Promise<void>;
generateProgressSyncEphemeralKeys(): Promise<ProgressSyncEphemeralKeys>;
deriveProgressSyncKey(...): Promise<CryptoKey>;
encryptProgressSyncPayload(...): Promise<Uint8Array>;
decryptProgressSyncPayload(...): Promise<ProgressSyncPayload>;
```

### 3. Contracts

- The exact six-digit numeric code is a bounded rendezvous identifier only. Creator and join bearer tokens are random, transport-role-specific, stored server-side only as HMAC hashes, and never placed in URLs.
- `creatorRole` defaults to semantic sender for legacy clients or may explicitly be semantic receiver for reverse QR. Creator/join order never grants data authority: only the semantic sender may approve/reject/upload, only the semantic receiver may claim, and either authenticated side may cancel.
- Each browser generates an ephemeral non-exportable P-256 private key. ECDH output is passed through HKDF-SHA-256; the full version/session/public-key/nonce transcript binds the AES-256-GCM key and six-digit comparison fingerprint.
- The server receives public handshake material, bounded state, token/code hashes, and opaque ciphertext only. It never receives plaintext workspace JSON, private keys, derived keys, or plaintext API Keys.
- Stable capture reads `workspaceRevision` before and after export. Receiver preview records its own revision and restore rejects a changed revision before merge/replace. Existing workspace sanitization, SHA-256 integrity, and atomic restore remain authoritative.
- Ordinary workspace export remains credential-free. Optional API Key inclusion is unchecked by default, requires a second confirmation, exists only inside the encrypted sync payload, and is written to receiver `sessionStorage` only after workspace commit. A failed write rolls the workspace back.
- Single-instance metadata is in memory. Ciphertext is atomically written below `DATA_DIR/progress-sync` and removed after claim, cancellation, rejection, or expiry. Restart invalidates sessions and removes orphan files.
- Admin `SiteSettings.progressSync` owns runtime enablement, 180-1800 second TTL, 5-64 MB ciphertext limit, and bounded IP/session attempts. Environment variables seed first-boot defaults; production defaults disabled.
- First-boot environment keys are `PROGRESS_SYNC_ENABLED`, `PROGRESS_SYNC_TTL_SECONDS`, `PROGRESS_SYNC_MAX_PAYLOAD_MB`, `PROGRESS_SYNC_MAX_IP_ATTEMPTS`, and `PROGRESS_SYNC_MAX_SESSION_ATTEMPTS`; process-local request guards use `PROGRESS_SYNC_RATE_LIMIT_MAX` and `PROGRESS_SYNC_MAX_CONCURRENT`.
- All responses are `Cache-Control: no-store`. HTTPS is mandatory outside localhost. Redis/S3/COS may later replace metadata/payload adapters, but Redis must never become the only large-payload store.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Invalid, expired, or exhausted code | Reject without revealing whether another code exists |
| Duplicate receiver | Preserve the first pending receiver and reject the second |
| Receiver transcript differs at approval | Reject approval; no payload upload |
| Wrong role token | Reject before state mutation or file access |
| Creator and join semantic roles are equal or request material conflicts with the declared role | Reject before attaching peer material or changing `waiting_join` |
| Ciphertext empty or above configured limit | HTTP 4xx/413; no partial file |
| Concurrent or duplicate claim | Exactly one succeeds; later claims return a terminal error |
| AES-GCM tag, AAD, key, or packet version mismatch | Reject before preview or IndexedDB writes |
| Source revision changes during capture | Retry once, then require a new capture |
| Receiver revision changes after preview | Reject restore and require a new preview |
| API Key persistence fails after workspace commit | Atomically restore the captured receiver rollback snapshot |
| Feature disabled | Status remains readable; session routes return 503 |

### 5. Good/Base/Bad Cases

- Good: desktop and phone display the same fingerprint, sender approves, receiver validates counts/digest, merges, and optionally receives the Key only after commit.
- Base: API Key remains unchecked; the encrypted payload contains only the credential-free workspace and resume route.
- Bad: deriving encryption from the short code, storing ciphertext only in Redis, parsing ciphertext server-side, accepting a resume path that does not match its public module, or restoring an old preview over newly changed local data.

### 6. Tests Required

- `tests/server/progress-sync.test.mjs`: hashing, legacy and receiver-created semantic role matrices, exact transcript approval, wrong-role no-side-effect behavior, attempts, expiry, atomic storage, interrupted upload, duplicate claim, cleanup, body limits, no-store, and runtime configuration.
- `tests/e2e/progress-sync-crypto.spec.ts`: two-party key agreement, equal/substituted fingerprints, non-exportable private keys, round trip, tamper, wrong AAD/session, and stale receiver revision.
- `tests/e2e/progress-sync-cross-device.spec.ts`: real server plus isolated desktop/mobile contexts for both QR directions and manual fallback, no pre-confirm protocol request, optional-Key second confirmation, exact IndexedDB records, and post-commit sessionStorage restore.
- `tests/e2e/mobile-layout.spec.ts`: 360/375/390/412/tablet, landscape, 200% text, reduced motion, dark/light, visualViewport, touch targets, and dialog containment.
- Release evidence still requires real iOS Safari and Android Chrome; Chromium emulation cannot close that gate.

### 7. Wrong vs Correct

```js
// Wrong: the memorable code becomes the encryption secret and download proof.
const key = await deriveKey(shortCode);
return payloadForCode(shortCode);

// Correct: code only finds a session; browsers derive a key and sender approves.
const sharedKey = await deriveProgressSyncKey(ephemeralEcdhTranscript);
await approveExactReceiverTranscript(creatorToken, receiverMaterial);
```

```ts
// Wrong: apply a preview after local data changed.
await restoreWorkspaceArchive(preview.workspace, "merge");

// Correct: bind apply to the receiver revision captured at preview time.
await restoreWorkspaceArchive(preview.workspace, "merge", preview.receiverRevision);
```

## Scenario: BYOK Chat And Image Production Paths

### 1. Scope / Trigger

- Trigger: any change to public Chat or image-generation payloads, `/api/chat/*`, `/api/image/optimize-prompt`, `/api/image/import`, `/api/generate/image`, model catalog routing, Provider adapters, request guards, managed upstream settings, readiness checks, or the bundled Docker deployment.
- The browser owns the user's session-only API Key and interaction state. The server owns the upstream origin, catalog lookup, request model name, endpoint protocol, capability checks, validation, Provider projection, timeouts, and public error shape.
- This contract does not cover knowledge accounts, Langflow, Agents, audio, video, PPT, mind maps, billing, or server-side storage of public API Keys.

### 2. Signatures

```ts
streamChat(payload: ChatStreamPayload, onEvent, signal?: AbortSignal): Promise<void>
api.generate("image", payload: GenerationPayload, signal?: AbortSignal): Promise<GenerationResult>
api.optimizeImagePrompt({ connection, modelId, prompt }): Promise<{ prompt: string }>
api.importImageResult(url: string): Promise<{ dataUrl: string; mimeType: string }>
api.imageTimingEstimate(key: ImageGenerationTimingKey): Promise<ImageGenerationTimingEstimate>
```

```js
normalizeConnection(value) // => { baseUrl: db.settings.upstreamBaseUrl, apiKey }
resolveRuntimeProvider(body, capability) // => { connection, entry, provider }
assertManagedUpstreamBaseUrl(value, options) // => Promise<normalizedUrl>
createRequestGuard({ scope, windowMs, maxRequests, maxConcurrent })
importPublicImageAsset(url, { maxBytes, timeoutMs })
createImageGenerationTimingStore({ filePath, maxBytes, retainRecords })
```

### 3. Contracts

- Public payloads provide `connection.apiKey` only. A legacy `connection.baseUrl` may be accepted for compatibility and redaction, but it never selects the outbound origin. `normalizeConnection()` always returns the administrator-managed `db.settings.upstreamBaseUrl`.
- The default origin is `https://api.xi-ai.cn`. `UPSTREAM_BASE_URL` locks the production origin unless `ALLOW_ADMIN_UPSTREAM_OVERRIDE=true`. Production requires HTTPS and rejects embedded credentials, query/hash fragments, local hostnames, and DNS results in private, loopback, link-local, metadata, carrier-grade NAT, multicast, or reserved ranges. `ALLOW_LOCAL_UPSTREAM=true` is for explicit local verification only.
- Catalog resolution occurs before network access. `modelId` must resolve to an enabled entry whose capability matches the route. The entry owns `vendor`, actual request `model`, `endpointProtocol`, and supported parameters.
- `/api/generate/mindmap` keeps the common chat-capable Provider adapter as its portability boundary, but the server owns every trusted preset and operation prompt. It accepts only normalized preset/depth/density/operation fields plus an optional bounded current `MindmapDocument`; user material and the current map stay in `user` messages. Provider JSON, fenced JSON, and legacy Markdown/Mermaid are normalized into version 1 with server-assigned IDs, 2-5 levels, at most 8 children per node, 60 nodes total, 24-character labels, 180-character notes, and duplicate-sibling removal. Expand merges only new children into the selected preserved-ID branch; Reorganize returns one complete normalized replacement. Meaningless output is `502`, never a successful decorative fallback.
- Chat responses are SSE with `meta`, zero or more `token`, optional `error`, and exactly one terminal `done` event while the client is connected. The server emits heartbeat comments, aborts upstream work after a genuine client disconnect, and maps timeout separately from cancellation. The browser rejects a stream that ends without `done`.
- For ordinary no-tool Chat requests, `openai-responses`, `anthropic-messages`, and `gemini-generate-content` adapters must call their native streaming endpoints and forward only displayable text deltas as they arrive. They must not await a complete JSON response before calling `onToken`. Anthropic thinking deltas are never public chat text; Gemini adapters must avoid duplicating cumulative gateway chunks. Local or hosted tool loops may retain their explicit final-answer fallback until a tool-aware streaming event contract is implemented.
- The Chat route passes native text through a bounded micro-buffer before public `token` events. Defaults are a 32ms flush cadence, 80ms maximum wait, 512-character batch, 131072-character pending queue, and 5000ms downstream drain timeout. `SSE_TOKEN_FLUSH_MS`, `SSE_TOKEN_MAX_WAIT_MS`, `SSE_TOKEN_MAX_CHARS`, `SSE_TOKEN_MAX_QUEUE_CHARS`, and `SSE_BACKPRESSURE_TIMEOUT_MS` are server-only bounded deployment settings; they must not become public bootstrap or user settings. The buffer flushes its tail before `done`, cancels on disconnect, and never invents text during a Provider silence.
- Chat context and attachments are bounded before Provider projection. API Keys are limited to 4,096 characters. Image attachments are at most 4 MiB each and 24 MiB total; model vision capability remains authoritative. Conversation persistence, IndexedDB archives, and import/export may retain message attachments and usage, but must not retain the API Key.
- Image generation distinguishes `generate` from `edit`. The server validates local images, caps edit uploads at 20 MiB total, enforces Provider-specific reference counts, and validates OpenAI masks as same-size PNG images with an alpha channel. Count defaults to one, Gemini caps at four, and other supported image Providers cap at ten.
- `/api/image/import` is a same-origin fallback for generated HTTPS images that render in `<img>` but deny browser CORS reads. It accepts only `{ url }`, applies its own `12/minute` and `2 concurrent` defaults, parses at most 16 KiB of JSON, validates a public credential-free HTTPS URL and DNS result before fetch, rejects redirects, detects PNG/JPEG/WebP from bytes rather than trusting `Content-Type`, caps the body at the shared 20 MiB edit limit, times out by default after 30 seconds, returns `Cache-Control: no-store`, and never forwards the user's API Key. It is not a general URL proxy.
- `/api/image/timing-estimate` is a credential-free read of server-global operational timing. It validates an enabled image model and bounded mode/resolution/aspect/count fields, returns `Cache-Control: no-store`, and is limited independently to `120/minute` and `8 concurrent` requests by default. The dedicated JSONL store records only successful image generations after usable assets exist; records contain model ID, mode, resolution, aspect ratio, count, duration, and timestamp, never API Keys, prompts, image bytes, URLs, or user identifiers. Estimates prefer the exact parameter key, then model/mode and model fallbacks, and average at most the newest 10 matching records.
- Image adapters receive only supported values. The public Image Studio always sends `count: 1`, uses PNG output by default, and projects model-supported size/quality fields; the server keeps bounded count normalization for compatible non-UI callers. The first Provider request keeps the normalized requested count. If it returns at least one but fewer assets, the route may issue at most the missing number of sequential `count: 1` supplemental requests; a complete first response makes no supplemental call. Empty first responses and bounded sequences that remain incomplete are `502`, never partial completed results. The one server-global ETA sample measures the complete browser request including supplementation. Browser cancellation must abort the request and must not enter the server-global ETA sample set.
- General upstream timeout defaults to 120 seconds. Image timeout defaults to 300 seconds and is bounded to 30-900 seconds. Provider response readers cap image payloads at 64 MiB and reject HTML or malformed success envelopes.
- `/api/health` is a liveness endpoint. `/api/ready` is readiness and returns `503` unless Admin credentials, metadata state, managed upstream state, data-directory writes, and at least one enabled Chat and image model are ready.
- The root Compose deployment is an image consumer, never a source builder. It pulls `XI_AI_WEB_IMAGE` (default `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.1`) for the Web process, knowledge migration, and knowledge worker so all roles run the same release. GitHub Actions publishes reviewed `linux/amd64` and `linux/arm64` images with `latest`, commit-SHA, and `v*` tags; production should pin an immutable release tag for rollback.
- The bundled Compose deployment binds `127.0.0.1:8787`, persists `/app/data`, runs as `node`, uses a read-only root filesystem, drops Linux capabilities, enables `no-new-privileges`, bounds PID/CPU/memory use, and health-checks `/api/ready`. PostgreSQL and Langflow remain optional profile services and PostgreSQL has no published host port.

Environment contract:

| Key | Default / requirement | Meaning |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Production: at least 8 characters | Admin login and fallback source for a domain-separated session signing key |
| `ADMIN_SESSION_SECRET` | Optional but recommended | Explicit Admin session signing secret |
| `UPSTREAM_BASE_URL` | `https://api.xi-ai.cn` | Administrator-managed Provider gateway |
| `ALLOW_ADMIN_UPSTREAM_OVERRIDE` | `false` | Allows Admin metadata to override an explicit production upstream |
| `ALLOW_LOCAL_UPSTREAM` | `false` | Permits local HTTP/private addresses for controlled local tests only |
| `UPSTREAM_TIMEOUT_MS` | `120000`, max `900000` | General Provider timeout |
| `IMAGE_UPSTREAM_TIMEOUT_MS` | `300000`, range `30000-900000` | Image Provider timeout |
| `IMAGE_IMPORT_TIMEOUT_MS` | `30000`, max `120000` | Public generated-image import timeout |
| `SSE_HEARTBEAT_MS` | `15000`, range `5000-60000` | Chat SSE heartbeat interval |
| `SSE_TOKEN_FLUSH_MS` | `32`, range `16-100` | Chat token micro-buffer cadence |
| `SSE_TOKEN_MAX_WAIT_MS` | `80`, range `40-200` | Maximum token micro-buffer wait |
| `SSE_TOKEN_MAX_CHARS` | `512`, range `128-4096` | Maximum public token batch size |
| `SSE_TOKEN_MAX_QUEUE_CHARS` | `131072`, range `1024-131072` | Maximum pending server token queue |
| `SSE_BACKPRESSURE_TIMEOUT_MS` | `5000`, range `500-30000` | Downstream SSE drain timeout |
| `CHAT_RATE_LIMIT_MAX` / `CHAT_MAX_CONCURRENT` | `30` / `8` | Process-local Chat limits |
| `GENERATION_RATE_LIMIT_MAX` / `GENERATION_MAX_CONCURRENT` | `20` / `4` | Process-local generation limits |
| `IMAGE_IMPORT_RATE_LIMIT_MAX` / `IMAGE_IMPORT_MAX_CONCURRENT` | `12` / `2` | Process-local CORS fallback import limits |
| `IMAGE_TIMING_RATE_LIMIT_MAX` / `IMAGE_TIMING_MAX_CONCURRENT` | `120` / `8` | Process-local global ETA read limits |

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing or overlong API Key | `400`; no Provider request |
| Caller supplies a private or alternate `baseUrl` | Ignore it and use the managed upstream |
| Invalid or unsafe managed upstream | Startup/import/update becomes degraded or fails validation; `/api/ready` returns `503` |
| Unknown, disabled, or capability-incompatible model | `4xx` before Provider access |
| Model input exceeds `maxInputCharacters` | `413` before Provider access |
| Mind Map expansion has no valid current document or selected node | `400`; no Provider request |
| Mind Map output is malformed and has no meaningful bounded hierarchy fallback | `502`; do not return an empty or decorative map |
| Chat image exceeds per-item or aggregate bounds | `413`; no Provider request |
| Request rate or concurrency exhausted | `429` with bounded `Retry-After` |
| Upstream timeout | `504`; redact API Key from the message |
| Client cancellation | Abort Provider work, clear token buffers, emit no later token, use stopped/cancelled terminal state, and do not count success |
| Downstream drain timeout or token queue overflow | Abort Provider work, bound the public error, clear timers/listeners, and never allocate an unbounded queue |
| Chat stream closes without `done` | Browser throws a `502`-class `ApiError` |
| Image edit uses an unsupported mode or reference format | `400`; no Provider request |
| Image import URL is missing, non-HTTPS, credentialed, private, loopback, metadata, or DNS-rebound | `400`; no remote request for rejected validation |
| Image import redirects, times out, returns non-image bytes, or remote failure | `502`; no Data URL returned |
| Image import exceeds 20 MiB | `413`; cancel body reading and return no Data URL |
| Timing estimate has no matching successful record | Return the bounded parameter-aware baseline with zero samples |
| OpenAI mask is not PNG, differs in dimensions, or has no alpha | `400`; no Provider request |
| Upstream returns HTML, malformed JSON, oversized media, or no image asset | Redacted `502`; never render the envelope as model output |
| Upstream returns fewer images than requested | Make bounded missing-image `count: 1` requests; return `502` if the final asset count still differs |
| Readiness dependency is degraded | `/api/ready` returns `503` with per-check booleans |

### 5. Good/Base/Bad Cases

- Good: the browser submits an API Key, an enabled catalog `modelId`, and one PNG image request; the server sends the Key only in the Provider authorization header to `api.xi-ai.cn`, returns one normalized asset, and persists no credential. If that asset blocks browser CORS, the browser imports it through `/api/image/import`, applies transforms locally, and then submits the resulting PNG to the selected edit model.
- Base: a text-only Chat request receives SSE `meta`, token data, and `done`; the client can cancel it and a later conversation restore retains messages without restoring a Key.
- Bad: forwarding `connection.baseUrl`, fetching an arbitrary/private image URL without public-address validation, trusting an image response header without byte detection, selecting an endpoint from UI text, treating an HTML gateway page as optimized prompt text, reporting an empty image array as completed, or making `/api/health` depend on external readiness.

### 6. Tests Required

- `npm run provider-contracts`: exact OpenAI Chat/Responses, Anthropic Messages, Gemini generateContent, native split-frame Chat streaming, async token callback backpressure, tool-loop fallback, image generation/edit projection, unsupported-field omission, response bounds, and redaction.
- `npm run test:server`: bounded token coalescing, tail flush, queue limits, SSE `drain`, cancellation, and backpressure timeout.
- `npm run chat-local-contracts`: Chat payload bounds, attachment continuity, cancellation, terminal SSE handling, and local persistence contracts.
- `npm run workspace-storage-contracts` and `npm run privacy`: IndexedDB/import-export round trips and absence of API Keys in durable browser/server data.
- `npm run test:security`: managed-upstream lock, DNS/private-address rejection, request limits, Admin login limits, secret handling, and bounded public-image import type/size behavior.
- `npm run test:server`: route behavior, readiness, metadata recovery, Provider routing, and request guards.
- `tests/server/mindmap-document.test.mjs`, `tests/server/mindmap-route.test.mjs`, and `tests/e2e/mindmap-workbench.spec.ts`: structured parsing/bounds, trusted prompts, Provider routing, selected-branch expansion, complete reorganization, local edits without requests, source round trips, all exports, and desktop/mobile overflow.
- `npm run release-check`: start a production server against a controlled local upstream, prove malicious caller URLs are ignored, and traverse real Chat SSE plus image-generation routes.
- `npm run ui-runtime` and Playwright desktop/mobile suites: public Key entry, Chat send/cancel/restore, image generate/edit/cancel, and responsive interaction.
- A pre-release live smoke with a disposable real API Key remains required to prove the external `api.xi-ai.cn` gateway, DNS, TLS, account permissions, and model availability. Never add that Key to fixtures or logs.

### 7. Wrong vs Correct

```js
// Wrong: the public browser controls the server's outbound destination.
const connection = {
  baseUrl: req.body.connection.baseUrl,
  apiKey: req.body.connection.apiKey
};

// Correct: only the transient credential crosses the public boundary.
const connection = normalizeConnection(req.body.connection);
// connection.baseUrl === db.settings.upstreamBaseUrl
```

```ts
// Wrong: EOF is treated as a successful streaming completion.
while (!(await reader.read()).done) parseEvents();

// Correct: success requires the explicit terminal event.
if (!receivedDone) {
  throw new ApiError(502, "Model stream ended before the completion event");
}
```

```js
// Wrong: a 200 response with no image is reported as completed.
return resultPayload("image", "result", { assets: extractAssets(json, "image") });

// Correct: empty media is an upstream contract failure.
const assets = extractAssets(json, "image").slice(0, requestedCount);
if (!assets.length) throw httpError(502, "Image provider returned no usable image assets");
```

```js
// Wrong: browser CORS failure leads to an unrestricted server-side fetch.
const bytes = await fetch(req.body.url).then((response) => response.arrayBuffer());

// Correct: the image-only importer owns URL, redirect, DNS, type, size and timeout checks.
const asset = await importPublicImageAsset(req.body.url, {
  maxBytes: MAX_IMAGE_EDIT_UPLOAD_BYTES,
  timeoutMs: IMAGE_IMPORT_TIMEOUT_MS
});
```
