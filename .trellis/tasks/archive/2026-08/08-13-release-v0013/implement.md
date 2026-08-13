# v0.0.13 Release Evidence

## P0 - Freeze And Review

- [x] Reviewed all changed and untracked paths; reports, local data, environment
      files, and generated assets remained ignored.
- [x] Ran focused secret scanning and security review.
- [x] Rejected credential-like MCP URL path state before persistence or I/O.
- [x] Added the MCP live smoke script to the production image.

## P1 - Commit And Verify

- [x] `6e53431 feat: add approved remote MCP execution`
- [x] `595dfb8 fix: stabilize Langflow workflow timestamps`
- [x] `7c5c4eb test: isolate browser verification runtime`
- [x] `21a8d35 release: prepare v0.0.13`
- [x] Committed snapshot passed full QA and 12/12 focused MCP E2E.

## P2 - Publish

- [x] Pushed `master` and annotated `v0.0.13` to GitHub.
- [x] Branch workflow `31679727203` completed successfully.
- [x] Tag workflow `31679765740` completed successfully.
- [x] GHCR multi-architecture manifest published as
      `sha256:06c7a21653ee3c74cbb60885ce1f07605dcb1c83beccb485b633c7d4d1dcd402`.

## P3-P4 - Deployment And Operator Boundary

- [x] Credential-free smoke passed against `https://chat.xi-api.cn`, which
      currently reports v0.0.12 and healthy SSE delivery.
- [x] Recorded that production has not yet been upgraded to v0.0.13.
- [x] `npm run smoke:mcp-live` explicitly skipped because no approved
      `MCP_LIVE_ENDPOINT` was configured.
- [x] Remote MCP execution and user-added services remain disabled by default.

## Rollback

Pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.12` and restart Compose. MCP-only
rollback requires disabling the user-connections switch and then global MCP
execution; no migration is required.
