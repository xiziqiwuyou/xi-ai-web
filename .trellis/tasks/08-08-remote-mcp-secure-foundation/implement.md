# Implementation Plan

## P0 - Contracts And Security Core

- [x] Add shared MCP profile/projection types and bounded normalization.
- [x] Add endpoint validation, DNS/private-address checks, closed error codes,
      and request/response limits.
- [x] Add pure tests for credentials in URLs, unsafe schemes/ports, duplicate
      IDs/names, oversized schemas, and legacy missing collections.

## P1 - Server Discovery Boundary

- [x] Add normalized `mcpServers` metadata loading, import/export, and Admin
      CRUD routes.
- [x] Implement one-shot JSON-RPC initialize/tools-list discovery with timeout,
      redirect rejection, body limits, cancellation, and rate limiting.
- [x] Return untrusted descriptors only; ensure no tool execution route exists.

## P2 - Admin Surface

- [x] Add the MCP connection destination under the existing Admin AI group.
- [x] Add bounded create/edit/enable/delete controls and explicit Discover
      action with safe status/error copy.
- [x] Keep endpoint details Admin-only and preserve shared dialog/layout rules.

## P3 - Regression And Privacy Coverage

- [x] Add server tests for SSRF, DNS rebinding, protocol errors, rate limits,
      cancellation, redaction, and execution denial.
- [x] Add Admin desktop/mobile E2E and static privacy/type contracts.
- [x] Verify existing Chat, tools, provider, metadata import, and public
      bootstrap behavior remains unchanged.

## P4 - Finish Gate

- [x] Run check, server tests, focused E2E, UI contract, privacy, feature audit,
      build, diff check, and task validation.
- [x] Update backend/frontend specs; commit, archive, and journal remain in the
      Trellis finish gate.

## Rollback Points

- After P0: retain pure contracts/security helpers only.
- After P1: remove discovery routes and metadata collection without touching
      existing tool execution.
- After P2: remove the Admin surface while retaining no persisted secrets.
