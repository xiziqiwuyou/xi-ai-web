# Implementation Plan

## P0 - Contracts And Task Boundary

- [x] Freeze local/server data ownership, no-auth transport, session binding,
      default-off policy, non-goals, and rollback.
- [x] Keep Admin profiles as system presets and create a separate anonymous-user
      policy switch.

## P1 - Browser-Local Profiles

- [x] Add dedicated IndexedDB persistence for remembered label/endpoint records.
- [x] Add session-only profile persistence and ensure credentials, approvals,
      results, and connection IDs are excluded.
- [x] Add bounded sanitizers and storage/privacy contract tests.

## P2 - Ephemeral Server Connections

- [x] Add a bounded process-local connection store with session binding, TTL,
      capacity, opaque IDs, and no persistence/logging.
- [x] Add CSRF-protected connect/disconnect routes with SSRF-safe discovery.
- [x] Add Admin/public policy projection and preserve import/restore boundaries.

## P3 - Chat Integration

- [x] Add a Chat MCP management popover for add/connect/disconnect/delete and
      system/user tool selection.
- [x] Resolve mixed preset/user tool IDs through the existing approval and
      provider follow-up path.
- [x] Preserve mobile layout, focus, abort, streaming, and dark mode.

## P4 - Adversarial Verification

- [x] Cover unsafe endpoints, wrong session/CSRF, expiry, disconnect, disable,
      forged IDs, zero/one calls, no persistence, no export/sync, and no header
      leakage.
- [x] Run complete QA and four-viewport Admin/Chat E2E.

## P5 - Operator Smoke And Release Decision

- [x] Add a conditional public HTTPS no-auth MCP smoke harness with explicit
      skip when no operator endpoint is configured.
- [x] Keep user connections disabled/operator-only until a real smoke succeeds;
      do not publish in this task.

## Verification Notes

- `npm run check`, `npm run build`, `npm run privacy`, all local contract
  scripts, `npm run release-check`, and `npm run test:server` pass.
- Server MCP suite: 131 passed; user connection focused route/store suite: 4
  passed.
- Admin, parent Chat approval, and user-local Chat E2E: 12 passed across the
  four standard desktop/mobile viewports.
- `npm run smoke:mcp-live` explicitly skipped because
  `MCP_LIVE_ENDPOINT` was not provided. No real public MCP endpoint was
  claimed or contacted. Both MCP policy switches remain false by default.
