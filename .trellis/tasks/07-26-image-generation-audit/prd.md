# Image Generation Audit And Refactor

## Goal

Turn the image generation page into a clear, callable workbench. Support text-to-image, image-to-image/editing, optional prompt optimization, visible progress feedback, and browser-local duration estimates.

## Requirements

1. Support only these requested image model aliases in the image experience: OpenAI `gpt-image-1`, `gpt-image-1.5`, `gpt-image-2`, `gpt-image-2-vip`, and BotCF `nano-banana-2`. `gpt-image-2-vip` is an explicitly configured gateway alias, not an official OpenAI model claim; `nano-banana-2` follows the configured BotCF image protocol.
2. Text-to-image must not include references. Image-to-image/edit must include references. Native OpenAI editing uses multipart; BotCF image models use `/images/edits` for reference edits and the documented public-HTTPS form when applicable.
3. Show parameters only when supported: model, mode, aspect/size, count, quality, background, output format, and compression. Do not display or send inert parameters. OpenAI image models support PNG/JPEG/WebP; transparent output is restricted to PNG/WebP; `gpt-image-2` can use constrained custom sizes.
4. Add an explicit prompt-optimization flow. The user selects an enabled chat model, previews the optimized prompt, then applies or restores it. Optimization must never happen implicitly.
5. During generation, show animation, elapsed time, estimated remaining time, and a cancel state. Record successful and failed requests in IndexedDB with model, mode, size, count, timestamps, and duration. Use bounded matching samples and a median estimate.
6. Keep the existing flat red/white visual language: creation is the primary surface, parameters are compact and grouped, and results/history are separate. Do not add glass, decorative shadows, or inert explanatory panels.
7. Preserve BYOK, admin catalog ownership, and existing gallery asset persistence.

## Acceptance Criteria

- [ ] The five requested model aliases are distinguishable at runtime and in admin presets; display labels and request model names are separate.
- [ ] OpenAI, BotCF image, and BotCF `nano-banana-2` request shapes pass provider contracts and unsupported fields are omitted.
- [ ] Edit requests without references, mixed local/URL references, or over-limit references are blocked before upstream calls.
- [ ] Prompt optimization can select a chat model, preview, apply, and restore through the current BYOK connection.
- [ ] Generation shows animation, elapsed time, and ETA; completion/failure writes IndexedDB timing data and future ETA uses it. If IndexedDB is unavailable, generation still completes without an unhandled persistence error.
- [ ] Desktop/mobile workbench layouts have no parameter squeeze or horizontal overflow.
- [ ] Typecheck, contracts, targeted browser tests, build, and `git diff --check` pass.

## Constraints

- Do not add a database, server-side user storage, or third-party dependency. Timing data is browser-local IndexedDB only.
- Do not reset or overwrite unrelated dirty files in the workspace.
