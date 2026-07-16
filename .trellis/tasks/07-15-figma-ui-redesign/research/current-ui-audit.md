# Current UI Audit

## Scope

This audit covers the current `xi-ai-web` public UI before redesign. Evidence comes from:

- Source inspection of `src/**/*.tsx`, the active CSS cascade imported by `src/styles.css`, and `index.html`.
- Runtime inspection at `http://localhost:8787` on 2026-07-15.
- Desktop captures at `1440 x 900`.
- Mobile captures at `390 x 844` using a touch/mobile browser context.
- A session-only placeholder API connection used solely to dismiss the first-use modal; no provider request was made.

The current runtime is functional and visually consistent enough to redesign from, but it does not yet satisfy the requested flat, compact, small-radius, iOS-like direction. The largest structural issue is mobile scrolling: the shell is locked to one viewport while several module canvases are substantially taller than the viewport.

## Actual Public Menu Set

The source currently exposes six public destinations in `portalModuleOrder` (`src/app/moduleRegistry.tsx:133`):

| ID | Public label | Product role | Redesign decision |
| --- | --- | --- | --- |
| `chat` | 对话 | Conversation workspace | Keep as primary destination. |
| `image` | 绘画 | Image creation workspace with local image history | Keep as creation destination. Integrate a compact local recent strip, but do not turn it into the global asset library. |
| `mindmap` | 思维导图 | Structured visual generation and source editing | Keep as primary destination. |
| `agents` | 智能体 | Role, tool permission, trace, and result workspace | Keep as primary destination. |
| `apps` | 应用 | Preset workflow marketplace and runner | Keep as destination. |
| `gallery` | 画廊 | Cross-module local asset library | Keep because it is still routed and rendered (`src/app/ModuleRouter.tsx`). Clarify that it aggregates outputs from drawing, mind map, agents, and apps. |

The phrase “drawing/gallery combined” should therefore be interpreted as a shared asset model and shared visual components, not as deleting the current Gallery route. The redesign should prevent duplicate experiences by separating responsibilities:

- **Drawing**: create, preview, reuse prompt, and inspect recent image outputs.
- **Gallery**: search, filter, select, export, favorite, replay, and delete all local outputs across modules.

## Runtime Baseline

### Desktop

- Viewport: `1440 x 900`.
- Header: `1420 x 72`, white surface, `20px` radius.
- Six navigation buttons expand to approximately `191px` each.
- Chat conversation rail: approximately `310px` wide.
- Icon buttons: `30 x 30`.
- Default panels: `24px` radius.
- The six desktop pages fit horizontally without document overflow at this viewport.

### Mobile

Viewport: `390 x 844`.

| Module | Workspace canvas scroll height | Canvas client height | Result |
| --- | ---: | ---: | --- |
| Chat | 1525 | 752 | Content exceeds shell by 773px. |
| Drawing | 1356 | 752 | Result/history is below the clipped region. |
| Mind map | 1185 | 752 | Lower result/source content is clipped. |
| Agents | 1487 | 752 | Tool controls and result content exceed the viewport. |
| Apps | 2457 | 752 | Marketplace/result content greatly exceeds the viewport. |
| Gallery | 752 | 752 | Empty state fits; populated state will be taller. |

The root document remains exactly `844px` high, while `.rednote-shell` has `overflow: hidden`. The top navigation is `541px` wide inside a `239px` viewport and hides its scrollbar. These are runtime-confirmed problems, not theoretical CSS concerns.

## What Works Today

- The six destinations have a consistent top-level order and icon vocabulary.
- The desktop workbench pattern is predictable: controls on the left and output on the right.
- Chinese source text and runtime labels render correctly; no source-level mojibake was found when files were read explicitly as UTF-8.
- The palette already establishes red as the primary accent and white as the principal surface.
- Most icon-only actions use Lucide icons and many have accessible labels.
- Generated images have CSS aspect-ratio constraints, reducing layout shift.
- A global `prefers-reduced-motion` override exists (`src/styles/rednote-flat-v2.shell.css:671`).
- The first-use API connection boundary is clear and remains browser-session-only.

## Cross-Product Findings

### 1. Navigation Is Too Large on Desktop and Too Opaque on Mobile

`TopBar` renders every visible module as an equal-weight button (`src/app/TopBar.tsx:19`). Desktop buttons use `flex: 1 0 104px`, but at 1440px they grow to roughly 191px each. This makes navigation dominate the page and reduces the feeling of a professional workbench.

On mobile, the brand consumes roughly 108px and the nav viewport is only 239px. The six-item strip is 541px wide, its scrollbar is hidden, and the active item is programmatically scrolled into view. Users can lose awareness of destinations that moved off-screen.

**Redesign implication**: compact desktop navigation with content-width items; mobile bottom navigation with a native-style More destination rather than a hidden horizontal strip.

### 2. The Visual System Is Over-Rounded and Over-Containerized

Current final CSS uses `20-24px` radii for the header, panels, cards, dialogs, and nested sections. The result is a soft consumer-card aesthetic rather than the requested flat, tactile tool UI.

Examples visible at runtime:

- A rounded page shell contains rounded workbench panels.
- Workbench panels contain rounded connection cards, model cards, prompt cards, option cards, and result cards.
- The Apps page repeats the selected app in both the left rail and the market grid.
- The API modal contains multiple card-like summary and status blocks inside the modal card.

**Redesign implication**: one surface per functional region. Use dividers and spacing inside a panel instead of placing cards inside cards. Limit radius to `6-12px` except true pills and circular controls.

### 3. Empty States Consume Too Much Productive Space

Drawing, mind map, agents, apps, and gallery render very large empty areas with centered icons and explanatory copy. On desktop this creates a sparse demo-state composition rather than a dense workbench. On mobile it pushes useful controls and results farther below the fold.

**Redesign implication**: compact empty states aligned near the top-left of the output area, with one clear action and no decorative oversized icon.

### 4. “Result / Task / Details” Is a Non-Functional Visual Control

`WorkbenchLayout` renders `结果`, `任务`, and `详情` as static spans (`src/components/workbench/WorkbenchLayout.tsx:38`). They appear interactive but only Result exists. This creates false affordance on every generated-workbench page.

**Redesign implication**: remove the strip unless a module provides real views. Use actual segmented controls only where two or more states are implemented, such as Mind map Visual/Source.

### 5. Mobile Scroll Ownership Is Broken

At `max-width: 760px`, `.rednote-shell.top-nav-shell` is fixed to `100dvh` with `overflow: hidden`, while child workspaces become auto-height and visible-overflow (`src/styles/rednote-flat-v2.responsive.css:75`). Runtime measurements show canvases up to 2457px inside a 752px visible region.

This also makes the UI fragile when the software keyboard opens. A prompt field can remain visible while its submit action or result area is clipped outside the non-scrollable shell.

**Redesign implication**: establish one explicit scrolling owner per screen. The mobile document or content region must scroll; only app bars, bottom navigation, and composer controls may remain sticky.

### 6. Touch Targets and Focus Treatment Are Inconsistent

Current icon buttons are commonly `30 x 30`; send/stop controls are `34 x 34`; several chips and segmented items are `28-38px` high. This is too small for a touch-first mobile UI.

The top navigation removes the default outline and uses a hover-like focus state. Other newer buttons rely on browser defaults because custom focus coverage is incomplete.

**Redesign implication**: `44px` minimum interactive target on touch layouts, `36px` minimum control height on desktop, and a consistent `2px` focus ring with `2px` offset.

### 7. Important State Is Not Reflected in the URL

The app reads the pathname only to distinguish `/admin`; the public active module lives exclusively in component state (`src/App.tsx:44`, `src/App.tsx:168`). Browser back/forward, refresh restoration, sharing, and deep links do not represent the active public workspace.

**Redesign implication**: prototype and implementation plan should define stable routes or query state for each public module and relevant subviews.

### 8. Accessibility Gaps Are Concentrated Around Dialogs, Labels, and Destructive Actions

- API connection modal has initial autofocus and Escape handling, but no focus trap, background inerting, or focus restoration (`src/features/settings/ApiConnectionModal.tsx:29`).
- Gallery detail dialog lacks an accessible name, Escape behavior, focus trapping, and focus restoration (`src/features/gallery/GalleryModule.tsx:209`).
- Chat composer and several search inputs rely on placeholder text instead of a stable label.
- Apps and Gallery declare tablists without implementing tab semantics; these controls are filters and should use pressed-state buttons.
- Admin entity picker selects and adjacent Add icon buttons lack accessible names.
- Delete and Clear operations across chat, drawing, knowledge, gallery, media jobs, and admin entities often execute immediately without confirmation or undo.

**Redesign implication**: accessibility behavior must be part of each Figma component’s states and interaction annotation, not an implementation-only note.

## Module Audit

### Chat

**Current structure**

- Desktop: `310px` conversation rail + chat stage.
- Chat header combines assistant, model, temperature, API status, pin, import, four export/share actions, and summarize.
- Empty chat includes assistant cards, app presets, prompt presets, and tool tags.
- Composer sits at the bottom of the chat stage.

**Problems**

- Header action density is excessive.
- Mobile turns the header controls into a long stack and places tool icons in a vertical rail.
- The empty state repeats several different product taxonomies at once.
- Conversation delete is immediate and not undoable.

**Direction**

- Keep conversation rail on desktop; use a sheet/drawer on mobile.
- Keep assistant and model selectors visible; move import/export/share/summarize into one More menu.
- Empty state should show one short title and up to three starter prompts.
- Composer should be sticky within the chat content area, with a compact attachment tray.

### Drawing

**Current structure**

- Left rail contains connection state, model, prompt, presets, size/style/quality, negative prompt, and submit.
- Right side contains fake top tabs, current result, a large empty state, and local image history.

**Problems**

- Too many rounded subcards inside the control rail.
- The output area is nearly empty before generation.
- Mobile shows the entire configuration form first; preview and history are below the clipped viewport.

**Direction**

- Desktop: `320px` inspector + flexible canvas, with a `112px` recent-image strip.
- Mobile: Input / Preview / History segmented view, with submit sticky above bottom navigation.
- Use shared AssetCard components with Gallery.

### Mind Map

**Current structure**

- Left prompt rail, right visual/source workspace.
- Visual/Source segmented control exists, while the generic fake Result/Task/Details strip is also present.

**Problems**

- Duplicate view navigation.
- Canvas does not dominate the screen.
- Source editor is visually treated as another large card.

**Direction**

- Canvas-first workspace with a compact top toolbar for zoom, fit, export, Visual/Source.
- Prompt and generation settings in a left inspector on desktop and a bottom sheet on mobile.
- Source editor replaces the canvas in the same region rather than stacking below it.

### Agents

**Current structure**

- Left rail: connection, model, role, prompt, temperature, tool checkboxes, run.
- Main: tool trace notice and result card.

**Problems**

- Tool permissions look like a long form rather than a scoped capability selector.
- Trace and final answer are separated by nested panels.
- Mobile tool selection extends beyond the visible shell.

**Direction**

- Tool permissions become compact toggle rows grouped under Permissions.
- Main area becomes one timeline: Run status, tool events, and Final answer.
- Desktop may expose a collapsible trace inspector; mobile uses a Trace tab or sheet.

### Apps

**Current structure**

- Left rail repeats selected app metadata and contains runner input.
- Right side contains app market cards and a separate result panel.

**Problems**

- Selected app information is duplicated.
- Five large cards across at 1440px reduce scan efficiency and create unnecessary card nesting.
- Mobile market content reaches 2457px inside a locked shell.

**Direction**

- Desktop master-detail: market/list on the left or center, selected app runner in a `360px` detail pane.
- Result replaces the detail pane after submission or appears as a deliberate second tab.
- Mobile: searchable app list, then app detail as a full-height sheet/screen.

### Gallery

**Current structure**

- Full-width header and empty state; populated state adds search, filters, batch actions, cards, and a side detail dialog.

**Problems**

- Empty header is itself a large rounded container.
- Clear is exposed before there is a clear selection/undo model.
- Gallery detail dialog lacks complete keyboard/focus behavior.

**Direction**

- Flat toolbar + responsive asset grid.
- Selection mode reveals batch actions; destructive actions require confirm or undo.
- Desktop detail inspector is persistent or dismissible; mobile detail is a full-screen sheet.

## Content and Copy Audit

- Remove generic instructional copy that repeats visible controls, such as “results will display here.”
- Keep privacy copy only where credentials or local persistence are directly relevant.
- Use one sentence maximum for empty states.
- Do not expose implementation terms such as provider compatibility unless needed in the model picker.
- Avoid repeating keyboard shortcuts in every panel; show them in the relevant field hint or tooltip.
- Use consistent terms: `绘画`, `思维导图`, `智能体`, `应用`, `画廊`; avoid alternating between “作品画廊,” “绘画画廊,” and “历史作品” without a hierarchy.

## Redesign Constraints to Preserve

- No public login or registration.
- User API URL and Key remain browser-session-only.
- `/admin` remains the sole admin entry.
- Existing module IDs and server contracts should remain stable during visual redesign unless separately approved.
- No new external UI dependency is required for the design direction.
- Use Lucide icons already present in the project.

## Recommended Design Validation

Before implementation approval, validate the Figma prototype at:

- Desktop: `1440 x 900` and `1280 x 800`.
- Tablet: `834 x 1194`.
- Mobile: `390 x 844` and `375 x 812`.
- Chinese labels at 200% text zoom.
- Keyboard-only navigation through header, dialogs, workbench controls, and destructive confirms.
- Reduced-motion prototype notes.
- Mobile software-keyboard states for Chat composer and each generation prompt.

