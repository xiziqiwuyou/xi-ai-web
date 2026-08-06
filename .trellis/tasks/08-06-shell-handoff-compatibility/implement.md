# Implementation Plan

## P0 - Confirm the wire contract and runtime version

- Capture one actual `type: 3` generated destination with the token value redacted: scheme/host/path, hash/query, parameter names, and token presence/length.
- Record the protocol boundary: `type: 2` is ShellNext only; xi-ai-web must be configured as `type: 3`.
- Check the deployed `/api/health`, `/api/ready`, and `POST /api/public/shell-token/exchange` status without sending a real secret; confirm frontend static assets and backend route are from the same release.
- Confirm the administrator `UPSTREAM_BASE_URL` points to the Shell control plane that actually exposes the two expected endpoints.
- Confirmed on 2026-08-06: `api.xi-ai.cn/api/user/login/refresh` returns HTTP 200 with `success:false` because the administrator has disabled cross-domain JWT login. Treat this as the current production blocker, not as token expiry.
- Follow-up confirmed: the `v0.0.6` image workflow completed successfully and the live exchange route emits the new structured error envelope. A random bounded token is rejected upstream as invalid/expired, which is expected and is not evidence that the request format should be changed.
- Stop at this phase if the real type 3 URL does not contain the expected token; do not implement guessing or type 2 compatibility.

## P1 - Make failures diagnosable and safe

- Add stable error codes and request-id propagation to the exchange service/route without reflecting upstream bodies or secrets.
- Separate malformed local handoff, missing handoff, upstream 401/403, upstream 404/405, timeout, network/5xx, and missing default Key.
- Separately classify the confirmed `JWT cross-domain login is not enabled by the administrator` response as operator configuration error.
- Keep no-store, rate/concurrency guard, small body limit, timeout, redirect rejection, fixed upstream origin, and existing secret redaction.
- Add a safe operator-facing log line containing only request id, failure class, upstream status and endpoint class.

## P2 - Correct the verified type 3 exchange

- Preserve the canonical type 3 parser and exchange contract.
- Compare the real type 3 token with the expected Shell login token and verify the refresh/default-token endpoint, headers, response shape and configured upstream origin.
- If the real type 3 contract differs, correct the exchange service with a typed, documented adapter; do not add type 2 behavior.
- Reject direct long-lived API Keys in URL handoffs; retain manual BYOK as the fallback.

## P2.1 - Optional OneAPI/Next-Web settings compatibility

- Add an administrator-controlled, default-off `oneapi-settings` feature flag.
- Parse only `#/?settings=<JSON>` after the flag is enabled; validate bounded `settings.key`, discard all other settings, ignore `settings.url`, scrub the fragment, and store the Key through the existing session-only provider helper.
- Do not send the direct Key to `/api/public/shell-token/exchange`, server metadata, logs, exports, or analytics.
- Test raw and encoded JSON, malformed settings, disabled-feature rejection, URL cleanup, session-only storage, ignored malicious URL, manual replacement, and non-regression of Shell type 3.
- Document that this format works for OneAPI's per-user model-token links but cannot make Shell's `{{x_s_token}}` act as a model API Key.

## P3 - Harden browser initialization and retry behavior

- Make parsing and exchange idempotent across first load, strict-mode effects, hashchange, duplicate navigation, and mobile browsers.
- Preserve immediate URL scrubbing while holding the token only in memory until the request settles.
- Add a current-page retry for retryable upstream failures and a clear “regenerate external token” message for expired credentials.
- Preserve success auto-fill, session-only Key persistence, manual replacement and no modal flash on successful exchange.

## P4 - Add regression coverage

- Unit-test parser acceptance/rejection and type 2 adapter fixtures, with no raw token in errors.
- Server-test all failure classes, endpoint URLs, headers, timeout/abort, request-id, no-store, rate limiting and redaction.
- E2E-test successful handoff, expired handoff, missing/unsupported handoff, retry, refresh/duplicate initialization, mobile viewport and manual fallback.
- Add a deployment smoke assertion that an updated service responds to the exchange route instead of an old process returning 404.

## P5 - Live validation and release decision

- With a short-lived disposable external token, validate the real redirect and the real Shell control-plane responses.
- Record only timestamps, status classes, endpoint classes, release/version and request ids.
- Run focused tests, `npm run check`, `npm run build`, `npm run privacy`, `npm run ui-contract`, `npm run test:e2e -- tests/e2e/byok-modal.spec.ts`, and `git diff --check`.
- Release only if type 2 semantics are proven and the production deployment uses matching frontend/backend assets; otherwise ship diagnostics and retain the documented canonical type 3/manual flow.

## Risk gates

- Do not log or paste a live token into issue text, tests, screenshots, chat, or repository files.
- Do not accept caller-provided upstream URLs or bypass `upstream-security.mjs`.
- Do not store a handoff token in localStorage, IndexedDB, server JSON, audit logs, or analytics.
- Do not classify every 401/403 as “expired” when the upstream endpoint is missing or the deployed route is stale.
- Do not mix this task with the currently dirty synchronization-layout files.

## P2.1 execution evidence - 2026-08-06

- Implemented a separate `oneapi-settings` parser, state, cleanup entry, error taxonomy, and default-off Admin flag without changing Shell type-3 exchange behavior.
- Confirmed that `settings.url` causes no external browser request and cannot replace the administrator-managed upstream; direct Keys persist only in the existing session provider record.
- Added Admin UI warning and server protection that prevents metadata import and backup restore from changing the live flag.
- Passed `npm run check`, `npm run build`, `npm run privacy`, `npm run ui-contract`, full `npm run test:server` (81 tests), and focused desktop/mobile Playwright coverage (28 BYOK/handoff tests plus Admin toggle coverage).
- The broader task remains in progress because live validation with a real disposable Shell type-3 JWT is intentionally outside this direct-Key compatibility implementation.
