# Phase 13 Library / Translation Re-Audit

Date: 2026-07-19
Scope: Figma Make Version 24 Assistants, Translation, shared `FigmaMenu`, shared dialogs, and the mobile navigation lifecycle. This is a read-only product audit; no implementation files were changed.

## Executive Result

The Version 24 first-frame visuals are largely converged. The desktop Assistants page/dialog, mobile Assistants page, Translation workspace, language popovers, and mobile navigation geometry closely match the persisted Version 24 captures. The remaining blockers are behavioral: Assistant launch does not navigate, the visible specialist can map to a different backend assistant, Translation capability cards expose incomplete invented actions, and several mobile/dialog keyboard states are not implemented or tested.

## Ranked Findings

### P1 - `鍚姩姝ゅ姪鎵媊 does not complete the authored launch flow

- Current action: `C:\Users\56252\Documents\New project 2\src\features\studio\StudioModule.tsx:781` writes `aistudio-selected-assistant` and switches the dialog to local success state at lines 865-875.
- Missing action: `onModuleChange("chat")` is never called, so the user remains in `/assistants` and Chat never consumes the pending assistant. The consumer exists at `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx:239`.
- Version 24 expected state: one persistent, full-width `鍚姩姝ゅ姪鎵媊 button; activation starts that specialist and transitions directly to AI Chat. There is no authored `宸插垱寤轰笓灞炰細璇漙 replacement panel.
- The current E2E masks the defect: `C:\Users\56252\Documents\New project 2\tests\e2e\module-shell.spec.ts:683` checks the local success copy and then manually runs `page.goto("/chat")` at line 686.
- Required regression: click `鍚姩姝ゅ姪鎵媊, assert URL `/chat`, assert the pending storage item is consumed, and assert the newly created conversation uses the selected assistant without a manual navigation call.

### P1 - Visible specialist identity can launch an unrelated backend assistant

- The six exact Figma profiles are hard-coded at `C:\Users\56252\Documents\New project 2\src\features\studio\StudioModule.tsx:171`.
- They are paired cyclically with runtime assistants using `assistants[index % assistants.length]` at lines 767-775. Launch stores the runtime assistant ID, not the visible profile ID, at line 783.
- Result: a card labelled `浜у搧鐮旂┒鍛榒 can open a Chat conversation using an unrelated administrator-defined assistant prompt/name. With one runtime assistant, all six visible specialists launch the same assistant; with zero, Version 24's six-card library becomes `00 CURATED AGENTS` plus an empty state.
- Expected state: each visible profile must have an explicit, deterministic backend assistant binding, or the UI must expose the real backend identity. Never present one specialist and launch another.
- Missing tests: fewer than six runtime assistants, reordered assistants, zero assistants, and exact visible-profile-to-created-conversation mapping.

### P2 - Translation capability cards are incomplete pseudo-submenus

- Authoritative copy is correct at `C:\Users\56252\Documents\New project 2\src\features\studio\StudioModule.tsx:180`: `鏂囦欢缈昏瘧`, `鏈搴揱, `鍙岃瀵圭収` with the Version 24 descriptions.
- Current click behavior at lines 958-977 does not match that copy:
  - `鏂囦欢缈昏瘧` only focuses the textarea and asks the user to paste content; there is no DOCX/PDF/subtitle upload control or dialog.
  - `鏈搴揱 only resets tone and shows a notice; there is no term-library submenu, selection state, or locked-term editor.
  - `鍙岃瀵圭収` copies source and result text to the clipboard; it does not present paragraph-level bilingual comparison or review marks.
- The current `activeCapability` / `aria-pressed` state at lines 896 and 1089-1095 is not present in the Version 24 handoff. The cards are visually static in the reference.
- Expected state: either keep all three cards non-interactive presentation tiles, or implement the labelled flows completely. The current half-state should not remain.
- Existing test only checks three buttons and their titles at `C:\Users\56252\Documents\New project 2\tests\e2e\module-shell.spec.ts:737`; it never activates or validates a capability.

### P2 - Several mobile controls miss the 44px target contract

The visual circles may remain at Version 24 size, but the interactive hit boxes should be at least 44px.

- Mobile theme/menu controls: `.figma-icon-button` is `38px` square in `C:\Users\56252\Documents\New project 2\src\styles\rednote-flat-v2.shell.css:199`.
- Assistant dialog close: `.figma-agent-dialog-top > button` is `36px` square in `C:\Users\56252\Documents\New project 2\src\styles\rednote-flat-v2.workbench.css:1218`.
- Translation swap: `.figma-language-row > button` remains `28px` square at lines 1343-1353, including mobile.
- Translation tone buttons: mobile override is only `40px` at lines 1679-1685.
- Translation copy command: `.figma-translate-result > header button` has only `34px` minimum height at lines 1427-1437.
- Language triggers and menu options already meet the contract: mobile triggers are `44px` at lines 1670-1677 and listbox options are `44px` at lines 356-369.
- `C:\Users\56252\Documents\New project 2\tests\e2e\mobile-layout.spec.ts:37` checks only the six navigation rows, not the header buttons or Translation/dialog controls.

### P2 - Mobile navigation focus and breakpoint lifecycle are incomplete

- Opening the menu only toggles state at `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx:154`; focus remains on the trigger. This is acceptable only if the disclosure contract explicitly relies on Tab moving into the navigation; that contract is not tested.
- Route selection closes the menu at lines 125-133, but focus is left on the selected navigation button as its containing sidebar becomes hidden. Expected: move focus to the destination `h1`/main region, or restore it to the menu trigger.
- There is no resize/breakpoint reset. If the menu is open, the viewport is widened past `1024px`, then narrowed again, `mobileNavOpen` remains true and the overlay reappears unexpectedly.
- Safe-area math is incomplete: `C:\Users\56252\Documents\New project 2\src\styles\rednote-flat-v2.responsive.css:207` adds `env(safe-area-inset-top)` to `top`, while the `max-height` at lines 41-49 does not subtract that inset. On notched devices the menu can extend below the viewport.
- Tests cover Escape and non-interactive outside-click focus restoration (`public-navigation.spec.ts:104`, `mobile-layout.spec.ts:72`) but not route-selection focus, resize reset, first Tab destination, or safe-area bounds.
- Intentional match: Version 24 uses a non-modal floating navigation card with no scrim. Keeping `.figma-workspace` as the sole scroll owner while it is open, as asserted at `mobile-layout.spec.ts:68`, is consistent with that design and should not be replaced by a modal drawer without a new design decision.

### P2 - Locked dialogs expose incorrect Escape/scrim semantics

- `C:\Users\56252\Documents\New project 2\src\components\ui\Dialog.tsx:113` only prevents and stops Escape when `canClose && closeOnEscape`. When `canClose=false`, Escape propagates to global handlers even though the modal remains open.
- The scrim is always an enabled button named `鍏抽棴瀵硅瘽妗哷 at lines 164-174, even when `canClose=false` makes it a no-op. Assistive technology is therefore offered a close command that cannot close.
- This affects busy destructive confirmations (`C:\Users\56252\Documents\New project 2\src\components\ui\ConfirmationDialog.tsx:29`) and required API connection (`C:\Users\56252\Documents\New project 2\src\features\settings\ApiConnectionModal.tsx:26`).
- Expected: a locked dialog still consumes Escape; its scrim is disabled/hidden from accessibility or accurately labelled as non-actionable.

### P2 - Assistant mobile dialog lacks safe-area and assistant-specific lifecycle coverage

- Baseline Version 24 geometry at `375x812`: approximately `x=16`, `width=343`, bottom inset `16`, all-corner `16px` radius, `24px` inner padding, and one full-width action.
- Current selectors reproduce the nominal geometry: `.ui-dialog-layer` has `16px` padding (`rednote-flat-v2.modal.css:180`), the assistant layer aligns to the bottom at line 246, and `.figma-agent-dialog` uses `width: min(512px, calc(100vw - 32px))` plus `24px` padding (`rednote-flat-v2.workbench.css:1192`).
- Gap: the bottom inset is fixed `16px`; it does not include `env(safe-area-inset-bottom)`. The close target is also only `36px`.
- No assistant-specific mobile test verifies dialog bounds, sole dialog scroll owner, initial close-button focus, Tab/Shift+Tab containment, Escape, scrim close, trigger restoration, or safe-area clearance.

### P3 - Shared `FigmaMenu` lacks typeahead and two lifecycle edge contracts

- Confirmed implemented behavior in `C:\Users\56252\Documents\New project 2\src\components\ui\FigmaMenu.tsx`: selected-option focus on open (lines 109-121), outside/Escape close (83-107), selection focus restoration (123-129), ArrowUp/Down/Home/End roving focus (138-166), and viewport correction (57-77).
- Missing typeahead: `moveOptionFocus` accepts only Arrow/Home/End keys. The eight-item language menu should move focus by printable prefix, for example `鏃, `F`, or `E`.
- Tab close at lines 145-147 is not tested to ensure focus continues to the next page control after the popover unmounts.
- If `options`, `value`, or `disabled` changes while open, there is no explicit reconciliation/close path; focus can become stale if the focused option disappears.
- Integration risk: `Dialog` listens for Escape in document capture while `FigmaMenu` closes in bubble/document handlers. A future menu inside a dialog can close the outer dialog before the submenu handles Escape. First Escape should close only the topmost submenu.
- Existing menu tests at `C:\Users\56252\Documents\New project 2\tests\e2e\module-shell.spec.ts:20` cover selected state, Escape/outside close, trigger restoration, Arrow/Home/End and viewport containment, but not typeahead, Tab continuation, dynamic options, or nested-dialog Escape ordering.

### P3 - Exact authored copy/order is under-tested

- The six profile definitions currently match Version 24 exactly, including order, descriptions, tags and colors (`StudioModule.tsx:171-178`), but E2E only locks the Product card (`module-shell.spec.ts:652-670`).
- Translation defaults currently match the reference strings (`StudioModule.tsx:186-187`) and render `63 / 5,000`, but tests assert only an English substring and later `5 / 5,000` (`module-shell.spec.ts:713-720`).
- Language option order is not locked even though the source popover must remain: `鑷姩妫€娴媊, `涓枃锛堢畝浣擄級`, `鑻辫锛堢編寮忥級`, `鏃ユ湰瑾瀈, `頃滉淡鞏碻, `Fran莽ais`, `Deutsch`, `Espa帽ol`.
- Add exact copy/order assertions and screenshot checks at `1440x900`, `1280x800`, `390x844`, and `375x812` for Assistants initial/dialog states, Translation closed/open source and target menus, and mobile navigation open state.

## Confirmed Fidelity Matches

- Assistants hero, `06 CURATED AGENTS`, filter order, six visible profiles, desktop `3 x 2` grid, `16px` grid gap, `44px` symbols, `16px` titles, `12px` descriptions, and `10px` tags match Version 24.
- Desktop assistant dialog and its initial mobile bottom-card composition match the persisted captures. Backdrop dim/blur is authored and should remain.
- Translation hero, supporting copy, initial source/result text, language defaults, tone labels, editor anatomy, and capability copy match.
- Desktop Translation controls are correctly locked to `96px / 28px / 96px`; tone controls are `27px`. The shared language popover is `min-width: 190px`, expands to `220px`, has a `248px` local scroll viewport, and uses `44px` option rows, matching the open-menu captures.
- Result chips are visually plain as authored: although JSX contains Check icons, `.figma-translate-result > footer span > svg` is hidden at `rednote-flat-v2.workbench.css:1514`; this is not a remaining visual gap.
- Mobile navigation keeps the exact six-item order/copy, one-column layout, `20px` side insets, `72px` top offset, `16px` radius, and at least `56px` row height.

## Minimum Closure Tests

1. Assistant launch: real `/assistants` to `/chat` transition and deterministic visible-profile/backend binding.
2. Assistant dialog: desktop/mobile geometry, 44px close hit area, safe-area, focus loop, Escape/scrim, scroll owner, and trigger restoration.
3. Translation capabilities: lock as static or test complete file/term/bilingual flows; do not retain pseudo-actions.
4. Translation mobile targets: header copy, swap, tone, and dialog controls at least 44px.
5. `FigmaMenu`: printable typeahead, Tab continuation, dynamic-option reconciliation, and nested-dialog Escape precedence.
6. Mobile navigation: route-selection focus, resize reset, safe-area bounds, header button targets, and explicit close assertion after selection.
