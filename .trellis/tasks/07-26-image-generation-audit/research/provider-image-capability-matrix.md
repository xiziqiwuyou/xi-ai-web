# Image Provider Capability Matrix

Sources consulted on 2026-07-26:

- OpenAI OpenAPI: https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml
- BotCF multimodal documentation: https://docs.api.botcf.com/botcf01-multimodal/
- Google GenAI official SDK examples: https://github.com/googleapis/python-genai

## OpenAI

`gpt-image-1` and `gpt-image-1.5` use `/images/generations` for text-to-image and `/images/edits` for edits. Native edits accept multipart `image`, optional PNG `mask`, `prompt`, `n`, `size`, `quality`, `background`, `output_format`, and `output_compression`. OpenAI documents PNG/JPEG/WebP output and 0-100 compression for JPEG/WebP; transparent background requires PNG/WebP.

The current OpenAPI source documents `gpt-image-2` arbitrary width x height sizes subject to divisibility, aspect, pixel, and edge limits. This project treats `gpt-image-2-vip` as a gateway alias and forwards its configured actual model string only when the admin catalog maps it.

## BotCF

BotCF documents `gpt-image-2` families and `nana-banana-2` families. Text-to-image uses `/v1/images/generations`; reference/edit uses `/v1/images/edits`. Local references use multipart `image` and `image[]`; public HTTPS references use JSON `images: [{ image_url }]`. Provider-specific image aliases must not inherit OpenAI-only quality, format, or compression fields unless documented.

`nana-banana-2_sync` is synchronous and `nana-banana-2` is an asynchronous image task family. The requested front-end `nano-banana-2` spelling is normalized to the configured actual model name and displays its sync/async state. This pass does not invent task polling without a configured status contract.

## Google Gemini

Native Gemini image generation uses `generateContent` with `responseModalities: [\"IMAGE\"]` or `[\"TEXT\", \"IMAGE\"]`, plus `imageConfig.aspectRatio` and supported `imageConfig.imageSize`. Reference images are inline image parts. Omit OpenAI-only `n`, `quality`, `output_format`, and `output_compression` from native Gemini bodies.

## Uncertainty

`gpt-image-2-vip` and `nano-banana-2` are provider/catalog aliases rather than names in the OpenAI model enum. Their actual request model strings must remain administrator-editable.
