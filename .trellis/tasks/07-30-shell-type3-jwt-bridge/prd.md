# Shell Type 3 JWT Bridge

## Goal

Accept the external ShellAPI `type: 3` link contract, validate its short-lived `x_s_token` against the administrator-configured upstream, and place the account's default model API Key into the current browser session without exposing or persisting either secret outside the required request boundary.

## Requirements

- Recognize only the exact Hash route `#/jwt_auth?x_s_token=...` on public pages.
- Remove the JWT from the address bar before bootstrap or provider UI renders.
- Never treat the Shell JWT itself as a model API Key.
- Exchange the JWT through a rate-limited same-origin endpoint that talks only to the configured upstream origin.
- Validate the JWT through ShellAPI refresh, then request the account default token with the refreshed JWT.
- Return only the normalized `sk-...` default API Key with `Cache-Control: no-store`.
- Keep JWT and resulting Key out of logs, backend metadata, localStorage, URLs, public bootstrap, errors, and analytics.
- Save the resulting Key only through the existing `cherry-web-user-provider` sessionStorage helper.
- Suppress the required manual API dialog while exchange is pending.
- On exchange failure, open the existing required dialog with a readable inline error and an empty Key field.
- Preserve manual Key entry and mid-session replacement behavior.

## Acceptance Criteria

- [x] A valid type-3 link exchanges exactly once and lands on `/chat` with no Hash or token in the URL.
- [x] Successful exchange fills sessionStorage with the returned normalized API Key and does not open the required modal.
- [x] The JWT is absent from rendered text, localStorage, backend data, logs, and returned errors.
- [x] Invalid, missing, oversized, or malformed tokens never call the upstream and fall back to the required modal.
- [x] Upstream login/default-token failures return bounded generic errors without upstream secrets.
- [x] The exchange route uses the admin-managed upstream origin, rejects redirects, has a small JSON limit, timeout, rate limit, and no-store response headers.
- [x] Existing manual BYOK and Key replacement tests remain green.
- [x] TypeScript, server tests, privacy scan, UI contracts, focused E2E, build, and `git diff --check` pass.

## Non-goals

- Persisting Shell login state or creating a local user account.
- Copying Shell cookies, user profiles, quota data, or JWTs into browser storage.
- Accepting a caller-provided upstream URL.
- Supporting NextChat or Shell type-2 settings links in this task.
