# Scrollbar visibility refinement

## Goal

Keep public-shell scrollbars visually hidden while idle and reveal only the scrollbar that is actively scrolling.

## Requirements

- Remove pointer-hover scrollbar activation from the public workspace.
- Apply one shared debounced scroll-activity behavior to the public workspace and destination navigation.
- Keep scrollbar width and `scrollbar-gutter` stable so content does not shift when the thumb appears.
- Preserve the public workspace as the only page-level vertical scroll owner.
- Do not change navigation order, layout geometry, or feature behavior.

## Acceptance Criteria

- [x] Moving the pointer over the page does not reveal either public-shell scrollbar.
- [x] Wheel, touchpad, keyboard, or programmatic scrolling reveals only the scroller receiving the scroll event.
- [x] The active thumb fades back to transparent after a short debounce.
- [x] Desktop and mobile layouts retain one page-level scroll owner and no horizontal overflow.
- [x] TypeScript, UI contracts, focused Playwright coverage, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
- Existing frontend component guidelines already define the required auto-hiding scrollbar contract, so no additional code-spec update is needed.
