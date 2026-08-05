# Server-global image generation ETA

## Goal

Replace browser-local image generation timing estimates with one server-global estimate derived from the most recent successful generations.

## Requirements

- Persist image timing samples on the server without a database.
- Never store API Keys, prompts, image bytes, result URLs, or user identifiers in timing records.
- Record only successful image generations.
- Calculate estimates from at most the 10 most recent matching server records.
- Match the current model, generation mode, resolution, aspect ratio, and count first, with bounded model-level fallback when an exact parameter history does not exist.
- Return a deterministic baseline when the server has no usable history.
- Let every browser connected to the same deployment share the server estimate.
- Stop loading or writing browser IndexedDB timing records from the image workbench.
- Show that the estimate uses server-global recent records and expose the current sample count, capped at 10.

## Acceptance Criteria

- [x] Eleven or more matching records produce an estimate from only the newest 10 successful records.
- [x] Failed and cancelled requests do not affect the estimate.
- [x] A successful image response includes the refreshed global estimate.
- [x] The public estimate endpoint validates the enabled image model and bounded timing parameters.
- [x] The image workbench updates estimates when model or generation parameters change.
- [x] The image workbench shows `基于服务端最近 N 次记录（最多 10 次）` when samples exist.
- [x] Existing image generation, cancellation, result preview, edit handoff, and gallery behavior remain unchanged.
- [x] TypeScript, server tests, UI contracts, focused browser tests, production build, privacy scan, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
