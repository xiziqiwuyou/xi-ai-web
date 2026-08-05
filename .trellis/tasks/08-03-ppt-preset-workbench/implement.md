# Implementation Plan

1. P1: adjust only the scoped PPT desktop settings and thumbnail geometry; preserve existing responsive breakpoints and scroll behavior.
2. P2: add typed preset metadata, apply recommended defaults on explicit type selection, and render a compact preset summary.
3. P3: add server-owned prompt profiles and compose them with normalized user options while retaining strict JSON and exact page-count enforcement.
4. P4: make deterministic browser fixtures cover the slide renderer set, add server prompt/profile regressions, and assert layout/overflow behavior at all four target viewports.
5. Run TypeScript checks, build, PPT server tests, relevant contracts, four-viewport Playwright checks, and `git diff --check`.
6. Perform an independent code/UI review and fix verified findings before reporting completion.
