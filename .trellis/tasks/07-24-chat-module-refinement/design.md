# Design

## Interaction Model

Skills remain an advanced, explicit augmentation to a normal chat message. The composer owns discovery through `$`, selected Skills remain visible as removable tags, and advanced settings own management. The chat header no longer suggests that Skills are a required primary workflow.

## Rendering Boundary

```text
stored Message.content -> react-markdown + remark-gfm + remark-math
                                      -> rehype-katex
                                      -> safe React element tree

fenced code -> ChatCodeBlock -> language label + copy utility + pre/code
inline code -> standard markdown code element
```

- Raw HTML remains disabled because `react-markdown` is not given `rehype-raw`.
- The code-copy helper first uses the Clipboard API and falls back to a selected temporary textarea and `document.execCommand("copy")`, which keeps HTTP IP deployments usable.
- KaTeX CSS is imported from the package once in the Chat module rendering boundary.

## Layout

- The message track widens on desktop from `896px` to `1024px`; the composer/controls retain `896px` for comfortable input line length.
- Assistant messages remain left-aligned and user messages right-aligned; the wider track moves their existing avatars outward organically without absolute positioning.
- Mobile uses the current constrained track and avatar dimensions, preventing page overflow and preserving touch targets.
- Desktop message history remains a bounded inner scroller, but its vertical overscroll chains to `.figma-workspace` at the top and bottom instead of trapping wheel input.

## Compatibility

- Existing Markdown, GFM tables, citations, streamed text, and message storage remain unchanged.
- Existing Skill IDs and request `skillInstructions` remain unchanged.
- The visual browser tests and chat-local contract are updated only where primary-action expectations changed.

## Search Provider Selection

- Chat stores only `searchProvider: "" | "glm" | "kimi"` in each in-memory session UI state; a blank value disables the explicit toolbar search request.
- The toolbar uses the shared `FigmaMenu` listbox with GLM and Kimi first and the Off action last. Options remain one vertical column at desktop and mobile widths.
- Request time combines the selected provider preset with the active `UserProviderConfig.baseUrl` and `apiKey`. Chat does not read or write the standalone search-service session record and does not mount `SearchServiceDialog`.
- A Skill that explicitly requests `web_search` uses the selected provider when present, otherwise infers Kimi from the model/vendor URL and falls back to GLM.

## Reasoning Controls

```text
Chat toolbar selection
  -> ChatStreamPayload.reasoningEffort
  -> server allowlist normalization
  -> provider adapter mapping
  -> vendor request body
```

- The shared value is `default | off | low | medium | high | xhigh`.
- `default` is omission, not a guessed vendor default.
- Provider-specific mapping remains inside provider adapters. The browser never sends raw `thinking`, `reasoning`, or `thinking_budget` objects.
- Explicit reasoning may remove sampling fields for vendors/models that document fixed or incompatible sampling behavior.
- Returned hidden reasoning text is not added to the public message model.

## Image Attachment Limit

- `maxImageAttachments` joins the existing session-only Chat settings and is normalized to `1 | 2 | 4 | 6`, default `4`.
- File input uses `multiple`; each file still passes the existing MIME and 4 MB validation.
- New images append to the active conversation's pending attachments until the configured total is reached. Overflow is visible but does not discard accepted files.
- The browser renders and removes attachments by stable attachment ID. Successful send and Clear Messages remove the pending list; a failed provider request keeps it for retry.
- Pending attachments render in a compact horizontal tray immediately before the composer, never inside it. The tray scrolls independently when several images are selected, while the textarea retains its normal height.
- The server remains authoritative with a hard six-attachment slice and the existing per-image validation.

## Destructive Action

- Clear Messages opens the shared `ConfirmationDialog` and affects only the active conversation.
- Cancel restores focus to the toolbar trigger through the shared Dialog contract.

## Session Settings Refactor

- `chatSessionSettings.ts` owns the typed settings schema, defaults, runtime sanitization, and sessionStorage boundary.
- `ChatSessionSettingsDialog.tsx` owns grouped settings presentation. `ChatModule` keeps only the saved settings object and a disposable dialog draft, so Cancel never needs to roll back live state.
- Rendering and composer settings are passed to Chat-owned components as typed objects instead of read from storage inside leaf components.
- Options without a safe executable behavior are intentionally omitted rather than rendered as inert toggles.

## Tool Invocation Modes

```text
allowed tool names -> server allowlist resolution
  prompt mode   -> local schemas in trusted prompt -> strict JSON envelope
                -> validate allowed name/arguments -> runRegisteredTool -> max 4 rounds
  function mode -> existing provider-native function/hosted tool adapters -> max 4 rounds
```

- The browser sends only `toolInvocationMode: "prompt" | "function"`.
- Prompt mode never executes provider-hosted tools and never trusts arbitrary tool names from model text.
- Search tools remain pre-executed by the existing independent GLM/Kimi search path and are not exposed through either model-controlled loop.
- Tool results are bounded before being returned to the model.

## Configurable Rendering

- `ChatMessageContent` receives a render-settings object. It keeps `react-markdown` raw HTML disabled, enables `remark-math`/KaTeX only when requested, and configures single-dollar parsing explicitly.
- `<think>...</think>` is separated before Markdown rendering and shown in an accessible `details` region; no hidden provider reasoning field is introduced.
- Code lines are rendered from escaped text. HTML preview uses a sandboxed iframe with a restrictive inline CSP and no script capability.
- The message outline is derived from visible messages in memory and scrolls to stable message element IDs.

## Input Behavior

- Token count is an explicitly labelled estimate derived locally from draft length; it is not presented as provider billing data.
- Long pasted text becomes the existing bounded text attachment type. Image capability checks inspect image attachments only.
- Send-shortcut handling is composition-safe and remains subordinate to the open command listbox keyboard contract.

## Session Settings Navigation

- Desktop uses a two-column dialog workspace: a quiet 188px category menu and one active content panel. The menu keeps all eight existing groups visible without repeating every control in one long page.
- Category buttons use `tablist` / `tab` / `tabpanel` semantics. Appearance is the default panel on every open; selecting another category changes only the draft presentation and never saves settings implicitly.
- Mobile converts the category menu into a single horizontally scrollable row above the active panel. The dialog remains the only vertical scroll owner and every category target keeps a 44px touch height.
- Panels use one section heading, one short description, flat setting rows, and local dividers. Nested decorative cards are removed; controls, values, and dependency-disabled states remain unchanged.
- Titles use at least 13px and helper text at least 12px in both themes. Existing token colors provide contrast; no blur, gradient, or glass treatment is added.
- The dialog has a fixed viewport-bounded height across category changes, reserves its scrollbar gutter, disables scroll anchoring, and resets its own scroll position before paint. Switching categories must never recenter the dialog or move the public workspace beneath it.
- Settings categories visually inherit the public sidebar menu contract: transparent inactive rows, bare 16px icons, full primary-fill selection, shared shadow/radius, and matching title/helper typography. The dialog does not use a competing icon tile or left inset indicator.

## Context Selection

```text
conversation messages
  -> keep the latest configured message count
  -> reserve output and system-prompt Tokens from the selected 4K..1M window
  -> walk newest to oldest until the remaining history budget is exhausted
  -> send the selected chronological history
```

- Context-window size and referenced-message count are separate session settings because a large model window must not implicitly send an unlimited conversation.
- Both settings use discrete sliders so supported values remain validated while preserving a continuous range-control interaction. Referenced-message count adds an unlimited endpoint; Token-window trimming remains authoritative.
- The browser uses a conservative local Token estimate for history selection. It is a request-budget guard, not provider billing data.
- The newest message is retained even when one oversized message exceeds the estimated history budget; older messages are discarded first.
- Providers do not receive a synthetic `context_window` field. The selected window changes the actual history included in the existing Chat request.
- Maximum output is a separate opt-in limit. When disabled, Chat omits `maxTokens` and lets the selected model/provider apply its own limit; when enabled, the sanitized manual integer is sent unchanged.
- Enabling the limit swaps Session Settings for one shared confirmation dialog so the overlay/scroll-owner contract remains singular. Session Settings keeps an explicit return-focus reference across that handoff.
- The paired context controls reserve the same title/description row height on desktop, keeping both tracks and value rows aligned even when one description wraps.
- The manual Token field stays in a compact right-side action group with the limit switch. Tool invocation uses the shared right-side `FigmaMenu` with Prompt and Function Calling choices instead of a full-width segmented control.

## Conversation Stack And Titles

- Conversation ordering is deterministic: currently expanded records first by the time they were opened, then collapsed records with pinned items first and persisted `updatedAt` as the final order.
- Pin state remains part of the browser-local `Conversation` record and therefore participates in the existing IndexedDB archive/import path.
- Title generation runs only when the user explicitly collapses a conversation containing messages newer than `titleSummaryAt`. This avoids bulk calls during hydration and repeated charges for unchanged conversations.
- The title request uses the current BYOK connection and an enabled chat model from the administrator catalog. Version-10 catalog migration appends the shipped `gpt-5.4-mini` entry only when that exact `vendor:model` pair is missing.

## Avatar Presets

- The supplied 3×2 source artwork is cropped into six 512×512 PNG assets with transparent corners and a consistent circular boundary. Runtime components consume only the independent project assets, never the temporary composite source.
- Assistant and personal identities share one typed preset catalog but store independent preset IDs. A custom personal upload remains a session-only data URL and takes visual priority without deleting the selected preset.
- New sessions default to the halo robot for the assistant and the human future guide for the personal avatar. Existing unknown legacy preset IDs sanitize to these defaults.
