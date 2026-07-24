# BotCF Image Generation Integration

## Goal

Add a dedicated BotCF image-provider path to the public image workspace so a user can bring a BotCF URL and API key, select developer-managed BotCF models, and reliably run text-to-image and image-to-image requests.

## Requirements

1. Add `botcf` as a model vendor across the model catalog, Admin model form, frontend labels, and the user's API URL presets.
2. Add BotCF image model presets for Image2, Grok Image, Nana Banana, and the documented Gemini image models.
3. For BotCF image models using the Images API:
   - Text-to-image sends `POST /images/generations`.
   - Any local reference image sends `POST /images/edits` as multipart data.
   - A public HTTPS reference URL sends `POST /images/edits` with `images: [{ image_url }]`.
   - Multiple local references use the documented `image` / `image[]` multipart fields.
4. For BotCF Gemini image models, send the documented OpenAI Chat-compatible `POST /chat/completions` body, with public HTTPS references as `image_url` message content.
5. Extend the image studio to support up to four reference images for BotCF models, individual removal, and optional public HTTPS reference URLs. Do not allow local uploads and remote URLs in one request.
6. Preserve the existing OpenAI and Gemini paths, including their output format, quality, mask, and result-gallery behavior.

## Acceptance Criteria

- [ ] The Admin model form and shipped presets include BotCF as a selectable vendor.
- [ ] The user API URL presets include `https://botcf.com/v1`.
- [ ] BotCF text-to-image, multipart image editing, URL image editing, and BotCF Gemini Chat image request shapes have focused provider contracts.
- [ ] The image studio only exposes multi-reference and URL-reference behavior for BotCF models, without regressing existing OpenAI/Gemini editing flows.
- [ ] Invalid or mixed local/remote references fail before the upstream provider request.
- [ ] Typecheck, provider contracts, UI contracts, targeted browser tests, and build pass.
