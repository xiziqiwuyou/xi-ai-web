# Remote MCP Execution Implementation Plan

## P0 - Contract And Boundary Review

- [x] Add the execution task as the next child of the LobeChat clean-room
      roadmap and keep the parent planning until this child is accepted.
- [x] Freeze approval state, argument/result bounds, execution switch, and
      provider follow-up behavior in contracts before implementation.
- [x] Decide whether process-local approval state is acceptable for the current
      single-instance deployment; do not silently claim multi-instance support.

## P1 - Server Transport And Approval

- [x] Implement bounded JSON-RPC `tools/call` using the existing MCP transport
      and SSRF/DNS/cancellation guards.
- [x] Add single-use, session-bound, expiring approval records with safe error
      projections and no persistent secrets/output.
- [x] Add Admin allowlist controls for profile execution and individual tools,
      defaulting every new execution permission to off.

## P2 - Chat Integration

- [x] Add explicit MCP tool selection and approval events to the existing Chat
      tool resolver without changing local tools or search state.
- [x] Resume function/prompt provider rounds only after successful approval and
      a bounded untrusted result projection.
- [x] Preserve abort, stop, retry, streaming, mobile layout, keyboard focus,
      and dark-mode behavior.

## P3 - Adversarial Verification

- [x] Cover forged selectors/endpoints/schemas, replay, wrong-session,
      expiration, cancel, disconnect, disable, rate-limit, timeout, oversized
      arguments/results, prompt injection, and redaction.
- [x] Add Admin and Chat desktop/mobile E2E with zero-network assertions for
      denied paths and exactly-one-call assertions for approved paths.
- [x] Run check, privacy, feature/provider/tool contracts, security/server,
      focused E2E, build, release-check, and diff hygiene.

## P4 - Release Decision

- [x] Classify MCP execution as disabled/operator-only until an operator
      completes a real public HTTPS MCP smoke test.
- [x] Do not publish a version until the approval protocol and rollback path
      are verified.

## P0-P4 Release Hardening Pass

- [x] P0: isolate runtime UI and browser E2E servers from existing ports/data,
      remove Vite source imports from storage tests, and make Windows cleanup
      deterministic.
- [x] P1: pass Admin, approval, and user-connection Playwright coverage twice
      across all four standard viewports.
- [x] P2: extend the conditional live smoke to optional discovery plus one
      explicitly selected harmless call without printing arguments or output.
      Record an explicit skip when `MCP_LIVE_ENDPOINT` is absent.
- [x] P3: document protocol exclusions, single-instance/15-minute runtime
      limits, Admin gates, operator smoke, and no-migration rollback.
- [x] P4: prepare the v0.0.13 metadata, Compose pins, release notes, full QA,
      and release classification without committing, tagging, or publishing.

## Rollback Points

- After P0: planning-only, no runtime behavior.
- After P1: retain discovery and return `MCP_EXECUTION_NOT_AVAILABLE` until
      Chat approval tests are green.
- After P2: disable the execution setting globally to restore v0.0.12 behavior.
