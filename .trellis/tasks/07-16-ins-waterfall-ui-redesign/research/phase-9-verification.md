# Phase 9 Verification - Online Chat Figma Make

## Source

- Figma Make file: `NqmyXu1t03HzZNssnm1dqL`
- Design context node: `0:1`
- Target: AiStudio-style online Chat workspace adapted to xi-ai-web's six public modules and session-only BYOK contract.

## Visual Verification

- `1440x900`: desktop rail, conversation panel, Chat identity bar, controls, empty state, and composer inspected.
- `1280x800`: compact control treatment inspected; model selector remains readable and all controls stay on one row.
- `390x844`: mobile header, five-action Chat control row, prompt cards, horizontal mask strip, and composer inspected.
- `375x812`: compact mobile layout inspected with no document overflow or control overlap.
- Screenshots are stored under `reports/figma-chat/` for local review.

## Automated Evidence

- `npm run qa`: passed.
- `npm run test:e2e`: 52 passed, 4 device-conditional skips.
- `npm run smoke`: passed against `http://localhost:8787`.
- `npm run release-check`: passed against an isolated production server.
- `git diff --check`: passed; only existing line-ending warnings were emitted.

## Figma Asset Gate

- `G5 PASS`: all delivered shell and Chat icons use matching Lucide assets with stable 15-18px icon geometry and 38-44px controls.
- The delivered Chat surface does not require the reference-only avatar images; no placeholder image asset was introduced.
- Controlled gradients are limited to the Figma identity marks. Page backgrounds and operational surfaces remain flat and backdrop blur remains forbidden.
