# Implementation Plan

## Phase 1 - Design System And Shared Primitives

- [x] Update `design-system/xi-ai-web/MASTER.md` from Figma foundations and the approved PRD.
- [x] Update visual tokens in `rednote-flat-v2.tokens.css`.
- [x] Add `MasonryGrid` to `src/components/ui/` and export it.
- [x] Add shared masonry/card/control rules to workbench and responsive CSS.
- [x] Validate TypeScript and UI contracts before module adoption.

## Phase 2 - Public Shell, Dialogs, And Chat

- [x] Restyle `AppShell` and `TopBar` to the Figma shell at desktop/mobile sizes.
- [x] Align shared buttons, icon controls, form fields, chips, tabs, dialogs, and sheets.
- [x] Restyle Chat conversation rail, toolbar, suggestions/masks, message stage, and composer.
- [x] Restyle the first-use API modal without changing session-only BYOK behavior.
- [x] Run targeted public navigation and BYOK E2E tests.

## Phase 3 - Drawing And Gallery Masonry

- [x] Convert Drawing history/results to shared masonry while preserving generation, selection, replay, favorite, export, and delete actions.
- [x] Keep the Drawing parameter panel structured and mobile-sheet compatible.
- [x] Convert Gallery cards to image-first masonry while preserving filters, batch actions, detail dialog, replay, export, favorite, and delete.
- [x] Add stable aspect-ratio placeholders and loading/empty/error states.
- [x] Add E2E assertions for desktop/mobile masonry behavior and horizontal overflow.

## Phase 4 - Agents, Apps, And Mind Map

- [x] Apply shared discovery cards/masonry to Agents and Apps catalogs.
- [x] Preserve Agent setup, permissions, execution timeline, and final result behavior.
- [x] Preserve App runner setup/result switching and mobile market/runner navigation.
- [x] Restyle Mind Map settings, stage header, canvas, tabs, status, editor, and mobile sheet.
- [x] Verify keyboard and mobile navigation across all six public routes.

## Phase 5 - Complete Admin Redesign

- [x] Redesign Admin login/loading/error surfaces.
- [x] Redesign Admin header, sidebar, mobile picker, page headers, and scroll ownership.
- [x] Redesign overview, operations, backup, validation, tool, site, and menu sections.
- [x] Redesign models, assistants, applications, prompt presets, media configuration, and audit log sections.
- [x] Align all admin dialogs, destructive confirmations, loading, empty, success, and error states.
- [x] Preserve all admin API calls, validation, import/export, backup, restore, and audit behavior.
- [x] Extend Admin E2E coverage for desktop and mobile navigation/controls.

## Phase 6 - Quality And Visual Verification

- [x] Run `npm run qa`.
- [x] Run `npm run test:e2e`.
- [x] Run `npm run smoke` and `npm run release-check`.
- [x] Capture public and admin screenshots at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- [x] Verify one scroll owner, no horizontal overflow, no rendered gradients, and no backdrop blur.
- [x] Inspect the application in the in-app browser and fix visual regressions.

## Phase 7 - Figma Fidelity Closure

- [ ] After Figma MCP rate-limit cooldown, use `generate_figma_design` to capture final public and admin routes into file `DRn9F4HRe5cpDSrHW8FiOQ`.
- [ ] Verify imported Figma frames against browser screenshots.
- [x] Update `research/figma-handoff.md` with final page/frame IDs and limitations.
- [x] Run `git diff --check` and a final Trellis quality pass.

## Risk And Rollback Points

- Commit boundary after shared tokens/primitives before module adoption.
- Commit boundary after public modules before Admin redesign.
- Do not change storage schemas or provider contracts.
- If masonry harms keyboard order or mobile stability, fall back per module to a two-column CSS grid while keeping card styling.

## Phase 8 - Model Relay Homepage Fidelity

- [x] Capture the preserved reference at desktop/mobile sizes and record layout measurements.
- [x] Add a root homepage route without adding Admin or account behavior.
- [x] Implement hero, operations, services, onboarding, model/API, FAQ, and footer sections.
- [x] Add homepage-to-workspace History API navigation and defer required BYOK gating until workspace entry.
- [x] Add Home to desktop/mobile navigation and reorganize the More sheet.
- [x] Add route, interaction, scroll-owner, overflow, and mobile target Playwright coverage.
- [x] Run the full quality gate and compare final screenshots to the reference.

## Phase 9 - Online Chat Figma Make Correction

- [x] Remove the synthetic Home route and restore Chat as the public root/default.
- [x] Rebuild the public shell as the AiStudio desktop rail and mobile menu.
- [x] Map the Figma Make visual tokens into the active CSS layer.
- [x] Restyle the complete Chat workspace without changing behavior or request contracts.
- [x] Update navigation, BYOK, Chat, and mobile E2E contracts.
- [x] Verify desktop/mobile screenshots and run the full quality gate.

## Phase 10 - Exact Figma Replacement

- [x] Replace public route metadata and navigation with the exact six Figma destinations and order.
- [x] Replace the adapted public shell with the Figma header/sidebar/footer and mobile navigation behavior.
- [x] Rebuild Chat markup as stacked collapsible sessions while retaining real local persistence and streaming requests.
- [x] Remove all mounted public controls and descriptive surfaces absent from the Figma design.
- [x] Align non-chat destination frames to the Figma design without exposing retired labels.
- [x] Update UI contracts and Playwright assertions to the exact design structure.
- [x] Visually compare all four acceptance viewports and run the complete quality gate.

## Phase 11 - Complete Menu And Submenu Fidelity

- [x] Persist the Version 24 live-preview audit and update design contracts.
- [x] Replace Chat's native model select with the Figma vendor/model popover.
- [x] Complete Chat settings with avatar, Top-P, personal-avatar, and exact control anatomy.
- [x] Rebuild Image around prompt, creation parameters, and the inspiration waterfall while preserving real image generation.
- [x] Rebuild PPT around topic/options, AI creation stages, and prompt ideas while preserving generation/export.
- [x] Rebuild Mind Map around branch controls, canvas, zoom, and capability notes while preserving generated content.
- [x] Rebuild Assistants around category filters, exact card language, and the specialist detail dialog while preserving assistant launch.
- [x] Rebuild Translation around language/tone/source/result/capability surfaces while preserving real translation.
- [x] Extend static and E2E contracts for all secondary menus and responsive states.
- [x] Close the final fidelity gaps: visible-row model counts, cross-vendor roving focus, single-column tablet navigation, and outside-pointer menu dismissal.
- [x] Capture and compare all six routes at four acceptance viewports; run the full quality gate.

## Phase 12 - Version 24 Detail Re-Audit

- [x] Re-open the live Version 24 Make preview and inventory every public route, menu, dialog, and secondary control.
- [x] Measure the desktop Chat message/composer track, Translation toolbar, PPT option cards, Mind Map branches, and Assistant cards against the live preview.
- [x] Add regression coverage for the authored geometry before final verification.
- [x] Align Chat message history and composer to the centered `896px` reference track.
- [x] Align PPT, Mind Map, Assistant, and Translation secondary-control geometry.
- [x] Re-run the four-viewport visual audit and complete the full quality gate.

### Phase 12 Closure Notes

- Chat model popovers now correct horizontal overflow as well as vertical placement, and retain a stable correction during scroll/reflow.
- Chat vendor tabs use automatic activation for `ArrowLeft`/`ArrowRight`/`Home`/`End`; keyboard focus leaves the model popover cleanly, and the trigger regains focus on Escape or selection.
- `新对话` and `会话设置` are owned by the Chat heading card only. Mobile keeps them as compact heading-card commands; session headers contain only model selection and fold state.
- Chat session headers expose the current fold action in their accessible name.
- Fresh visual captures are stored as `.tmp-v24-*.png` for the six routes and the authored submenu/dialog states at `1440x900` and `375x812`.

## Phase 13 - Version 24 Interaction And Responsive Closure

- [x] Move mobile Chat `新对话` and `会话设置` commands from the workspace heading into the active session header while retaining the desktop heading commands.
- [x] Match the authored Chat model popover geometry: `350x195px`, `156px` list viewport, and `46px` model rows without viewport overflow.
- [x] Close the fractional `<1024px` shell breakpoint gap and reset the mobile menu cleanly across route and breakpoint changes.
- [x] Raise mobile public controls to at least `44x44px` hit areas across the shell, Chat, Image, PPT, Mind Map, Assistants, and Translation while preserving compact visual glyphs.
- [x] Preserve desktop Image and PPT split compositions from `1024px` upward and keep stacking below the desktop shell breakpoint.
- [x] Make `启动此助手` complete the authored Assistants-to-Chat transition and remove the intermediate success replacement state.
- [x] Correct grouped-control semantics and locked-dialog Escape/scrim behavior without changing the visible Version 24 frame.
- [x] Add focused E2E coverage for mobile Chat actions, model popover geometry, fractional breakpoint behavior, touch targets, Assistant launch, and dialog/menu lifecycle.
- [x] Run `npm run check`, `npm run qa`, `npm run test:e2e`, `npm run smoke`, `npm run release-check`, and `git diff --check`.

### Phase 13 Follow-Up Semantics

- [x] Carry Image count through typed provider requests and render every returned image asset.
- [x] Normalize generated Mind Maps without mixing generated and reference fallback branches; preserve stable branch identity through reorganization and export.
- [x] Align PPT generation/download output with the promised presentation format.
- [x] Wire Chat Top-P, context, max-token, and tool-mode settings to truthful provider behavior.
- [x] Decide and test session-lifetime persistence for saved Chat settings.

## Phase 14 - Dark Typography And Range-Control Legibility

- [x] Add explicit UI and metadata font stacks so Chinese copy never falls back to a tiny generic monospace face.
- [x] Raise dark-theme muted/faint text and border contrast without flattening the authored hierarchy.
- [x] Improve Temperature and Top-P track, border, thumb, value, and focus visibility in both themes.
- [x] Remove compounded opacity from dark navigation notes and keep small metadata readable.
- [x] Add static and browser regression checks for dark contrast, font fallback, and range-control geometry.
- [x] Verify Chat and session settings at `1440x900`, `390x844`, and `375x812`, then run the required quality gate.

## Phase 15 - Model Selection And Transient Scrollbars

- [x] Make the Chat model-list scrollbar transparent at rest and reveal it only during active scrolling without layout shift.
- [x] Generalize the shared Studio model menu so each destination can provide its own label, accessible name, and placement class.
- [x] Add Chat-capable model selection to AI PPT, Mind Map, and Translation and pass the selected model ID through existing generation requests.
- [x] Add responsive styling for the new menus at desktop and mobile acceptance viewports.
- [x] Add static and browser regression coverage for scrollbar state, menu lifecycle, and selected-model request payloads.
- [x] Verify the affected modules at `1440x900`, `390x844`, and `375x812`, then run the required quality gate.

## Phase 16 - Provider-Native Catalog And Image Editing

- [x] Persist official OpenAI/Gemini image and Claude/Kimi/DeepSeek/Qwen request research under `research/`.
- [x] Remove trailing chevrons from unselected Chat and shared menu options while preserving fixed row geometry and selected checks.
- [x] Extend shared/provider registry types, Admin vendor controls, capability hints, and model presets for Kimi, DeepSeek, Qwen, and image editing.
- [x] Add a non-destructive metadata migration that appends only missing current built-in model presets.
- [x] Add explicit Kimi, DeepSeek, and Qwen adapters over the shared OpenAI-compatible transport with provider-specific sampling normalization.
- [x] Pass truthful Top-P and maximum-output-token values from Chat settings through shared request options where the selected provider supports them.
- [x] Implement typed OpenAI image generation/editing with count, source image, optional mask, resolution, quality, output format, and compression.
- [x] Implement typed Gemini text-to-image and image editing with aspect/resolution mapping, optional semantic mask reference, bounded count fan-out, and flattened assets.
- [x] Update Drawing with Generate/Edit mode, source/mask upload lifecycle, provider-aware controls, and rendering of every returned image.
- [x] Extend provider/static/browser tests and run `npm run check`, `npm run qa`, `npm run test:e2e`, `npm run smoke`, `npm run release-check`, and `git diff --check`.

### Phase 16 Closure Notes

- Provider research is recorded in `research/provider-api-implementation-matrix.md` and `research/image-provider-api-matrix.md`, using official vendor documentation and SDK sources.
- Public model menus keep an empty fixed-width trailing slot for unselected rows and a check mark for the selected row, so removing the chevron does not shift labels.
- OpenAI, Claude, Gemini, Kimi, DeepSeek, Qwen, and generic OpenAI-compatible requests now use explicit provider identities and provider-specific parameter normalization.
- Drawing supports provider-aware text generation and image editing, including source image, optional mask, count, aspect/resolution, OpenAI quality/output format/compression, and rendering every returned asset.
- Verification passed with `npm run qa`, `157` Playwright tests passed (`35` intentionally skipped), `npm run smoke`, `npm run release-check`, and `git diff --check`.
- Residual risk: very large base64 gallery assets can exceed the existing per-resource session persistence limit; current-session rendering and URL-backed gallery assets are unaffected.

## Phase 17 - Softer Chat Model List

- [x] Replace horizontal model-row dividers with list padding, small row gaps, and locally rounded options.
- [x] Preserve the existing popover/list/row geometry, transient scrollbar, selected check, and keyboard interaction.
- [x] Add computed-style regression coverage and run targeted Chat model-picker verification, TypeScript, UI contracts, and `git diff --check`.

### Phase 17 Closure Notes

- Model rows now rest on a transparent surface with `4px` row gaps and `10px` local radii; horizontal dividers were removed.
- Existing `350x195px` popover geometry, `156px` scroll viewport, `46px` option height, selected check alignment, transient scrollbar, and keyboard lifecycle remain unchanged.
- Computed-style E2E assertions verify zero bottom-border width, rounded rows, stable spacing, and unchanged geometry across all four acceptance viewports.
- The no-divider rounded-row contract is recorded in `.trellis/spec/frontend/component-guidelines.md` for future UI work.
- Verification passed with targeted Chat E2E (`18` passed, `2` skipped), `npm run qa`, full E2E (`157` passed, `35` skipped), `npm run smoke`, `npm run release-check`, and `git diff --check`.

## Phase 18 - Balanced Model Scrollbars

- [x] Lighten the shared active model-scrollbar thumb token in light and dark themes.
- [x] Add an independent debounced transient scrollbar state to the vendor column.
- [x] Reserve stable gutters and compensate vendor padding so scrollbar visibility never changes menu geometry or label space.
- [x] Extend browser regression coverage and run the complete quality gate.

### Phase 18 Closure Notes

- The shared active scrollbar token is now `rgba(101, 115, 141, 0.42)` in light mode and `rgba(147, 163, 191, 0.46)` in dark mode.
- The vendor tablist has an independent `650ms` debounced scroll-active state and a fixed `4px` scrollbar gutter; the model list retains its existing independent state.
- Browser regressions verify transparent idle thumbs, visible theme-aware active thumbs, automatic return to idle, and unchanged vendor/list plus tab/option widths.
- The transient dual-column scrollbar contract is recorded in `.trellis/spec/frontend/component-guidelines.md` and enforced by `scripts/ui-contract.mjs`.
- Verification passed with targeted model-picker E2E (`4` acceptance viewports), `npm run qa`, full E2E (`157` passed, `35` skipped), `npm run smoke`, `npm run release-check`, and `git diff --check`.

## Phase 19 - Emphasized Selected Vendor

- [x] Strengthen the selected vendor background while preserving the existing rounded geometry.
- [x] Keep hover feedback lighter than selection and avoid borders or layout changes.
- [x] Add computed-style and state-transfer regression coverage, then run the required quality gate.

### Phase 19 Closure Notes

- The selected vendor now uses a borderless `16%` soft-red background, `10px` radius, red text, and `750` weight; inactive vendors remain transparent.
- Hover uses a restrained `5%` tint, so it remains visibly subordinate to the selected state.
- Browser regression coverage verifies the selected background, radius, weight, and correct transfer of emphasis when switching vendors.
- The selected-vendor pill contract is recorded in `.trellis/spec/frontend/component-guidelines.md` and enforced by `scripts/ui-contract.mjs`.
- Verification passed with targeted model-picker E2E (`4` viewports), `npm run qa`, full E2E (`157` passed, `35` skipped), `npm run smoke`, `npm run release-check`, and `git diff --check`.
