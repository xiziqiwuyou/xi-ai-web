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

## Out Of Scope

- Syntax-aware code execution, sandboxes, code download, or language-server features.
- Raw HTML, arbitrary JavaScript, or formula evaluation.
- Changing model/provider request formats, persistence schema, or workflow behavior.
- Persisting reasoning or image-limit settings outside the existing browser session settings.
- Rendering or storing hidden chain-of-thought content returned by providers.
