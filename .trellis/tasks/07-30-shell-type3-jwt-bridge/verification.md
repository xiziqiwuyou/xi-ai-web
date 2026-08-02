# Verification

Verified on 2026-07-30 against the current local service at `http://localhost:8787`.

## Root Cause

The listener on port 8787 was an older Node process. It returned `404` for `POST /api/public/shell-token/exchange`, so the new frontend handoff could never complete. Restarting the server with the current `server/index.mjs` changed the route result to the expected bounded `400` for malformed input.

## Evidence

- `npm run check`: passed.
- `npm run test:server`: 26 passed.
- `npm run privacy`: passed.
- `npm run ui-contract`: passed.
- `npm run build`: passed; existing chunk-size warning only.
- `git diff --check`: passed; existing line-ending warnings only.
- `npx playwright test tests/e2e/byok-modal.spec.ts --project=desktop-1440 --workers=1` against port 8787: 5 passed.
- Focused Shell handoff E2E: valid exchange, failure fallback, and malformed-token rejection all passed; the success route was called exactly once.
- In-app browser malformed handoff: the token was removed from the URL, navigation canonicalized to `/chat`, and the existing Key dialog displayed the bounded error.
- Live route probe: valid JSON with a short token and malformed JSON both returned `400` with `Cache-Control: no-store, max-age=0` and `Pragma: no-cache`.

## Runtime

The local development service was restarted from the current workspace and is listening on port 8787.
