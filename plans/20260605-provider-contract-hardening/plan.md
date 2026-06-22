# Provider Contract Hardening Plan

Date: 2026-06-05

## Goal

Implement Phase 01 from the next roadmap: harden model provider adapters with offline contract tests for OpenAI, Claude, Gemini, and OpenAI-compatible endpoints.

## Scope

- Add a zero-dependency Node contract test script.
- Mock `fetch` and call provider adapters directly.
- Validate request URLs, headers, payload shapes, response parsing, tool-call loops, media paths, embeddings, STT/TTS, and video polling templates.
- Add the contract script to `package.json` and `npm run qa`.
- Add QA evidence and code review artifacts.

## Non-Goals

- No real external provider calls.
- No API key usage.
- No changes to public login/admin boundary.
- No dependency installation.
- No large adapter rewrite unless tests expose a clear bug.

## Implementation Steps

1. Add `scripts/provider-contracts.mjs`.
2. Cover OpenAI:
   - Responses API chat payload.
   - Vision content mapping.
   - Tool call round trip.
   - Image, TTS, STT, embedding.
3. Cover Claude:
   - Messages API payload.
   - Vision content mapping.
   - Tool call round trip.
   - Unsupported capability errors.
4. Cover Gemini:
   - GenerateContent payload.
   - Vision inline data.
   - Tool call/function response loop.
   - Image, TTS, STT, embedding.
5. Cover OpenAI-compatible:
   - Chat completions payload.
   - SSE streaming parser.
   - Tool call round trip.
   - Image, TTS, STT, embedding, video generation/status.
   - Read the fixture capability set from the shared OpenAI-compatible defaults, including `video`, so adapter contracts and provider capability metadata stay aligned.
6. Add script to `package.json`:
   - `provider-contracts`
   - include it in `qa`
7. Update README QA commands to include `provider-contracts`.
8. Run validation:
   - `npm run provider-contracts`
   - `npm run qa`
   - `npm run smoke`
   - `node --check` for touched scripts and providers.

## Acceptance Criteria

- Provider contract script passes without network or real credentials.
- `npm run qa` includes provider contracts and passes.
- Existing privacy smoke remains clean.
- Contract tests verify at least one request and response path per supported capability group.
- OpenAI-compatible video contract uses the shared default capability set and configured video endpoints.
- No public API key/base URL is persisted in backend data.
