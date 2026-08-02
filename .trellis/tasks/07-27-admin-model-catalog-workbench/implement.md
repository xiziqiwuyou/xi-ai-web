# Implementation Plan

1. Extend `AdminModelsSection` with grouped vendor and preset derivations plus a vendor-scoped `onCreate` prop.
2. Replace the stacked JSX with vendor rail, model list, and inspector markup while preserving all detail form controls and callbacks.
3. Update `AdminConsole` to create drafts from a requested vendor using the existing default endpoint helper.
4. Replace obsolete model-preset/dropdown styles with scoped workbench styles and responsive breakpoints.
5. Extend the E2E fixture and Admin spec to verify vendor scoped preset workflow and post-save reload.
6. Update the feature audit for the new workbench source contract.
7. Run typecheck, contracts, Admin E2E, build, runtime UI, smoke, visual screenshots, and diff check.
8. Hide the chat endpoint selector for media-only models, project the actual vendor media route, and widen the model destination for wide Admin viewports.
9. Add image-model endpoint and 1920px width regressions, then rerun the focused quality gate.
10. Replace the global 980px Admin bottleneck and model-only `:has()` exception with one shared 1680px content boundary.
11. Audit all 16 Admin destinations at 1920px and mobile, adjust low-density form grids, and add an all-destination width regression.
12. Add the `ModelVendorEntry` contract, default vendors, legacy `vendorId` migration, catalog reconciliation, and metadata import/export support without changing runtime adapter behavior.
13. Add Admin model-vendor create/delete endpoints with duplicate-name, supported-adapter, non-empty-vendor, and last-vendor protection.
14. Replace the vendor rail footer model action with an inline “新增模型厂商” editor and guarded delete control; keep model creation exclusively in the middle column.
15. Bind model drafts and presets to `vendorId` while deriving the existing `vendor` and endpoint protocol from the selected vendor adapter.
16. Restyle capability/default groups and detail actions to the reviewed flat blue-white layout, then verify desktop/tablet/mobile containment.
17. Extend fixtures, E2E, static contracts, migration/import coverage, and run the complete quality gate.
18. Add normalized `ModelCatalogEntry.order`, source-order migration, deterministic reconciliation, and append-at-end creation behavior.
19. Add atomic `PATCH /api/admin/model-catalog/order` validation, persistence, audit logging, and restart/import/export tests.
20. Add atomic model ordering with drag and explicit move controls; the later direct-list refinement replaces the original dialog presentation.
21. Make all model capability filters sort by `order`, make the first compatible model the catalog default, and retain valid browser `lastModelId` as an explicit user override.
22. Remove the conflicting Admin default-purpose controls while retaining `defaultFor` as legacy round-trip metadata.
23. Add desktop/mobile E2E for reorder persistence and picker/default behavior, then run typecheck, server tests, Admin E2E, UI/feature contracts, build, real-browser smoke, and `git diff --check`.

## Model ordering verification

- `npm run check`: passed.
- `npm run build`: passed.
- `npm run test:server`: 16 passed.
- `npm run feature-audit`: passed.
- `npm run ui-contract`: passed.
- Admin E2E: 43 passed, 1 skipped across 1440, 1280, 390, and 375 viewports.
- Focused mobile model-order E2E: 2 passed across 390 and 375 viewports.
- `git diff --check`: passed; only existing line-ending conversion warnings remain.

## Vendor row height follow-up

- The desktop vendor column keeps its original horizontal track, while vendor rows grow to roughly `62px` so their vertical rhythm matches model rows.
- The six-row vendor scroller grows with the rows; tablet and mobile multi-column limits continue to expose no more than six items before internal scrolling.
- Successful vendor reordering no longer emits a global success notice; inline errors and screen-reader position announcements remain available.
- Admin E2E asserts the desktop row-height relationship and the absence of the removed success notice.
- Follow-up verification: TypeScript and production build passed; Admin E2E passed with 47 tests and 1 intentional skip across all four viewports.

## Vendor reorder runtime and list-style follow-up

- Remove the rendered vendor position announcement entirely so no `已移至第 N 位` text can leak through an overridden utility class.
- Align configured model rows with vendor rows: `62px` minimum height, `4px` list gap, matching radius, hover tint, active tint, and selected text emphasis.
- Restart the stale local Node process and verify the live vendor-order endpoint returns a contract/auth response rather than `API route not found`.
- Live verification after restart: `PATCH /api/admin/model-vendors/order` returned HTTP 200 with the current complete vendor order.

## Direct model-list ordering follow-up

36. Replace the global model-order dialog with direct current-vendor row drag and mobile/keyboard move controls.
37. Project a vendor-local move back into the complete global catalog ID order before calling the existing atomic endpoint.
38. Give vendor and model columns the same heading/scroller/footer frame; move model create/delete into the model footer and leave save in the inspector.
39. Remove success/position notices, retain inline failure rollback, update static contracts, and verify desktop/mobile persistence and public defaults.

## Direct model-list ordering verification

- TypeScript, UI contract, feature audit, and production build: passed.
- Admin E2E: 47 passed, 1 skipped across 1440, 1280, 390, and 375 viewports.
- Direct model-order E2E verifies desktop drag, mobile move controls, immediate atomic persistence, reload retention, and the public default-model projection.
- Browser geometry check confirms both list-column footers share one bottom edge, first configured model row is 67px high, and document overflow is zero at 1440px.
- `http://localhost:8787/admin`: HTTP 200 with the React root document.

## Desktop viewport-height follow-up

40. Mark the active Admin destination explicitly so the model page can use a viewport-bound desktop layout without `:has()` or affecting other sections.
41. Remove outer model-page scrolling above `1100px`, compact vertical whitespace, and let the workbench fill the remaining height while preserving internal vendor/model scrolling.
42. Rebalance the two list columns and capability grid at narrow desktop widths so all labels and the Save action remain visible without reducing the body type scale.
43. Add geometry regressions for `1280x800`, `1440x900`, and `2048x955`, then rerun the complete Admin E2E matrix and production checks.

### Desktop viewport-height verification

- TypeScript, UI contract, feature audit, production build, and clean-data runtime UI checks passed.
- Admin E2E passed with 47 tests and 1 intentional skip across desktop and mobile projects.
- The focused model test asserts no outer Admin scrolling plus visible workbench, list footers, and Save action at `1280x800`, `1440x900`, and `2048x955`.
- Mobile keeps its existing document flow, internal six-row scrollers, and 44px touch controls.

## Capability-toggle follow-up

44. Replace equal-width capability check rows with individual `aria-pressed` rounded toggle buttons so every capability label stays readable and buttons wrap to available space.
45. Keep the existing capability save payload shape unchanged; only the control presentation and accessibility state change.
46. Add Admin E2E coverage for all capability controls, readable labels, rounded wrapping layout, and an on/off round trip before saving.

### Capability-toggle verification

- TypeScript, UI contract, and feature audit checks passed.
- Focused Admin model E2E passed at `1440x900`, `1280x800`, `390x844`, and `375x812`.

## Streaming ownership follow-up

47. Remove `streaming` from `ModelCapability`, Admin capability controls, shipped model presets, workspace import allowlists, and vendor capability hints.
48. Make server catalog normalization strip legacy `streaming` values and ensure default/public model catalogs never return the removed field.
49. Retain Chat Session Settings `streamOutput`, SSE transport, and message streaming status as isolated Chat runtime concerns.
50. Add server migration, Admin absence, Chat setting presence, provider contract, and feature-audit coverage.

### Streaming ownership verification

- TypeScript, server tests, provider contracts, and feature audit passed.
- Server normalization converts legacy `["chat", "streaming"]` model capabilities to `["chat"]`.
- Admin exposes 14 model capability toggles with no Streaming control; Chat Session Settings retains the independent Streaming Output switch.

## Density refinement implementation

24. Remove duplicate model-section title, normal validation status, public capability preview, detail vendor selector, and mapping preview; retain issue-only feedback.
25. Move model ordering into the model-list heading and wrap configured/draft/preset rows in one eight-row scrolling owner.
26. Replace the large capability fieldset with a compact responsive checkbox group.
27. Update Admin E2E for the simplified ownership path, bounded list geometry, compact capabilities, and correct vendor payload.
28. Run typecheck, build, Admin E2E, UI/feature contracts, server tests, and `git diff --check`.

## Density refinement verification

- TypeScript and production build: passed.
- Server tests: 16 passed.
- Admin E2E: 43 passed, 1 skipped across 1440, 1280, 390, and 375 viewports.
- Focused density/vendor tests: 8 passed across all four viewports.
- Capability label containment is asserted at every Admin viewport.
- Feature audit and UI contract: passed.
- `git diff --check`: passed; only existing line-ending conversion warnings remain.

## Vendor order and scroll implementation

29. Add atomic vendor-order validation, persistence, audit logging, and metadata round-trip coverage.
30. Add the typed Admin vendor-order API and parent-owned bootstrap update callback.
31. Add in-list vendor drag/move controls with accessible announcements and failure rollback.
32. Widen the desktop vendor rail and constrain both vendor/model lists to six-row scroll regions.
33. Add shared scroll-active state with stable-width, shallow-color 7px thumbs and fade-out behavior.
34. Extend Admin E2E and server tests for vendor ordering, six-row bounds, scrollbar geometry/visibility, and responsive containment.
35. Run typecheck, build, server tests, Admin E2E, feature/UI contracts, runtime smoke, and `git diff --check`.

## Vendor order and scroll verification

- TypeScript and production build: passed after the final vendor-selection synchronization fix.
- Server tests: 16 passed, including atomic vendor reorder persistence and invalid-order rejection.
- Admin E2E: 47 passed, 1 skipped across 1440, 1280, 390, and 375 viewports.
- Vendor reorder E2E verifies desktop drag, mobile move controls, one complete-ID request, and reload persistence.
- Six-row vendor/model bounds, stable 7px scrollbar geometry, scroll-active fade state, unchanged row width, and responsive containment are asserted in Chromium.
- Feature audit and UI contract: passed.
- `http://localhost:8787/admin`: HTTP 200 with the React root document.
- Trellis context validation: passed.
- `git diff --check`: passed; only existing line-ending conversion warnings remain.

## Admin shell design-system implementation

51. Add `.trellis/spec/frontend/admin-console-design.md` and link it from the frontend spec index.
52. Reorder `adminNavigationGroups` into five operator-oriented groups, add group icons, and preserve every existing destination ID.
53. Make desktop group expansion accordion-like and derive the page breadcrumb from the active navigation group.
54. Update `AdminNavigation` markup for icon, label, destination count, chevron, and stable active semantics.
55. Replace the nested Admin shell surface with one navigation panel plus an unframed content canvas; compact the utility header and page header.
56. Align navigation rows, page panels, form controls, and model workbench surfaces with the Admin design specification without changing data/API ownership.
57. Extend Admin E2E and static contracts for group order, single expansion, no English eyebrow, all-destination reachability, stable geometry, and model-workbench preservation.
58. Run TypeScript, focused Admin E2E, UI/feature contracts, build, live desktop/mobile visual inspection, smoke, and `git diff --check`.

### Admin shell design-system verification

- TypeScript, feature audit, UI contract, production build, isolated runtime UI, isolated smoke, and isolated production release checks passed.
- Admin E2E passed with 47 tests and 1 intentional skip across `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Knowledge Admin and Langflow navigation regressions passed with 20 tests across all four viewports.
- Live desktop inspection confirmed a `232px` sidebar, one expanded group, an unframed content canvas, and a viewport-contained model workbench.
- Live mobile inspection confirmed the sticky grouped picker, hidden sidebar, 44px controls, one scroll owner, and no horizontal overflow at `390x844`.
- The existing local operational menu configuration was not mutated; isolated data directories were used for default runtime and smoke checks.

## Admin navigation card-grid implementation

59. Record 2026 menu, progressive-disclosure, card, and Bento research plus the Figma baseline and redesign frame.
60. Add explicit expanded-group and destination icon-well markup without changing navigation state ownership.
61. Widen the desktop sidebar, remove external child indentation, and implement full-width single-column destination cards.
62. Apply restrained Bento spans to the operations summary while preserving all content and actions.
63. Update static and Playwright contracts for shared parent/child boundaries, two-column geometry, stable target size, no shadow, and no overflow.
64. Run TypeScript, feature/UI contracts, focused Admin/Knowledge/Langflow E2E, build, live desktop/mobile visual inspection, smoke, and `git diff --check`.

### Admin navigation card-grid verification

- Figma baseline capture and final 1440x900 redesign were created in file `9L4qtWR33FEwLMZUqC9slS`; final frame is `4:3`.
- TypeScript, feature audit, UI contract, and production build passed.
- Admin E2E passed with 47 tests and 1 intentional skip using one worker across 1440, 1280, 390, and 375 viewports.
- Knowledge Admin and Langflow regressions passed with 20 tests across all four viewports.
- Isolated runtime UI and smoke checks passed on port 8790 without mutating the live operational menu configuration.
- Live 1440 and 1280 screenshots confirmed shared parent/child boundaries, rounded destination cards, no card shadows, and no horizontal overflow.

## Single-column navigation and invocation statistics implementation

65. Replace the expanded destination grid with one full-width card per row and update geometry contracts.
66. Add a bounded, compacting `model-usage.jsonl` store that writes only allowlisted non-sensitive fields.
67. Track real response completion for chat, generation, agent/workflow, media, knowledge, and embedding provider calls.
68. Extend `AdminOpsPayload` with model-level calls, latest time, average duration, and total duration.
69. Render responsive desktop rows and mobile statistic cards with a truthful empty state.
70. Update unit, server, Admin E2E, static contracts, Figma, build, runtime, smoke, and diff checks.

### Single-column navigation and invocation statistics verification

- TypeScript, feature audit, UI contract, privacy scan, production build, Trellis context validation, and `git diff --check` passed.
- Server tests passed with 21 tests. Dedicated usage tests prove one-event response completion, secret omission, aggregation math, current catalog label projection, malformed-line tolerance, and non-fatal read/write failures.
- Admin E2E passed with 47 tests and 1 intentional skip across `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Isolated runtime UI and smoke checks passed on port `8790` with a temporary `DATA_DIR`; the live operational menu configuration was not changed.
- The live server was restarted on `http://localhost:8787` with PID `34892`. Health returned `ok: true`, and the authenticated Admin operations payload returned an empty `modelInvocations` array before any real model call, matching the truthful empty-state contract.
- Live smoke was intentionally replaced by the isolated smoke gate because the existing operational menu configuration disables `agents` and `workflows`; testing did not rewrite that user-managed configuration.
