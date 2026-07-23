# Image Provider API Matrix

Date: 2026-07-19
Scope: OpenAI direct Images API and Google Gemini native image generation/editing. Sources are restricted to official vendor documentation, official SDKs, and official vendor repositories.

## Implementation Decision Matrix

| Concern | OpenAI Images API | Google Gemini native image models |
| --- | --- | --- |
| Primary endpoint | `POST /v1/images/generations`; SDK `client.images.generate(...)` | `POST /v1beta/models/{model}:generateContent`; SDK `ai.models.generateContent(...)` / `client.models.generate_content(...)` |
| Editing endpoint | `POST /v1/images/edits` as multipart; SDK `client.images.edit(...)` | No separate native edit endpoint. Send image part(s) plus an edit instruction through `generateContent`; chat sessions are recommended for iterative edits. |
| Auth | `Authorization: Bearer $OPENAI_API_KEY` | `x-goog-api-key: $GEMINI_API_KEY`; `@google/genai` also reads `GEMINI_API_KEY`. Vertex AI uses Google Cloud auth instead. |
| Current image models | GPT Image family: `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`; SDK also exposes `chatgpt-image-latest`. Compatibility models: `dall-e-2`, `dall-e-3`. | Official Nano Banana guide currently documents `gemini-2.5-flash-image`, `gemini-3-pro-image`, and `gemini-3.1-flash-image`. Preview aliases still appear in model-list samples, so keep the catalog server-driven rather than rewriting IDs client-side. |
| Text-to-image input | JSON body with required `prompt`, explicit `model`, and optional `n`, `size`, `quality`, `background`, `output_format`, `output_compression`, `moderation`, and streaming fields. | `contents` may be a text string or content/part array. Optionally set `responseModalities: ["IMAGE"]` and `imageConfig`. |
| Image-to-image/edit input | Multipart `image` plus `prompt`; GPT Image accepts one or up to 16 PNG/WebP/JPEG inputs under 50 MB each. DALL-E 2 accepts one square PNG under 4 MB. | Put text and one or more image parts in the same request, for example `{inlineData: {mimeType, data: base64}}` plus `{text: "edit instruction"}`. Official guidance states up to 3 references for 2.5 Flash Image and 14 for Pro; the guide also documents a 6-image high-fidelity path. |
| Mask | Supported by `/images/edits`: PNG under 4 MB, same dimensions as the first input image; transparent pixels mark the editable area. With multiple inputs the mask applies to the first image. | No structured mask field in Gemini native `generateContent`. Prompt-directed inpainting/outpainting is supported semantically. Structured user/generated masks belong to Vertex Imagen `editImage`, not the Gemini Developer API. |
| Size / aspect | Standard GPT Image sizes: `1024x1024`, `1536x1024`, `1024x1536`, plus `auto` where supported. `gpt-image-2*` accepts arbitrary `WIDTHxHEIGHT`: each edge divisible by 16, aspect ratio from 1:3 to 3:1, maximum documented resolution `3840x2160`; above `2560x1440` is experimental. | Use `imageConfig.aspectRatio`, not an OpenAI-style pixel size. Standard ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. Gemini 3.1 Flash Image additionally documents `1:4`, `4:1`, `1:8`, `8:1`. Without an input image the default is 1:1; edits try to match input dimensions. |
| Resolution | Controlled by `size`; `gpt-image-2*` supports arbitrary valid resolution. | `gemini-2.5-flash-image` is the normal 1K path. Gemini 3 Pro supports `1K`, `2K`, `4K`; Gemini 3.1 Flash Image supports `512px`, `1K`, `2K`, `4K` through `imageConfig.imageSize`. |
| Output count | `n` is 1-10. DALL-E 3 only supports `n=1`. `partial_images` controls streaming previews and is not output count. | No documented deterministic `numberOfImages` field for Gemini native `generateContent`. The model can return multiple image parts when requested in the prompt. Do not map UI count to `candidateCount`; use fan-out requests when an exact count is required. |
| Quality | GPT Image: `auto`, `low`, `medium`, `high`; DALL-E 3: `standard` or `hd`; DALL-E 2: `standard`. | No image-quality enum. Use model choice and supported `imageSize`. |
| Output format | GPT Image supports `png`, `jpeg`, `webp`; compression 0-100 only for JPEG/WebP. Transparent background requires PNG/WebP. | Gemini Developer API does not support configurable `outputMimeType`, output compression, or image output options in `ImageConfig`. Use the MIME type returned in each image part. |
| Response assets | GPT Image returns `data[].b64_json` by default. DALL-E can return `data[].url` or `b64_json`; generated URLs expire after 60 minutes. Always iterate every `data` item. | Iterate every candidate and every content part. Extract each `part.inlineData.data` with `part.inlineData.mimeType`; do not stop at the first image part. |

## Model-Specific Restrictions

### OpenAI

| Model group | Generate | Edit | Important restrictions |
| --- | --- | --- | --- |
| `gpt-image-2*` | Yes | Yes | Arbitrary valid resolution; transparent background is not supported and returns an error. |
| `gpt-image-1.5`, `gpt-image-1` | Yes | Yes | Standard GPT Image sizes; supports `input_fidelity` low/high for edits. |
| `gpt-image-1-mini` | Yes | Yes | `input_fidelity` is unsupported. |
| `dall-e-3` | Yes | No direct edit | `n=1`; `style` is `vivid` or `natural`; sizes are `1024x1024`, `1792x1024`, `1024x1792`. |
| `dall-e-2` | Yes | Yes | One square PNG under 4 MB for edits; smaller legacy sizes; also owns `/images/variations`. |

OpenAI fields to gate by model:

- Omit `response_format` for GPT Image models; they always return base64.
- Omit `style` except for DALL-E 3.
- Omit `output_format` and `output_compression` for DALL-E models.
- Reject `background: "transparent"` for `gpt-image-2*`.
- Omit `input_fidelity` for `gpt-image-1-mini` and DALL-E.

### Google Gemini

| Model | Default use | Resolution controls | Reference/edit notes |
| --- | --- | --- | --- |
| `gemini-2.5-flash-image` | Fast/default image generation and editing | Standard aspect ratios; normal 1K output | Up to 3 reference images in official guidance. |
| `gemini-3-pro-image` | Highest-quality, diagrams, grounded/current-information images | `1K`, `2K`, `4K` | Up to 14 reference images; Google Search grounding supported. |
| `gemini-3.1-flash-image` | Speed/quality balance | `512px`, `1K`, `2K`, `4K`; additional extreme aspect ratios | Thinking and search grounding; official guide documents a high-fidelity multi-reference path. |

Gemini fields and behaviors to gate:

- Do not send OpenAI fields such as `n`, `quality`, `output_format`, `output_compression`, or `mask` to native `generateContent`.
- `candidateCount` means response candidates, not guaranteed image count.
- `ImageConfig.outputMimeType`, `outputCompressionQuality`, `imageOutputOptions`, and `prominentPeople` are explicitly unsupported in the Gemini API SDK types.
- Editing uses the same multimodal generation method; preserve all returned image parts because one response can contain several.
- `ai.models.generateImages(...)`, `numberOfImages`, and `ai.models.editImage(...)` are Imagen surfaces. The SDK explicitly limits `editImage` to Vertex/Enterprise mode; they are not interchangeable with Gemini native image models.

## Recommended Adapter Contract

```text
OpenAI generate:
  prompt, model, n, size, quality, outputFormat, compression, background

OpenAI edit:
  prompt, model, images[], optional mask, n, size, quality,
  inputFidelity, outputFormat, compression, background

Gemini native generate/edit:
  model, contents[text + optional inline image parts],
  responseModalities, imageConfig{aspectRatio, imageSize}
```

For the xi-ai-web count control:

1. OpenAI: pass the requested count as `n` and return every `data[]` asset.
2. Gemini native: do not invent an `n` mapping. For an exact count, issue bounded parallel requests, flatten returned `inlineData` images, and cap the asset list to the requested count; otherwise treat prompt-requested multi-image output as best effort.
3. Preserve provider-specific option objects instead of silently sending unsupported common fields.

## Official Sources

OpenAI:

- [Image generation guide](https://platform.openai.com/docs/guides/image-generation)
- [Images API reference](https://platform.openai.com/docs/api-reference/images)
- [Official OpenAI Node SDK image resource, generated from the OpenAPI schema](https://github.com/openai/openai-node/blob/master/src/resources/images.ts)
- [Official OpenAI Node SDK authentication setup](https://github.com/openai/openai-node/blob/master/README.md)

Google:

- [Gemini image generation documentation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini models documentation](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API key authentication](https://ai.google.dev/gemini-api/docs/api-key)
- [Official Nano Banana cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_Started_Nano_Banana.ipynb)
- [Official Google Gen AI JavaScript SDK methods](https://github.com/googleapis/js-genai/blob/main/src/models.ts)
- [Official Google Gen AI JavaScript SDK types](https://github.com/googleapis/js-genai/blob/main/src/types.ts)
- [Vertex Imagen API reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api)

Environment note: the OpenAI developer-docs web host returned a regional 403 in this session. OpenAI field-level claims above were therefore verified against the official `openai/openai-node` resource generated from OpenAI's OpenAPI schema; no third-party documentation was used.
