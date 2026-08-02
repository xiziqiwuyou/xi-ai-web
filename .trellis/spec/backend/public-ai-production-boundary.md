# Public AI Production Boundary

## Scenario: BYOK Chat And Image Production Paths

### 1. Scope / Trigger

- Trigger: any change to public Chat or image-generation payloads, `/api/chat/*`, `/api/image/optimize-prompt`, `/api/generate/image`, model catalog routing, Provider adapters, request guards, managed upstream settings, readiness checks, or the bundled Docker deployment.
- The browser owns the user's session-only API Key and interaction state. The server owns the upstream origin, catalog lookup, request model name, endpoint protocol, capability checks, validation, Provider projection, timeouts, and public error shape.
- This contract does not cover knowledge accounts, Langflow, Agents, audio, video, PPT, mind maps, billing, or server-side storage of public API Keys.

### 2. Signatures

```text
GET  /api/health
GET  /api/ready
POST /api/chat/stream
POST /api/chat/title
POST /api/image/optimize-prompt
POST /api/generate/image
```

```ts
streamChat(payload: ChatStreamPayload, onEvent, signal?: AbortSignal): Promise<void>
api.generate("image", payload: GenerationPayload, signal?: AbortSignal): Promise<GenerationResult>
api.optimizeImagePrompt({ connection, modelId, prompt }): Promise<{ prompt: string }>
```

```js
normalizeConnection(value) // => { baseUrl: db.settings.upstreamBaseUrl, apiKey }
resolveRuntimeProvider(body, capability) // => { connection, entry, provider }
assertManagedUpstreamBaseUrl(value, options) // => Promise<normalizedUrl>
createRequestGuard({ scope, windowMs, maxRequests, maxConcurrent })
```

### 3. Contracts

- Public payloads provide `connection.apiKey` only. A legacy `connection.baseUrl` may be accepted for compatibility and redaction, but it never selects the outbound origin. `normalizeConnection()` always returns the administrator-managed `db.settings.upstreamBaseUrl`.
- The default origin is `https://api.xi-ai.cn`. `UPSTREAM_BASE_URL` locks the production origin unless `ALLOW_ADMIN_UPSTREAM_OVERRIDE=true`. Production requires HTTPS and rejects embedded credentials, query/hash fragments, local hostnames, and DNS results in private, loopback, link-local, metadata, carrier-grade NAT, multicast, or reserved ranges. `ALLOW_LOCAL_UPSTREAM=true` is for explicit local verification only.
- Catalog resolution occurs before network access. `modelId` must resolve to an enabled entry whose capability matches the route. The entry owns `vendor`, actual request `model`, `endpointProtocol`, and supported parameters.
- Chat responses are SSE with `meta`, zero or more `token`, optional `error`, and exactly one terminal `done` event while the client is connected. The server emits heartbeat comments, aborts upstream work after a genuine client disconnect, and maps timeout separately from cancellation. The browser rejects a stream that ends without `done`.
- Chat context and attachments are bounded before Provider projection. API Keys are limited to 4,096 characters. Image attachments are at most 4 MiB each and 24 MiB total; model vision capability remains authoritative. Conversation persistence, IndexedDB archives, and import/export may retain message attachments and usage, but must not retain the API Key.
- Image generation distinguishes `generate` from `edit`. The server validates local images, caps edit uploads at 20 MiB total, enforces Provider-specific reference counts, and validates OpenAI masks as same-size PNG images with an alpha channel. Count defaults to one, Gemini caps at four, and other supported image Providers cap at ten.
- Image adapters receive only supported values. The public UI uses PNG output by default and projects model-supported size/quality fields. A successful upstream response with no usable image asset is a `502`, never a completed result. Browser cancellation must abort the request and record a cancelled timing entry rather than a success.
- General upstream timeout defaults to 120 seconds. Image timeout defaults to 300 seconds and is bounded to 30-900 seconds. Provider response readers cap image payloads at 64 MiB and reject HTML or malformed success envelopes.
- `/api/health` is a liveness endpoint. `/api/ready` is readiness and returns `503` unless Admin credentials, metadata state, managed upstream state, data-directory writes, and at least one enabled Chat and image model are ready.
- The bundled Compose deployment binds `127.0.0.1:8787`, persists `/app/data`, runs as `node`, uses a read-only root filesystem, drops Linux capabilities, enables `no-new-privileges`, bounds PID/CPU/memory use, and health-checks `/api/ready`.

Environment contract:

| Key | Default / requirement | Meaning |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Production: at least 16 characters | Admin login and fallback source for a domain-separated session signing key |
| `ADMIN_SESSION_SECRET` | Optional but recommended | Explicit Admin session signing secret |
| `UPSTREAM_BASE_URL` | `https://api.xi-ai.cn` | Administrator-managed Provider gateway |
| `ALLOW_ADMIN_UPSTREAM_OVERRIDE` | `false` | Allows Admin metadata to override an explicit production upstream |
| `ALLOW_LOCAL_UPSTREAM` | `false` | Permits local HTTP/private addresses for controlled local tests only |
| `UPSTREAM_TIMEOUT_MS` | `120000`, max `900000` | General Provider timeout |
| `IMAGE_UPSTREAM_TIMEOUT_MS` | `300000`, range `30000-900000` | Image Provider timeout |
| `SSE_HEARTBEAT_MS` | `15000`, range `5000-60000` | Chat SSE heartbeat interval |
| `CHAT_RATE_LIMIT_MAX` / `CHAT_MAX_CONCURRENT` | `30` / `8` | Process-local Chat limits |
| `GENERATION_RATE_LIMIT_MAX` / `GENERATION_MAX_CONCURRENT` | `20` / `4` | Process-local generation limits |

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing or overlong API Key | `400`; no Provider request |
| Caller supplies a private or alternate `baseUrl` | Ignore it and use the managed upstream |
| Invalid or unsafe managed upstream | Startup/import/update becomes degraded or fails validation; `/api/ready` returns `503` |
| Unknown, disabled, or capability-incompatible model | `4xx` before Provider access |
| Model input exceeds `maxInputCharacters` | `413` before Provider access |
| Chat image exceeds per-item or aggregate bounds | `413`; no Provider request |
| Request rate or concurrency exhausted | `429` with bounded `Retry-After` |
| Upstream timeout | `504`; redact API Key from the message |
| Client cancellation | Abort Provider work; use stopped/cancelled terminal state and do not count success |
| Chat stream closes without `done` | Browser throws a `502`-class `ApiError` |
| Image edit uses an unsupported mode or reference format | `400`; no Provider request |
| OpenAI mask is not PNG, differs in dimensions, or has no alpha | `400`; no Provider request |
| Upstream returns HTML, malformed JSON, oversized media, or no image asset | Redacted `502`; never render the envelope as model output |
| Readiness dependency is degraded | `/api/ready` returns `503` with per-check booleans |

### 5. Good/Base/Bad Cases

- Good: the browser submits an API Key, an enabled catalog `modelId`, and one PNG image request; the server sends the Key only in the Provider authorization header to `api.xi-ai.cn`, returns one normalized asset, and persists no credential.
- Base: a text-only Chat request receives SSE `meta`, token data, and `done`; the client can cancel it and a later conversation restore retains messages without restoring a Key.
- Bad: forwarding `connection.baseUrl`, selecting an endpoint from UI text, treating an HTML gateway page as optimized prompt text, reporting an empty image array as completed, or making `/api/health` depend on external readiness.

### 6. Tests Required

- `npm run provider-contracts`: exact OpenAI Chat/Responses, Anthropic Messages, Gemini generateContent, image generation/edit projection, unsupported-field omission, response bounds, and redaction.
- `npm run chat-local-contracts`: Chat payload bounds, attachment continuity, cancellation, terminal SSE handling, and local persistence contracts.
- `npm run workspace-storage-contracts` and `npm run privacy`: IndexedDB/import-export round trips and absence of API Keys in durable browser/server data.
- `npm run test:security`: managed-upstream lock, DNS/private-address rejection, request limits, Admin login limits, and secret handling.
- `npm run test:server`: route behavior, readiness, metadata recovery, Provider routing, and request guards.
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
