# Implementation Plan

## Delivery Rules

- Execute stages in order; do not combine Chat, Admin, and shared-workbench changes in one review.
- Preserve API/storage contracts and `src/styles.css` import order in every stage.
- Add behavior tests before or with the first markup change for that behavior.
- Do not delete legacy CSS unless its selector is proven unused by source search and rendered regression checks.
- Each stage ends with `npm run check` plus its targeted tests; shared stages also capture screenshots.

## Stage 0 - Regression Harness and Current-Build Evidence

**Owned files:** `package.json`, lockfile, `playwright.config.ts`, `tests/e2e/**`, screenshot/report fixtures only.

- Add `@playwright/test` as a dev dependency and Chromium projects for `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Build deterministic public/admin API fixtures; never use real API keys or provider calls.
- Lock menu order/IDs, storage round-trips, existing module workflows, API modal required gating, and representative admin operations.
- Capture current-build evidence for all six modules, API modal, admin login, and admin console. Treat blank research captures as non-visual evidence only.

**Gate:** `npm run check`, existing `npm run qa`, and the new browser smoke suite pass before visual edits.

## Stage 1 - Foundations and Overlay Contracts

**Owned files:** `src/styles/rednote-flat-v2.tokens.css`, minimal shared overlay/UI components, `src/styles/rednote-flat-v2.modal.css`, related browser tests.

- Apply the approved tokens, small radii, flat elevation, focus ring, and desktop/touch control sizes.
- Add reusable modal/sheet focus management and confirmation dialog behavior.
- Add compact empty/status primitives only where multiple modules use them.
- Do not restructure feature modules yet.

**Gate:** focus, Escape, inert-background, restoration, reduced-motion, and destructive-dialog tests pass; all-module screenshots show no unintended token regression.

## Stage 2 - Public Routes, Shell, and Navigation

**Owned files:** `src/App.tsx`, `src/app/AppShell.tsx`, `src/app/TopBar.tsx`, new route/mobile-navigation helpers, `rednote-flat-v2.shell.css`, relevant responsive rules and tests.

- Implement canonical public route mapping with History API and `popstate`.
- Preserve bootstrap default selection and server menu source/order.
- Implement compact desktop navigation and mobile bottom navigation/More sheet.
- Update module/admin document titles; keep `/admin` isolated and absent from public navigation.
- Establish the shell-level mobile scroll-owner and safe-area contract.

**Gate:** direct load, refresh, invalid path, disabled/hidden fallback, Back/Forward, title, menu order, mobile More, and no-overflow tests pass at all viewports.

## Stage 3 - Shared Workbench and Drawing

**Owned files:** `src/components/workbench/**`, `src/features/generation/GenerationModule.tsx`, shared asset presentation as needed, `rednote-flat-v2.workbench.css`, scoped responsive rules and tests.

- Flatten workbench panels, remove the static fake tab strip, and use dividers instead of nested cards.
- Preserve model, connection, prompt, options, submit, result, and error contracts.
- Implement Drawing inspector/preview/recent layout and mobile Input/Preview/History views.
- Keep gallery insertion, output options, generated asset display, and local history unchanged.

**Gate:** Drawing plus Mind Map/Agents/Apps shared-component smoke tests pass; Drawing screenshots pass at all four viewports.

## Stage 4 - Chat

**Owned files:** `src/features/chat/ChatModule.tsx` and adjacent extracted chat components, `rednote-flat-v2.chat.css`, chat tests.

- Recompose rail, compact header, message area, overflow actions, starter prompts, attachment tray, and sticky composer.
- Preserve streaming, retry/edit/fork, import/export/share/summarize, attachments, speech, conversation storage limits, and request cancellation.
- Add conversation deletion confirmation or guaranteed Undo.
- Mobile conversation list becomes a focus-managed full-height sheet.

**Gate:** existing `npm run chat-local-contracts`, rendered chat behavior tests, keyboard tests, long-content scroll tests, and four-viewport screenshots pass.

## Stage 5 - Mind Map

**Owned files:** `src/features/mindmap/MindmapModule.tsx`, shared workbench/CSS only where required, mind-map tests.

- Implement canvas-first layout, compact toolbar, and in-place Visual/Source switching.
- Move mobile prompt/settings to a sheet without changing prompt, parsing, editing, zoom, or export behavior.

**Gate:** empty/generating/result/source/parse-error tests and screenshots pass; no nested mobile vertical scroller is introduced.

## Stage 6 - Agents

**Owned files:** `src/features/agents/AgentsModule.tsx`, trace presentation components/CSS, agent tests.

- Convert tools to compact permission rows and results to one run timeline.
- Preserve role/model/prompt/tool payloads, trace expansion, failure, cancellation, and final result behavior.

**Gate:** ready/running/tool/completed/failed tests and screenshots pass at all viewports.

## Stage 7 - Apps

**Owned files:** `src/features/apps/AppsModule.tsx`, app-specific workbench/CSS, app tests.

- Implement searchable market plus desktop runner pane and mobile routed detail/runner.
- Preserve app source data, category/search behavior, selected app, model/input request, and result state.
- Use pressed filters rather than invalid tab semantics; only real Setup/Result views use segmented semantics.

**Gate:** search/filter/select/run/result/empty-search tests, one-scroll-owner tests, and screenshots pass.

## Stage 8 - Gallery and API Connection Modal

**Owned files:** `src/features/gallery/GalleryModule.tsx`, shared asset components, `src/features/settings/ApiConnectionModal.tsx`, modal/gallery CSS and tests.

- Implement flat Gallery toolbar/grid, selection toolbar, desktop inspector, and mobile detail sheet.
- Preserve favorites, filters, exports, replay handoff, local storage format/cap, and source-module navigation.
- Add confirmation for batch delete/Clear All and confirmation or guaranteed Undo for single delete.
- Move the API modal onto the shared focus contract while preserving readiness and session-only behavior.

**Gate:** gallery round-trip/replay/export/delete tests, BYOK storage tests, required/optional modal tests, and screenshots pass.

## Stage 9 - Admin Shell and Content Hierarchy

**Owned files:** `src/features/admin/AdminPortal.tsx`, `AdminConsole.tsx` and adjacent section components, `rednote-flat-v2.admin.css`, admin tests.

- Implement compact login, authenticated header, grouped navigation, and readable single-column content hierarchy.
- Keep every current operation and API method; extraction is mechanical and section-scoped.
- Add accessible names to entity pickers/add buttons and confirmations for restore and entity deletion.
- Mobile admin uses one scroll owner and compact navigation without exposing admin publicly.

**Gate:** login/loading/error, section navigation, representative saves, import/export, backup restore, audit, logout, delete confirmations, and four-viewport screenshots pass.

## Stage 10 - Responsive, Accessibility, and Final Visual Gate

**Owned files:** `rednote-flat-v2.responsive.css`, targeted scoped files/tests, approved screenshot snapshots. Legacy files are read-only unless proof supports one selector deletion.

- Test all scoped screens at the four required viewports, keyboard-only, reduced motion, long Chinese text, and software-keyboard-sensitive layouts.
- Assert exactly one visible mobile vertical scroll owner, no document horizontal overflow, `44x44px` mobile targets, safe-area clearance, and unobscured sticky actions.
- Assert accessible names/labels, valid segmented/filter semantics, modal focus behavior, and destructive safety.
- Inspect rendered computed styles for gradients/backdrop blur and DOM for styling-only panel/card nesting.
- Review and approve final screenshots; do not blindly update snapshots.

**Final commands:**

```bash
npm run check
npm run build
npm run qa
npm run smoke
npm run release-check
npx playwright test
```

## Review and Rollback

- Commit/review one stage at a time. A failed shared-stage gate blocks downstream module work.
- Revert the current stage only; no stage requires a data migration or server rollback.
- If a source-contract script depends on changed markup, replace brittle source-string assertions with equivalent semantic/browser coverage in the same stage.
- If a legacy selector cannot be proven unused, leave it in place and document the residual cascade risk rather than deleting it.
