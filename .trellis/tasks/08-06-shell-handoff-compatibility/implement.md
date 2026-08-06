# Implementation Plan

## P0 - Confirm the wire contract and runtime version

- Capture one actual `type: 3` generated destination with the token value redacted: scheme/host/path, hash/query, parameter names, and token presence/length.
- Record the protocol boundary: `type: 2` is ShellNext only; xi-ai-web must be configured as `type: 3`.
- Check the deployed `/api/health`, `/api/ready`, and `POST /api/public/shell-token/exchange` status without sending a real secret; confirm frontend static assets and backend route are from the same release.
- Confirm the administrator `UPSTREAM_BASE_URL` points to the Shell control plane that actually exposes the two expected endpoints.
- Confirmed on 2026-08-06: `api.xi-ai.cn/api/user/login/refresh` returns HTTP 200 with `success:false` because the administrator has disabled cross-domain JWT login. Treat this as the current production blocker, not as token expiry.
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
