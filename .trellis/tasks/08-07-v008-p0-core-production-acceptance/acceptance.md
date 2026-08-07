# P0 Acceptance Record

## Baseline

- Repository baseline: `master` at `6d3aa6c`, immutable tag `v0.0.8`.
- The task does not overwrite or republish `v0.0.8`.
- OneAPI settings, Shell type-3 JWT, and manual session-only BYOK boundaries remain unchanged.

## Implemented

- Health and Admin operations now project the application version from `package.json` through `server/app-version.mjs`; the unrelated hard-coded `0.3.0` value is removed.
- `/api/diagnostics/sse` provides a rate-limited, fixed two-event stream for reverse-proxy buffering checks without accepting input or contacting a provider.
- `npm run smoke` performs a credential-free deployment check: application/Admin shell, health, readiness, version, bootstrap privacy, core Chat/Image catalog coverage, retired conversation route, and incremental SSE.
- `npm run smoke:live` performs explicit environment-gated Chat non-streaming, Chat streaming, image generation, and optional image editing checks.
- Live smoke output contains no prompt, provider text, image URL, request body, source-image path, or API Key. Generated image success requires detected in-memory PNG/JPEG/WebP bytes.
- The runtime Docker image includes only the smoke scripts required for operator checks.

## Local-contract evidence

- `npm run check`: passed.
- `npm run build`: passed.
- `npm run privacy`: passed.
- `npm run ui-contract`: passed.
- `npm run feature-audit`: passed.
- `npm run provider-contracts`: passed.
- `npm run chat-local-contracts`: passed.
- `npm run workspace-storage-contracts`: passed.
- `npm run automation-contracts`: passed.
- `npm run search-contracts`: passed.
- `npm run prompt-tool-contracts`: passed.
- `npm run test:security`: 11 passed.
- `npm run test:server`: 88 passed.
- `npm run test:langflow`: 17 passed.
- `npm run test:knowledge`: 153 passed.
- `npm run ui-runtime`: passed.
- `npm run release-check`: passed against the controlled local upstream.
- Local credential-free production smoke: passed as `0.0.8`; first SSE event 27 ms, event separation 403 ms, 26 Chat models and 18 Image models available.
- `git diff --check`: passed; only checkout line-ending warnings were emitted.

## Browser-contract evidence

- Focused Playwright run: `byok-modal.spec.ts`, `chat-visual.spec.ts`, and `module-shell.spec.ts` on `desktop-1440` and `mobile-390`.
- Result: 103 passed, 21 conditional skips, 0 failed.
- Covered manual BYOK, raw/encoded OneAPI settings, Shell normal/appended JWT, malformed handoffs, Chat stream following, Image generation/edit/import/preview, and desktop/mobile containment.

## Online evidence

- `https://chat.xi-api.cn` currently returns health version `0.3.0`, not repository release `0.0.8`.
- Re-running the credential-free smoke with expected version `0.3.0` reaches `/api/diagnostics/sse` and receives `404`, proving the online instance still uses the pre-task build.
- The current source cannot be considered deployed until it is published under a new immutable version and the online smoke passes without an expected-version override.

## Open operational gates

- `live-api`: not run because no new disposable provider Key was supplied. Previously exposed conversation Keys were deliberately not reused.
- `online-smoke`: blocked on publishing and deploying a new immutable release; do not overwrite `v0.0.8`.
- `docker-build`: not run locally because Docker CLI is unavailable on this workstation. `release-check` statically verifies the runtime smoke files and production hardening declarations.
- Physical iOS Safari and Android Chrome remain outside this focused P0 run; Chromium touch/mobile contracts passed.

## Completion decision

P0 implementation is complete locally. Production acceptance remains open until a new release is deployed and both of these gates pass:

1. `SMOKE_URL=https://chat.xi-api.cn npm run smoke`
2. `npm run smoke:live` with a disposable Key plus explicit Chat/Image model IDs

No P1 feature work should be mixed into the release that carries these P0 changes.
