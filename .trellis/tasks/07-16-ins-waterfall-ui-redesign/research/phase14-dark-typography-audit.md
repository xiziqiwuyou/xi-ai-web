# Phase 14 Dark Typography And Range Audit

## Scope And Evidence

- Baseline: Version 24 typography and settings anatomy in `design-system/xi-ai-web/MASTER.md:10-27`, `design.md:171-174,193`, and `research/figma-make-App.reference.tsx:179,189`.
- Accessibility baseline: `.trellis/spec/frontend/component-guidelines.md:47-65`, PRD WCAG AA requirement, and current Vercel Web Interface Guidelines.
- Current source/runtime: dark `http://localhost:8787/chat` at `1440x900` and `390x844`, with the Chat settings dialog open and both ranges inspected through computed styles.

## Status

**WATCH.** The current pass already fixes the main fuzzy-text causes: `--font-ui` and `--font-mono` now include explicit Chinese Windows fallbacks, range metadata is `10px`, and dark muted text is raised to `#93a3bf`. Runtime contrast is approximately `7.10:1` on `#0f1623`; audited foreground text has `transform:none`, `filter:none`, and `text-shadow:none`.

The remaining problems are filled-primary text contrast and legacy input styles leaking into the Temperature/Top-P controls.

## Findings

### P1 - White text on the dark primary fill fails AA

- `src/styles/rednote-flat-v2.shell.css:115-119` - `.figma-nav-item.active` uses `#fff` on dark primary `#4f8dff`; contrast is about `3.19:1` for the `12px` title.
- `src/styles/rednote-flat-v2.shell.css:141-147` - the active navigation note also applies `opacity: .72`; effective contrast falls to about `2.37:1` at `10px`.
- `src/styles/rednote-flat-v2.chat.css:484-486` - `.figma-message.user .figma-message-bubble` repeats white-on-primary at `14px`, also about `3.19:1`.
- `src/styles/rednote-flat-v2.chat.css:1125-1127` - the `淇濆瓨璁剧疆` filled button repeats the same failing pair at `11px` bold.
- Minimal repair: keep `#4f8dff` for accents, links, focus, and thumbs, but introduce a darker filled-surface token such as `#2368e8` with white text, or use a dark `--on-primary` foreground. Remove alpha opacity from active-item copy and assign an explicit accessible color.

### P1 - Legacy global input chrome overrides the authored range geometry

- Intended range rules: `src/styles/rednote-flat-v2.chat.css:962-1008` declare a `24px` range, `6px` track, `18px` thumb, and blue contrast ring.
- Conflicting legacy rules: `src/styles/legacy.00-foundation.css:194-215,223-228` add field border/radius, `40px` minimum height, `12px` horizontal padding, a near-white inset highlight, and the retired red focus border to every input.
- Runtime computed result for both sliders: `40px` high, `padding: 0 12px`, `14px` radius, `rgba(255,255,255,.92)` inset top highlight. Focus shows a blue outline plus the old red border, producing the visibly fuzzy double halo.
- Version 24 reference uses a plain accent range, not a raised rounded text-field shell.
- Minimal repair on `.figma-settings-grid input[type="range"]`: explicitly reset `min-height`, `padding`, `border`, `border-radius`, and `box-shadow`; reset the same properties on `:focus`. After the desktop reset, give the mobile input a separate `min-height:44px` hit area while keeping the visual track centered.

### P1 - The custom track loses Version 24 progress state

- `src/styles/rednote-flat-v2.chat.css:972-1008` renders one uniform custom track after `appearance:none`; WebKit receives no filled segment from minimum to current value.
- Runtime contrast: track fill `#2a3851` against the dialog surface is about `1.54:1`; its `#637493` border is `3.84:1`, and the blue thumb is `5.68:1`. The control outline is detectable, but current value is communicated almost entirely by thumb position.
- The Version 24 reference relies on `accent-primary`, which presents a primary-colored progress segment.
- Minimal repair: render a primary progress fill using a percentage custom property/gradient or an explicit progress layer, while retaining the `3:1+` track boundary and current thumb ring.

### P2 - Slider names are verbose and change with the value

- Markup: `src/features/chat/ChatModule.tsx:648-657` wraps the heading, slider, endpoint text, and numeric value in one `<label>`.
- Runtime accessible names are `妯″瀷娓╁害 路 Temperature 涓ヨ皑 0.7 鍙戞暎` and `TOP-P 鑱氱劍 0.9 澶氭牱`; the label name changes whenever the value changes even though the native slider already exposes its value.
- Minimal repair: give the heading an ID and use `aria-labelledby`; expose endpoint guidance through `aria-describedby`; render the number as `<output>` and use `font-variant-numeric: tabular-nums`.

### P2 - Design-system documentation is behind the accessibility-adjusted runtime

- `design-system/xi-ai-web/MASTER.md:23-27` still records dark foreground/muted/border as `#e2e8f4 / #6b7a99 / rgba(255,255,255,.08)`.
- Current runtime tokens at `src/styles/rednote-flat-v2.tokens.css:81-96` are brighter: `#edf3ff / #93a3bf / rgba(222,232,250,.13)` plus dedicated range tokens.
- The current values materially improve legibility and should be treated as an accessibility correction, not silently described as the unchanged exact token set. Update the handoff documentation in the owning implementation lane.

## Confirmed Non-Causes

- `src/styles/rednote-flat-v2.tokens.css:27-28,110-119` - explicit Chinese fallbacks, normal kerning, and optical sizing are present; generic CJK monospace fallback is no longer the source of fuzziness.
- Audited foreground text has no transform, filter, or text shadow. Adding global `font-smoothing` or `text-rendering` hacks is not recommended; these can make dark text thinner on macOS and do not fix contrast.
- `src/styles/rednote-flat-v2.modal.css:216-220` intentionally blurs only the background behind `.figma-session-settings`. Background shell text is expected to blur while the dialog is open; the dialog itself is not blurred or transformed.

## Test Gaps

- `tests/e2e/chat-settings.spec.ts:44-95` verifies token strings, font fallback, minimum label size, and `rangeHeight >= 24`, but the unintended computed `40px` legacy field still passes.
- `scripts/ui-contract.mjs:424-431` checks source substrings and cannot detect cascade leakage.
- Add computed assertions for range `border:0`, `padding:0`, `box-shadow:none`, desktop/mobile hit-area rules, blue-only focus treatment, distinct progress fill, stable accessible names, and the active primary text contrast pairs.

## Remaining Selectors To Fix

1. `.figma-nav-item.active`
2. `.figma-nav-item.active small`
3. `.figma-message.user .figma-message-bubble`
4. `.figma-session-settings > footer button.primary`
5. `.figma-settings-grid input[type="range"]`
6. `.figma-settings-grid input[type="range"]:focus`
7. `.figma-settings-grid input[type="range"]::-webkit-slider-runnable-track`
8. `.figma-settings-grid input[type="range"]::-moz-range-track`
9. `.figma-range-control > span`, `.figma-range-control > small`, and the range ARIA linkage
