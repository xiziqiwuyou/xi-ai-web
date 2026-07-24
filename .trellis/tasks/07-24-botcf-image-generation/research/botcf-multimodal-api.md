# BotCF Multimodal API Notes

Source: https://docs.api.botcf.com/botcf01-multimodal/

Fetched: 2026-07-24

## Image Endpoints

- Base URL for the app's BYOK preset should be `https://botcf.com/v1`.
- Requests authenticate with `Authorization: Bearer <BotCF API Key>`.
- Text-to-image uses `POST /v1/images/generations`.
- Any reference-image task, image-to-image task, or image edit uses `POST /v1/images/edits`.
- JSON reference-image edits pass `images: [{ image_url: "https://..." }]`.
- Multipart reference-image edits use `image` for the first uploaded file and may use `image[]` for additional uploaded references.
- Public HTTPS direct image URLs are required for JSON references.

## Gemini Image Models

- BotCF Gemini image models use the OpenAI Chat-compatible `POST /v1/chat/completions` path instead of the Images edit endpoint.
- Reference images are represented as message content parts with `{ type: "image_url", image_url: { url } }`.
- Local browser uploads should not be sent directly to this path because the documented Chat-compatible sample uses public URLs.

## Relevant Model Families

- Image2: `gpt-image-2`, `gpt-image-2-1k`, `gpt-image-2-2k`, `gpt-image-2-4k`, `gpt-image-2-4k特惠`.
- Grok Image: `grok-imagine-image`, `grok-imagine-image-quality`.
- Gemini Image: `gemini-3-pro-image`, `gemini-3.1-flash-image`.
- Nana Banana: `nana-banana-2_sync`, `nana-banana-pro_sync`, `nana-banana-2-4k_sync`, plus async variants.
