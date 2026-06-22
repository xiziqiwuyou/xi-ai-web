# Test Spec - Provider Contract Hardening

Date: 2026-06-05

## Required Commands

- `npm run provider-contracts`
- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run ui-contract`
- `npm run qa`
- `npm run smoke`
- `node --check scripts\provider-contracts.mjs`
- `node --check server\providers\openai.mjs`
- `node --check server\providers\anthropic.mjs`
- `node --check server\providers\gemini.mjs`
- `node --check server\providers\openai-compatible.mjs`
- `node --check server\providers\types.mjs`

## Contract Assertions

- OpenAI adapter:
  - Uses `/responses` for chat.
  - Sends system prompt as `instructions`.
  - Maps image input to `input_image`.
  - Runs function-call output loop.
  - Uses expected image, audio, transcription, and embedding endpoints.

- Claude adapter:
  - Uses `/messages`.
  - Sends `x-api-key` and `anthropic-version`.
  - Maps image data URL to base64 source.
  - Runs tool use/tool result loop.
  - Throws for unsupported native media/embedding capabilities.

- Gemini adapter:
  - Uses `:generateContent` and `:embedContent`.
  - Sends `x-goog-api-key`.
  - Maps image/audio data URLs to `inlineData`.
  - Runs functionCall/functionResponse loop.
  - Sends image/audio generation config fields.

- OpenAI-compatible adapter:
  - Uses `/chat/completions`.
  - Parses SSE streaming deltas.
  - Runs tool call loop.
  - Uses configured video generation/status paths.
  - Uses the shared OpenAI-compatible default capability set for video generation/status assertions.
  - Uses expected image, audio, transcription, and embedding endpoints.

## Privacy Assertions

- Tests must use dummy keys only.
- No `apiKey` or `baseUrl` may be written to backend data.
- Existing `npm run privacy` must pass.
