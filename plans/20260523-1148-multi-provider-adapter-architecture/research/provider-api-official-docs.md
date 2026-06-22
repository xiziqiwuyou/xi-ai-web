# Provider API Research - OpenAI, Anthropic Claude, Google Gemini

Date: 2026-05-23  
Scope: 对话、语音、画图、多模态、工具调用、向量检索  
Source rule: only official provider documentation.

## Official Sources

### OpenAI

- Responses API: https://developers.openai.com/api/docs/guides/responses
- Function calling / tools: https://developers.openai.com/api/docs/guides/function-calling
- Image generation: https://developers.openai.com/api/docs/guides/image-generation
- Audio: https://platform.openai.com/docs/guides/audio
- Embeddings: https://platform.openai.com/docs/guides/embeddings
- Vector stores / file search: https://platform.openai.com/docs/guides/tools-file-search

### Anthropic Claude

- Messages API: https://docs.anthropic.com/en/api/messages
- Tool use: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use
- Vision: https://docs.anthropic.com/en/docs/build-with-claude/vision
- Embeddings guidance: https://docs.anthropic.com/en/docs/build-with-claude/embeddings

### Google Gemini

- Text and multimodal generation: https://ai.google.dev/gemini-api/docs/text-generation
- Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Speech generation / native audio: https://ai.google.dev/gemini-api/docs/speech-generation
- Live API: https://ai.google.dev/gemini-api/docs/live
- Embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- File search / semantic retrieval: https://ai.google.dev/gemini-api/docs/file-search

## Capability Matrix

| Capability | OpenAI | Claude | Gemini |
| --- | --- | --- | --- |
| Text chat | Native, Responses API or Chat Completions | Native, Messages API | Native, generateContent |
| Streaming | SSE | SSE | streamGenerateContent / Live API |
| Vision input | Native image parts | Native image content blocks | Native image/file parts |
| Audio input | Native transcription + selected multimodal models | No primary audio API found in official Claude docs | Native audio input, Live API |
| Speech output | Native speech endpoint | No native TTS found in official Claude docs | Speech generation / native audio models |
| Image generation | Native image generation | No native image generation found in official Claude docs | Native Gemini/Imagen image generation |
| Tool calling | Tools/functions in Responses | `tool_use` + `tool_result` | `functionCall` + `functionResponse` |
| Embeddings | Native embeddings | No Anthropic embedding model; official docs point to external embeddings such as Voyage AI | Native embeddings |
| Vector retrieval | Vector stores + file_search | External/local retrieval, then inject context into Claude | File search / semantic retrieval + embeddings |

## Interface Shape Notes

### OpenAI

- Auth: `Authorization: Bearer <apiKey>`.
- Default base URL: `https://api.openai.com/v1`.
- Text/multimodal recommended endpoint: `POST /responses`.
- Legacy compatibility endpoint: `POST /chat/completions`.
- Images: `POST /images/generations`.
- Speech output: `POST /audio/speech`.
- Transcription: `POST /audio/transcriptions`, multipart upload.
- Embeddings: `POST /embeddings`.
- Retrieval: vector stores + Responses `file_search` tool.

OpenAI adapter should support both:

- `openai`: native Responses API, full multimodal/tools/file_search support.
- `openai-compatible`: existing Chat Completions-style custom endpoints, for Ollama and third-party compatible services.

### Anthropic Claude

- Auth: `x-api-key: <apiKey>` plus `anthropic-version`.
- Default base URL: `https://api.anthropic.com/v1`.
- Main endpoint: `POST /messages`.
- Request shape: top-level `model`, `max_tokens`, optional `system`, `messages`, `tools`, `tool_choice`, `stream`.
- Message content is block-based: text, image, tool_result.
- Assistant tool requests arrive as `tool_use` blocks.
- User tool replies return as `tool_result` blocks.

Claude adapter should expose capability gaps instead of faking support:

- No native TTS/STT in official docs found.
- No native image generation in official docs found.
- No native embedding model; route embeddings to OpenAI/Gemini or an optional external embedding provider.

### Gemini

- Auth: API key via `x-goog-api-key` header or query param. Prefer header in server adapter.
- Default base URL: `https://generativelanguage.googleapis.com/v1beta`.
- Main endpoint: `POST /models/{model}:generateContent`.
- Streaming endpoint: `POST /models/{model}:streamGenerateContent`.
- Request shape: `contents[].parts[]` with text, inline data, file data, function calls, function responses.
- Tool schema uses function declarations.
- Embeddings endpoint family uses embedding models and `embedContent` / batch embedding.
- Image generation is model/capability-specific and should be routed through Gemini image generation APIs.
- Speech generation / native audio is model-specific; settings must separate chat model from audio model.

## Design Consequences

1. One `baseUrl + apiKey + model` is not enough anymore.
   - Need provider kind.
   - Need model overrides per capability.
   - Need capability detection or capability presets.

2. Tool calling cannot be implemented in feature pages.
   - Tool loop belongs in server.
   - Each provider maps tools differently.
   - Server normalizes tool calls into one internal format.

3. Vector retrieval should be provider-neutral first.
   - Use selected embedding adapter to index chunks.
   - Store chunks locally for self-hosted deployment.
   - Inject retrieved context into any chat provider.
   - Use OpenAI/Gemini native file search only as optional provider-native enhancement.

4. Unsupported features must be explicit.
   - Claude chat/vision/tool calling: yes.
   - Claude image/audio/embedding: no native official support found.
   - UI should show disabled capability badges instead of sending broken requests.

5. Existing OpenAI-compatible flow remains useful.
   - Keep it as `openai-compatible` for custom servers.
   - Add native adapters beside it.
