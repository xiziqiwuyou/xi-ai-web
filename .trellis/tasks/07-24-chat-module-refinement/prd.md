# Chat Module Refinement

## Goal

Make the public AI chat workspace feel focused for ordinary browser conversations while improving readability for long answers, code, and mathematical content.

## Confirmed Facts

- Chat currently exposes persistent Skill-management buttons in the desktop workspace heading and mobile session header.
- Skills are already optional per conversation, start unselected, are injected only when selected, and can be selected through the `$` command palette.
- Messages currently use an 896px shared message/composer track, with 40px avatars adjacent to bubbles.
- Markdown uses `react-markdown` and `remark-gfm`; fenced code blocks have only basic `pre` styling and mathematical markdown is not rendered.

## Requirements

1. Remove the persistent Skill-management buttons from the public chat header and mobile session actions.
2. Keep Skills optional: normal messages must not receive Skill instructions unless the user explicitly selects one through `$` or the advanced session settings.
3. Retain access to local Skill management from the advanced session-settings flow without showing it as a primary chat action.
4. Expand desktop message presentation and place assistant/user avatars nearer to the left/right visual edges without making the composer overly wide or degrading mobile layout.
5. Render inline and block mathematical markdown with KaTeX.
6. Render fenced code blocks as a dedicated component with a language label, copy action, accessible feedback, and horizontal overflow handling. Inline code remains lightweight.
7. Preserve Markdown safety: do not enable raw HTML rendering.
8. Add a per-conversation reasoning-length menu above the composer with six levels: Default, Off, Low, Medium, High, and Extra High. Default must preserve provider behavior by omitting explicit reasoning parameters.
9. Carry the selected reasoning level through the browser request, server validation, and vendor adapters. Each adapter maps only documented vendor fields and prunes incompatible sampling fields where required.
10. Rename the existing context-clear action to Clear Messages and require confirmation before deleting the current conversation's messages.
11. Add a session-scoped maximum image count setting with values 1, 2, 4, and 6, defaulting to 4 while preserving the server hard limit of 6.
12. Support selecting multiple images, adding them up to the configured limit, showing every selected image, and removing individual images before sending.
13. Keep pending image previews outside the text composer so attachments never reduce the message-entry area. Use compact, horizontally scrollable thumbnails at every viewport.
14. Keep desktop message-history scrolling chained to the public workspace so the mouse wheel continues moving the page when the message list reaches either boundary.
15. Replace Chat's separate search settings action with a vertical GLM/Kimi provider menu. The selected provider must reuse the current user-supplied API URL and Key instead of collecting a second credential pair.
16. Refactor Session Settings into clear Appearance, Skills, Model, OpenAI, Messages, Math, Code Blocks, and Input groups without changing the shared Dialog accessibility contract.
17. Replace the legacy Auto / Ask Before Calling / Disabled tool modes with Prompt and Function Calling. Prompt mode must use a bounded server-owned JSON protocol and the same allowlisted tool executor; Function Calling keeps provider-native tool calls. Provider-hosted tools remain Function Calling only.
18. Add real message presentation settings for user-prompt visibility, serif type, user Markdown rendering, collapsible `<think>` reasoning, a compact message outline, and bounded message font sizing.
19. Add real math settings for KaTeX rendering and optional single-dollar inline delimiters. Raw HTML and formula evaluation remain disabled.
20. Add real code-block settings for theme, framed blocks, line numbers, initial collapse, wrapping, and sandboxed HTML preview. Arbitrary code execution and an editable code editor remain unavailable.
21. Add real input settings for estimated token display, long-paste conversion to a text attachment, `$` / `/` command menus, and Enter versus Ctrl+Enter send shortcuts.
22. OpenAI-only response verbosity and usage display settings must map to documented response behavior and be ignored safely by other provider adapters.
23. Reorganize Session Settings as a categorized workspace: desktop uses a persistent left category menu and one active right panel; mobile uses a horizontally scrollable category bar. Keep all existing settings and draft Save/Cancel behavior while improving text size, contrast, spacing, and scanability.
24. Expand the model context-window setting through 1M tokens and add an independent recent-history message-count setting. The outbound Chat request must first cap history by the selected message count and then trim older messages to the selected Token budget, always preferring the newest message.
25. Present context-window size and referenced-history count as discrete sliders. Referenced history may be unlimited while remaining bounded by the Token window. Replace fixed maximum-output presets with an optional manual Token limit that defaults off and is omitted from provider requests while disabled.
26. Keep paired context sliders on one desktop baseline, present the manual output value as a compact right-side control, warn before enabling it, and replace the tool-mode segmented control with one right-side Prompt/Function menu.
27. Make the provider-managed maximum output the default, enlarge collapsed conversation summaries, support persistent pinning, and always place expanded conversations first; apply pin and last-use ordering only to collapsed conversations.
28. When a changed conversation is explicitly collapsed, optionally summarize its title through a configurable chat model. Default to `gpt-5.4-mini` and the latest four non-empty messages without storing a second API credential.
29. Replace the old photographic avatar presets with six cropped circular AI avatars. Make the same preset set available independently for assistant and personal avatars, while preserving custom personal-avatar uploads.

## Acceptance Criteria

- [x] Desktop chat heading contains only New Conversation and Session Settings actions.
- [x] Mobile session actions contain only New Conversation and Session Settings.
- [x] `$` command selection still adds a Skill tag, and selected Skill instructions are still sent only with that conversation's outbound request.
- [x] Advanced session settings retain a non-primary path to Skill management.
- [x] Desktop message track is wider than 896px while controls remain at the existing readable width.
- [x] At desktop widths, assistant and user avatars sit on opposite outer sides of the message track; mobile maintains visible 44px-safe controls and no horizontal page overflow.
- [x] `$...$` and `$$...$$` expressions render through KaTeX.
- [x] Fenced code exposes a language label and a Copy Code control; clipboard fallback works when `navigator.clipboard` is unavailable.
- [x] Typecheck, build, focused chat browser tests, and existing chat contracts pass.
- [x] The composer toolbar exposes Clear Messages and an accessible reasoning-length menu with all six levels and keyboard navigation.
- [x] Default reasoning omits provider-specific reasoning fields; explicit levels reach the outgoing provider body through the shared Chat request contract.
- [x] OpenAI, Claude, Gemini, Kimi, DeepSeek, Qwen, and custom OpenAI-compatible adapters map explicit reasoning levels through their documented request fields.
- [x] Clear Messages requires confirmation and clears only the active conversation after confirmation.
- [x] Session settings persist a 1/2/4/6 image limit in sessionStorage, defaulting to 4.
- [x] Image input accepts multiple files, keeps up to the configured total, reports overflow, renders all selected images, and removes one image without clearing the rest.
- [x] Server validation caps Chat attachments at 6 and rejects invalid image payloads as before.
- [x] Provider contracts, Chat contracts, typecheck, build, focused browser tests, and mobile overflow checks pass.
- [x] Pending image previews render as a compact tray immediately before the composer; the composer keeps its normal height and the page has no horizontal overflow.
- [x] Wheel input over message content scrolls the public workspace after the bounded message list reaches its edge.
- [x] Chat search exposes GLM, Kimi, and Off as a vertical menu, has no settings icon/dialog, and projects both provider request shapes from the active BYOK connection.
- [x] Session Settings exposes the eight grouped sections on desktop and mobile, keeps one dialog scroll owner, and preserves Cancel versus Save behavior.
- [x] Saved settings are sanitized, stored only in sessionStorage, and restored after reload without storing API credentials.
- [x] Prompt tool mode executes only allowlisted local tools through a strict bounded protocol; Function Calling uses the existing native adapters; provider-hosted tools are rejected in Prompt mode.
- [x] User prompt visibility, message typography, Markdown, reasoning collapse, message outline, and font size visibly affect the active chat.
- [x] KaTeX and single-dollar delimiter toggles affect formula rendering without enabling raw HTML.
- [x] Code theme, framing, line numbers, collapse, wrapping, and sandboxed preview affect fenced code blocks without executing scripts.
- [x] Token estimates, long-paste text attachments, command-menu enablement, and the selected send shortcut affect composer behavior.
- [x] OpenAI verbosity reaches the native OpenAI Responses request and usage is attached to the final assistant message only when enabled.
- [x] Session Settings exposes eight clear categories with tab semantics, mounts only one visible settings panel, preserves one dialog scroll owner, and adapts to a horizontal mobile category bar without document overflow.
- [x] Setting titles and helper text remain readable in light and dark themes, with at least 12px helper text and 13px control labels on desktop.
- [x] Model Settings exposes 4K through 1M context windows plus 4 through 256 or unlimited recent-history messages, persists both values in sessionStorage, and sends only history that satisfies both limits.
- [x] Context and history-count sliders expose readable current values, history supports an unlimited endpoint, and maximum output defaults to unlimited with an optional 1 through 1,048,576 manual Token field.
- [x] Enabling the output limit requires a model-context warning, the confirmation temporarily becomes the only visible dialog, paired tracks align within one pixel on desktop, and tool invocation switches through one accessible popover menu.
- [x] The output limit defaults off, collapsed summaries use readable typography, expanded conversations always stay above every collapsed conversation, and collapsed conversations use pin-first then descending `updatedAt` ordering.
- [x] Explicitly collapsing a changed conversation generates a title with the configured model and recent-message count; defaults are `gpt-5.4-mini` and four messages, and settings survive reload in sessionStorage.
- [x] Six 512×512 transparent-corner AI avatars render as circular presets for both assistant and personal identities; each selection persists independently and a custom upload temporarily overrides the personal preset.

## Out Of Scope

- Syntax-aware code execution, sandboxes, code download, or language-server features.
- Raw HTML, arbitrary JavaScript, or formula evaluation.
- Changing model/provider request formats, persistence schema, or workflow behavior.
- Persisting reasoning or image-limit settings outside the existing browser session settings.
- Rendering or storing hidden chain-of-thought content returned by providers.
- Arbitrary code execution, editable code sandboxes, MathJax installation, multi-model parallel replies, translation shortcuts, or message regeneration/deletion workflows that do not yet exist in Chat.
