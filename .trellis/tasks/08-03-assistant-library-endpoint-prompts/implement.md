# Assistant library expansion and endpoint prompt delivery implementation

## Phase 1 - Contracts And Tests

- [x] Add avatar-key normalization tests and Provider prompt serialization assertions before behavior changes.
- [x] Update default-catalog tests for count, category coverage, prompt structure, avatar uniqueness and fresh timestamps.
- [x] Add migration regression for version-12 metadata preserving edited/custom assistants.

## Phase 2 - Catalog And Migration

- [x] Extract and expand the curated assistant catalog to 30 entries.
- [x] Add `avatar` to Assistant normalization, Admin request handling and public/admin bootstrap records.
- [x] Bump metadata version and implement the version-13 default backfill.

## Phase 3 - Endpoint Prompt Delivery

- [x] Keep Chat/Anthropic/Gemini native projections unchanged and make their tests exact.
- [x] Reapply Responses instructions on every tool round.
- [x] Add the bounded non-OpenAI Responses developer-input compatibility projection.

## Phase 4 - UI And Avatar Integration

- [x] Add shared `AssistantAvatar` and semantic icon catalog.
- [x] Refine assistant categories, counts, card density and detail presentation.
- [x] Use the bound assistant avatar in Chat session/message rendering with the current preset as fallback.
- [x] Add the Admin avatar selector.

## Phase 5 - Verification

```powershell
npm.cmd run check
npm.cmd run provider-contracts
npm.cmd run automation-contracts
npm.cmd run ui-contract
npm.cmd run feature-audit
npm.cmd run test:server
npm.cmd run build
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8788'
npm.cmd exec -- playwright test tests/e2e/assistant-library.spec.ts --workers=1
npm.cmd exec -- playwright test tests/e2e/module-shell.spec.ts --grep "Assistants" --workers=1
git diff --check
```

## Risk And Rollback Points

- Catalog migration: preserve matching records and add an isolated version-12 regression before bumping metadata.
- Responses compatibility: keep official OpenAI `instructions`; scope developer fallback to non-OpenAI provider kinds.
- Avatar rollout: optional field plus fallback prevents broken imported/custom records.
- Dirty worktree: edit only assistant, provider contract, shared type, owning UI/style and focused test/spec surfaces; preserve unrelated changes.

## Verification Result

- `npm.cmd run check`, Provider/automation/UI/feature contracts, full server tests, privacy scan and production build passed.
- Focused Assistant Library, Admin avatar and desktop geometry Playwright checks passed at 1440, 1280, 390 and 375 viewports (`10 passed`, `2 expected mobile skips`).
- Real 30-assistant preview at 1440 and 390 had no document-width overflow; card/detail screenshots were reviewed.
