# Complete requested image result count

## Goal

Ensure image generation returns the requested asset count when an upstream gateway returns only a partial image array.

## Requirements

- Preserve the existing frontend `count` contract and Provider adapter `n` projection.
- Use the first Provider response normally when it contains the requested number of assets.
- When the first response contains at least one but fewer than requested, issue bounded supplemental requests with `count: 1` until the missing images are filled.
- Never perform more Provider calls than the requested image count.
- Apply the same completion behavior to text-to-image and image-edit requests.
- If any bounded completion sequence still cannot provide the requested count, return a clear upstream error instead of a partial successful result.
- Record one timing sample for the complete browser request, including supplemental Provider calls.
- Preserve all existing image result preview, gallery, edit handoff, cancellation, and recent-10 ETA behavior.

## Acceptance Criteria

- [x] A request for two images whose first upstream response contains one image makes one supplemental `count: 1` request and returns two assets.
- [x] A complete first response makes no supplemental request.
- [x] An empty first response remains a `502` without retrying an unbounded sequence.
- [x] A partial sequence that cannot reach the requested count is not reported as completed.
- [x] The normalized response reports matching `requestedCount` and `assetCount` values.
- [x] Provider contracts, release check, TypeScript, server tests, UI/feature contracts, focused Playwright, privacy scan, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
