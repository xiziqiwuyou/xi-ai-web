# xi-ai-web v0.0.7

## Release status

This release is the first operational baseline after the v0.0.6 Chat/Image acceptance pass. It keeps the public product account-free and BYOK: browser API Keys remain session-only, while the server uses the administrator-managed `https://api.xi-ai.cn` gateway by default.

## Included

- Stable Chat streaming, provider routing, model catalog mapping, and session-only BYOK.
- OpenAI/Gemini image generation and editing contracts with compact result previews and provider-aware parameters.
- Assistant Library, browser-local Agents, visual Workflows, PPT, Mind Map, and text Translation flows.
- Mobile/desktop layout checks, shared dialog geometry, and approval content inside the progress-sync QR stage.
- SSRF protection, request rate/concurrency guards, redacted errors, scoped JSON body limits, and privacy checks.
- Optional Langflow and cloud Knowledge services remain operator-enabled integrations.
- GHCR deployment tags and simplified Compose deployment are pinned to `v0.0.7`.

## Operating classification

- GA candidate: Chat, Image, BYOK, Admin model catalog, Assistants, Agents, local Workflows, PPT, Mind Map, and text Translation.
- Beta/operator-only: Langflow, cloud Knowledge, cross-device sync, independent search providers, and provider-specific hosted tools until their external services are configured and smoke-tested.
- Disabled or hidden by default: OneAPI fragment Key handoff, Shell JWT handoff, retired Audio/Video public modules, and the standalone Knowledge route in the public menu.

## Verification boundary

All local checks and deterministic browser fixtures passed. The release does not claim that a real customer provider Key, PostgreSQL/COS, Langflow instance, GHCR image, or reverse proxy was live-tested from this workstation. Operators must complete the deployment smoke test in `README.md` before enabling optional services.

## Rollback

Keep `v0.0.6` available. For Compose, replace the image tag with `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.6`, then run `docker compose pull && docker compose up -d`.
