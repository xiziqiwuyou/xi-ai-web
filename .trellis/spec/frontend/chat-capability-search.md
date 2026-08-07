# Chat Capability And Independent Search

## Scope

This guide applies to Chat image attachments, model capability changes, the independent GLM/Kimi search menu, and the `/api/chat/stream` request projection.

## Contracts

- `vision` is the only model capability that enables image attachments in Chat. `image` and `imageEdit` belong to the Image module and must not be used as Chat gates.
- The Chat image button, hidden file input, asynchronous attachment handler, model-switch transition, send preflight, and server catalog validation all enforce the same stable `modelId` capability record.
- A capability change never silently discards a pending user attachment. Explicit model switching uses a confirmation; a refreshed catalog keeps the attachment visible, blocks sending, and exposes removal or model replacement.
- Independent `web_search` has `execution: "search"`. It is not the selected model's `webSearch` capability and does not require `toolCalling`.
- Search is off for new conversations and page refreshes. Selecting GLM/Kimi arms the current in-memory conversation; only an explicit send with non-empty current-turn text invokes search.
- Search queries use only current-turn text. Do not include history, attachment bytes/text, application prompts, or credentials in the search query.
- The Chat route derives the independent-search credential from the primary session-only connection Key; any client-supplied `searchService.apiKey` is ignored and cannot create a second search credential.
- Search runs before Chat generation and is formatted as untrusted external context. Search failure blocks Chat generation; there is no silent plain-Chat or provider fallback.
- Search provider selection never performs a readiness probe. Missing Key, disabled tools, upstream authorization, endpoint support, rate limits, malformed responses, timeout, and cancellation are separate visible states with bounded credential-safe messages.
- The administrator-managed upstream remains the only outbound URL source. Browser-provided search URLs are never accepted.

## Signatures

```ts
supportsChatImageInput(model?: ModelCatalogEntry): boolean
countIncompatibleChatImages(attachments: readonly { kind: string }[], model?: ModelCatalogEntry): number
streamChat(payload: ChatStreamPayload, onEvent: (event: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void>
```

```http
POST /api/chat/stream
Content-Type: application/json

{
  "connection": { "apiKey": "<session-only-key>" },
  "modelId": "<catalog-entry-id>",
  "allowedTools": ["web_search"],
  "searchService": { "provider": "glm" },
  "content": "<current-turn-text>"
}
```

The Chat route derives the search authorization header from `connection.apiKey`. `searchService.apiKey` and `searchService.baseUrl`, when supplied by a caller, are ignored for this route.

## Validation And Error Matrix

| Condition | Required result |
| --- | --- |
| Chat model lacks `vision` and request contains an image | `400` before any provider fetch |
| Model has `image` or `imageEdit` but not `vision` | Image picker stays unavailable in Chat |
| Armed search has no current-turn text | UI notice; no search or Chat request |
| Search tool is disabled or the primary Key is absent | Armed state is cleared; bounded notice; no upstream request |
| Search upstream returns `401`/`403` | `SEARCH_AUTH_FAILED`; Chat generation does not start |
| Search upstream returns `404`/`405` | `SEARCH_ENDPOINT_UNSUPPORTED`; no provider fallback |
| Search upstream returns `429`, timeout, malformed response, or cancellation | Bounded provider-specific error/state; preserve retry state where applicable |

## Good / Base / Bad Cases

- Good: a `vision` catalog entry accepts an image, an armed GLM search uses only the current text and the primary session Key, then the Chat provider consumes marked untrusted context.
- Base: a text-only Chat model sends normally with search off and does not require `webSearch`.
- Bad: a caller sends `searchService.apiKey: "other-key"`, a private `baseUrl`, or an `image`-only model with an image attachment; the route ignores the alternate credential/URL or rejects before provider access.

## Common Mistakes

- Leaving the image picker enabled because only the send handler checks `vision`.
- Treating `image`/`imageEdit` as equivalent to `vision`.
- Inferring GLM/Kimi from the main model vendor when no search provider was explicitly selected.
- Running search while a menu opens or text changes instead of on Send.
- Falling back to ordinary Chat after an explicit search failure.
- Persisting the armed search provider into durable conversation/workspace data without a product requirement.

## Wrong Vs Correct

```js
// Wrong: a client field creates a second search credential.
runIndependentWebSearch({ service: req.body.searchService });

// Correct: the Chat route owns the credential boundary.
runIndependentWebSearch({
  service: { ...req.body.searchService, apiKey: connection.apiKey },
  upstreamBaseUrl: db.settings.upstreamBaseUrl
});
```

```ts
// Wrong: image generation capability enables Chat attachments.
const canAttach = model.capabilities.includes("image");

// Correct: only vision enables Chat image input.
const canAttach = supportsChatImageInput(model);
```

## Verification

- Frontend contract tests cover the capability predicate and independent tool resolution.
- Server tests prove non-vision attachments fail before upstream access and search errors are classified without exposing the Key.
- Playwright covers desktop/mobile image gating, pending-image model transitions, catalog refresh incompatibility, zero-request selection, text-only triggering, Chat-only models without `webSearch`, attachment-only blocking, retry, and refresh reset.

## Tests Required

- Local contracts must assert `vision`/`image`/`imageEdit` separation and independent tool resolution without a model `webSearch` capability.
- Server tests must assert no upstream access for non-vision images, primary-Key-only search authorization, structured `401`/`403`/`404`/`429`/timeout errors, malformed responses, and cancellation.
- Browser tests must cover desktop/mobile, keyboard focus and disabled explanation, dark-mode layout stability, provider-selection no-op, send-time ordering, attachment-only blocking, retry, cancellation, and refresh reset.
