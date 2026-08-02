# Quality Guidelines

> Required verification and review contracts for xi-ai-web frontend work.

## Required Commands

Run targeted checks while editing, then run the full gate before completion:

```powershell
npm run check
npm run qa
npm run test:e2e
npm run smoke
npm run release-check
git diff --check
```

`npm run smoke` expects a healthy server at `SMOKE_URL` or `http://localhost:8787`. `release-check` builds and starts its own isolated production server.

## Browser Test Contract

- Playwright uses deterministic route fixtures in `tests/e2e/support/app-fixture.ts`; never use real provider credentials.
- Required projects are `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Wait for `waitForPublicModule` before layout assertions. A correct shell title does not prove the lazy feature module has mounted.
- Mobile checks assert one visible vertical scroll owner, no document overflow, and `44px` navigation/sheet targets.
- BYOK tests assert `cherry-web-user-provider` is written only to `sessionStorage`, the required modal cannot dismiss early, desktop/mobile replacement controls reopen the same dialog, and the unmasked Key is absent from shell text and `localStorage` before and after replacement.
- Workspace tests use real Chromium IndexedDB and assert legacy cleanup after commit, exported-secret absence, digest/count validation, duplicate rejection, atomic replace, theme restore, and one visible dialog scroll owner.
- Command/workflow tests must assert `$` and `/` keyboard selection, Escape behavior, removable tags, one-shot app cleanup, the card catalog before canvas detail, and local template/knowledge output flowing into a later Agent request.
- Provider-tool tests must assert a tool-bearing Skill sends the exact deduplicated `allowedTools`, Chat's GLM/Kimi menu reuses the active BYOK connection on a model without `webSearch`/`toolCalling`, missing credentials fail before provider access, Agent-bound knowledge supplies context, and Workflow tool errors occur before any node reaches the provider.
- Session-settings tests must cover all eight category tabs, one visible panel, keyboard category navigation, desktop side-menu geometry, mobile horizontal overflow, readable dark-theme labels, sanitized sessionStorage restoration, structural Cancel/Save behavior, both send shortcuts, command-menu disablement, long-paste text attachments, formula/code rendering, and prompt/function request projection. Prompt-tool contracts must reject Markdown envelopes, unknown tools, malformed JSON, schema violations, provider-hosted tools, and calls beyond the bounded round limit.
- Agent tests must assert catalog-before-editor navigation, category/tag round trip, exact workflow references after deletion, and selected local knowledge reaching `contextChunks` plus request-scoped `knowledge_search`.
- Assistant tests must assert backend-driven categories, starter prompt draft behavior, exactly one new conversation, unchanged old conversations, visible bound identity, exact outbound `assistantId`, consumed launch storage, and fail-closed invalid IDs on desktop and mobile.
- Admin model tests must assert expandable group semantics, one mounted child section, grouped mobile destination values, independent display/request-name validation, short-label public rendering, stable outbound `modelId`, mapped provider `model` dispatch, direct current-vendor drag/move model ordering with atomic full-catalog persistence, vendor/model footer creation and guarded deletion, six-row bounded vendor/model scrollers, stable 7px idle/active scrollbar geometry, readable responsive capability labels, and the absence of duplicate vendor/mapping controls in the inspector.
- Public navigation tests assert canonical routes, Back/Forward behavior, server order, no `/admin` link, pointer/keyboard intent preloading without route mutation, a gated cold import, stable shell geometry while pending, reduced-motion behavior, failed-import rollback/retry, and last-request-wins rapid navigation.

Vite must ignore `**/reports/**`. Playwright writes traces and screenshots there; watching that directory reloads concurrent test pages and produces `ERR_ABORTED` or destroyed execution contexts.

## Visual Review

At minimum inspect Chat, Mind Map, one shared workbench, the API modal, and Admin at desktop and mobile widths.

Computed-style checks should find:

```text
visible operational/page gradient backgrounds: only `.figma-ppt-stages` and `.figma-map-canvas`
identity gradients: only approved `.figma-brand-mark`
visible backdrop-filter blur: only the scrim behind `.figma-session-settings` or `.figma-agent-dialog`
document width <= viewport width + 1px
mobile visible scroll owners: 1
```

A screenshot update is not proof by itself. Confirm navigation placement, sticky actions, long text, dialogs, and empty states visually.

## Cloud Knowledge Workspace And Migration Contract

### 1. Scope / Trigger

- Trigger: changes to `src/features/knowledge-cloud/`, the standalone `/knowledge` route, session-only embedding connections, direct COS upload, or local IndexedDB migration.
- This workspace is authenticated only by the knowledge account. It must not introduce public-site login state or persist provider credentials.

### 2. Signatures

```ts
KnowledgeCloudPortal // auth/recovery boundary
KnowledgeCloudWorkspace // catalog, documents, indexing, migration
createKnowledgeUploadGrant(baseId, fileMetadata)
runLocalKnowledgeMigration(options)
```

Browser storage: knowledge Embedding connections use `sessionStorage`; local source documents and migration checkpoints use the existing IndexedDB workspace stores.

### 3. Contracts

- Signed-out states own login, registration, recovery, and one-time recovery-code acknowledgement. Signed-in state mounts the independent cloud workspace.
- Catalog and detail views expose create/edit/archive/delete, effective capacity, document status, upload queue, model profile, and index/reindex progress.
- Browser bytes go directly to the exact signed COS PUT URL. Upload completion means parsing was queued, never that the document is searchable.
- Status copy distinguishes upload, parsing, waiting for Key, embedding, ready, OCR required, failure, and deletion. Only `ready` documents are described as searchable.
- OpenAI/Qwen URL/Key values are scoped to the current browser session and cleared on knowledge logout. They never enter IndexedDB, exports, URL parameters, or backend settings.
- Local migration previews count/bytes, persists resumable checkpoints, and keeps every local source after upload/index failure. Local deletion is enabled only after all corresponding cloud documents are ready and the user explicitly confirms it.
- A failed local migration checkpoint remains failed even when a previous direct-upload grant left a cloud document in `pending_upload`. Refreshing cloud documents must not downgrade the local item back to uploading/processing; a user-initiated retry may clear the stale cloud ID and request a fresh upload grant.
- Desktop and mobile layouts must have no horizontal overflow, one visible scroll owner, keyboard-reachable controls, and bounded status/filename text.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| No knowledge session | Show auth UI; do not call catalog endpoints |
| Upload succeeds but parsing/indexing is pending | Keep a non-searchable queued status |
| Matching profile connection missing | Show waiting-Key state and continue-index action |
| Reindex lacks headroom | Preserve active model/index and show the server error |
| Migration upload/index failure | Preserve local document and checkpoint |
| Migration retry sees an old `pending_upload` cloud document | Keep the failed checkpoint visible until the user clicks retry; retry clears the stale cloud ID and starts a fresh upload |
| Logout | Clear cloud selections and embedding connections; preserve unrelated public workspace data |

### 5. Good/Base/Bad Cases

- Good: a local document uploads, parses, resumes embedding after reload, becomes ready, and only then offers explicit local deletion.
- Base: a user logs in on another device, sees cloud metadata, supplies a session-only compatible Key, and resumes pending indexing.
- Bad: marking COS PUT success as ready, auto-deleting IndexedDB after upload, merging an upload grant credential into a persisted document record, or replacing a failed local migration checkpoint with an old `pending_upload` projection during refresh.

### 6. Tests Required

- `knowledge-auth.spec.ts`: registration/recovery acknowledgement, session restore, logout, and no Web Storage secrets.
- `knowledge-embedding.spec.ts`: session-only OpenAI/Qwen connections and resumable indexing.
- `knowledge-workspace.spec.ts`: create/upload/index/reindex, capacity/status UI, migration checkpoint retention, explicit local deletion gate, and four viewport overflow checks.
- Migration failure E2E must assert the IndexedDB source remains, the migration checkpoint remains `failed`, the delete-local action stays hidden, and the UI does not regress to "processing" after catalog/document refresh.
- `npm run privacy`, `npm run check`, and production build remain mandatory after workspace changes.

### 7. Wrong vs Correct

```ts
// Wrong: COS upload completion deletes the local source and marks cloud search ready.
await upload(file);
await deleteKnowledgeDocument(localId);
setStatus("ready");

// Correct: preserve local data until server parsing and embedding both reach ready.
await upload(file);
saveMigrationCheckpoint({ localId, cloudDocumentId, state: "uploaded" });
if (cloudDocument.status === "ready" && userConfirmedDelete) {
  await deleteKnowledgeDocument(localId);
}

// Wrong: an old pending upload overwrites the user's visible failed checkpoint.
const stage = cloudStatusMigrationStage(cloudDocument.status);
saveMigrationCheckpoint({ localId, cloudDocumentId, state: stage });

// Correct: preserve failure until the user explicitly retries.
if (current.state === "failed" && stage === "uploading") {
  return current;
}
saveMigrationCheckpoint({ localId, cloudDocumentId, state: stage });
```

## Forbidden Patterns

- No `any`, suppressed TypeScript errors, debug logging, or ignored failed promises in changed code.
- No API Key or Shell handoff JWT persistence in backend files, `localStorage`, query strings, logs, analytics, IndexedDB, or workspace exports.
- No public Admin entry. `/admin` is address-only and isolated from public bootstrap.
- No fake tabs, project-authored explanatory copy absent from Figma, nested styling cards, persistent glass effects, or gradients outside `.figma-brand-mark`, `.figma-ppt-stages`, and `.figma-map-canvas`.
- No direct feature writes to localStorage for conversations, gallery, knowledge, media jobs, agent data, memories, or backup state; theme localStorage is only a first-paint mirror of the IndexedDB preference.
- No silent fallback from an explicit missing/disabled Assistant ID to another assistant, in either Chat or the server runtime.
- Do not accept duplicate upstream message IDs as React keys. The stream receiver must deconflict only locally while keeping the provider response semantics intact.
- No broad Vite watch over generated reports, `dist`, data, dependencies, or VCS metadata.
- No prompt-only search claims, generic OpenAI-compatible inheritance of OpenAI hosted tools, provider-hosted tools in the local dispatcher, or `web_search` in the selected model adapter's hosted-tool payload.

## Review Checklist

- Behavior and API/storage formats remain compatible.
- Visible/disabled menu state and order still come from bootstrap data.
- Direct load, refresh, invalid-route fallback, and Back/Forward work.
- Dialog focus, inert background, Escape policy, focus restoration, and sole scroll ownership work.
- Mobile grid rows and safe-area padding are explicit.
- Desktop `.figma-sidebar` is `224px` at `1024px`, `1280x800`, and `1440x900`; its eight-item navigation scrolls independently when height is constrained. `.figma-mobile-header` replaces it below `1024px` and the open menu exposes eight `44px` destinations in one vertical column.
- Figma hero emphasis text must preserve both visual phrase grouping and the exact accessible heading name; assert computed `white-space: nowrap` and query the heading by its full name.
- The public navigation order remains the eight bootstrap destinations; `Skill` stays Chat-local, retired labels and public Admin links remain absent, and the only persistent credential action is the masked session-Key replacement control outside destination navigation.
- Chat viewport tests cover `1440x900`, `1280x800`, and `2048x1030`: the expanded composer and generation note remain at least `12px` inside the viewport while message history keeps `overflow-y: auto`. Mobile tests at `390x844` and `375x812` scroll the composer into view, assert safe-area-aware controls padding, one public-workspace scroll owner, and no horizontal overflow.
- The required BYOK dialog exposes only Key, visibility, and save controls while retaining the shared dialog and session-only storage contracts. Shell type-3 E2E must cover successful exchange, failure fallback, malformed-token rejection, URL scrubbing, one request under StrictMode, and absence from persistent storage.
- All changed accessible names match tests and visible intent.
- Dark typography checks cover Chinese fallback stacks, a `10px` metadata floor, filled-primary text contrast, and the absence of compounded opacity on selected navigation copy.
- Range-control checks inspect computed border, padding, shadow, desktop/mobile hit-area geometry, stable accessible names, visible progress, and a single focus treatment; source-token assertions alone cannot catch legacy cascade leakage.
- Model-menu checks cover enabled capability filtering, current-value descriptions, selected-option focus restoration, popover containment, in-flight selection locking, and the exact selected `modelId` in generated PPT, Mind Map, and Translation requests.
- Auto-hiding scrollbar checks verify transparent idle and visible scroll-active states, debounce back to idle, and unchanged list/row widths across both states.
- `qa`, E2E, smoke, release check, and `git diff --check` pass with fresh output.
- Workflow visual review checks the catalog card grid, the detail back action, fixed Start/Reply anchors, enabled/disabled local knowledge node state, and no horizontal overflow at mobile width.
