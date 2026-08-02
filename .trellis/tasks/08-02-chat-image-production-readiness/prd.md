# Chat And Image Production Readiness

## Goal

Make the public BYOK chat and image-generation experiences safe and reliable enough for an initial production rollout behind `api.xi-ai.cn`.

## In Scope

- `/chat`: model selection, endpoint routing, session-only API Key, streaming and non-streaming behavior, context projection, image attachments, cancellation, timeout, error feedback, and title generation.
- `/image`: supported image model selection, text-to-image, image-to-image/editing, prompt optimization, size/quality/count/output mapping, progress/cancellation, result persistence, and failure feedback.
- Server boundaries used by those modules: fixed upstream origin, provider adapters, catalog resolution, request validation, request limits, concurrency limits, redaction, usage logging, health checks, and minimal Docker deployment.
- Focused automated contracts and release verification for these two workflows.

## Out Of Scope

- Knowledge cloud, Langflow, agents, workflows, audio, video, PPT, mind map, translation, multi-user accounts, billing, and real provider credential provisioning.
- Database adoption or server-side storage of public users' API Keys.
- Broad UI redesign unrelated to a chat/image production blocker.

## Requirements

1. Public users provide only an API Key. Caller-supplied API base URLs must not control server requests.
2. Model catalog entries must resolve to a trusted vendor adapter, request model name, endpoint protocol, and capability set before an upstream request is created.
3. Chat must support abortable streaming, readable upstream failures, bounded context and attachments, and no persistent credential leakage.
4. Image generation must omit unsupported parameters and correctly distinguish generation from edit/reference requests.
5. Prompt optimization must use the selected chat model and return prompt text rather than an HTML/error envelope.
6. Public generation routes must have bounded body sizes, per-client rate limits, global concurrency limits, upstream timeouts, and redacted errors.
7. The minimal Docker deployment must require only `ADMIN_PASSWORD`, persist server metadata, bind to loopback for reverse proxying, and use `https://api.xi-ai.cn`.

## Acceptance Criteria

- [x] TypeScript, production build, privacy scan, provider contracts, prompt-tool contracts, security tests, server tests, release check, and focused E2E tests pass.
- [x] Chat contract tests cover OpenAI Chat/Responses, Anthropic Messages, and Gemini GenerateContent routing plus abort/error behavior.
- [x] Image contracts cover OpenAI generation/edit and configured Gemini/BotCF image behavior with unsupported fields omitted.
- [x] API Key values are absent from persistent browser storage, server metadata, logs, public bootstrap, and error payloads.
- [x] Requests cannot target private/loopback/link-local upstream addresses through public payloads or admin metadata.
- [x] `/api/health` remains a liveness check; `/api/ready` reports production readiness and is used by Docker health checks.
- [x] The remaining real-Key gateway smoke and unavailable local Docker execution are documented as post-deploy verification gaps.
