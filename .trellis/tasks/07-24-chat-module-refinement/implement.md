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
11. Update Chat static contracts and browser tests for request payloads, persistence, keyboard/focus behavior, limits, and mobile geometry.
12. Run provider contracts, Chat contracts, typecheck, build, focused Playwright tests, full QA, visual screenshots, and `git diff --check`.
