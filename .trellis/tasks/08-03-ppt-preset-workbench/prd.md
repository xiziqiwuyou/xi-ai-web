# PPT preset workbench refinement

## Goal

Make the PPT workspace easier to operate and make each presentation category produce a materially different, polished narrative rather than acting as a label-only option.

## Requirements

- Narrow the desktop settings column to approximately 288-300px.
- Expand the thumbnail rail to approximately 144-152px and keep the main stage flexible.
- Preserve the stacked mobile layout and horizontal mobile thumbnail rail.
- Provide eight presentation presets: business report, product launch, pitch deck, project plan, course, annual review, data analysis, and industry research.
- Each preset defines its purpose, recommended narrative, content density, visual tone, theme, default audience/duration/page count, slide sequence, and prompt guidance.
- Selecting a preset applies its recommended defaults, after which every field remains manually editable.
- The server combines global PPT instructions, the selected preset profile, and all user-entered settings.
- Preserve strict JSON output, exact requested slide count, cover-first behavior, and summary retention.
- Require preset-specific layout variety and prevent more than two identical slide layouts in succession.
- Keep current BYOK, model selection, export, and generation request boundaries unchanged.

## Acceptance Criteria

- [x] Desktop settings and thumbnail columns match the new geometry without horizontal overflow.
- [x] All eight presets are available and selection applies deterministic recommended defaults.
- [x] Manual overrides remain possible after preset selection.
- [x] Generation requests include the selected preset and current overridden values.
- [x] Server prompts contain the selected preset purpose, narrative sequence, layout guidance, and exact page-count contract.
- [x] Preset profiles include cover/summary and suitable data, timeline, comparison, or quote layouts where relevant.
- [x] Browser fixtures exercise all supported slide renderers and avoid three identical layouts in sequence.
- [x] Targeted server tests and Playwright checks pass at 1440x900, 1280x800, 390x844, and 375x812.

## Out Of Scope

- Slide editing, drag sorting, collaboration, new persistence, or new dependencies.
- Changes to Chat, Image Studio, Mind Map, Translation, Admin, or provider architecture.
