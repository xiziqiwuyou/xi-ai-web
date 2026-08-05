# Technical Design

## Frontend preset boundary

`pptPresets.ts` owns typed, UI-facing preset metadata and recommended defaults. `PptStudio` applies those defaults only when the user explicitly changes the presentation type. Existing field state remains the request source, so every recommendation can still be overridden.

The settings panel shows one compact preset summary with purpose and recommended sequence. It does not add a second editor or persist preset state outside the feature.

## Server prompt boundary

`server/ppt-deck.mjs` owns trusted prompt profiles keyed by the shared presentation type IDs. The browser sends only the selected type and user settings; it cannot supply system instructions. `pptGenerationMessages` composes the global JSON contract, preset-specific narrative/layout guidance, and normalized user constraints.

## Layout

At widths of 1100px and above, the workbench uses a 296px settings track, a flexible preview track, and a 148px thumbnail rail. Below 1100px the existing stacked workbench remains. Below 760px thumbnails remain horizontal.

## Layout diversity

Every server profile declares a recommended slide sequence and a bounded layout mix. Prompt instructions require no more than two identical adjacent layouts and describe which content deserves data, timeline, comparison/two-column, or quote treatment. Parsing remains conservative and never invents content solely to force a visual type.

## Rollback

Removing `pptPresets.ts`, restoring the previous `onChange` handler, and reverting the scoped PPT CSS values returns the earlier behavior without changing API or stored data formats.
