# Technical Design

## Capability source of truth

The public model catalog entry selected by stable `modelId` is the frontend source of truth. A shared frontend predicate must express Chat image eligibility as `capabilities.includes("vision")`. UI rendering, file intake, model switching, and send preflight consume that predicate. The server independently resolves the same `modelId` against its catalog and retains its own `vision` guard.

`image` and `imageEdit` are deliberately excluded from this predicate. Media-only models remain outside the Chat model list even if they expose `vision` for image editing.

## Pending image transition

`ChatModule` owns a pending model transition containing the conversation ID and target model ID. A switch to a non-vision target with pending image attachments opens the existing confirmation-dialog primitive. Confirm removes image attachments only, clears stale attachment notices, applies the target model, and updates the last-model preference. Cancel changes nothing.

Catalog changes are not treated as an explicit user transition. If the selected catalog entry loses `vision`, images remain in session state and the session derives an incompatible-images condition. The composer renders that condition, blocks send, and offers a direct remove-images action.

## Search state machine

Provider selection remains a per-conversation, in-memory `SessionUiState` value. It is not restored after refresh and defaults to off for every new conversation. Request phase is separate transient UI state:

`idle -> searching -> generating -> idle`

Failures transition to `failed`; user cancellation transitions through `cancelled`. Those terminal labels remain visible until the user edits the draft, retries, or turns search off, then return to idle. Selecting a provider only arms the state. `sendMessage` is the sole frontend trigger.

When search is armed, send preflight requires `rawContent.trim()` before any request state or message mutation. The request sends `allowedTools: ["web_search"]` and a provider payload derived only from the session-only API Key. The server resolves the managed search tool, executes it before the Chat adapter, formats it as untrusted external context, and uses the administrator-managed upstream.

The frontend sets `searching` before calling `streamChat`. The first token event changes the phase to `generating`; completion returns to idle, while error and abort retain their terminal label until the next user action. This provides meaningful feedback without adding a new SSE protocol event.

## Independent versus hosted search

Tool definitions with `execution: "search"` bypass selected-model capability and vendor checks. Provider-hosted tools continue through `execution: "provider"` and their declared `requiredCapability`, including `webSearch`. No automatic conversion or fallback exists between these paths.

## Error boundary

The existing abort controller spans search and Chat. Server search failures return bounded public messages after credential redaction. Frontend failure handling restores the raw draft and leaves the selected provider armed for retry. Tool-disabled and Key-removed state changes are reconciled before send and clear the armed provider to prevent surprise future requests.

## Verification strategy

Use pure/local contract tests for the capability predicate and tool resolution, server route tests for crafted requests and no-upstream guarantees, and Playwright for model switching, file intake, search trigger timing, request payloads, accessibility, and responsive layout.

## Rollback

Changes are isolated to Chat state/components, focused styling, search error mapping, and tests. Reverting the new helper/state and tests restores the previous UI while the existing server guards continue to protect requests.
