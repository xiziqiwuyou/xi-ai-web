# OpenAI Relay Compatibility Implementation Plan

## P0 - Contract and Fixture Freeze

- [x] Add the relay profile types, normalization rules, and request/response
      examples to the task context.
- [x] Add mock relay fixtures for Chat Completions, SSE, image generation,
      image edit multipart, URL output, base64 output, OpenAI errors, HTML, and
      incomplete image batches.
- [x] Confirm that all existing native provider contract assertions remain the
      baseline before changing adapter dispatch.

## P1 - Catalog and Runtime Profile

- [x] Add `ModelRequestProfile` to `src/types.ts` and model draft state.
- [x] Normalize and preserve `requestProfile` in
      `server/registry/model-registry.mjs` and runtime provider construction.
- [x] Add `normalizeRequestProfile()` and relay defaults to
      `server/providers/types.mjs`.
- [x] Make `server/providers/registry.mjs` select the relay adapter before
      vendor-specific native dispatch.

## P2 - Relay Text Transport

- [x] Harden the OpenAI-compatible Chat body builder to omit undefined fields
      and keep the relay profile free of vendor-specific rewrites.
- [x] Verify plain text, multimodal messages, streaming, non-streaming,
      function tools, usage, cancellation, and redacted errors.
- [x] Keep hosted-tool rejection explicit and preserve current prompt-tool
      fallback behavior where the route already owns it.

## P3 - Relay Image Transport

- [x] Extend the compatible image adapter to support `/images/edits` multipart
      with bounded input files and optional masks.
- [x] Add relay-only image field projection using `response_format` and omit
      native-only output fields.
- [x] Reuse existing asset extraction, URL import, count supplementation,
      timing, timeout, and incomplete-result errors.

## P4 - Admin and Persistence

- [x] Add the profile selector and effective channel description to the Admin
      model editor.
- [x] Preserve the profile through metadata export/import, backup/restore, and
      model preset creation.
- [x] Add focused Admin E2E coverage for profile switching and persistence.

## P5 - Verification and Release Gate

- [x] Extend `scripts/provider-contracts.mjs` and add focused server tests for
      relay routing, image edit multipart, URL normalization, and redaction.
- [x] Run `npm run check`, `npm run build`, `npm run privacy`,
      `npm run provider-contracts`, `npm run test:server`,
      `npm run test:security`, `npm run test:frontend`, and
      `npm run release-check`.
- [x] Record any real new-api smoke gap explicitly; do not claim live relay
      acceptance without an operator-provided deployment and key.
- [x] Commit locally after all checks pass. Publishing, tagging, and pushing
      remain outside this task unless separately authorized.

## Validation note

The focused Admin E2E test is present but could not run in this environment:
Playwright Chromium was absent, and `playwright install chromium` failed because
the configured download returned truncated zero-byte ZIP responses. No live
new-api deployment or operator API Key was available for an upstream smoke test.

## Rollback Points

- After P1: profile exists but no model uses it; runtime behavior is unchanged.
- After P2: disable relay profile selection to restore native routing.
- After P3: disable relay image models while retaining native image adapters.
- After P4: revert only Admin profile choices; no persisted credential or
      browser migration is required.
