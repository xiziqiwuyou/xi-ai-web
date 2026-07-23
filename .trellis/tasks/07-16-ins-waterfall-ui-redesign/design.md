# Technical Design

## Design Source Of Truth

- Figma file: [xi-ai-web - Instagram Waterfall Redesign](https://www.figma.com/design/DRn9F4HRe5cpDSrHW8FiOQ)
- Figma file key: `DRn9F4HRe5cpDSrHW8FiOQ`
- Current editable references:
  - Foundations board (`1440x1100`)
  - Shared component board (`1440x1600`)
  - Chat desktop board (`1440x900`)
- Figma MCP is authenticated. Direct Plugin API writes are rate-limited after repeated development calls, so remaining screens will be imported from the verified implementation with `generate_figma_design` after the rate-limit window cools down. This makes final Figma frames pixel-identical to the delivered UI.

The repository design source remains `design-system/xi-ai-web/MASTER.md`. It will be updated to match the approved Figma values and is the implementation-readable counterpart to the visual file.

## Architecture Boundaries

### Shared Visual Foundation

Keep the existing split CSS architecture and update the `rednote-flat-v2.*.css` files in place:

- `tokens.css`: color, type, spacing, radius, shadow, motion, and focus tokens.
- `shell.css`: public header, navigation, viewport shell, and mobile bottom navigation.
- `chat.css`: conversation rail, message stage, prompt/mask discovery, and composer.
- `workbench.css`: Drawing, Mind Map, Agents, Apps, Gallery, shared forms, and masonry cards.
- `admin.css`: admin login, shell, navigation, sections, tables, forms, validation, and dialogs.
- `modal.css`: API modal and shared dialog surfaces.
- `responsive.css`: public/admin breakpoints, safe areas, masonry column counts, and one-scroll-owner rules.

Legacy CSS remains imported for compatibility, while the final `rednote-flat-v2` layer continues to own the visible design. Removing legacy CSS is out of scope for this task because it would broaden regression risk without improving the requested UI directly.

### Shared Masonry Primitive

Add `src/components/ui/MasonryGrid.tsx` as a semantic wrapper:

- renders a `role=list` container and preserves source DOM order;
- uses CSS multi-column layout with `break-inside: avoid` cards;
- accepts a stable class name and optional accessible label;
- supports four columns on wide desktop, three on standard desktop, two on tablet, and two compact columns on mobile;
- falls back to one column for narrow controls or reduced available width.

No masonry dependency is added. The primitive owns layout only; modules retain their own card actions and domain state.

### Public Shell

`AppShell` and `TopBar` preserve route behavior and public menu filtering. Visual changes include:

- 60-64px desktop header with calm brand treatment and six content-width items;
- red active state with neutral inactive items;
- compact API connection action outside primary navigation emphasis;
- 56px mobile bottom navigation plus safe area;
- full viewport shell and a single workspace scroll owner.

`/admin` remains address-only and is never added to `publicRoutes` or `TopBar`.

### Module Mapping

- Chat: retain existing conversation/session state, masks, branches, sharing, attachments, and composer. Reduce borders and card nesting; align controls to the component board.
- Drawing: retain the left parameter form and generation behavior. Replace the single large preview/history split with a result-first masonry feed that opens on prior images and keeps clear selected/result actions.
- Gallery: replace the aligned grid with image-first masonry cards; retain filters, batch selection, details, replay, export, favorite, and deletion.
- Agents: preserve setup and execution timeline. Add an agent discovery/card region and use a calmer setup/result hierarchy.
- Apps: preserve market/runner state. Render the catalog through shared masonry and keep the runner as a structured workspace.
- Mind Map: preserve settings, editor, visual/raw tabs, export, canvas, and mobile sheet. Only templates/recent artifacts use cards; the canvas never becomes masonry.

### Admin Redesign

`AdminPortal` and `AdminConsole` keep all API contracts and state logic. The complete visual and interaction redesign covers:

- login stage, loading and error states;
- header, desktop sidebar, mobile section picker, and content scroll owner;
- overview/operations, backup and validation panels;
- tools, site settings, and menu management;
- model catalog, media configuration, assistants, apps, and prompt presets;
- audit log filters and rows;
- confirmation dialogs, destructive actions, loading, empty, and success states.

Admin management layouts remain dense, with tables/forms and two-column editor patterns. Masonry is used only for browsable presets/catalog cards, not operational tables.

## Design Tokens

- Background: `#F7F7F8`
- Surface: `#FFFFFF`
- Surface subtle: `#FAFAFB`
- Text: `#171719`
- Secondary: `#66666F`
- Muted: `#8B8B94`
- Border: `#E8E8EC`
- Primary: `#FF2442`
- Primary hover: `#E91F3B`
- Focus: `#0A84FF`
- Success: `#168F5B`
- Warning: `#A96800`
- Danger: `#D92D45`
- Controls: `10-12px` radius
- Content cards: `16px` radius
- Dialogs/sheets: `20px` radius
- Spacing: `4, 8, 12, 16, 20, 24, 32`
- Motion: color/border/opacity only, `140-200ms`; no scale-induced layout shift

No gradient, backdrop blur, decorative glow, or page-level glass effect is allowed.

## Responsive Contracts

- Wide desktop: `1440x900`, four masonry columns.
- Standard desktop: `1280x800`, three or four columns according to available content width.
- Tablet: two columns and compact sidebars.
- Mobile: `390x844` and `375x812`, two compact masonry columns, bottom navigation, sheets for parameters/settings, and `44x44px` controls.
- Every public/admin screen exposes exactly one visible vertical scroll owner.
- No horizontal overflow is allowed at the acceptance viewports.

## Compatibility And Data Flow

- No provider, API request, local storage, gallery storage, conversation, model catalog, or admin endpoint changes.
- BYOK remains in `sessionStorage` through the existing `userProviderConfig` module.
- Existing browser routes and Back/Forward behavior remain unchanged.
- Shared dialogs continue to own inert background, focus trap, scroll lock, and focus restoration.

## Verification Strategy

1. Static contracts: TypeScript, UI contract scripts, privacy/provider/local conversation checks.
2. Browser E2E: navigation, BYOK modal, chat confirmation, masonry column behavior, admin shell, mobile safe areas.
3. Visual capture: public routes and `/admin` at desktop/mobile reference sizes.
4. Render audit: no gradients, no backdrop blur, one scroll owner, no horizontal overflow.
5. Figma capture: import final verified routes into the existing Figma file and compare screenshots against browser output.

## Rollback

- CSS changes remain isolated in the final override layer and can be reverted by file.
- `MasonryGrid` adoption is module-local and can fall back to the existing grid classes without data migration.
- No stored data shape changes are introduced.

## Model Relay Homepage Upgrade

### Reference Mapping

The visual reference is the locally preserved implementation of the Figma design at `C:/Users/56252/Documents/New project 6/homepage-fixed.html`. The implementation preserves its composition and interaction rhythm while translating product semantics:

- Console/account CTA -> configure session-only API and enter Chat.
- Pricing/model billing -> developer-managed model catalog coverage.
- Registration/recharge/token flow -> configure URL, enter key, select a catalog model, launch a workspace.
- External client support -> xi-ai-web's six built-in workspaces.
- API documentation -> in-page OpenAI-compatible request example and troubleshooting.

### Routing Boundary

- `/` is a fixed product route, not an administrator-managed feature menu item.
- Existing server-managed menu items remain the six workspaces and continue to control label/order/visibility/enabled state.
- `App` owns a `homeOpen` route flag alongside the existing `activeModule`; History API transitions keep both synchronized.
- `HomeModule` receives bootstrap data and callbacks only. It never reads storage or imports root state.
- The API modal auto-opens only when `homeOpen` is false and provider readiness fails.

### Styling Boundary

- Add `rednote-flat-v2.home.css` before the final responsive sheet.
- Homepage uses its own `relay-home-*` namespace so reference-specific teal/blue/violet accents, perspective, gradients, and staggered layouts do not leak into workspaces/Admin.
- The root shell stays full viewport. Homepage `.workspace-frame` is the sole scroll owner.
- Homepage desktop and mobile headers are part of `HomeModule`; the existing workspace `TopBar` gains only a Home command and revised mobile grouping.

### Functional Sections

1. Hero and connection status with API/configure and enter-workspace commands.
2. Operations card using live catalog/app/assistant counts.
3. Workspace service cards launching the six modules.
4. Four-step BYOK onboarding with focusable section anchors.
5. Model catalog preview grouped by vendor and capability.
6. OpenAI-compatible endpoint/cURL sample derived from the session URL without exposing the key.
7. FAQ accordion and footer navigation.

## Online Chat Figma Make Correction

- Source: https://www.figma.com/make/NqmyXu1t03HzZNssnm1dqL/在线对话功能网页设计
- Shell: `224px` sticky left rail on desktop; compact mobile header and shared navigation sheet below `760px`.
- Core colors: background `#f5f8ff`, foreground `#10203d`, primary `#2368e8`, secondary `#edf2fc`, muted `#65738d`, border `rgba(31,64,125,.12)`.
- Typography: `Plus Jakarta Sans` for UI copy and `DM Mono` for small system labels, with local fallbacks.
- Chat: top workbench identity bar, conversation rail, centered message canvas, compact model/assistant/API controls, multi-action composer, and shared configuration/confirmation overlays.
- The Figma Make sample state is visual reference only. Existing xi-ai-web state, provider adapters, local storage boundaries, and API contracts remain authoritative.

## Exact Figma Replacement Architecture

The earlier adapted studio shell is retired. The public implementation will use a dedicated Figma-faithful structure rather than preserving the previous workbench markup and hiding it with CSS.

- `AppShell` owns only the Figma header/sidebar/footer frame and route outlet.
- `TopBar` renders the exact six-destination navigation and theme/mobile controls; it contains no API configuration or administrator action.
- Chat keeps its request and local persistence logic but replaces its presentation with the Figma stacked-session composition. Legacy conversation rails, mask strips, prompt starters, import/export menus, summary bars, and connection pills are not mounted.
- The first-use API dialog remains the only public credential entry point. It is behaviorally required but does not become part of the persistent shell.
- Existing feature modules may remain as implementation backends for non-chat destinations, but their public labels and outer frame must match the Figma design and must not leak retired navigation labels.
- A new final CSS layer is not added. The owning `rednote-flat-v2` token, shell, chat, workbench, modal, and responsive sheets are rewritten toward the Figma source values.

### Exact Tokens

- Light: background `#f5f8ff`, foreground `#10203d`, card `#ffffff`, primary `#2368e8`, secondary `#edf2fc`, muted `#65738d`, border `rgba(31,64,125,.12)`.
- Dark: background `#080c14`, card `#0f1623`, primary `#4f8dff`, with the same restrained blue-gray hierarchy visible in the reference.
- Radius base: `16px`.
- Typography: Plus Jakarta Sans with local system fallbacks; DM Mono for system labels.
- The reference's identity gradient is allowed only on the brand mark. No additional decorative elements are introduced.

## Version 24 Menu And Submenu Fidelity

### Page Ownership

- `TopBar` remains the only public navigation owner.
- `ChatModule` owns stacked sessions, the vendor/model popover, and session settings.
- `StudioModule` owns five distinct page components. Shared code is limited to model resolution, request helpers, notices, and small primitives; page compositions are not forced through one generic workbench.

### Data And Interaction Compatibility

- Figma sample copy initializes empty local UI state only where it does not overwrite a user's saved result.
- Model rows are derived from the developer-managed model catalog and grouped into Figma vendor tabs.
- Image inspiration uses the exact reference assets; generated and saved images enter the same waterfall without changing gallery storage.
- PPT, mind map, and translation submit through existing `/api/generate/*` paths.
- Assistant cards derive from admin-managed assistants; category/tag presentation is a frontend projection. Launch writes the selected assistant ID to session storage and opens Chat.
- Hidden or unavailable backend capabilities disable the corresponding command without adding compatibility messaging to the persistent frame.

### Overlay Contracts

- Chat model selection is an anchored popover inside the session header. It closes on outside click, Escape, model selection, folding, or unmount.
- Session settings and assistant detail use the shared accessible `Dialog` contract.
- An open dialog is the sole scroll owner. The model popover does not create a second page scroll container.

### Responsive Contracts

- At `1024px+`, the left rail and content compositions follow the desktop Figma preview.
- Below `1024px`, the shell uses the mobile header/menu while every module preserves its authored section order.
- Below `760px`, multi-column authored sections stack without changing copy or hiding primary commands.
- Stable image aspect ratios, fixed control heights, and explicit grid tracks prevent layout shift and overlap.

## Provider-Native Request And Image Contract

### Catalog And Runtime Identity

- Extend the shared `ProviderKind`/registry taxonomy with `kimi`, `deepseek`, and `qwen`; keep `openai-compatible` as an explicit generic fallback rather than using it as the identity of every OpenAI-shaped vendor.
- The catalog remains metadata only. API URL/key stay in the existing session-only user connection payload and are combined with the selected catalog entry only for the current request.
- Bump the metadata normalization version and merge only missing built-in vendor/model presets. Never overwrite, re-enable, rename, or delete administrator-maintained entries.

### Text Request Normalization

- OpenAI continues to use `/responses`; Anthropic uses `/messages`; Gemini uses `/models/{model}:generateContent`.
- Kimi, DeepSeek, and Qwen use dedicated adapter identities over their documented OpenAI-compatible `/chat/completions` transport. Shared SSE, multimodal `image_url`, function-tool, and embedding helpers stay centralized.
- Common request options are normalized once, then projected to vendor fields such as `top_p`, `max_output_tokens`, `max_tokens`, or `generationConfig`. Unsupported values are omitted. Kimi K2.5/K2.6/K2.7/K3 sampling fields are omitted because current official models fix Temperature and Top-P.

### Image Request Boundary

The browser sends one typed image request:

```text
mode, prompt, count, size, aspectRatio, imageSize,
quality, outputFormat, outputCompression,
optional inputImage, optional maskImage
```

- OpenAI generate: JSON `/images/generations` with `n`, valid model-specific size, quality, format, and compression.
- OpenAI edit: multipart `/images/edits` with source image, optional PNG mask, `n`, and supported output fields.
- Gemini generate/edit: native `generateContent` with text plus optional `inlineData` image parts, `responseModalities`, and `imageConfig`. Exact count uses a maximum four-request fan-out and flattened candidates.
- Server validation owns upload MIME/size checks and count limits. Adapters own provider field gating. `extractAssets` remains the single response-to-asset projection and must iterate all OpenAI `data[]` entries and all Gemini candidate parts.

## Softer Chat Model List Surface

- Keep `.figma-model-popover` and its two-column grid unchanged so placement, clipping correction, and keyboard focus contracts remain stable.
- Render `.figma-model-list` as a padded grid with a small row gap. Each option owns a local `10px` radius and transparent resting background.
- Remove per-option divider borders. Hover/focus use the existing soft surface token and selection keeps the existing restrained red fill.
- Preserve the existing stable scrollbar gutter and change no scroll-state dimensions.

## Balanced Model Scrollbars

- Use the shared `--xhs-scrollbar-active` token as a semi-transparent gray-blue thumb in both themes.
- Give the vendor tablist its own debounced scroll-activity state so scrolling one column does not reveal the other column's thumb.
- Keep `scrollbar-gutter: stable`, `scrollbar-width: thin`, and a fixed `4px` WebKit scrollbar width on both columns. Visibility changes only through thumb color.
- Reduce the vendor column's right padding by the reserved gutter width so long vendor labels keep their previous usable text width.

## Selected Vendor Emphasis

- Keep the existing transparent inactive vendor buttons and `10px` local radius.
- Use a `16%` red-to-surface mix and `750` font weight for the selected vendor, producing a visible pill without a border or raised-card treatment.
- Inactive hover uses only a `5%` red-to-transparent mix so it cannot compete with the selected state.
- Preserve tab dimensions, the vendor scroll gutter, and automatic keyboard activation.

### Drawing Interaction

- Keep the authored prompt/parameter layout. Add a compact Generate/Edit mode control, source-image upload, optional mask upload, and provider-aware resolution/quality/output controls inside the existing parameter surface.
- Model changes reconcile unsupported options without clearing the prompt or uploaded source image.
- The inspiration waterfall flattens all image assets from the current result and saved image generations so a multi-image response is visible as separate items.

### Verification

- Extend provider contracts for all explicit vendors and both image request modes.
- Extend UI/static contracts for arrow removal, image option typing, upload lifecycle, exact count payloads, and multi-asset rendering.
- Use fixture-only browser tests; no provider credentials or live billable calls are permitted.
