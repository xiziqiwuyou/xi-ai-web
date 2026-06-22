# Provider API Implications

Date: 2026-05-23

This note summarizes the earlier official-doc research and the product decision shift.

## Vendor facts that matter

- OpenAI: native chat, multimodal, tools, images, audio, embeddings, file search.
- Claude: strong chat, vision, tools; no native image/audio/embeddings in the official docs we reviewed.
- Gemini: chat, multimodal, tools, images, audio, embeddings, semantic retrieval.

## Product implication

- Public users should not manage raw API URLs or API keys.
- Backend should own provider credentials and provider-specific endpoints.
- Admin should manage which providers are enabled and which models each provider exposes.
- Public UI should pick provider + model from backend metadata, then the server routes to the correct vendor endpoint.

## Architecture implication

- Keep a provider adapter layer.
- Add a provider/model registry stored server-side.
- Add capability tags per model.
- Route by capability, not by a single generic endpoint.
