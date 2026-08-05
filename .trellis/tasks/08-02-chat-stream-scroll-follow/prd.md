# Chat streaming scroll behavior

## Goal

Make the expanded Chat message history reveal its scrollbar only during real scrolling and keep a streaming assistant response visibly anchored to the bottom as tokens arrive.

## Requirements

- Hovering or moving the pointer over message history must not reveal the scrollbar.
- Actual user or programmatic message-history scrolling may reveal a low-contrast scrollbar temporarily, without changing the content width.
- While an assistant message streams, every rendered token batch must keep the message history at its bottom boundary so new text appears progressively from the bottom upward.
- The automatic follow behavior must scroll only the message-history element and must not move the outer public workspace.
- Existing wheel propagation from a message-history boundary to the public workspace must remain intact.

## Acceptance Criteria

- [x] Idle and hovered message history use a transparent scrollbar thumb.
- [x] A message-history scroll event reveals the thumb and it fades back to transparent after the debounce interval.
- [x] During a delayed multi-token response, the bottom distance remains at most two pixels before the `done` event.
- [x] The outer workspace scroll position does not change because of token-follow updates.
- [x] TypeScript, Chat UI contracts, focused Playwright tests, production build, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
