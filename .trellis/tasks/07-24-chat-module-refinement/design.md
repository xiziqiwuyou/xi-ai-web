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

## Compatibility

- Existing Markdown, GFM tables, citations, streamed text, and message storage remain unchanged.
- Existing Skill IDs and request `skillInstructions` remain unchanged.
- The visual browser tests and chat-local contract are updated only where primary-action expectations changed.

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
- The server remains authoritative with a hard six-attachment slice and the existing per-image validation.

## Destructive Action

- Clear Messages opens the shared `ConfirmationDialog` and affects only the active conversation.
- Cancel restores focus to the toolbar trigger through the shared Dialog contract.
