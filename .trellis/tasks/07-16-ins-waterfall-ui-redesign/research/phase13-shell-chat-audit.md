# Phase 13 Shell And Chat Re-Audit

## Scope And Evidence

- Authoritative baseline: `research/figma-menu-submenu-audit.md:5-42,125-130,159-175` and `design.md:196-223`.
- Current source: `src/app/TopBar.tsx`, `src/features/chat/ChatModule.tsx`, `src/styles/rednote-flat-v2.{shell,chat,responsive}.css`, and focused E2E/static contracts.
- Current local runtime: `http://localhost:8787/chat`, checked at `1440x900`, `1280x720`, `1024x768`, a fractional `1023.33px` CSS viewport, `390x844`, and `375x812`.
- The live Make URL remains unavailable per the persisted Version 24 closure, so this pass uses the authoritative persisted audit plus fresh local source/runtime evidence.

## Verdict

**WATCH.** The Version 24 shell and Chat composition is substantially aligned. There is no P0 structural mismatch: the six-menu shell, Chat heading ownership, session header anatomy, model popover lifecycle, collapsed preview, `896px` message/composer track, and settings anatomy are present. Remaining release risks are the responsive cutoff, mobile touch targets, and settings whose labels imply request behavior that is not implemented.

## Confirmed Clear

- **Shell/menu geometry:** `TopBar.tsx:26-32,117-145` renders the exact six labels, notes, and order. `rednote-flat-v2.shell.css:1-11,36-44,89-150` and runtime at `1024x768` preserve the `224px` rail, `32px` gap, full-width active item, and no document overflow.
- **Mobile navigation:** `TopBar.tsx:81-111,148-191` and `rednote-flat-v2.responsive.css:13-74` provide the `64px` header, one-column overlay, route/outside/Escape dismissal, and trigger-focus restoration. Runtime at `390x844` measured a `350px` overlay with six `56px` rows.
- **Chat heading/session ownership:** `ChatModule.tsx:524-545` owns `01 / INTELLIGENCE`, the model subline, `AI 瀵硅瘽宸ヤ綔鍙癭, `鏂板璇漙, and `浼氳瘽璁剧疆`. `ChatModule.tsx:881-993` leaves only model selection and fold state in each session header.
- **Model popover:** `ChatModule.tsx:741-746,788-844,891-977` exposes `OpenAI / Anthropic / 瑙嗚`, `<vendor> 路 妯″瀷`, local list scrolling, selection, outside click, Escape, folding, and focus restoration. Runtime Escape from a focused option closed the popover and restored `.figma-model-trigger`; the `350x211px` mobile popover stayed inside the `390px` viewport.
- **Collapsed preview:** `ChatModule.tsx:995-1002` retains avatar, title, and final-message preview; runtime measured the authored `72px` preview with a `42px` avatar.
- **Composer geometry:** `rednote-flat-v2.chat.css:408-428,546-650` matches the measured Version 24 geometry. At `1440x900`, message and controls tracks were `896px`, history was `560px` (`100vh - 340px`), composer was `89.3px`, and send control was `32px` with `8px` radius.
- **Settings anatomy and scroll ownership:** `ChatModule.tsx:576-686` contains all reference fields and actions. `rednote-flat-v2.chat.css:710-718,764-823,1084-1133` keeps the dialog viewport-contained; runtime at `390x844` had one dialog scroll owner, no horizontal overflow, and reachable `鍙栨秷 / 淇濆瓨璁剧疆` actions.

## Findings

### P1 - The `<1024px` breakpoint has a fractional-pixel gap

- Contract: `design.md:219-223` and `figma-menu-submenu-audit.md:125-130` require the mobile shell at every width below `1024px`.
- Code: `rednote-flat-v2.responsive.css:13` uses `@media (max-width: 1023px)`.
- Runtime: an intended `1023px` browser override produced a `1023.33px` CSS viewport; `(max-width: 1023px)` was false, so the desktop `224px` rail remained. At `1022px`, the mobile header appeared.
- Minimal change: use range syntax `@media (width < 1024px)` or a tolerant cutoff such as `1023.98px`. Add a boundary regression that covers zoom/fractional CSS pixels, not only integer viewport sizes.

### P1 - Several mobile controls miss the required `44px` touch target

- Contract: `figma-menu-submenu-audit.md:125-130` requires `44px` controls on narrow layouts.
- Runtime at `390x844`: `.figma-icon-button` was `38x38`, `.figma-session-tools button` was `36px` high, `.figma-send-button` was `32x32`, and `.figma-settings-close` was `36x36`. Heading actions, model/fold controls, nav rows, segmented settings, and footer actions correctly reached `44px`.
- Code: `rednote-flat-v2.shell.css:199-211`, `rednote-flat-v2.responsive.css:151-163`, `rednote-flat-v2.chat.css:637-650,748-758,1109-1133`.
- Minimal change: enlarge the clickable boxes to at least `44x44px` below `760px`; preserve the authored `32px` send visual with an inner element or pseudo-element if needed.
- Test gap: `tests/e2e/mobile-layout.spec.ts:37-62` checks only the six menu rows. Extend it to header icons, Chat tools/send, and settings close.

### P1 - Settings copy overstates request behavior

- `Top-P` and `鏈€澶?Token 鏁癭 are stateful UI only: `ChatModule.tsx:177-180,639-667`; neither is included in the request at `ChatModule.tsx:410-421` nor in `ChatStreamPayload` at `src/types.ts:214-224`.
- `涓婁笅鏂囨暟` offers `4K / 16K / 32K / 128K tokens` at `ChatModule.tsx:650-657`, but the value is used as a message-count argument to `history.slice(...)` at `ChatModule.tsx:413`.
- `宸ュ叿璋冪敤鏂瑰紡` changes prompt text at `ChatModule.tsx:381-389`; it does not configure provider tool execution.
- `娴佸紡杈撳嚭` is correctly wired at `ChatModule.tsx:285-350` and is not part of this finding.
- Minimal change: pass supported `topP`/token limits through the typed request and provider adapters, implement a real token/message context policy, and either enforce tool mode at the provider boundary or relabel it as an instruction preference.

### P2 - Exact three-row model fidelity depends on catalog density

- `ChatModule.tsx:741-746,945-975` correctly caps the visible count at three and keeps a fixed three-row viewport.
- Fresh runtime data had five OpenAI models but only two Anthropic and two visual models, so those headings displayed `鏄剧ず 2 涓猔 and left the third row empty. This is logically correct but differs from the exact Version 24 populated state.
- Minimal change: keep the dynamic implementation; ensure default/demo and visual-regression catalogs provide at least three enabled Chat models per vendor. Do not hardcode nonexistent models or a false count.

### P2 - Tool-mode grouping has an incorrect accessible state name

- Code: `ChatModule.tsx:672-679` wraps three buttons in a `<label>`.
- Runtime: the selected `鑷姩` button was exposed with the accessible name `宸ュ叿璋冪敤鏂瑰紡 璇㈤棶鍚庤皟鐢?绂佺敤`, while its visible text remained `鑷姩`.
- Minimal change: replace the wrapping label with `fieldset/legend` or `role="group"` plus `aria-labelledby`; keep each segmented button's own accessible name equal to its visible copy.

### P2 - Saved settings survive dialog reopen, not Chat remount

- `saveSettings()` at `ChatModule.tsx:506-509` only clears the rollback snapshot and closes the dialog; initial settings live only in component state at `ChatModule.tsx:175-184`.
- Current E2E coverage at `tests/e2e/chat-settings.spec.ts:44-130` proves Cancel rollback and Save across close/reopen, but not route leave/return or reload.
- Minimal change: explicitly decide the contract. If `淇濆瓨璁剧疆` should survive Chat remount within the browser session, persist a versioned settings object in session-local storage; otherwise document and test the current component-lifetime scope.

## Prioritized Fixes

1. Replace the `max-width: 1023px` cutoff so every fractional width below `1024px` uses the mobile shell.
2. Guarantee `44x44px` mobile hit areas for header icons, Chat tools/send, and settings close without changing the intended visual scale.
3. Make Top-P, context, max-token, and tool-mode labels truthful by wiring their request behavior or narrowing the copy.
4. Add mobile touch-target and fractional-breakpoint E2E coverage.
5. Replace the tool-mode wrapping `<label>` with valid grouped-control semantics.
6. Keep production model grouping dynamic, but seed at least three models per vendor for exact Figma visual regression states.
7. Decide and test whether saved Chat settings persist across route remounts.
