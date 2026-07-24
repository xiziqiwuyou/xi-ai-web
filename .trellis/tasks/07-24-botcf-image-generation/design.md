# Technical Design

## Request Flow

```text
Image Studio
  -> GenerationPayload options
  -> POST /api/generate/image
  -> request validation and reference normalization
  -> BotCF adapter
  -> BotCF Images API or BotCF Chat API
  -> normalized GenerationResult assets
```

## Boundaries

- The React image studio owns UX limits and selection state.
- `src/types.ts` owns the shared browser/server request contract.
- `server/index.mjs` validates data URLs, public HTTPS URLs, image counts, and the mutually exclusive input shapes.
- `server/providers/botcf.mjs` owns BotCF endpoint choice and request-body shape.
- Model catalog entries decide that BotCF protocol applies; user credentials remain request-only.

## Protocol Choices

- Native Image2, Grok, and Nana Banana models use BotCF Images endpoints.
- BotCF Gemini image models use the documented OpenAI Chat-compatible endpoint.
- Local references are multipart only, because the documented JSON form requires publicly reachable HTTPS URLs.
- The adapter never uploads or persists a user image outside the request to BotCF.

## Risks

- BotCF accepts multiple local references with `image[]`; preserve one `image` field for the first reference to maintain compatibility with documented one-file uploads.
- Output format and compression controls remain limited to documented OpenAI-style models. BotCF requests do not invent unsupported output fields.
