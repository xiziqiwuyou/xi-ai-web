# Chat Capability Gating and Independent Search State

## Goal

Make the Chat composer honor the administrator-managed model capability catalog before attachment entry, and make independent GLM/Kimi search predictable, explicit, and isolated from model-native search capabilities.

## Requirements

### R1. Capability contract

- `vision` alone controls image attachments in Chat.
- `image` and `imageEdit` remain generation/edit capabilities and must never enable Chat image input.
- The visible image control, hidden file input, attachment handler, send preflight, and server request validation must enforce the same selected model record and capability.
- A crafted request using a non-vision model must fail before any upstream provider call.

### R2. Pending attachment behavior

- A non-vision model must not open the image picker or accept programmatically supplied image files.
- Switching from a vision model to a non-vision model with pending images requires explicit confirmation before removing images.
- Cancelling preserves the original model and attachments; confirming removes only image attachments and completes the switch.
- If a catalog refresh removes `vision` from the selected model, pending images remain visible but incompatible, sending is blocked, and the user can remove them or choose a compatible model.

### R3. Independent search activation

- Search states are off, GLM armed, Kimi armed, searching, generating, failed, and cancelled.
- New conversations and page refreshes start with search off.
- Opening the menu, selecting a provider, typing, attaching files, or changing models must not perform network search.
- An armed provider runs once only when the user sends a non-empty textual question, before the Chat model request.
- The selected provider remains armed for later turns in the same in-memory conversation until explicitly switched off.
- Attachment-only requests cannot trigger independent search; they must request a textual search question without calling search or Chat.

### R4. Search isolation and privacy

- Independent `web_search` is gated by the backend tool switch, a session-only user API Key, an explicit provider selection, and a textual current-turn query.
- Independent search does not require the selected Chat model's `webSearch` capability.
- `webSearch` remains reserved for provider-hosted/native tools and must not be inferred, auto-selected, or used as fallback for GLM/Kimi search.
- The search query contains only the current user text. It must not include image bytes, attachment text, history, or credentials.
- All outbound URLs remain administrator-managed. No browser-supplied URL may affect the search target.
- Provider selection must not probe the API Key. Runtime authorization and endpoint support are determined only by the explicit send.

### R5. Failure, cancellation, and feedback

- Search failure blocks the Chat model request and never silently falls back to plain Chat or another provider.
- Preserve the draft and selected search provider after a retryable failure.
- Surface bounded, credential-safe messages for unauthorized, unsupported endpoint, rate limit, timeout, malformed response, and cancellation cases.
- While an armed request is pending, show the selected provider as searching; switch to generating on the first model token.
- The existing stop action must abort both the search phase and model generation.
- If the backend tool is disabled or the API Key is removed, clear the armed provider and show one explicit notice.

### R6. Scope protection

- Do not add providers, separate search credentials, client-configurable URLs, or automatic keyword-based search.
- Do not alter the Image generation module, provider endpoint catalog, BYOK storage policy, or release/deployment files.
- Preserve the unrelated dirty `v0.0.8` production-acceptance work.

## Acceptance Criteria

- [ ] Non-vision Chat models cannot open or populate the image picker, while text input and text attachments remain usable.
- [ ] `image`/`imageEdit` without `vision` do not enable Chat images.
- [ ] Pending-image model switching has cancel and confirm paths with no silent data loss.
- [ ] Catalog capability loss produces an incompatible attachment state and blocks sending.
- [ ] Client and server reject non-vision image requests before upstream fetch.
- [ ] Selecting GLM/Kimi performs zero network requests; sending a textual question performs exactly one search request before Chat.
- [ ] Search-off and attachment-only paths perform zero search requests.
- [ ] A Chat-only model without `webSearch` can use independent GLM/Kimi search.
- [ ] Search errors, cancellation, and retry preserve the documented state without leaking credentials.
- [ ] Desktop, mobile, keyboard, dark-mode, static, privacy, server, search-contract, and Chat E2E checks pass.

## Out of Scope

- Real-provider credential validation, new hosted-search UI, new model providers, release publishing, deployment, or unrelated component/CSS refactors.
