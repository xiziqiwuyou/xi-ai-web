# Implementation Plan

1. Add the minimal KaTeX Markdown dependencies and a browser-safe code copy helper.
2. Extract chat message Markdown rendering into focused components for code blocks and math output.
3. Remove primary Skill management actions, retain explicit `$` selection, and move management access into advanced session settings.
4. Widen desktop message presentation and add dedicated code/math styles in the owning chat stylesheet with responsive safeguards.
5. Update chat contracts and browser tests for actions, layout geometry, Skill behavior, formulas, and code-copy feedback.
6. Run typecheck, build, focused Playwright coverage, chat contracts, and diff checks.

## Incremental Controls Plan

7. Add the shared reasoning-effort request type and server allowlist boundary.
8. Map reasoning effort in OpenAI, Anthropic, Gemini, Kimi, DeepSeek, Qwen, and generic compatible adapters with provider contract tests.
9. Add the Chat reasoning menu and confirmed Clear Messages action to the composer toolbar.
10. Add the session-only image count setting, multi-file ingestion, all-image previews, and per-image removal.
   - Keep the preview tray outside the composer and cap each thumbnail card so attachments cannot resize the text-entry surface.
11. Update Chat static contracts and browser tests for request payloads, persistence, keyboard/focus behavior, limits, and mobile geometry.
12. Run provider contracts, Chat contracts, typecheck, build, focused Playwright tests, full QA, visual screenshots, and `git diff --check`.
13. Add a desktop wheel regression test and keep the bounded message history chained to the public workspace at its scroll boundaries.
14. Replace Chat's search toggle/settings pair with a provider menu, derive its request config from BYOK, and verify GLM/Kimi payloads plus desktop/mobile geometry.
15. Add failing browser and static contracts for the grouped settings schema, Save/Cancel persistence, rendering/input behavior, and Prompt versus Function Calling payloads.
16. Extract the typed session-settings schema and grouped dialog, then migrate ChatModule from independent setting states to a saved object plus dialog draft.
17. Implement bounded Prompt tool invocation on the server and preserve the existing provider-native Function Calling path with provider/route contract coverage.
18. Extend message Markdown/code/reasoning rendering and add the derived message outline without enabling raw HTML or arbitrary code execution.
19. Extend composer behavior for token estimates, long-paste attachments, command-menu enablement, and configurable send shortcuts.
20. Map documented OpenAI verbosity and optional usage projection through the native Responses adapter.
21. Restyle the grouped dialog and configurable message/code/input surfaces for desktop/mobile, then run typecheck, build, contracts, focused Playwright, visual screenshots, smoke, and `git diff --check`.
22. Add typed category navigation to `ChatSessionSettingsDialog`, render one active panel, and preserve the existing draft Save/Cancel boundary.
23. Replace stacked section cards with a desktop side menu, mobile horizontal menu, flat rows, and larger readable typography in the Chat-owned stylesheet.
24. Update Session Settings browser coverage for category switching, tab semantics, responsive geometry, dark-theme readability, and every functional control path.
25. Expand context-window options to 1M, add the independent referenced-history message-count setting, and centralize newest-first history selection in the typed Chat settings module.
26. Add request-level browser coverage for both count-based and Token-budget trimming, then update static contracts and persistence assertions.
27. Replace context menus with discrete sliders, add the unlimited history endpoint, and replace fixed output presets with a default-off manual output limit.
28. Verify omitted versus explicit `maxTokens`, unlimited-history Token trimming, persistence, and responsive slider/input geometry.
29. Add the output-limit warning handoff, stable dialog return-focus target, aligned discrete-range headers, compact manual input, and right-side tool-mode menu.
30. Verify single visible dialog ownership, cancel/confirm behavior, one-pixel desktop track alignment, compact mobile/desktop input geometry, menu keyboard behavior, and saved tool-mode requests.
31. Add persistent session pinning, keep expanded sessions above all collapsed cards, and apply pin/recent-use ordering within the collapsed stack before enlarging collapsed-card typography.
32. Add configurable collapse-time title generation with freshness stamps, a BYOK server route, a default `gpt-5.4-mini` catalog migration, and focused persistence/request/browser contracts.
33. Crop the supplied six-avatar sheet into transparent circular project assets, replace assistant presets, add independently persisted personal presets, and verify upload override plus responsive rendering.
