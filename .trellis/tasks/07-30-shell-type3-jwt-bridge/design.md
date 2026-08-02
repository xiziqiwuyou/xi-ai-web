# Design

## External Contract

ShellAPI generates `type: 3` destinations as `/#/jwt_auth?x_s_token=<X-S-Token>`. The value is a Shell login JWT, not a model API Key. Shell's own client sends it to `/api/user/login/refresh`, stores the refreshed JWT, then reads `/api/token/default` to obtain the user's initial model token.

## Browser Boundary

`parseShellJwtHandoff()` parses only `/jwt_auth` and validates a bounded opaque token. `clearShellJwtHandoffUrl()` immediately calls `history.replaceState` without the Hash. `App` holds the JWT only in one-shot state while `api.exchangeShellJwt()` is pending. The normal required API dialog is gated by this pending state.

Success updates the existing `UserProviderConfig.apiKey`; the normal effect persists that sanitized object to sessionStorage. Failure clears the one-shot ref, records a public error message, and opens the existing required dialog.

## Server Boundary

`POST /api/public/shell-token/exchange` accepts `{ token }` only. It uses the origin of `db.settings.upstreamBaseUrl`, never request-provided routing data. The exchange service:

1. POSTs `{}` to `/api/user/login/refresh` with `X-S-Token`.
2. Requires a successful bounded JSON response and selects its refreshed JWT when provided.
3. GETs `/api/token/default` with the refreshed `X-S-Token`.
4. Requires `data.key`, prefixes `sk-` when absent, and returns `{ apiKey }`.

Both requests reject redirects and share the request abort signal. Errors expose only stable local messages and status classes.

## Security

- JWT maximum: 8 KiB; model Key maximum: 4 KiB.
- No response-body reflection, token logging, persistence, or query-string transport.
- Small route-specific JSON parser, IP rate/concurrency guard, upstream timeout, and no-store headers.
- The configured upstream has already passed the project's SSRF boundary; only its origin is used for Shell control-plane endpoints.

## Verification

- Pure server tests mock refresh/default-token responses and assert headers, URLs, redirect mode, prefixing, abort propagation, and redaction.
- E2E covers successful Hash consumption, failure fallback, sessionStorage-only persistence, no modal flash, and token removal from URL/page text.
