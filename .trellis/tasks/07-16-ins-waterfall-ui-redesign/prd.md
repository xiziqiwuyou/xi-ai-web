# Instagram Waterfall UI Redesign

## Goal

Redesign xi-ai-web into a flat, rounded, Instagram-clean AI workspace with visually consistent navigation, controls, dialogs, and responsive masonry content surfaces, then implement the approved design faithfully without changing the product's API or persistence behavior.

## Background

- The public product currently exposes six routes: `/chat`, `/image`, `/mindmap`, `/agents`, `/apps`, and `/gallery`.
- `/admin` is an address-only administrator surface and must remain absent from public navigation.
- End users provide an API URL and key through the first-use modal; credentials remain in browser session storage and are never persisted by the server.
- The current UI already uses a flat red and white foundation, but visual density, card rhythm, typography, and cross-module hierarchy are inconsistent.
- A Figma connector is not configured in this environment. The design handoff will therefore be stored as a Figma-ready token/component/page specification plus high-fidelity browser reference boards generated from the same implementation tokens.

## Requirements

### R1. Visual Direction

- Use a flat light theme with white surfaces, near-black text, quiet neutral backgrounds, and a restrained xi-ai-web red accent.
- Use generous but controlled whitespace, `14-20px` card radii, thin borders, and only subtle elevation on floating or interactive content.
- Do not use gradients, glass blur, decorative glow, oversized icons, or deeply nested cards.
- Use a local-first Chinese UI font stack with consistent typography across navigation and workspaces.

### R2. Shell And Navigation

- Preserve the six public destinations and direct URL routing.
- Keep the shell full-viewport with a compact desktop header and ergonomic mobile bottom navigation.
- Make navigation visually calmer than the content while retaining a clear active state and `44x44px` mobile targets.
- Keep API configuration contextual and keep `/admin` out of all public menus.

### R3. Waterfall Content System

- Introduce responsive masonry/card layouts for visual discovery and result browsing in Drawing, Gallery, Apps, and Agents.
- Use 4 columns on wide desktop, 3 on standard desktop, 2 on tablet, and 2 compact columns on mobile where content permits.
- Cards may vary in height but must retain stable width, readable metadata, keyboard focus, and non-shifting hover states.
- Chat, Mind Map editing, forms, tables, and configuration screens must use task-appropriate structured layouts rather than forced masonry.

### R4. Module-Specific Experience

- Chat: preserve conversation navigation, model selection, assistant/mask discovery, attachments, composer, sharing, and branch features while reducing visual noise.
- Drawing: open into a creation feed that combines generation controls with prior generated images and clear result actions.
- Mind Map: preserve the editor/canvas hierarchy and make templates or recent maps discoverable through compact cards.
- Agents: present discoverable agent cards with capability, provider/model, and primary action information.
- Apps: present app templates as a filterable masonry catalog with strong launch affordances.
- Gallery: use an image-first masonry feed with selection, replay, download, and removal actions.
- API modal: match the new component system while preserving session-only BYOK behavior and accessibility.
- Admin: fully redesign login, overview, menu management, model catalog, assistants, applications, presets, plugin configuration, validation, destructive confirmations, and responsive navigation using the same visual system. Preserve dense table/form ergonomics; use masonry only for genuinely browsable catalog surfaces.

### R5. Interaction And Accessibility

- Use Lucide icons consistently at `16-20px` inside stable controls.
- Provide visible hover, pressed, selected, disabled, loading, empty, error, and focus states.
- Preserve shared dialog focus trapping, inert background, scroll locking, and focus restoration.
- Respect `prefers-reduced-motion` and WCAG AA contrast.
- Maintain exactly one visible vertical scroll owner per workspace at common breakpoints.

### R6. Design Handoff And Fidelity

- Persist a Figma-ready design system containing tokens, component anatomy, state matrices, spacing, typography, responsive rules, and page compositions.
- Produce desktop and mobile reference screenshots from the implementation using the same source-of-truth tokens.
- Implementation must match the handoff for layout, colors, typography, radii, spacing, card behavior, and responsive transitions.

### R7. Regression Safety

- Preserve provider selection, API routing, local conversation/gallery state, admin isolation, and all existing public feature flows.
- Extend automated UI contracts and Playwright coverage for the new shell, masonry behavior, modal behavior, and mobile navigation.
- Keep Vite and production file watching isolated from generated screenshot reports.

## Acceptance Criteria

- [ ] A Figma-ready design handoff exists with tokens, component specs, desktop/mobile page compositions, and explicit anti-patterns.
- [ ] Public navigation exposes exactly Chat, Drawing, Mind Map, Agents, Apps, and Gallery; no Admin link appears publicly.
- [ ] Drawing, Gallery, Apps, and Agents use responsive masonry/card layouts with no horizontal overflow.
- [ ] Chat and Mind Map retain task-appropriate workspace layouts and all existing controls.
- [ ] API configuration remains session-only and opens automatically when URL/key are missing.
- [ ] `/admin` is fully redesigned across login, navigation, management forms, tables, catalogs, confirmations, empty states, and mobile layout without exposing an Admin entry publicly.
- [ ] Desktop layouts are visually verified at `1440x900` and `1280x800`.
- [ ] Mobile layouts are visually verified at `390x844` and `375x812`.
- [ ] No rendered gradient or backdrop blur exists in the redesigned surfaces.
- [ ] Keyboard focus, dialogs, navigation, hover states, and reduced-motion behavior remain usable.
- [ ] `npm run qa`, Playwright E2E, smoke checks, and `git diff --check` pass.

## Out Of Scope

- New authentication, user accounts, server-side credential persistence, or database storage.
- Changes to provider API formats or model catalog semantics.
- New public modules beyond the existing six destinations.
- Replacing the existing Lucide icon dependency.

## Scope Replacement - Exact Online Chat Figma UI

This scope replaces every earlier public-UI direction in this task. The sole visual and interaction source of truth is the Figma Make file `NqmyXu1t03HzZNssnm1dqL`, "在线对话功能网页设计".

### Requirements

- Abandon the current xi-ai-web public shell and feature presentation instead of layering another visual override on top of it.
- Reproduce the Figma user shell, navigation, responsive behavior, dark/light themes, stacked chat sessions, session folding, model picker, message presentation, composer, footer, and modal geometry faithfully.
- Public navigation exposes exactly, in this order: `AI 对话`, `图像生成`, `AI 一键 PPT`, `思维导图`, `助手库`, `翻译`.
- Do not render the previous `绘画`, `智能体`, `应用`, `画廊`, conversation rail, mask/workflow strips, prompt starter cards, public API status buttons, or any project-authored explanatory UI that is absent from the Figma design.
- Keep the real streaming Chat request path, developer-managed model catalog, local conversation state, session-only BYOK credentials, and address-only `/admin` route behind the reproduced surface.
- When a backend capability does not have a direct current module equivalent, use the existing closest functional module behind the exact Figma destination without adding visible compatibility controls.
- `/admin` remains available only by URL and is never added to the public design.

### Acceptance Criteria

- [x] The visible public shell contains only elements present in the Figma user design.
- [x] Public navigation labels and order exactly match the six Figma destinations.
- [x] Chat at `1440x900`, `1280x800`, `390x844`, and `375x812` matches the reference hierarchy and geometry.
- [x] A new chat appears expanded at the top; older sessions collapse below; folding hides the full session body and preserves state.
- [x] Chat keeps a functional model choice, image attachment, network-search state, context clearing, streaming send/stop flow, and BYOK first-use gate without exposing extra controls.
- [x] Public routes, browser Back/Forward, `/admin` isolation, session-only credential storage, and existing provider contracts remain valid.
- [x] `npm run qa`, `npm run test:e2e`, `npm run smoke`, `npm run release-check`, and `git diff --check` pass.

## Scope Upgrade - Model Relay Homepage

### Goal

Reproduce the Figma/model-relay homepage composition as the public root experience while adapting its actions to xi-ai-web's no-account, BYOK product model.

### Requirements

- Add `/` as a public homepage that can be viewed before API URL/key configuration.
- Preserve the reference hierarchy: compact product header, two-column hero, interactive operations card, supported capability badges, staggered service cards, four-step onboarding, dark API example, FAQ waterfall, and footer links.
- Keep the reference's restrained teal/blue/violet accents, tilted-card hover correction, staggered cards, and subtle decorative gradients on the homepage only. Existing workspaces and Admin remain flat red/white.
- Replace account, recharge, token, pricing, and billing actions with relevant xi-ai-web actions: configure API, browse the developer-managed model catalog, enter Chat/Drawing/Mind Map/Agents/Apps/Gallery, and read connection troubleshooting.
- Keep `/admin` address-only and absent from homepage/public menus.
- Clicking a workspace action updates History API state without a full reload. Browser Back/Forward must return between `/` and workspace routes.
- Missing API URL/key must not block viewing `/`; it becomes required only when entering a workspace or explicitly opening API configuration.
- Desktop homepage navigation exposes Home, Workspaces, Models, API Guide, and Help anchors/actions. Mobile navigation provides Home, Chat, Drawing, Agents, and a More sheet containing Mind Map, Apps, Gallery, and API configuration.

### Acceptance Criteria

- [ ] `/` visually matches the relay homepage reference at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- [ ] Homepage sections and navigation commands are functional, keyboard accessible, and use real bootstrap model/app/assistant counts.
- [ ] Homepage is visible without credentials; entering a workspace opens the required BYOK modal when credentials are absent.
- [ ] The operations card straightens on hover, staggered cards retain stable layout, and reduced motion disables non-essential movement.
- [ ] No horizontal overflow occurs and the homepage owns exactly one visible vertical scroll container.
- [ ] Existing six workspace routes, Admin isolation, provider behavior, and local data behavior remain compatible.

## Scope Correction - Online Chat Workspace

The model-relay homepage was based on the wrong Figma target. The authoritative reference is now the Figma Make file `NqmyXu1t03HzZNssnm1dqL`, "在线对话功能网页设计".

- `/` resolves to the Chat workspace; the synthetic public Home destination is removed.
- Public desktop navigation follows the reference's fixed left rail. Mobile uses a compact header and menu sheet.
- Adapt the reference's AiStudio visual system to xi-ai-web: Plus Jakarta Sans-style typography, blue primary color, pale blue background, white cards, 16px radii, quiet borders, and blue/cyan/violet semantic accents.
- Preserve xi-ai-web's six real destinations: Chat, Drawing, Mind Map, Agents, Apps, and Gallery. Do not add the reference's PPT, Translation, account, billing, or public Admin behavior.
- Chat keeps real local conversations, model catalog, assistant selection, attachments, streaming, tools, branches, sharing, import/export, summaries, and BYOK behavior.
- `/admin` remains address-only and is absent from all public navigation.

### Acceptance Criteria

- [ ] `/` canonicalizes to `/chat` and no synthetic Home action remains publicly visible.
- [ ] Desktop shell matches the Figma Make left-rail composition; mobile shell matches its compact header/menu behavior.
- [ ] Chat hierarchy, colors, typography, card geometry, model controls, messages, and composer match the reference at all four acceptance viewports.
- [ ] Existing Chat actions and provider request flow remain functional.
- [ ] Public navigation, BYOK, Chat confirmation, mobile layout, QA, E2E, Smoke, and release checks pass.

## Scope Refinement - Complete Menu And Submenu Fidelity

This refinement responds to the live-design audit of Version 24. It supersedes the generic non-chat workbench treatment while preserving all existing request and storage contracts.

### Requirements

- Reproduce every public destination's own Figma composition rather than wrapping all non-chat modules in one shared parameter/result template.
- Reproduce Chat's custom vendor/model submenu and complete session-settings controls.
- Reproduce Image prompt/parameter/inspiration sections, PPT option/creation/prompt-idea sections, Mind Map branch/canvas/zoom sections, Assistant filters/cards/detail overlay, and Translation language/tone/source/result/capability sections.
- Preserve real BYOK provider requests, model catalog selection, image/PPT/mindmap/translation generation, assistant launch, local conversations, and address-only Admin.
- The initial visible state must not include project-authored compatibility panels or explanatory copy absent from the Figma preview.

### Acceptance Criteria

- [ ] Main and mobile navigation contain the exact six Figma items, notes, order, and active states.
- [ ] Chat model selection uses vendor tabs and a scrollable model list; no native model select is visible.
- [ ] Chat settings contain avatar presets, personal avatar upload, message style, Temperature, Top-P, context, max tokens, streaming, tool mode, Cancel, and Save.
- [ ] Image, PPT, Mind Map, Assistants, and Translation match the audited headings, sections, controls, and initial sample content.
- [ ] Every visible secondary control has a functional state transition or command while retaining the real backend request path.
- [ ] Desktop and mobile screenshots match the Figma hierarchy with no overflow, overlap, duplicate navigation, or extra public Admin/API action.
- [ ] Static contracts, E2E, QA, Smoke, release check, and `git diff --check` pass.

## Scope Refinement - Model Selection And Transient Scrollbars

- The Chat model list keeps its scrollbar visually hidden at rest and reveals it only while the list is actively scrolling, including mouse, touch, keyboard, or programmatic scrolling, without changing the popover width or model-row layout.
- AI PPT, Mind Map, and Translation expose an explicit model selector derived from the enabled developer-managed Chat-capable model catalog.
- Selecting a model updates the session-only provider preference and the exact selected model ID is sent through the existing generation request.
- Model selectors remain keyboard accessible, fit the authored desktop composition, stack cleanly on mobile, and do not add public provider or administrator controls.

### Acceptance Criteria

- [x] Chat model scrollbar is invisible at rest, becomes visible during active scrolling, then hides again after scrolling stops.
- [x] PPT, Mind Map, and Translation each expose a labelled model menu with enabled Chat-capable models.
- [x] Generation requests from all three modules carry the model chosen in their visible selector.
- [x] Desktop and mobile layouts retain one scroll owner with no horizontal overflow.
- [x] Static contracts, targeted E2E, QA, Smoke, release check, and `git diff --check` pass.

## Scope Expansion - Provider-Native Requests And Image Editing

- Unselected model rows do not render a trailing chevron. Selected rows keep the check mark and stable trailing alignment in both Chat and shared Studio menus.
- The developer-managed model catalog exposes explicit OpenAI, Anthropic Claude, Google Gemini, Kimi, DeepSeek, Qwen, and generic OpenAI-compatible vendor identities. Existing session-only BYOK behavior remains unchanged: users still provide only one API URL and key, while the selected catalog model determines the request adapter.
- The built-in catalog and Admin presets include current commonly used models from official vendor documentation, with truthful chat, vision, tool-calling, streaming, image, image-editing, audio, and embedding capabilities.
- Provider requests use the vendor's documented endpoint, authentication headers, message format, multimodal parts, tool schema, sampling/output parameters, and response extraction. Kimi's fixed sampling constraints are not overridden by generic Temperature or Top-P values.
- Drawing supports text-to-image and image editing. Editing accepts a source image and optional mask; OpenAI sends a structured multipart edit request, while Gemini sends image parts through native `generateContent` and treats an optional mask as a semantic reference because Gemini exposes no structured mask field.
- Drawing sends typed count, size/aspect, resolution, quality, and output-format options instead of appending count to the prompt. OpenAI maps count to `n`; Gemini uses bounded request fan-out because native Gemini image generation has no deterministic output-count parameter.
- Every returned image asset is retained and rendered. Provider-specific unsupported fields are omitted rather than sent optimistically.

### Acceptance Criteria

- [x] No unselected model option in Chat, Image, PPT, Mind Map, or Translation displays a trailing `>` icon; selected rows still display a check without width movement.
- [x] Public bootstrap and Admin model forms recognize `openai`, `anthropic`, `gemini`, `kimi`, `deepseek`, `qwen`, and `openai-compatible` vendors.
- [x] Official model presets cover the current common families documented for all six named vendors, including OpenAI/Gemini image models and OpenAI/Gemini/Qwen embedding models where supported.
- [x] Contract tests prove provider-specific auth, endpoints, parameter normalization, streaming/tool payload shape, and model-specific sampling restrictions without contacting live provider APIs.
- [x] Drawing can generate from text, edit an uploaded image, attach an optional mask, choose count/resolution/quality/output format where supported, and pass those values through the typed request.
- [x] OpenAI image generation/editing and Gemini image generation/editing return and display all requested image assets up to the UI limit.
- [x] BYOK values remain session-only, `/admin` remains address-only, and the complete quality gate passes.

## Scope Refinement - Softer Chat Model List

- Chat model options use spacing and local corner radius instead of horizontal separator lines.
- Hover, focus, and selected fills preserve clear interaction feedback without turning the list into a table-like surface.
- The existing `350x195px` popover, `156px` scroll viewport, `46px` option height, transient scrollbar, vendor navigation, and keyboard behavior remain unchanged.

### Acceptance Criteria

- [x] Chat model rows have no visible bottom divider and retain at least an `8px` corner radius.
- [x] The list uses stable internal spacing without changing option height, popover geometry, scrollbar behavior, or focus restoration.
- [x] Targeted Chat model-picker E2E, TypeScript, UI contracts, and `git diff --check` pass.

## Scope Refinement - Balanced Model Scrollbars

- The right model-list scrollbar uses a lighter semi-transparent thumb in light and dark themes.
- The left vendor column gains the same transient scrollbar behavior: transparent at rest, visible only while scrolling, and debounced back to transparent.
- Both columns reserve a stable scrollbar gutter so thumb appearance never changes the popover width or squeezes menu labels.

### Acceptance Criteria

- [x] Model and vendor scrollbar thumbs are visually lighter while remaining readable in both themes.
- [x] The vendor scrollbar appears during mouse, touch, keyboard, or programmatic scrolling and hides after activity stops.
- [x] Vendor/list widths and option/tab widths remain stable across idle and active scrollbar states.
- [x] Targeted Chat E2E, TypeScript, UI contracts, full E2E, Smoke, release check, and `git diff --check` pass.

## Scope Refinement - Emphasized Selected Vendor

- The selected model vendor uses a clearly visible soft red rounded background rather than relying on text color alone.
- Inactive vendors remain visually quiet and hover feedback stays lighter than the selected state.
- Selection emphasis must not add borders, change button dimensions, or shift the vendor/model columns.

### Acceptance Criteria

- [x] The selected vendor has a non-transparent rounded background and stronger text weight.
- [x] Switching vendors transfers the emphasized background to the new selected tab and clears it from the previous tab.
- [x] Popover geometry, vendor scrollbar width, keyboard navigation, and model selection remain unchanged.
- [x] Targeted Chat E2E, UI contracts, QA, Smoke, release check, and `git diff --check` pass.
