# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Managed Upstream And Public Provider Boundary

- `SiteSettings.upstreamBaseUrl` is the only runtime base URL for public model, search, media, and knowledge Embedding requests. Browser-provided `baseUrl` fields are compatibility-only secrets for redaction and must never select an outbound target.
- The default managed upstream is `https://api.xi-ai.cn`. Production settings require HTTPS and must reject credentials, query/hash fragments, loopback, private, link-local, multicast, metadata, and DNS-resolved restricted addresses. Local HTTP is allowed only outside production with `ALLOW_LOCAL_UPSTREAM=true`.
- Validate the managed upstream during startup and every privileged settings import, restore, or update. Public request handlers consume the normalized stored value and never silently fall back to a client URL.
- `providerUrl(provider, endpointPath)` owns API-version projection for model traffic. A bare managed domain receives `/v1` for OpenAI, Anthropic, Kimi, DeepSeek, Qwen, BotCF, and OpenAI-compatible requests, while Gemini receives `/v1beta`. Preserve a base path that already ends in a version segment and never create `/v1/v1` or `/v1beta/v1beta`.
- Provider JSON and multipart-JSON helpers may accept valid JSON with a missing or incorrect media type for gateway compatibility, but must reject empty, malformed, HTML, and XHTML success bodies. Binary media helpers must reject HTML before creating a data URL. A landing page is an upstream configuration error, never model text or generated media.
- Prompt optimization performs a route-specific final-text check after provider extraction: remove at most one wrapping-quote layer and one transport-code-fence layer regardless of nesting order, then reject empty or HTML-document output. Normal chat remains allowed to discuss or generate HTML source.
- Knowledge Embedding uses the same model endpoint projection for `/v1/embeddings`. Kimi independent search uses `/v1/chat/completions`; GLM keeps its separate `/paas/v4/web_search` contract.
- Mount public Provider rate/concurrency guards before route JSON parsers. Keep request-body limits route-specific; large limits are reserved for bounded media or multi-image payloads.
- Bound all rate/concurrency environment overrides. Release concurrency slots once on response `finish` or `close`, return `Retry-After` on rejection, map server timeouts to 504, and distinguish client cancellation as 499.
- Local tools must not use `eval`, `Function`, or another dynamic-code execution path. Parse bounded tool input explicitly and validate the declared schema before execution.

Required regression gates for this boundary:

```powershell
npm run test:security
npm run provider-contracts
npm run search-contracts
npm run automation-contracts
npm run test:knowledge
npm run privacy
npm run test:server
```

## Scenario: Private Admin Credentials

### 1. Scope / Trigger

- Trigger: changes to the Admin page route, `server/admin-credentials.mjs`, Admin login/session Cookies, `/api/admin/credentials`, Admin bootstrap identity, deployment credential variables, or Site Settings credential UI.

### 2. Signatures

```text
GET   /api/admin/status      -> { authRequired, authenticated, adminConfigured }
POST  /api/admin/login       { username, password } -> { ok }
GET   /api/admin/bootstrap   -> { adminUsername, ...metadata }
PATCH /api/admin/credentials { currentPassword, username, password } ->
                              { ok, username, reauthenticationRequired }
```

```text
ADMIN_USERNAME=xizi2333
ADMIN_PASSWORD=<required secret>
ADMIN_SESSION_SECRET=<optional independent signing secret>
DATA_DIR/admin-credentials.json =
  { version, username, salt, passwordHash, revision, updatedAt }
```

### 3. Contracts

- The Admin page exists only at `/xizi2333`; protected management APIs remain under `/api/admin/*`. Public navigation exposes neither `/xizi2333` nor legacy `/admin`, and `/admin` never mounts Admin UI.
- Login always verifies both username and password. `ADMIN_USERNAME` defaults to `xizi2333`; an empty `ADMIN_PASSWORD` keeps Admin APIs locked in every runtime mode.
- Rotated credentials live only in `DATA_DIR/admin-credentials.json` as a versioned username, random salt, `scrypt` hash, random credential revision, and timestamp. Never include this file in metadata export/restore, backup payloads, logs, or browser state.
- A valid persisted credential file overrides bootstrap environment credentials. Deleting the file and restarting is the operator recovery path back to `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Every signed Admin session contains the active credential revision. Rotation changes the revision, clears the current Cookie, and invalidates all previous sessions.
- Rotation requires the current password; a blank new password preserves it. Usernames use 3 to 64 ASCII letters, digits, dots, underscores, or hyphens; new passwords use 8 to 512 characters.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing configured password | `503`; Admin APIs remain locked in development and production |
| Wrong username or wrong password | Same generic `401` body; never reveal which field failed |
| Invalid new username | `400 ADMIN_USERNAME_INVALID`; do not write the credential file |
| Invalid non-empty new password | `400 ADMIN_PASSWORD_INVALID`; do not write the credential file |
| Wrong current password during rotation | `401 ADMIN_CREDENTIALS_INVALID`; preserve current credentials and sessions |
| Valid rotation | Atomic same-directory replacement, new revision, expired Cookie, all previous sessions rejected |
| Malformed persisted credential file | Fail closed during startup; never fall back silently to environment credentials |

### 5. Good/Base/Bad Cases

- Good: an authenticated operator changes username and password, receives a cleared Cookie, old Cookies return `401`, and a fresh login succeeds without either plaintext password appearing on disk.
- Base: no credential file exists, so the runtime uses `ADMIN_USERNAME` plus `ADMIN_PASSWORD`; deleting a later credential file and restarting restores this bootstrap pair.
- Bad: allowing password-only login, treating empty development credentials as authenticated, placing credentials in `app-data.json`, or signing sessions without a credential revision.

### 6. Tests Required

- `tests/server/admin-credentials.test.mjs`: default username, locked empty password, generic verification, salted persistence, restart, repeat rotation, username-only rotation, and validation errors.
- `scripts/release-check.mjs`: production login, generic failures, endpoint rotation, stale Cookie rejection, fresh login, and plaintext absence.
- `tests/e2e/admin-shell.spec.ts`: `/xizi2333`, legacy `/admin` rejection, username/password form, Site Settings rotation, and desktop/mobile containment.
- `npm run ui-contract`, `npm run privacy`, `npm run test:server`, and `npm run release-check` remain green.

### 7. Wrong vs Correct

```js
// Wrong: password-only login and a session that survives credential rotation.
if (body.password === process.env.ADMIN_PASSWORD) setCookie({ role: "admin" });

// Correct: verify the active pair and bind the Cookie to the credential revision.
if (!adminCredentialStore.verify(body.username, body.password)) return generic401();
setCookie({ role: "admin", revision: adminCredentialStore.revision, expiresAt });
```

### Shell Type-3 JWT Exchange Boundary

- `POST /api/public/shell-token/exchange` accepts `{ token }` only and derives both Shell control-plane URLs from the origin of the validated administrator-managed `upstreamBaseUrl`. Never accept a caller-provided host or path.
- Treat `x_s_token` as a bounded one-shot Shell login JWT, not a model Key. Validate it through `POST /api/user/login/refresh` with `X-S-Token`, then request `GET /api/token/default` with the refreshed token and return only the normalized `sk-...` `data.key`.
- Reject redirects, malformed or oversized JSON, control characters, short/oversized JWTs, malformed upstream JSON, HTML responses, and missing default Keys. Public errors must be bounded and must not reflect upstream response text or either secret.
- Mount the exchange-specific rate/concurrency guard and 16 KiB JSON parser before the general parser, enforce a 20-second abort timeout, and return `Cache-Control: no-store` plus `Pragma: no-cache` on success.
- Never persist, log, cache, audit, or return the Shell JWT. The resulting API Key belongs to the existing browser session-only BYOK boundary and must not enter backend metadata.

---

## Admin JSON Metadata Write Queue

- `createMetadataWriteQueue()` is mounted after `requireAdmin` and before Admin mutation handlers. `GET` and `HEAD` bypass it; `POST`, `PUT`, `PATCH`, and `DELETE` acquire one in-process slot in arrival order.
- A request releases its slot exactly once on response `finish` or premature `close`. A queued request whose client disconnected must skip its downstream handler. Use `req.aborted` and the explicit abort event for request disconnects; do not treat `req.destroyed` alone as proof of a disconnect because Express may set it after consuming a normal request body. A synchronous downstream throw must release the slot before propagating.
- The queue serializes one Node process only. It is not a distributed lock and must not be described as horizontal multi-instance consistency.
- `tests/server/metadata-write-queue.test.mjs` covers ordering, GET bypass, close/finish idempotence, disconnected queued requests, and synchronous throws.

## Structured PPT Preset Contract

### 1. Scope / Trigger

- Trigger: changes to `/api/generate/ppt`, `server/ppt-deck.mjs`, `server/ppt-preset-profiles.mjs`, `PptGenerationOptions`, or the browser PPT preset catalog.

### 2. Signatures

```js
pptGenerationMessages(prompt, options)
parsePptDeckModelOutput(content, options, fallbackTitle)
```

```text
POST /api/generate/ppt { connection, modelId, prompt, options: { ppt } }
```

### 3. Contracts

- The browser submits a bounded `presentationType` plus editable generation options. It never submits trusted preset instructions.
- `server/ppt-preset-profiles.mjs` owns purpose, narrative flow, required/optional sections, layout guidance, and content rules for the eight supported preset IDs.
- The combined system message requires one JSON object, `16:9`, cover-first structure, the requested slide count, semantic layout variety, and no three consecutive identical ordinary layouts.
- Parsing bounds all visible text, retains the cover and terminal summary when trimming, and conservatively retypes only a third repeated ordinary layout while preserving its content.
- Invalid structured output remains available through the existing Markdown-compatible fallback. Do not render an invalid Provider envelope as a trusted structured deck.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown preset ID | Normalize to `business-report` before prompt composition |
| Page count outside `4..20` | Clamp before Provider access and parsing |
| User prompt or optional text exceeds its bound | Truncate in the user message; never merge it into trusted preset text |
| Unsupported slide type | Normalize to cover/content semantics according to position |
| Fewer valid slides than requested | Reject the structured deck and use the existing compatibility path |
| More slides than requested | Preserve cover and terminal summary, then trim middle slides |
| Third repeated ordinary layout | Use the selected preset's safe layout cycle and preserve normalized points |
| Invalid JSON or empty slides | Return `null` for the existing Markdown-compatible fallback |

### 5. Good/Base/Bad Cases

- Good: a product-launch request combines the server-owned product narrative with the user's manually overridden audience and theme, returns an exact structured deck, and renders mixed semantic layouts.
- Base: an unknown preset falls back to the business profile and a valid short deck remains readable through the compatibility path.
- Bad: accepting a browser-provided system prompt, silently inventing numeric evidence, or forcing layout variety by discarding slide content.

### 6. Tests Required

- `tests/server/ppt-deck.test.mjs`: all eight profile IDs, trusted prompt composition, option bounds, sanitization, cover/summary retention, and repeated-layout repair.
- `tests/e2e/module-shell.spec.ts`: preset default application plus manual overrides, exact request projection, cover/summary/data/timeline/two-column/quote rendering, desktop geometry, mobile containment, and menu accessibility at all four configured viewports.
- `npm run check`, `npm run ui-contract`, `npm run feature-audit`, `npm run test:server`, and `npm run release-check` remain green.

### 7. Wrong vs Correct

```js
// Wrong: an untrusted browser field becomes a system instruction.
messages = [{ role: "system", content: req.body.options.ppt.presetPrompt }];

// Correct: resolve the trusted profile by normalized ID and keep user fields in the user message.
const options = normalizePptGenerationOptions(req.body.options?.ppt);
messages = pptGenerationMessages(prompt, options);
```

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)

## Knowledge Account Authentication Contract

### 1. Scope / Trigger

- Trigger: any change under `server/knowledge-cloud/auth/`, `/api/kb/auth/*`, `kb_accounts`, `kb_sessions`, `kb_invites`, `kb_auth_rate_limits`, the standalone `/knowledge` route, or reverse-proxy client-IP handling.
- Public Chat, generation, Agents, Workflows, Assistants, and Translation remain account-free. Knowledge identity never authenticates Admin or supplies provider credentials.

### 2. Signatures

```text
GET  /api/kb/public-config
POST /api/kb/auth/register
POST /api/kb/auth/login
GET  /api/kb/auth/session
POST /api/kb/auth/logout
POST /api/kb/auth/recovery-code
POST /api/kb/auth/recover
```

```js
createKnowledgeAuthService({ repositories, tokenSecret, sessionTtlSeconds })
knowledgeClientContext(req) // => { ipPrefix, userAgent }
```

Required when knowledge is enabled: `KNOWLEDGE_TOKEN_SECRET` (32+ characters), `PUBLIC_ORIGIN`, `DATABASE_URL`, and COS configuration. `TRUST_PROXY_HOPS` defaults to `0`; set the exact trusted reverse-proxy hop count when deployed behind a proxy.

### 3. Contracts

- Passwords use Node built-in Argon2id with `64 MiB`, 3 passes, parallelism 2, per-password salt, and a versioned format. Unknown-account login still executes the password hashing cost path.
- Session, CSRF, recovery, invite, rate-limit, and IP-prefix values use keyed domain-separated HMAC-SHA256. Plaintext secrets never enter PostgreSQL, logs, bootstrap, browser storage, or Admin metadata.
- The opaque `xi_kb_session` cookie is `HttpOnly; SameSite=Lax; Path=/api`, adds `Secure` for HTTPS `PUBLIC_ORIGIN`, and is never returned in JSON. CSRF values are returned to the live page only and rotate on session refresh.
- Every `/api/kb/*` response sends `Cache-Control: no-store`; Session/CSRF data, one-time codes, account metadata, and future document results must not enter browser or intermediary HTTP caches.
- Register, login, recover, logout, and recovery-code rotation require exact `Origin === PUBLIC_ORIGIN`. Authenticated mutations additionally require `X-Knowledge-CSRF`.
- Knowledge JSON is parsed inside `createKnowledgeRouter` with a `64kb` limit before route handling. Do not place the router behind the application's `32mb` general parser.
- Registration applies both IP-prefix and IP-prefix-plus-normalized-name rate limits. Successful registration does not clear the shared IP bucket. Login failure locking and PostgreSQL rate-limit counters remain replica-safe.
- Password recovery revokes every old session and replaces the recovery code. Authenticated recovery-code rotation keeps sessions active but atomically compares the previous recovery hash so concurrent rotations cannot both succeed.
- Account and invite creation/consumption remain in one PostgreSQL transaction. Session/account generation checks fail closed after password recovery, Admin reset, freeze, or session revocation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing/invalid Origin | `403 KB_ORIGIN_INVALID` before auth work |
| Missing/invalid CSRF on authenticated mutation | `403 KB_CSRF_INVALID` |
| Invalid login | Generic `401 KB_AUTH_INVALID_CREDENTIALS`; no account enumeration |
| Invalid recovery account/code | Generic `401 KB_RECOVERY_INVALID` |
| Expired/revoked/stale-generation session | Unauthenticated projection or `401 KB_AUTH_REQUIRED` |
| Frozen account | `423 KB_ACCOUNT_FROZEN` after valid credential/session proof |
| Shared/account limit exceeded | `429 KB_RATE_LIMITED` plus bounded `Retry-After` |
| Oversized/malformed JSON | `413 KB_REQUEST_TOO_LARGE` / `400 KB_INVALID_REQUEST` |
| Concurrent recovery-code rotation loser | Fail closed; never return a code that was not persisted |

### 5. Good/Base/Bad Cases

- Good: a user behind one configured Nginx proxy is limited by their real `/24` or `/64` prefix, receives an opaque Cookie, and confirms a one-time recovery code without browser persistence.
- Base: a direct deployment keeps `TRUST_PROXY_HOPS=0`, ignores forwarded IP headers, and supports multiple independent sessions for one knowledge account.
- Bad: using `X-Forwarded-For` without an explicit trust boundary, clearing the shared registration-IP bucket after success, accepting a client token as a session, or logging request bodies on auth errors.

### 6. Tests Required

- `tests/knowledge-cloud/auth-crypto.test.mjs`: Argon2 format/parameters, entropy, and HMAC domain separation.
- `tests/knowledge-cloud/auth-service.test.mjs`: generic failures, dummy hash path, account lock, fresh sessions, CSRF rejection, multi-device revocation, registration-IP limit, invite consumption, recovery rotation, and rotation races.
- `tests/knowledge-cloud/auth-routes.test.mjs`: Origin, Cookie flags, token omission, CSRF header, one-time responses, trusted-proxy context, redaction, and `Retry-After`.
- `tests/knowledge-cloud/routes.test.mjs`: typed malformed/oversized body failures from the router-owned parser.
- `tests/e2e/knowledge-auth.spec.ts`: desktop/mobile standalone route, no public bootstrap dependency, recovery acknowledgement, copy fallback, no Web Storage secrets, session restore/logout, and authenticated recovery rotation.

### 7. Wrong vs Correct

```js
// Wrong: every new account name gets an independent limit and bypasses IP abuse controls.
await consumeRateLimit("register", `${ipPrefix}\0${normalizedUsername}`);
await clearRateLimit("register-ip", ipPrefix);

// Correct: retain a shared IP budget and a narrower identity budget.
await consumeRateLimit("register-ip", ipPrefix);
await consumeRateLimit("register", `${ipPrefix}\0${normalizedUsername}`);
```

```js
// Wrong: the general 32mb body parser runs before knowledge auth.
app.use(express.json({ limit: "32mb" }));
app.use("/api/kb", createKnowledgeRouter(runtime));

// Correct: the knowledge router owns its 64kb parser and mounts first.
app.use("/api/kb", createKnowledgeRouter(runtime));
app.use(express.json({ limit: "32mb" }));
```

## Knowledge Admin Control Plane Contract

### 1. Scope / Trigger

- Trigger: any change under `server/knowledge-cloud/admin/`, `/api/admin/knowledge/*`, `/api/kb/auth/admin-reset`, `kb_runtime_settings`, `kb_admin_audit`, Admin knowledge navigation, or account/invite/runtime-limit operations.
- Knowledge Admin uses the existing isolated Admin session. A knowledge account session never authorizes these routes, and the public application never exposes an Admin entry point.

### 2. Signatures

```text
GET|PUT /api/admin/knowledge/settings
GET     /api/admin/knowledge/overview
GET     /api/admin/knowledge/accounts
PATCH   /api/admin/knowledge/accounts/:accountId
POST    /api/admin/knowledge/accounts/:accountId/revoke-sessions
POST    /api/admin/knowledge/accounts/:accountId/reset
GET|POST /api/admin/knowledge/invites
DELETE  /api/admin/knowledge/invites/:inviteId
GET     /api/admin/knowledge/jobs
GET     /api/admin/knowledge/audit
POST    /api/kb/auth/admin-reset
```

```js
createKnowledgeAdminRouter(runtime, { authorize, actorFromRequest })
createKnowledgeAdminService({ repositories, authService, config })
```

Database ownership: `kb_runtime_settings` stores one versioned runtime row, `kb_admin_audit` stores immutable outcomes, and account/invite/reset mutations remain in their owning knowledge tables.

### 3. Contracts

- Mount `/api/admin/knowledge` before the application's general `32mb` parser. The router performs Admin authorization first, exact-Origin checks for mutations, strict `64kb` JSON parsing, request-ID projection, `Cache-Control: no-store`, and knowledge error normalization.
- Settings and account writes require `expectedVersion`. Conflicts fail rather than silently overwriting another Admin operation. Every privileged mutation requires a bounded non-empty `reason`.
- Account search and status filters are server-normalized and cursor-paginated. Capacity values that may exceed JavaScript's safe integer range are decimal strings in Admin read models.
- Lowering any limit preserves current usage, existing data, and active jobs. Global quota changes update accounts without a quota override; explicit account overrides continue to win until cleared.
- Freeze, session revocation, reset issuance, invite consumption/revocation, and settings/account changes update their domain row and successful audit entry in one PostgreSQL transaction. A failed mutation rolls back first, then appends one separate failed audit outcome.
- Invite and Admin-reset plaintext appears only in the successful response. PostgreSQL stores domain-separated hashes; a reset expires after 15 minutes, is single-use, revokes sessions, invalidates the old recovery path, and blocks old-password login once issued.
- Admin responses never expose password/recovery/session/invite/reset hashes, plaintext tokens after issuance, provider BYOK data, COS credentials, or document bodies. Object storage status is `configured` or `not_checked` until a real probe exists.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing/invalid Admin session | Existing Admin `401/403`; no knowledge repository call |
| Mutation from a different Origin | `403 KB_ORIGIN_INVALID` |
| Oversized/malformed JSON | `413 KB_REQUEST_TOO_LARGE` / `400 KB_INVALID_REQUEST` |
| Missing reason or invalid limits/filter | `400 KB_INVALID_REQUEST` with bounded details |
| Stale `expectedVersion` | `409 KB_VERSION_CONFLICT`; preserve the current row |
| Unknown account/invite | Typed `404`; append a failed audit only for an attempted privileged mutation |
| Knowledge disabled/unavailable | Typed `503 KB_DISABLED` / `KB_UNAVAILABLE` after Admin authorization |
| Reused/expired Admin reset code | Generic reset failure; do not reveal hash or prior credential state |

### 5. Good/Base/Bad Cases

- Good: an Admin lowers a frozen account's quota using its current version; existing bytes remain, new excess writes are blocked, and one immutable success audit records the reason.
- Base: a read-only overview on a configured deployment reports counts and `not_checked` storage state without claiming an external health probe succeeded.
- Bad: mounting behind the general parser, accepting last-write-wins settings, returning a reset code from later reads, writing only a JSONL audit, or decrementing usage when a limit is lowered.

### 6. Tests Required

- `tests/knowledge-cloud/admin-service.test.mjs`: optimistic versions, effective-limit inheritance, non-destructive lowering, freeze/revoke/reset semantics, transactional success audits, and post-rollback failed audits.
- `tests/knowledge-cloud/admin-routes.test.mjs`: Admin auth ordering, exact Origin, parser limit, request IDs, no-store, secret redaction, one-time responses, pagination/filter bounds, and disabled typed `503`.
- `tests/knowledge-cloud/admin-repository.test.mjs`: SQL ownership filters, cursor ordering, decimal bigint projections, audit immutability, and settings/account update predicates.
- `tests/e2e/knowledge-admin.spec.ts` and `tests/e2e/knowledge-auth.spec.ts`: six Admin destinations, desktop/mobile controls, one-time plaintext lifecycle, old-password rejection, and successful reset recovery acknowledgement.

### 7. Wrong vs Correct

```js
// Wrong: mutate first and write an unrelated best-effort audit afterward.
await repository.updateAccount(accountId, patch);
await appendJsonlAudit({ operation: "account.update" });

// Correct: commit the domain mutation and immutable PostgreSQL audit together.
await repositories.transaction(async (tx) => {
  const account = await tx.admin.updateAccount(accountId, patch, expectedVersion);
  await tx.admin.appendAudit(successAudit(account, reason));
  return account;
});
```

## Knowledge Library, Quota And COS Upload Contract

### 1. Scope / Trigger

- Trigger: any change to `/api/kb/bases*`, `/api/kb/documents*`, approved knowledge Embedding profiles, `kb_knowledge_bases`, `kb_index_versions`, `kb_documents`, `kb_usage_ledger`, knowledge cleanup jobs, or the Tencent COS adapter.
- The authenticated knowledge account is the only ownership source. Client payloads never contain a trusted account ID, object key, quota, effective limit, or permanent COS credential.

### 2. Signatures

```text
GET    /api/kb/embedding-profiles
GET    /api/kb/bases
POST   /api/kb/bases
GET    /api/kb/bases/:baseId
PATCH  /api/kb/bases/:baseId
DELETE /api/kb/bases/:baseId
GET    /api/kb/bases/:baseId/documents
POST   /api/kb/bases/:baseId/documents/upload-grant
POST   /api/kb/documents/:documentId/finalize
DELETE /api/kb/documents/:documentId
```

```js
createKnowledgeLibraryService({ repositories, objectStore, quotaService, clock })
createKnowledgeQuotaService({ repositories })
createTencentCosObjectStore(cosConfig)
```

Migration `0005_library_upload_lifecycle.sql` adds declared upload metadata, one reservation key per document, grant expiry, ETag, expiring ledger rows, and one initial reserve per account/key/component.

### 3. Contracts

- Approved snapshots are immutable server records: OpenAI `text-embedding-3-small`/1536, OpenAI `text-embedding-3-large`/3072, and Qwen `text-embedding-v4`/1024. The stored fingerprint covers vendor, catalog ID, actual model, and dimensions. A non-empty base changes profiles only through the later reindex flow.
- Every base/document SQL predicate includes authenticated `account_id`. UUID validation and ownership failure occur before COS access or durable mutation. Object keys follow `knowledge/{accountId}/{baseId}/{documentId}/source/{opaqueId}` and are always server-generated.
- Lock `kb_accounts` first, then run resource-count queries in a new PostgreSQL statement so a waiter observes the prior transaction's committed bases/documents/uploads. Count, quota, document insertion, reservation ledger entry, and account counters commit atomically.
- Effective limits layer validated account overrides over versioned runtime settings; `kb_accounts.quota_bytes` remains the authoritative effective capacity. Lowering a limit never deletes data or changes used/reserved bytes.
- `kb_usage_ledger` is append-only. Reserve increases `reserved_bytes`; settle releases the full reservation and adds verified logical bytes; release removes outstanding reservation or verified document usage. Counter reconciliation recomputes projections from ledger totals while holding the account lock.
- Upload grant creation commits a pending document and reservation before requesting STS. Tencent STS receives only `name/cos:PutObject` for the exact key and a bounded `KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS` (`60..7200`, default `900`). Permanent COS credentials never enter a response.
- Finalize performs COS HEAD outside the transaction, requires exact declared/actual bytes, validates ETag and authoritative SHA-256 when available, then locks account/document, settles once, marks `uploaded`, and queues one parse job. Delete marks resources `deleting` and queues cleanup; used capacity returns only after idempotent object deletion and transactional relational cleanup. Expired pending uploads best-effort delete the object and release the reservation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing knowledge session | `401 KB_AUTH_REQUIRED` |
| Wrong Origin or CSRF on mutation | `403 KB_ORIGIN_INVALID` / `KB_CSRF_INVALID` |
| Cross-account base/document ID | Typed `404` before COS/database mutation |
| Unknown Embedding profile | `400 KB_EMBEDDING_PROFILE_INVALID` |
| Profile change with documents | `409 KB_EMBEDDING_PROFILE_CHANGE_REQUIRES_REINDEX` |
| Base/document/upload-count limit | Typed `409`/`429`; preserve existing content |
| `used + reserved + requested > quota` | `413 KB_QUOTA_EXCEEDED`; no ledger/document write |
| Client supplies owner/object key or unknown field | `400 KB_INVALID_REQUEST` |
| Missing object or mismatched size/ETag/checksum | `409 KB_UPLOAD_NOT_FOUND` / `KB_UPLOAD_MISMATCH`; keep retryable reservation until expiry |
| COS/STS failure | Redacted `502 KB_OBJECT_STORE_UNAVAILABLE`; compensate or leave an expiring reservation for cleanup |
| Repeated finalize/delete cleanup | Idempotent; never double settle or double release |

### 5. Good/Base/Bad Cases

- Good: two uploads race at the last available slot; account locking plus a post-lock count lets only one reserve capacity and obtain an exact-path temporary credential.
- Base: a 128-byte object matches HEAD, settles `reserved -128 / used +128`, queues one parse job, and a repeated finalize returns the stored document without another ledger entry.
- Bad: accepting a client object key, counting before acquiring the account lock, trusting declared bytes without HEAD, exposing `COS_SECRET_KEY`, or decrementing used bytes when deletion is merely requested.

### 6. Tests Required

- `tests/knowledge-cloud/library-service.test.mjs`: ownership, approved snapshots, limits, generated keys, unknown-field rejection, pending-upload concurrency, grant compensation, HEAD mismatch, idempotent finalize, stale-upload cleanup, delayed quota return, and profile switching.
- `tests/knowledge-cloud/quota-service.test.mjs`: idempotent reserve, overflow before write, settle-once, frozen-account release, and counter reconciliation.
- `tests/knowledge-cloud/library-repository.test.mjs`: account predicates, row lock before fresh count query, and append-only ledger writes.
- `tests/knowledge-cloud/object-store.test.mjs`: exact STS scope, temporary-only response, HEAD/delete mapping, and redacted failures.
- `tests/knowledge-cloud/library-routes.test.mjs`: session, exact Origin, CSRF, no-store, authenticated account projection, and temporary grant response.
- Real PostgreSQL + pgvector migration execution remains required through `KNOWLEDGE_TEST_DATABASE_URL`; deterministic fakes do not prove PostgreSQL/COS service availability.

### 7. Wrong vs Correct

```js
// Wrong: the statement snapshot can predate a conflicting transaction while it waits for the lock.
SELECT a.*, (SELECT COUNT(*) FROM kb_documents WHERE account_id = a.id)
FROM kb_accounts a WHERE a.id = $1 FOR UPDATE;

// Correct: lock first, then count in the next READ COMMITTED statement.
SELECT id, quota_bytes, used_bytes, reserved_bytes
FROM kb_accounts WHERE id = $1 FOR UPDATE;
SELECT COUNT(*) FROM kb_documents WHERE account_id = $1;
```

```js
// Wrong: return capacity as soon as deletion is requested.
await markDeleting(documentId);
await decrementUsedBytes(document.verifiedBytes);

// Correct: queue cleanup, delete the exact COS object, then release ledger usage transactionally.
await enqueueCleanup(documentId);
await objectStore.deleteObject({ objectKey, versionId });
await releaseDocumentUsageAndDeleteRecord(documentId);
```

## Durable Knowledge Parsing Worker Contract

### 1. Scope / Trigger

- Trigger: changes to `kb_jobs`, `kb_documents` parse states, `kb_chunks`, parser dependencies, COS worker download/upload, quota components `normalized` / `chunk_text`, or Admin job operations.
- The parser Worker is a separate process started with `npm run knowledge:worker`. It never receives or stores user BYOK credentials.

### 2. Signatures

```text
POST /api/admin/knowledge/jobs/:jobId/retry
POST /api/admin/knowledge/jobs/:jobId/cancel
```

```js
createKnowledgeJobWorker({ repositories, library, objectStore, config })
createKnowledgeIngestionService({ repositories, objectStore, parserLimits })
runKnowledgeParserIsolated(input, { timeoutMs, signal })
```

Migration `0006_durable_parsing_worker.sql` owns the expired-lease and document-chunk indexes. Exact parser dependencies and licenses are documented in `docs/knowledge-runtime.md`.

### 3. Contracts

- Claim `queued`/`retry` work or expired `running` leases with `FOR UPDATE SKIP LOCKED`. Increment attempts only on claim, heartbeat by exact `job_id + lease_owner`, retry with bounded exponential delay, and move exhausted work plus its parse document to terminal `failed` state. Frozen accounts do not claim new parse work; cleanup remains claimable.
- Parse concurrency honors each account's effective `maxConcurrentIngestionsPerAccount`. Lowering the limit does not terminate a running lease; it prevents another claim.
- Download the exact server-owned COS key/version into a random OS temp directory with byte and SHA-256 verification. Always remove the directory in `finally`; never persist a worker path in PostgreSQL or return it to a client.
- Every parser runs in a resource-limited Node worker thread with a hard timeout. Limits cover source/normalized bytes, ZIP entries/decompressed bytes/compression ratio, XML depth/nodes, pages/slides, spreadsheet rows/cells, JSON/HTML nodes, and chunks.
- Supported types are PDF, DOCX, XLSX, PPTX, TXT, Markdown, CSV, JSON, and HTML. Validate extension, declared MIME, and content signature/OOXML structure together. Reject encrypted, malformed, disguised, unsupported, oversized, and compressed-bomb inputs.
- Never execute Office macros/formulas, PDF JavaScript, HTML scripts, remote resources, XML DTDs, or external OOXML relationships. HTML script/style/template content is excluded from normalized text.
- Source locators survive persistence: PDF page, DOCX paragraph/heading path, XLSX sheet/cell range, PPTX slide/shape, text/Markdown lines, CSV rows/headers, JSON path, or HTML block/heading path.
- Empty image-only PDF extraction enters `needs_ocr`, creates no chunks/vectors/normalized quota, and completes the parse job. Other empty supported documents fail with `KB_PARSER_EMPTY`.
- For successful text extraction, reserve exact normalized/chunk bytes before COS upload. Persist replacement chunks, document `awaiting_embedding`, both quota settlements, index logical bytes, and job success in one PostgreSQL transaction. A lost/cancelled lease must roll back the transaction. Document cleanup deletes both the original and normalized COS objects before releasing logical usage.
- Admin retry/cancel requires isolated Admin auth, exact Origin, a bounded reason, and immutable success/failure audit. Responses never include `lease_owner`, `error_detail`, object keys, document bodies, or credentials. Parse retry resets only a failed document to `uploaded`; parse cancellation marks it `failed` with `KB_JOB_CANCELLED`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Worker crash / expired lease | Another worker may reclaim; no committed duplicate chunks or usage |
| Heartbeat or final commit loses ownership | `KB_JOB_LEASE_LOST`; no state/usage commit |
| COS/network failure | Retry until `max_attempts`, then terminal `failed` |
| Type mismatch/encryption/malformed/resource limit | Terminal typed parser failure; source remains deletable |
| No PDF text | `needs_ocr`; no chunks, normalized artifact, or vector payload |
| Chunk/account quota race | Recheck while holding the account row lock; one writer fails closed |
| Admin cancels running parse | Revoke lease, mark document failed, and make worker finalization roll back |
| Expired reservation | Worker maintenance appends a release ledger entry; never edits ledger history |

### 5. Tests Required

- `tests/knowledge-cloud/job-repository.test.mjs`: claim SQL, lease ownership, retries, batching, Admin mutations.
- `tests/knowledge-cloud/job-worker.test.mjs`: retry/dead-letter transitions and no duplicate successful execution.
- `tests/knowledge-cloud/ingestion-service.test.mjs`: chunk/source-locator persistence, exact quota settlement, OCR state, restart guard.
- `tests/knowledge-cloud/parsers.test.mjs`: all nine formats, isolated timeout, malformed, encrypted, oversized, empty, script-bearing, disguised, and ZIP-bomb fixtures.
- `tests/knowledge-cloud/object-store.test.mjs`: bounded download and server-side normalized upload.
- `tests/knowledge-cloud/admin-jobs.test.mjs`, `admin-routes.test.mjs`, and `tests/e2e/knowledge-admin.spec.ts`: audited retry/cancel, auth/origin boundaries, secret-free projections, desktop/mobile behavior.

### 6. Wrong vs Correct

```js
// Wrong: parse in the Web request and mark upload as searchable.
await parse(req.body.file);
await updateDocument({ status: "ready" });

// Correct: finalize queues durable work; parsing ends before online BYOK embedding.
await enqueueParseJob(document.id);
// Worker: uploaded -> parsing -> awaiting_embedding | needs_ocr | failed
```

```sql
-- Wrong: two workers can select the same queued row.
SELECT * FROM kb_jobs WHERE status = 'queued' LIMIT 1;

-- Correct: one transaction claims one eligible row without blocking peers.
SELECT id FROM kb_jobs
WHERE status IN ('queued', 'retry')
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

## Resumable BYOK Knowledge Embedding Contract

### 1. Scope / Trigger

- Trigger: changes to knowledge embedding profiles, `kb_embedding_batches`, fixed-dimension vector tables, reindexing, or `/api/kb/documents/:documentId/embedding-batches/next`.
- Embedding credentials are request-only browser session data. The Worker never receives them, and PostgreSQL, COS, audit, logs, exports, and bootstrap never persist them.

### 2. Signatures

```text
POST /api/kb/documents/:documentId/embedding-batches/next
POST /api/kb/bases/:baseId/reindex
```

```js
createKnowledgeEmbeddingService({ repositories, provider, leaseSeconds })
createKnowledgeEmbeddingProvider({ fetchImpl, requestTimeoutMs })
```

Migrations `0007_resumable_embeddings_pgvector.sql` and `0008_embedding_retry_quota_attribution.sql` own fixed 1024/1536/3072 vector tables, leases, retryable idempotency, and document-attributed shadow usage.

### 3. Contracts

- Approved profiles lock vendor, catalog ID, actual request model, dimensions, batch bounds, and fingerprint. Dynamic request dimensions never select a table name.
- A batch leases pending/failed chunks, calls the provider outside the transaction, then verifies the exact account/session/lease before vector insertion and settlement.
- Completed idempotency keys return the committed result without another provider call. Fully released failed/expired reservations may reuse the same key.
- Provider URL/Key values are registered as request secrets. Stored error codes come from a fixed allowlist; raw upstream codes/messages never reach durable state.
- Reindexing reserves full shadow capacity, clones source chunks, embeds the pending index, attributes chunk/vector bytes to documents, atomically cuts over, then releases and deletes the retired index.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing or mismatched connection/profile | `KB_EMBEDDING_CONNECTION_REQUIRED` / `KB_EMBEDDING_PROFILE_INVALID` before provider access |
| Existing live lease for the same work | `KB_EMBEDDING_BATCH_IN_PROGRESS` |
| Expired lease | Release chunks/reservation, then allow an idempotent reclaim |
| Completion loses lease/session ownership | `KB_EMBEDDING_BATCH_LEASE_LOST`; no vector or usage commit |
| Provider failure | Redacted typed error, released lease, document returns to resumable state |
| Insufficient reindex headroom | `KB_QUOTA_EXCEEDED`; preserve the active index |

### 5. Good/Base/Bad Cases

- Good: a failed Qwen batch is retried with the same idempotency key and writes each vector once.
- Base: closing the page leaves committed batches intact and uncommitted chunks reclaimable.
- Bad: persisting a BYOK key in `kb_jobs`, deriving a vector table from client dimensions, or releasing old index usage before cutover.

### 6. Tests Required

- `embedding-provider.test.mjs`: exact OpenAI/Qwen request shape, dimensions, response bounds, and secret redaction.
- `embedding-service.test.mjs`: resume, lease loss, concurrency, cross-account IDs, provider failure, reindex capacity, cutover, and cleanup.
- `embedding-repository.test.mjs`: fixed table routing, account/index predicates, shadow footprints, and retryable batch SQL.
- `knowledge-embedding.spec.ts`: session-only credentials and desktop/mobile resume behavior.

### 7. Wrong vs Correct

```js
// Wrong: persist credentials so a Worker can continue unattended.
await jobs.insert({ apiUrl: connection.baseUrl, apiKey: connection.apiKey });

// Correct: persist only leases/profile metadata; each online batch carries a transient connection.
await embeddings.nextBatch(accountId, sessionId, documentId, {
  embeddingProfileId,
  idempotencyKey,
  connection
});
```

## Cloud Knowledge Retrieval And Citation Contract

### 1. Scope / Trigger

- Trigger: changes under `server/knowledge-cloud/retrieval/`, `citations/`, retrieval repository SQL, signed COS source URLs, or future Chat/Agent/Workflow cloud-knowledge integration.
- Phase 08 owns retrieval and citation services only. Main-model integration must call this shared service in Phase 09 rather than duplicating authorization or ranking.

### 2. Signatures

```text
POST /api/kb/retrieve
POST /api/kb/retrieval
GET  /api/kb/documents/:documentId/source-url?chunkId=:chunkId&disposition=inline|attachment
POST /api/kb/documents/:documentId/source-url
```

```js
createKnowledgeRetrievalService({ repositories, provider, rateLimiter, tokenSecret })
createKnowledgeCitationService({ repositories, objectStore, sourceUrlTtlSeconds })
```

Request fields are bounded `query`, optional `queryContext`, exactly 1-3 unique `knowledgeBaseIds`, optional `topK`, and request-only profile connections. Source opening requires the returned document/chunk IDs and an optional `inline|attachment` disposition.

### 3. Contracts

- Resolve effective retrieval limits through a read-only account/settings projection. Do not call quota `lockContext`; retrieval must not `FOR UPDATE` the whole account.
- Consume the PostgreSQL-backed per-account retrieval bucket before base/provider work. Clamp client `topK` to the effective Admin/account `maxRetrievalTopK` and hard maximum 20.
- Every selected base must belong to the authenticated account, be active, have an active approved index snapshot, and have all non-deleting documents ready. Any failure aborts before query embedding.
- Group by exact persisted profile/index identity and embed the query once per group. Any group failure prevents every vector search and future main-model call.
- Pgvector SQL uses only migration-provisioned tables and always binds account, base, active index ID/version, active index status, ready document, and ready chunk state.
- Normalize/fuse scores deterministically, use stable tie-breakers, suppress adjacent chunks from the same document/index, cap results, and format bounded `UNTRUSTED_KNOWLEDGE_CONTEXT` records.
- Each injected chunk has exactly one stable citation. Public retrieval results omit COS object keys and credentials.
- Source opening reauthorizes the account, active base, ready document, active index, ready chunk, and exact object version. COS `versionId` and `response-content-disposition` are signed query parameters; URLs expire in 30-900 seconds.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing session / wrong Origin / CSRF | `KB_AUTH_REQUIRED` / `KB_ORIGIN_INVALID` / `KB_CSRF_INVALID` before service access |
| Zero, duplicate, or more than three base IDs | `KB_INVALID_REQUEST` |
| Cross-account base | `KB_KNOWLEDGE_BASE_NOT_FOUND` before provider access |
| Archived/stale/partially indexed base | `KB_INDEX_NOT_READY` before provider access |
| Missing profile connection | `KB_EMBEDDING_CONNECTION_REQUIRED`; no partial search |
| One embedding group fails | Redacted `KB_EMBEDDING_PROVIDER_ERROR`; zero searches |
| Effective request limit exceeded | `KB_RATE_LIMITED` with bounded `Retry-After` |
| Stale/cross-account citation source | `KB_DOCUMENT_NOT_FOUND`; no COS signing |

### 5. Good/Base/Bad Cases

- Good: two bases sharing one OpenAI profile produce one query embedding, two account-scoped searches, deterministic fused citations, and on-demand signed open/download URLs.
- Base: an empty but valid active base returns no chunks without leaking unrelated data.
- Bad: searching by vector table alone, silently skipping a missing connection, returning object keys, or putting `VersionId` outside the COS signed `Query` object.

### 6. Tests Required

- `retrieval-service.test.mjs`: unique 1-3 selection, complete preflight, grouping, limits, partial failure, deterministic fusion, bounds, and one-to-one citations.
- `retrieval-repository.test.mjs`: read-only limit projection and exact SQL ownership/index/document/chunk predicates.
- `retrieval-rate-limit.test.mjs`: secret-derived account bucket and retry metadata.
- `retrieval-routes.test.mjs`: auth, Origin, CSRF, no-store, request-secret redaction, and source reauthorization.
- `citation-service.test.mjs` / `object-store.test.mjs`: active citation chunk, no object-key projection, signed version/disposition, expiry, and cross-account rejection.
- Real PostgreSQL + pgvector execution remains required through `KNOWLEDGE_TEST_DATABASE_URL`; SQL-shape fakes do not prove extension behavior.

### 7. Wrong vs Correct

```sql
-- Wrong: vector similarity without ownership or active-version boundaries.
SELECT chunk_id FROM kb_vectors_1536 ORDER BY embedding <=> $1 LIMIT 20;

-- Correct: bind vector, chunk, document, base, and active index to one account/base/version.
WHERE v.account_id = $1
  AND v.knowledge_base_id = $2
  AND v.index_version_id = $3
  AND b.active_index_version = i.version
  AND i.status = 'active'
  AND d.status = 'ready'
  AND c.embedding_state = 'ready'
```

## Assistant Metadata And Streaming Contracts

- Public assistants are developer-managed metadata. Normalize category, tags, starter prompts, enabled state, IDs, text bounds, and timestamps at the server boundary; public bootstrap returns enabled records only while Admin bootstrap retains disabled records.
- Versioned metadata migrations merge missing shipped defaults by stable ID or exact name and must not replace administrator-created records. Once the new metadata version is saved, later deletions stay deleted.
- An absent or empty Chat `assistantId` is a valid neutral conversation and contributes no Assistant system prompt. A non-empty `assistantId` is fail-closed: missing or disabled records return a clear 4xx response before provider access; never use `|| assistants[0]` or rewrite historical bindings after deletion.
- Chat streaming receives resolved Skill instructions explicitly and includes them after the selected Assistant system prompt when one exists. Keep request credentials transient and redact provider errors.
- For SSE cancellation, `IncomingMessage.close` is not a client-abort signal. Listen to `request.aborted` and a premature `response.close`, abort provider work only while the response is unfinished, and always close a live response in `finally`.
- `scripts/automation-contracts.mjs` must cover metadata migration, curated category coverage, timestamp preservation, missing-assistant rejection before provider access, exact assistant system prompt injection, Skill instruction injection, and stream completion.

## Provider Tool Resolution Contracts

### 1. Scope / Trigger

- Trigger: any tool catalog, model capability, provider adapter, Chat tool, Agent tool, Workflow tool, or metadata-version change.

### 2. Signatures

```js
resolveRequestedTools({ context, settings, entry, requestedNames })
// => { localTools, searchTools, hostedTools, unavailable }
```

Adapters receive local `tools` separately from normalized `hostedTools`. Independent search is completed before adapter access and never enters either adapter argument.

### 3. Contracts

- Normalize and deduplicate names against the immutable server catalog. Local/provider tools check admin enablement, vendor allowlist, selected-model capability, and context. `web_search` checks Admin enablement and an independently supplied search service, not the selected model.
- Local function tools may enter `runRegisteredTool`; hosted tools may enter only the OpenAI, Anthropic, Gemini, or implemented Qwen hosted mapping.
- `web_search` enters `searchTools`, runs through `server/search/registry.mjs` before the main provider, and injects bounded context marked as untrusted external data with source URLs. Missing config or search failure prevents the main-model request.
- Generic OpenAI-compatible, Kimi, and DeepSeek adapters reject non-empty `hostedTools` even if a caller bypasses the main resolver.
- Metadata version 8 adds shipped hosted capabilities once to matching vendor/model defaults while preserving IDs, labels, default/enabled state, and later administrator capability removals.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown or disabled tool | HTTP 400 before provider access |
| Vendor or model capability mismatch | HTTP 400 before provider access |
| Context-required tool without context | HTTP 400 before provider access |
| Provider returns an unlisted local function call | Stop the loop; do not execute or start another provider round |
| Hosted tool passed to compatible/Kimi/DeepSeek adapter | Reject without a network request |
| Independent search config missing/malformed | HTTP 400 before search and main-provider access |
| GLM/Kimi search upstream failure | Redacted HTTP 502 before main-provider access |

### 5. Good/Base/Bad Cases

- Good: a generic OpenAI-compatible main model receives bounded GLM search context while its request has no hosted `web_search` tool payload.
- Base: omitted `allowedTools` produces no tool field.
- Bad: treating OpenAI-compatible syntax as proof of hosted-tool support or dispatching hosted tools locally.

### 6. Tests Required

- `scripts/provider-contracts.mjs` asserts exact hosted request shapes and negative adapter boundaries.
- `scripts/automation-contracts.mjs` asserts metadata ownership, pre-provider rejection, deduplication, independent search traces, and absence of hosted search payloads.
- `scripts/search-contracts.mjs` asserts GLM/Kimi request formats, response bounds, source filtering, loop limits, key redaction, and prompt-injection boundary markers.
- `tests/e2e/automation-workspace.spec.ts` asserts Chat, Agent, and Workflow UI compatibility behavior.

### 7. Wrong vs Correct

```js
// Wrong: every enabled tool is sent to both paths.
requestChatCompletion({ tools: enabledTools, hostedTools: enabledTools });

// Correct: the resolver produces disjoint execution sets.
const { localTools, searchTools, hostedTools, unavailable } = resolveRequestedTools(input);
if (unavailable.length) throw httpError(400, formatUnavailable(unavailable));
```

## Chat Reasoning And Multi-Image Contract

### 1. Scope / Trigger

- Trigger: any change to `ChatStreamPayload`, `/api/chat/stream`, `streamProviderReply`, `requestChatCompletion`, a provider adapter, or Chat image attachment handling.
- The browser owns semantic reasoning intent and its session-only image selection limit. The server owns request normalization, the six-attachment hard cap, image validation, and provider-specific protocol fields.

### 2. Signatures

```ts
type ReasoningEffort = "default" | "off" | "low" | "medium" | "high" | "xhigh";

type ChatStreamPayload = {
  reasoningEffort?: ReasoningEffort;
  attachments?: ChatAttachment[];
};
```

```text
POST /api/chat/stream
```

The browser-only `maxImageAttachments` setting accepts `1 | 2 | 4 | 6`, defaults to `4`, and remains in the dedicated Chat `sessionStorage` record. It is not an API authorization or server configuration field.

### 3. Contracts

- Normalize `reasoningEffort` through the server allowlist. `default` means omit every provider reasoning field so the selected model keeps its native default.
- Provider adapters map semantic intent locally: OpenAI Responses uses `reasoning.effort`; Claude uses `thinking` plus `output_config.effort`; Gemini uses model-generation thinking config; Kimi, DeepSeek, Qwen, and generic compatible adapters use only their declared compatible fields.
- Explicit reasoning must remove incompatible sampling fields where an adapter documents fixed or mutually exclusive sampling. Do not return, store, or render hidden provider reasoning text.
- The Chat UI may accept multiple images and keep a per-session total, but `sanitizeChatAttachments` remains authoritative: it slices at six and preserves the existing MIME, data-URL, and 4 MB-per-image validation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing, non-string, or unknown reasoning value | Normalize to `default`; adapters omit reasoning fields |
| Explicit reasoning on a vendor with fewer levels | Map to the nearest documented active mode; never invent an undocumented field |
| Generic compatible endpoint receives explicit reasoning | Send only `reasoning_effort`; do not inherit OpenAI Responses syntax |
| More than six attachments | Server accepts at most the first six valid values |
| Invalid MIME, malformed data URL, or image over 4 MB | Reject under the existing Chat attachment validation boundary |
| Client lowers its image selection limit | Browser trims pending attachments before send; server cap remains unchanged |

### 5. Good/Base/Bad Cases

- Good: a Chat request with `reasoningEffort: "xhigh"` reaches its adapter as the documented vendor shape while a `default` request sends no provider reasoning field.
- Base: a user selects four images in the browser, then sends them through the normal Chat request with no server-side storage of the browser preference.
- Bad: exposing `thinkingBudget` or `enable_thinking` in React state, trusting a client image-limit setting as a security boundary, or persisting hidden chain-of-thought output in a `Message`.

### 6. Tests Required

- `scripts/provider-contracts.mjs`: assert all six semantic values for OpenAI, Claude, Gemini 3/2.5, Kimi, DeepSeek, Qwen, and generic compatible adapters, including default omission and sampling pruning.
- `scripts/chat-local-contracts.mjs`: assert the shared payload, server allowlist, six-image cap, multi-file input, and confirmation path remain present.
- `tests/e2e/chat-settings.spec.ts`: assert keyboard menu behavior, request payload value, clear confirmation/cancel, sessionStorage persistence, multi-image append/overflow/removal, and final attachment count.
- `tests/e2e/mobile-layout.spec.ts`: assert Chat controls remain touch-safe and document width stays bounded.

### 7. Wrong vs Correct

```js
// Wrong: frontend decides a vendor protocol and makes default behavior explicit.
streamChat({ reasoning: { effort: "medium" }, thinkingBudget: 4096 });

// Correct: frontend sends semantic intent; the selected adapter owns the protocol.
streamChat({ reasoningEffort: "medium" });
adapter.completeText({ reasoningEffort: "medium", model, messages });
```

```js
// Wrong: a UI preference becomes the only attachment guard.
attachments = selectedFiles.slice(0, maxImageAttachments);

// Correct: the browser improves UX and the server remains authoritative.
attachments = pendingAttachments.slice(0, maxImageAttachments);
const sanitized = sanitizeChatAttachments(req.body.attachments, modelEntry).slice(0, 6);
```

## Model Chat Endpoint Protocol Contract

- `ModelCatalogEntry.endpointProtocol` is the sole chat endpoint selector. Supported values are `openai-chat`, `openai-responses`, `anthropic-messages`, and `gemini-generate-content`.
- `vendor` continues to own display grouping, capability metadata, media implementations, and Kimi/DeepSeek/Qwen parameter normalization. It must not silently override the selected chat protocol.
- `createProviderAdapter()` composes a vendor adapter with a protocol chat adapter and replaces only `streamChat` and `completeText`. Image, audio, video, transcription, and embedding methods remain vendor-owned.
- Legacy records normalize to Responses for OpenAI, Messages for Anthropic, generateContent for Gemini, and Chat Completions for Kimi, DeepSeek, Qwen, BotCF, and OpenAI-compatible vendors.
- `providerUrl()` must produce `/v1beta/models/{model}:generateContent` for Gemini-native model actions and `/v1/...` for the other supported protocols, replacing an incompatible trailing version on the managed base URL.
- Provider contracts must cover exact paths, request shapes, authentication headers, Kimi Chat normalization, OpenAI Chat/Responses switching, and a media call after a chat-protocol override.

## Scenario: DeepSeek Responses Compatibility

### 1. Scope / Trigger

- Trigger: any change to DeepSeek catalog presets, `createDeepSeekResponsesAdapter`, shared Responses tool rounds, or a DeepSeek model configured with `endpointProtocol: "openai-responses"`.
- DeepSeek Responses reuses the existing `openai-responses` protocol value; vendor-specific behavior belongs in the DeepSeek wrapper, not a duplicate endpoint enum.

### 2. Signatures

```text
POST {managedUpstream}/v1/responses
Authorization: Bearer <session-only API Key>
{ model, input, instructions?, reasoning?, max_output_tokens?, tools?, stream? }
```

```js
createOpenAIAdapter(provider, { normalizeResponseBody, statelessResponses })
createDeepSeekResponsesAdapter(provider)
```

### 3. Contracts

- The shipped `deepseek-v4-flash` preset selects `openai-responses`; `deepseek-v4-pro` remains `openai-chat` until the official documentation reports Responses support.
- DeepSeek Responses is stateless. Never depend on `previous_response_id`, `conversation`, or server-side storage. Every function-call round resends the original input, prior response output items, and matching `function_call_output` items.
- Project system instructions use top-level `instructions` and are not duplicated as a leading `developer` input item. Function tools omit OpenAI-only `strict` metadata.
- Semantic reasoning maps to `reasoning.effort`: `off -> none`, while `low`, `medium`, `high`, and `xhigh` retain their names. Explicit reasoning omits ineffective sampling fields; output limits use `max_output_tokens`.
- Streaming consumes `response.output_text.delta` and terminates through the documented Responses event family. No `[DONE]` marker is required.
- DeepSeek image/file input remains unsupported and must fail the model `vision` capability check before an upstream request. Independent GLM/Kimi search remains separate; do not infer DeepSeek hosted-search availability from the Responses endpoint.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| DeepSeek model selects `openai-chat` | Preserve the existing Chat Completions body and reasoning normalization |
| DeepSeek model selects `openai-responses` | Route to `/v1/responses` through the stateless DeepSeek wrapper |
| DeepSeek Responses receives an image part without `vision` | Reject before upstream access |
| Function call requires another round | Resend full input/output transcript; omit `previous_response_id` |
| Provider emits `response.failed` | Return a bounded provider error; never report successful completion |
| Existing administrator record selects Chat | Preserve the explicit record; do not silently migrate it |

### 5. Good/Base/Bad Cases

- Good: `deepseek-v4-flash` sends `instructions`, user input, `reasoning.effort`, and `max_output_tokens` to `/v1/responses`; a tool round resends the full transcript and returns final text.
- Base: an existing DeepSeek model remains on `/v1/chat/completions` and keeps the compatible Chat request fields.
- Bad: adding a `deepseek-responses` enum, switching every DeepSeek model by vendor, sending only a `function_call_output` after an ignored `previous_response_id`, or enabling hosted search as a side effect.

### 6. Tests Required

- `scripts/provider-contracts.mjs`: exact endpoint/body/auth, prompt projection, reasoning/output limits, stateless tool round, streaming deltas/usage, and Chat Completions non-regression.
- `scripts/feature-audit.mjs`: fresh server and Admin presets select Responses only for `deepseek-v4-flash`, and the registry uses the DeepSeek wrapper.
- `npm run check`, `npm run privacy`, `npm run test:server`, and `npm run build` remain green.

### 7. Wrong vs Correct

```js
// Wrong: DeepSeek ignores this ID, so the follow-up loses the tool context.
input = functionOutputs;
previous_response_id = response.id;

// Correct: DeepSeek receives the complete stateless Responses transcript.
input = [...previousInput, ...response.output, ...functionOutputs];
delete body.previous_response_id;
```

## Scenario: Administrator Model Vendor Registry

### 1. Scope / Trigger

- Trigger: any change to `ModelVendorEntry`, `ModelCatalogEntry.vendorId`, Admin model-vendor routes, metadata import/restore, registry normalization, or public model projection.
- A model vendor is an administrator-managed display/grouping entity. Its `adapter` is the existing trusted runtime provider kind; it is not a custom protocol or credential container.

### 2. Signatures

```ts
type ModelVendorEntry = {
  id: string;
  label: string;
  adapter: ProviderKind;
  enabled: boolean;
  order: number;
};

type ModelCatalogEntry = {
  order: number;
  vendorId: string;
  vendor: ProviderKind;
  vendorLabel: string;
  // existing model fields
};
```

```text
POST   /api/admin/model-vendors       { label, adapter } -> 201 ModelVendorEntry
DELETE /api/admin/model-vendors/:id                      -> 204
POST   /api/admin/model-catalog       { vendorId, ... }  -> 201 ModelCatalogEntry
PUT    /api/admin/model-catalog/:id   { vendorId, ... }  -> 200 ModelCatalogEntry
PATCH  /api/admin/model-catalog/order { modelIds }       -> 200 ModelCatalogEntry[]
```

### 3. Contracts

- `vendorId` owns grouping and administrator display identity. `vendor` owns runtime adapter dispatch. On every model create/update, resolve `vendor` from the referenced vendor entry and ignore a client-supplied conflicting adapter.
- Public model projection retains `vendorId`, resolved `vendorLabel`, and trusted `vendor`; disabled models remain excluded.
- Versioned normalization maps legacy models without `vendorId` to their default provider vendor. Metadata import and backup restore reconcile vendors before models so custom labels and adapter mappings survive round trips.
- Catalog deduplication is scoped by `vendorId + model`, allowing two display vendors backed by the same adapter to expose the same upstream model name.
- Duplicate IDs must advance an independent suffix until an unused value is found. Never derive the next candidate solely from a fixed collection size inside the loop.
- `order` is the global display and capability-fallback priority. Legacy catalogs backfill it from source position, normalized catalogs compact it to consecutive integers, and new models append instead of silently becoming the first default.
- Reorder is one atomic full-list mutation. Validate exact length, unique non-empty IDs, and complete membership before changing `db.modelCatalog`; persist and audit only after the complete request passes.
- The `openai-compatible` vendor/adapter remains available for administrator-created real models, but generic shipped placeholders such as `compatible-chat` and `compatible-video` are not default catalog entries or Admin presets. Versioned metadata migration removes those reserved IDs only.
- An explicitly supplied empty `modelCatalog` is a valid administrator state and must remain empty through normalization, restart, import, and restore; fallback defaults apply only when catalog data is omitted or when a legacy migration explicitly requires them.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Empty vendor label or unsupported adapter | HTTP 400; no metadata write |
| Case-insensitive duplicate vendor label | HTTP 409 |
| Missing vendor on model create/update | HTTP 400 before catalog mutation |
| Client `vendor` conflicts with selected vendor `adapter` | Ignore the client adapter; persist the trusted adapter |
| Delete unknown vendor | HTTP 404 |
| Delete the final remaining vendor | HTTP 409 |
| Delete a vendor that still owns models | HTTP 409; never cascade-delete models |
| Explicit empty model catalog | Preserve an empty catalog; do not silently recreate shipped defaults |
| Import/restore removes the selected model | Select the first surviving model, or create an unsaved draft under the first vendor when no models survive |
| Reorder omits, duplicates, or invents a model ID | HTTP 400; preserve the complete previous catalog order |

### 5. Good/Base/Bad Cases

- Good: an administrator creates a Qwen-backed display vendor, receives its server-normalized ID, adds a model with that `vendorId`, and the public catalog shows the custom label while runtime requests use the Qwen adapter.
- Base: legacy metadata contains only `vendor: "openai"`; normalization assigns `vendorId: "openai"` and preserves request behavior.
- Bad: matching a newly created vendor by submitted label after the server truncates it, trusting a submitted model `vendor`, or deleting a populated vendor and orphaning its models.

### 6. Tests Required

- `tests/server/model-registry.test.mjs`: default vendors, legacy migration, model-order backfill/compaction, custom label projection, adapter enforcement, vendor-scoped deduplication, and occupied duplicate-ID suffix progression.
- Admin route tests: create, atomic reorder validation, duplicate label, unsupported adapter, forged model adapter, populated/final vendor delete protection, metadata import/export, and restart persistence.
- `tests/e2e/admin-shell.spec.ts`: returned vendor becomes active without reload, model draft keeps the returned `vendorId`, model ordering persists and drives compatible defaults, populated delete is disabled, empty delete requires confirmation, and desktop/mobile layouts remain contained.

### 7. Wrong vs Correct

```js
// Wrong: display selection silently controls runtime behavior from client input.
const entry = { ...req.body, vendor: req.body.vendor };

// Correct: the server owns the adapter boundary.
const vendor = db.modelVendors.find((item) => item.id === req.body.vendorId);
if (!vendor) throw httpError(400, "Model vendor does not exist");
const entry = sanitizeModelEntry({ ...req.body, vendor: vendor.adapter });
```

```ts
// Wrong: server normalization can make this lookup fail.
const created = vendors.find((item) => item.label === submittedLabel);

// Correct: activate the exact response entity.
const created = await api.createModelVendor(payload);
setActiveVendorId(created.id);
```

## Assistant Catalog And Prompt Projection

- `server/data/assistant-catalog.mjs` owns shipped assistant IDs, seven-category metadata, semantic avatar allowlisting, structured system prompts, and versioned default backfill. A metadata migration may append missing shipped records once, but matching administrator-edited and custom records remain authoritative.
- Assistant-bound Chat sends only the exact `assistantId`; neutral Chat omits the field. `server/index.mjs` resolves non-empty IDs and owns prompt composition. Never accept a browser-supplied replacement system prompt for a catalog assistant.
- Project the resolved system prompt in the protocol-native field: OpenAI Chat `messages[0].role = "system"`, OpenAI Responses `instructions`, Anthropic top-level `system`, and Gemini `systemInstruction.parts`.
- Responses requests retain `instructions` on every tool round. Non-OpenAI providers configured for the Responses protocol additionally receive a `developer` input projection as a bounded compatibility fallback; official OpenAI requests do not duplicate that fallback.
- Required regression gates: `tests/server/defaults.test.mjs`, `scripts/provider-contracts.mjs`, and the assistant Chat request in `scripts/automation-contracts.mjs`.
