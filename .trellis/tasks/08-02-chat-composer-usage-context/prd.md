# Chat composer usage and context controls

## Goal

Move Token usage and referenced-history controls out of message bubbles and into one compact composer-adjacent status row that is consistent across every expanded conversation.

## Requirements

- Remove per-message Token usage copy from assistant bubbles.
- When usage display is enabled, render one compact status above the composer: show the latest assistant response's provider-reported input/output/total usage when available; otherwise show a clearly labelled local estimate for the currently selected history context.
- Place the referenced-history message-count selector in the same row with options for recent 4/8/16/32/64/128/256 messages and unlimited history.
- Apply and persist the referenced-history count immediately in sessionStorage; subsequent Chat requests must use the selected count.
- Remove the duplicated referenced-history slider from the Session Settings dialog while retaining model context-window and output-limit settings there.
- Render the composer Token status as text only, without an icon, fill, border, padding, or pill treatment.
- Temporarily remove the Skill category, selection list, and manager entry from Session Settings while preserving `$` command activation and outbound Skill instructions.
- Keep the controls legible at desktop widths and horizontally reachable with 44px targets on mobile.

## Acceptance Criteria

- [x] No `.figma-message-usage` element renders inside a message bubble.
- [x] Every expanded conversation exposes the composer Token status when `showUsage` is enabled, including an estimate fallback when provider usage is absent.
- [x] Provider-reported usage is labelled as the latest response and displays input, output, and total values.
- [x] Changing the composer context-count menu updates visible state, sessionStorage, and the next request history projection.
- [x] Session Settings no longer contains the referenced-history slider and its usage toggle describes the new composer location.
- [x] Composer Token status is plain text with a transparent background and no decorative icon.
- [x] Session Settings exposes no Skill tab or management controls, while `$` Skill invocation remains functional.
- [x] Desktop/mobile geometry, TypeScript, Chat contracts, focused Playwright, production build, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
