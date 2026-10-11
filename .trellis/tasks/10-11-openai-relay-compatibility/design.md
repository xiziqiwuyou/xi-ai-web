# OpenAI Relay Compatibility Design

## Existing Constraints

- `ModelEndpointProtocol` currently selects only the Chat adapter. Image
  generation and editing are selected by the vendor adapter.
- `server/providers/openai-compatible.mjs` already implements Chat Completions
  and image generation but rejects image editing.
- `server/providers/openai.mjs` owns Responses streaming and native OpenAI image
  multipart behavior.
- `server/index.mjs` owns the public route boundary, catalog resolution,
  managed upstream selection, image validation, bounded supplementation, and
  asset extraction.
- `src/types.ts` and `server/registry/model-registry.mjs` own the persisted and
  runtime model catalog shape. Existing records must continue to normalize.

## Model Contract

Add the following optional field to `ModelCatalogEntry` and its runtime form:

```ts
type ModelRequestProfile = "native" | "openai-relay";
requestProfile?: ModelRequestProfile;
```

`native` is the backward-compatible default. `openai-relay` has these rules:

- Chat protocol is OpenAI Chat Completions regardless of the vendor label.
- Image protocol is OpenAI Images generation/editing.
- The actual model ID remains the catalog `model` field.
- The catalog `vendor` remains useful for display and usage grouping but does
  not decide the wire format.

The existing `endpointProtocol` remains persisted for native records and is
preserved during migration. The relay profile validates it as `openai-chat` at
runtime instead of mutating old metadata.

## Adapter Selection

`createProviderAdapter()` checks `requestProfile` first. For `openai-relay`, it
returns the OpenAI-compatible transport for Chat, tools, image, audio, video,
and embedding methods that already have compatible envelopes. For `native`, it
keeps the existing vendor and endpoint-protocol dispatch unchanged.

This makes a Claude, Gemini, or arbitrary model routed through a new-api gateway
use the relay envelope while preserving its catalog label and capability flags.

## Text Projection

Relay Chat builds a strict OpenAI Chat Completions body:

```json
{
  "model": "catalog-model-id",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": [
      {"type": "text", "text": "..."},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
    ]}
  ],
  "stream": true
}
```

Undefined optional values are omitted. Relay mode does not apply Qwen, Kimi,
DeepSeek, Responses, Anthropic, or Gemini-only request rewrites. Existing SSE
and non-stream parsers remain the response boundary.

## Image Projection

Generation uses JSON at `/v1/images/generations` with `model`, `prompt`, bounded
`n`, supported `size`, supported `quality`, and `response_format: "b64_json"`
by default. This avoids expiring or CORS-blocked URLs; the existing URL import
fallback remains available when a gateway returns URLs.

Editing uses multipart `/v1/images/edits`. Browser data URLs are decoded on the
server into bounded file parts named `image`/`image[]`; the optional mask is a
`mask` part. Existing OpenAI PNG/mask validation remains in `server/index.mjs`.

Relay image responses continue through `extractAssets()` so the public result
shape and image timing/supplement logic do not change.

## URL, Error, and Secret Handling

- Reuse `providerUrl()` and add relay-focused tests for base URLs with and
  without `/v1`.
- Reuse `authHeaders()` so only the server-to-upstream request receives the
  Bearer key.
- Extend provider error parsing only where needed for `{ error: { message } }`;
  keep public redaction in `publicProviderError()`.
- Do not expose the selected request profile, upstream URL, or API Key through
  public bootstrap unless an existing public capability projection requires it.

## Admin UX

The model editor adds a compact “请求协议模式” selector. Native is the default;
OpenAI Relay explains that text uses `/v1/chat/completions` and images use
`/v1/images/generations` plus `/v1/images/edits`. Existing endpoint controls stay
visible for native models and are not silently rewritten in saved metadata.

## Compatibility and Rollback

- No data migration is required: absent `requestProfile` normalizes to `native`.
- A relay rollout can be reversed by changing the model profile back to native
  or disabling the relay model; no browser data or API Key migration is needed.
- Provider contracts are extended before the adapter switch. If the relay
  profile is disabled, all existing native adapter paths remain intact.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Gateway accepts Chat but not Images | Gate `image`/`imageEdit` capabilities and return a clear upstream error |
| Gateway rejects optional image fields | Send only documented common fields in relay mode |
| Upstream returns only URLs | Keep URL assets and use the existing same-origin import path |
| Partial `n` response | Preserve bounded sequential supplementation and 502 on incomplete output |
| Existing OpenAI Responses behavior regresses | Relay dispatch is opt-in; native default and native contracts stay unchanged |
