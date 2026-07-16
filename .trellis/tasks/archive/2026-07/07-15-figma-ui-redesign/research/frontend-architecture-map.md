# Frontend Architecture Map

## Scope and planning status

This document maps the current frontend implementation surface for the Figma UI redesign task. It is based on the checked-in React, CSS, browser-storage, PWA, and validation code.

The task is still in planning and the task PRD contains placeholders (`.trellis/tasks/07-15-figma-ui-redesign/prd.md:1`). No Figma frame URL, exported assets, target viewport list, or component-state specification is present in the task directory yet. Those inputs are required before implementation boundaries can be finalized, but the existing code boundaries are clear enough to identify the likely change surface and regression risks.

## Executive summary

- The app is a Vite/React 19 single-page application with one root render entry (`src/main.tsx:1-15`).
- There is no React Router and no global state library. `src/App.tsx` branches on `window.location.pathname` for `/admin` and otherwise keeps navigation as an in-memory `activeModule` value (`src/App.tsx:43-52`, `src/App.tsx:140-145`).
- Public feature navigation is server-driven. The server bootstrap returns six ordered menu items; `TopBar` renders the received array directly (`server/index.mjs:53-60`, `server/index.mjs:1212-1221`, `src/app/TopBar.tsx:19-40`).
- Public feature modules are lazy-loaded through a single prop-heavy `ModuleRouter` (`src/app/ModuleRouter.tsx:17-45`).
- Image, mind map, agents, and apps share `WorkbenchLayout`; chat and gallery use independent layouts (`src/components/workbench/WorkbenchLayout.tsx:15-45`).
- Root-owned state is limited to bootstrap data, active module, BYOK connection, API modal state, and gallery items (`src/App.tsx:46-52`). Most drafts, selections, result state, and busy/error state live inside feature modules and are lost when the module unmounts.
- CSS is global and import-order-driven: 15 legacy files are loaded before seven `rednote-flat-v2` override files (`src/styles.css:1-22`). This is the largest implementation risk for a pixel-focused redesign.
- Existing frontend checks are primarily source-string contracts and API/runtime smoke checks, not browser-rendered component, visual regression, or interaction tests (`scripts/ui-contract.mjs:27-75`, `scripts/ui-runtime.mjs:100-120`).

## Entry points and route boundary

### Browser entry

- `index.html` mounts a single `#root` and loads `/src/main.tsx`.
- `src/main.tsx:6-10` renders `<App />` under `StrictMode` and imports the single global stylesheet entry at `src/main.tsx:4`.
- Production registers `/sw.js` after `load` (`src/main.tsx:12-15`).

### Application route split

- `src/App.tsx:44-45` normalizes the pathname and recognizes only exact `/admin` as the admin route.
- `/admin` lazy-loads `src/features/admin/AdminPortal.tsx` (`src/App.tsx:23`, `src/App.tsx:140-145`).
- Every other pathname renders the public application. Module selection is not represented in the URL, history, query string, or hash.
- Consequence for redesign: changing tabs/modules does not produce shareable URLs and browser Back/Forward does not restore module state. A Figma design that implies routed sections would require an explicit routing/state decision, not only visual changes.

## Public shell and navigation

### Shell ownership

- `src/app/AppShell.tsx:20-34` owns the page shell, skip link, `TopBar`, and constrained workspace canvas.
- `src/app/TopBar.tsx:11-42` contains the brand and horizontal module navigation. It has no search, profile menu, secondary command bar, or separate mobile navigation component.
- Menu item labels and icons are resolved through `src/app/moduleRegistry.tsx:31-131`; server labels are accepted unless corruption markers are detected (`src/app/moduleRegistry.tsx:160-163`).
- Disabled menu items remain visible but disabled (`src/app/TopBar.tsx:26-37`).

### Navigation source of truth

- The server's `defaultMenuItems()` fixes the six public modules and order: chat, image, mindmap, agents, apps, gallery (`server/index.mjs:53-60`).
- `publicMenuItems()` sorts and filters persisted menu metadata (`server/index.mjs:635-640`), then `/api/public/bootstrap` returns it (`server/index.mjs:1212-1221`).
- `src/App.tsx:136-138` performs only a visibility filter before passing items to `TopBar` and `ModuleRouter`.
- `portalModuleOrder` in `src/app/moduleRegistry.tsx:133-140` is not the top-nav source. It is used by gallery filters/replay and source-contract tests (`src/features/gallery/GalleryModule.tsx:71-74`, `src/features/gallery/GalleryModule.tsx:104-108`).
- Constraint: changing visible modules, IDs, or order crosses frontend/server/test boundaries. It is not safely contained to `TopBar` CSS.

## Feature module map

| Public module | Router/component | Layout model | Main state/API boundaries | Redesign notes |
| --- | --- | --- | --- | --- |
| Chat | `src/features/chat/ChatModule.tsx`, selected at `src/app/ModuleRouter.tsx:95-110` | Custom two-pane conversation list + chat stage | Local conversations, streaming reducer-like updates, attachments, STT, imports/exports; `streamChat` and `api.transcribeAudio` | Highest-risk public component. It is over 1,300 lines and contains `ChatHeader`, `MessageList`, mask/tool strips, markdown code rendering, and `Composer` in one file (`src/features/chat/ChatModule.tsx:807-1414`). Preserve behavior while changing composition. |
| Image | `src/features/generation/GenerationModule.tsx`, selected through `generationModuleIds` | Shared `WorkbenchLayout` with image-specific result/history stage | Draft/options local to module; generated items lifted to root gallery | `generationModuleIds` currently contains only `image` (`src/app/moduleRegistry.tsx:142`). Do not generalize UI around dormant audio/video/PPT branches. |
| Mind map | `src/features/mindmap/MindmapModule.tsx` | Shared `WorkbenchLayout`, custom visual/raw stage | Local prompt/model/result/source/tab; parser and SVG export | Preserve visual/raw tab behavior and editable source (`src/features/mindmap/MindmapModule.tsx:159-192`). |
| Agents | `src/features/agents/AgentsModule.tsx` | Shared `WorkbenchLayout` | Local prompt/model/assistant/tools/result; `api.runAgent` | Result area combines `AgentTracePanel` and `ResultPanel` (`src/features/agents/AgentsModule.tsx:211-223`). |
| Apps | `src/features/apps/AppsModule.tsx` | Shared `WorkbenchLayout`, nested app market + result | Local search/category/app/input/model/result; `api.generate("agents")` | The app market is an additional dense grid inside the shared main stage (`src/features/apps/AppsModule.tsx:168-223`). |
| Gallery | `src/features/gallery/GalleryModule.tsx` | Independent full-stage gallery | Root-owned items; local filters/selection/detail layer; replay through session storage | Redesign must retain batch selection, detail dialog, favorites, export, deletion, and replay (`src/features/gallery/GalleryModule.tsx:58-108`, `src/features/gallery/GalleryModule.tsx:209-248`). |
| Admin | `src/features/admin/AdminPortal.tsx` and `AdminConsole.tsx` | Separate `/admin` shell | Cookie-backed admin APIs; extensive local draft state | `AdminConsole.tsx` is over 1,300 lines and should be treated as a separate redesign track unless the Figma scope explicitly includes admin. |

### Dormant or compatibility-only frontend code

- `src/features/knowledge/KnowledgeModule.tsx` exists but is not imported by `ModuleRouter`.
- `src/features/media/MediaJobPanel.tsx` and `mediaJobStorage.ts` are not imported by an active public module.
- `src/features/generation/pptxExport.ts` is not imported by an active public module.
- Legacy module IDs remain in `ModuleId` and `moduleMeta` for compatibility (`src/app/moduleRegistry.tsx:86-130`), but the server public menu contains only six current IDs.
- Recommended boundary: do not redesign or reactivate these surfaces unless the PRD explicitly adds them to the Figma scope.

## Shared workbench surface

The reusable workbench layer is the safest place to implement common Figma patterns shared by image, mind map, agents, and apps.

- `src/components/workbench/WorkbenchLayout.tsx:15-45`: two-column shell, sidebar header, main tabs, main stage.
- `WorkbenchSidebar.tsx` / `WorkbenchMain.tsx`: thin structural wrappers; good stable boundaries for spacing and overflow changes.
- `PromptComposer.tsx:20-81`: textarea, Ctrl/Cmd+Enter submission, character/status row, presets, nested options, notice, and submit button.
- `ModelPicker.tsx`: shared capability-filtered model selector and empty-state semantics.
- `ConnectionStatus.tsx`: shared BYOK readiness affordance.
- `ResultPanel.tsx:54-121`: result header, text, retrieval chunks, asset gallery, raw result disclosure, and empty state.
- `AssetGallery.tsx`: shared image/audio/video/link rendering.

Constraints:

- `WorkbenchLayout` receives `description` and `badges`, but currently renders neither (`src/components/workbench/WorkbenchLayout.tsx:6-20`). A Figma design that includes those fields should either make them real or remove the unused contract rather than duplicate headings inside modules.
- The three labels in `.workbench-main-tabs` are static spans, not functional tabs (`src/components/workbench/WorkbenchLayout.tsx:38-42`). Do not style them as interactive controls unless behavior is implemented and specified.
- Shared components use global class names. Any selector change can affect four active modules at once.

## State and persistence map

| State category | Owner | Persistence | Important behavior |
| --- | --- | --- | --- |
| Public bootstrap/settings/menu/catalog/presets | `src/App.tsx:47`, loaded through `src/api.ts:55-57` | Server JSON, refreshed on demand | Passed through `ModuleRouter`; chat calls `onRefresh` after streaming completion. |
| Active public module | `src/App.tsx:48` | None | Switching modules unmounts the previous feature, so feature-local drafts/results normally reset. |
| BYOK URL/key/last model | `src/App.tsx:49`; helpers in `src/features/settings/userProviderConfig.ts` | `sessionStorage`, key `cherry-web-user-provider` (`userProviderConfig.ts:3`, `43-59`) | Shared by all generation/chat modules; modal is root-owned. Preserve this single source rather than creating feature-specific connection forms. |
| API connection modal | `src/App.tsx:50`, `ApiConnectionModal.tsx` | None | Automatically opens when connection is missing (`src/App.tsx:93-96`); locks body scroll and conditionally handles Escape. |
| Gallery items | `src/App.tsx:51`, `galleryStorage.ts` | `localStorage`, capped/sanitized (`galleryStorage.ts:46-88`) | Root-owned because generation modules append and gallery edits/removes. |
| Conversations | `ChatModule.tsx:189-190`, `localConversationStore.ts` | `localStorage`, capped to 40 conversations/80 messages (`localConversationStore.ts:3-7`, `84-124`) | Full conversations stay inside Chat; summaries are bubbled to `App` through `onConversationsChange`. |
| Gallery replay handoff | `replayDraft.ts` | One-shot `sessionStorage` | Gallery saves source module/prompt/model, target module consumes it on mount (`replayDraft.ts:11-35`). |
| Knowledge documents | `knowledgeDb.ts` | IndexedDB with localStorage migration/fallback | Dormant public surface; avoid coupling redesign work to it unless reactivated. |
| Feature drafts, selections, busy/error/result state | Individual module components | None | Lost on unmount except data explicitly copied to gallery/replay storage. This matters if the Figma design adds persistent sidebars, drawers, or cross-module task queues. |
| Admin drafts and operations data | `AdminConsole.tsx:242-270` | Server-backed after explicit save | Large independent state surface; do not lift it into public `App`. |

There is no context provider, reducer store, query cache, or custom hook layer. State sharing is performed through props and callbacks. `ModuleRouterProps` is therefore a high-coupling contract (`src/app/ModuleRouter.tsx:24-46`).

## CSS architecture

### Import and override model

`src/styles.css` imports all global CSS in a fixed sequence:

1. Fifteen `legacy.*.css` files covering foundation, shell, chat, modal, admin, responsive, workbench, apps/gallery, knowledge, and later overrides (`src/styles.css:1-15`).
2. Seven `rednote-flat-v2.*.css` files for tokens, shell, chat, workbench, admin, modal, and responsive overrides (`src/styles.css:16-22`).

There are no CSS Modules, scoped styles, CSS-in-JS, Tailwind utilities, or component-level stylesheet imports. The complete CSS surface is roughly 7,900 lines. Import order and selector specificity are architectural behavior.

### Current token layer

- `src/styles/rednote-flat-v2.tokens.css:2-36` defines the current color, shadow, radius, and compatibility aliases.
- The same file applies global body/input/select/textarea styling (`rednote-flat-v2.tokens.css:38-66`).
- Recommended boundary: map Figma color, typography, spacing, elevation, and radius values into this file first; avoid scattering literal replacements through feature styles.

### Shell layer risk

- `rednote-flat-v2.shell.css` contains both obsolete left-rail/global-search rules and the current top-navigation redesign beginning at `rednote-flat-v2.shell.css:682`.
- Current rendered classes are `top-nav-shell`, `top-bar`, `top-brand`, `top-module-nav`, and `top-module-button` (`src/app/AppShell.tsx:21`, `src/app/TopBar.tsx:13-41`).
- Selectors for `.left-nav`, `.nav-collapsed`, `.global-search`, `.top-bar-actions`, and `.mobile-nav` remain in shell/responsive CSS but have no current TSX owner.
- Recommended boundary: modify the current top-nav block and delete/retire stale selectors only in a dedicated cleanup step with screenshots and contract updates. Do not add another generic shell override at the end of the file without resolving which block is authoritative.

### Feature style ownership

- Chat: `src/styles/rednote-flat-v2.chat.css`; also affected by `legacy.02-chat.css` and `legacy.11-flat-chat-api.css`.
- Shared workbench, image, apps, mind map, gallery, knowledge remnants: `rednote-flat-v2.workbench.css`; also affected by legacy workbench/apps/gallery/knowledge files.
- Admin: `rednote-flat-v2.admin.css` plus `legacy.04-admin.css`.
- API connection modal: `rednote-flat-v2.modal.css` plus `legacy.03-api-modal.css` and `legacy.11-flat-chat-api.css`.
- Global tokens/shell/buttons/form defaults: token and shell files plus legacy foundation/shell layers.

## Responsive behavior

Primary current breakpoints are distributed across multiple files:

- `1320px`: top-bar/action compaction (`rednote-flat-v2.responsive.css:32-48`).
- `1180px`: chat header stacks and workbench sidebar narrows (`rednote-flat-v2.responsive.css:50-64`).
- `820px`: additional chat-specific changes (`rednote-flat-v2.chat.css:616`).
- `760px`: main mobile transition in responsive/workbench/admin/legacy files (`rednote-flat-v2.responsive.css:66-172`, `rednote-flat-v2.workbench.css:648`, `rednote-flat-v2.admin.css:167`).

Current shell behavior:

- Desktop uses a full-viewport `100dvh` shell with hidden outer overflow and internal scrolling (`rednote-flat-v2.shell.css:683-700`, `790-799`).
- Top navigation is a horizontally scrollable flex row; each item has a 104px minimum width (`rednote-flat-v2.shell.css:731-749`).
- At `<=760px`, the shell remains a fixed `100dvh` grid, the brand shrinks, nav buttons drop to 82px minimum width, and content modules collapse to one column (`rednote-flat-v2.responsive.css:66-135`).
- The same responsive file styles `.mobile-nav`, but no current component renders it (`rednote-flat-v2.responsive.css:137-163`).

Figma validation must include at least 1440px desktop, 1180px compact desktop/tablet, the 760px boundary on both sides, and a 390px mobile viewport. Pay special attention to nested scrolling, composer visibility, gallery detail overlays, and modal height.

## Test and validation architecture

### Existing checks

- `npm run check`: TypeScript `tsc --noEmit` for `src` and Vite config.
- `npm run ui-contract`: source-string assertions for TopBar, accessibility markers, API modal behavior, workbench controls, and selected CSS tokens (`scripts/ui-contract.mjs:27-75`).
- `npm run feature-audit`: source and data assertions for six-module routing, menu order, module/API calls, and model capability coverage (`scripts/feature-audit.mjs:29-114`).
- `npm run chat-local-contracts`: executable pure-function checks for conversation import/export/edit/fork behavior plus source checks for PWA and local-chat boundaries (`scripts/chat-local-contracts.mjs:1-158`).
- `npm run ui-runtime`: starts or reuses a server, checks public bootstrap, then performs more source-string assertions; it does not launch a browser or inspect rendered layout (`scripts/ui-runtime.mjs:100-124`).
- `npm run smoke`: checks root/admin HTML and public API privacy/legacy route behavior (`scripts/smoke.mjs:20-42`).
- `npm run release-check`: production build/server/auth/backup/bootstrap integration checks using a temporary data directory (`scripts/release-check.mjs:112-207`).
- `npm run privacy`: scans persisted data and source for credential patterns (`scripts/privacy-scan.mjs:19-39`).
- `npm run qa`: aggregates typecheck, build, privacy, UI contract, feature audit, provider contracts, chat contracts, and UI runtime (`package.json:21`).

### Missing coverage relevant to Figma implementation

- No Playwright, Cypress, Vitest, Jest, Testing Library, screenshot, or pixel-diff dependency is present.
- No test mounts React components or clicks through the six modules in a browser.
- No automated viewport/layout checks cover 1320/1180/820/760/mobile breakpoints.
- No visual checks cover scroll containment, sticky/fixed controls, modal focus/height, gallery detail, or long localized text.
- Existing source-string tests will need updates if class names or DOM structure change, but passing them does not prove visual correctness.

## High-risk shared files

1. `src/styles.css` - global import order; any reordering changes the entire cascade.
2. `src/styles/rednote-flat-v2.shell.css` - current top navigation and stale shell variants coexist.
3. `src/styles/rednote-flat-v2.responsive.css` - cross-module breakpoint behavior and stale mobile-nav rules.
4. `src/App.tsx` - root state, route split, bootstrap lifecycle, modal, and gallery ownership.
5. `src/app/ModuleRouter.tsx` - all active feature props and module activation rules.
6. `src/app/moduleRegistry.tsx` plus `server/index.mjs` - cross-layer menu IDs/order/labels and compatibility IDs.
7. `src/components/workbench/WorkbenchLayout.tsx` and `src/styles/rednote-flat-v2.workbench.css` - shared by four public modules.
8. `src/features/chat/ChatModule.tsx` and `src/styles/rednote-flat-v2.chat.css` - largest public behavior and layout surface.
9. `src/features/admin/AdminConsole.tsx` and admin CSS - largest independent screen; isolate unless explicitly in Figma scope.
10. `src/types.ts` and `src/api.ts` - shared contracts; visual work should avoid changing them unless the design introduces new behavior/data.

## Recommended edit boundaries

### Boundary A: tokens and global foundation

Edit only `rednote-flat-v2.tokens.css` for design tokens and global control defaults. Keep semantic token names stable where possible. Do not rewrite legacy foundation files during the first visual pass.

### Boundary B: application shell and navigation

Own changes in `AppShell.tsx`, `TopBar.tsx`, the authoritative top-nav section of `rednote-flat-v2.shell.css`, and corresponding rules in `rednote-flat-v2.responsive.css`. Preserve server-driven item order, disabled state, `aria-current`, and horizontal overflow unless the PRD changes those contracts.

### Boundary C: shared workbench

Implement common Figma panels, sidebar/main proportions, model picker, prompt composer, options, result framing, and empty states through `src/components/workbench/**` plus `rednote-flat-v2.workbench.css`. Validate image, mind map, agents, and apps after every shared change.

### Boundary D: chat

Treat chat as a separate behavior-preserving pass. Prefer extracting existing internal sections (`ChatHeader`, `MessageList`, `Composer`, mask/tool strips) into adjacent chat components before large markup movement if the Figma hierarchy differs substantially. Do not alter streaming, conversation persistence, import/export, retry/edit, attachment, or voice behavior as part of a visual-only change.

### Boundary E: gallery

Keep gallery item ownership in `App`; limit UI work to `GalleryModule.tsx` and gallery/workbench CSS. Preserve replay handoff through `replayDraft.ts` and `onNavigateModule`.

### Boundary F: admin

Keep `/admin` out of the public redesign unless explicit frames exist. If included, plan it as an independent subtask because `AdminConsole` has separate data/loading/error/edit flows and a distinct CSS layer.

### Avoid during the visual implementation

- Do not reactivate knowledge/media/PPT code merely because related CSS/classes exist.
- Do not introduce a second menu source or hard-code module order in `TopBar`.
- Do not lift all feature state into `App` solely to match a static frame; first identify which states the design requires to survive module changes.
- Do not append another broad override layer without declaring which existing v2 selectors it supersedes.
- Do not rename shared classes without updating source-contract scripts and checking every importing CSS layer.
- Do not modify API payloads, BYOK persistence, server routes, or storage formats for a visual-only requirement.

## Validation commands

Run targeted checks during implementation:

```bash
npm run check
npm run ui-contract
npm run feature-audit
npm run chat-local-contracts
npm run ui-runtime
```

Run the full release gate before completion:

```bash
npm run qa
npm run smoke
npm run release-check
```

Browser validation is still required because the repository has no rendered visual test harness. At minimum verify `/` and `/admin` at 1440x900, 1180x820, 761x900, 760x900, and 390x844; exercise all six public modules, the API connection modal, chat with long content, gallery detail, keyboard focus, horizontal nav overflow, and reduced-motion behavior.

## Inputs still needed from the Figma planning lane

- Figma file/frame identifiers or exported reference images.
- Explicit in-scope screens: public six modules only, API modal, and/or admin.
- Required desktop/mobile viewport dimensions and whether tablet is a distinct layout.
- Whether module selection must become URL-addressable or remain in-memory.
- Whether feature drafts/results must survive navigation.
- Required new assets, icon mapping, typography source, and permitted font-loading strategy.
- Interaction/state frames for loading, empty, error, disabled, streaming, modal, selected, hover/focus, and mobile overflow states.
