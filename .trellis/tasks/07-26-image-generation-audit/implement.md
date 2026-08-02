# Implementation Plan

1. Add research-backed model aliases and a typed image capability/profile module; align runtime catalog and admin presets without removing unrelated models.
2. Extend the image request contract and provider adapters for background/custom size/explicit output fields, preserving OpenAI, Gemini, and BotCF contracts.
3. Add the prompt optimization endpoint and client flow using the existing chat-capable catalog and BYOK boundary.
4. Add IndexedDB timing records, sanitization, archive compatibility, repository helpers, and ETA calculation.
5. Rebuild `ImageStudio` around capability-driven controls, prompt optimization, reference editing, progress/ETA, and clear result state.
6. Update the active workbench CSS in its owning module; keep responsive geometry stable.
7. Add focused provider, storage, UI, and e2e coverage.
8. Run the full acceptance command set, review the diff for unrelated changes, and capture new spec guidance.

## Review Gates

- Provider request shapes pass before changing the main UI.
- IndexedDB migration and export/import contracts pass before timing writes are wired.
- Browser tests assert unsupported controls are absent, not merely disabled.
- Final verification includes typecheck, lint, build, provider contracts, UI contracts, feature audit, and `git diff --check`.
