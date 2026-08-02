# Implementation Plan

1. Run the existing type, provider, security, server, release, and focused browser checks to establish a baseline.
2. Trace Chat UI -> client API -> public route -> catalog -> provider adapter -> SSE response and verify every trust boundary.
3. Trace Image UI -> capability projection -> client API -> public route -> provider adapter -> result persistence and verify generation/edit behavior.
4. Rank verified findings as P0, P1, or P2. Implement only P0/P1 blockers within the defined scope.
5. Add focused regression tests before or with each behavior fix.
6. Re-run targeted checks, then the complete production gate and local health/request smoke tests.
7. Record the final readiness decision and any live-provider test gap.

## Completion Record

- Automated code, provider, security, server, release, UI contract, runtime, and desktop/mobile Playwright gates passed on 2026-08-02.
- `release-check` traversed the production Chat SSE and image-generation routes through a controlled local upstream and proved caller-provided URLs do not select the outbound destination.
- A real `api.xi-ai.cn` request was intentionally not run because no disposable API Key was supplied for this verification pass.
- Docker is unavailable in the current environment, so Compose and Dockerfile contracts were verified statically and through the production Node release check rather than `docker compose build`.
- Vite still reports large Chat-related chunks. This is a non-blocking follow-up performance item, not part of the P0 correctness boundary.

## Review Gates

- No real API Key or provider URL may be added to fixtures, environment examples, logs, or metadata.
- Provider payload fixes must be proven by request-shape tests.
- UI fixes must preserve the existing design and browser storage contracts.
- A successful build alone is not an上线 decision; security, request contracts, and production startup must also pass.
