import {
  assertCapability,
  bufferFromDataUrl,
  fetchJson,
  fetchMultipartForm,
  providerUrl
} from "./types.mjs";

const IMAGE_RESPONSE_LIMIT_BYTES = 64 * 1024 * 1024;
import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";

function authHeaders(provider) {
  return provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
}

function normalizedCount(value) {
  return Number.isFinite(Number(value)) ? Math.max(1, Math.min(4, Math.trunc(Number(value)))) : 1;
}

function imageFiles(inputImages = [], inputImage) {
  const seen = new Set();
  return [...(Array.isArray(inputImages) ? inputImages : []), inputImage]
    .filter((item) => item?.dataUrl)
    .filter((item) => {
      if (seen.has(item.dataUrl)) return false;
      seen.add(item.dataUrl);
      return true;
    })
    .map((input, index) => {
      const payload = bufferFromDataUrl(input.dataUrl);
      if (!payload) throw new Error("BotCF reference image is invalid");
      return {
        fieldName: index === 0 ? "image" : "image[]",
        buffer: payload.buffer,
        fileName: input.name || `reference-${index + 1}.png`,
        mimeType: input.mimeType || payload.mimeType
      };
    });
}

function referenceUrls(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    })
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 4);
}

function isGeminiImageModel(model) {
  return /^gemini-[a-z0-9.-]*image(?:$|[-_])/i.test(String(model || ""));
}

function imageFields({ model, prompt, count, size }) {
  return {
    model,
    prompt,
    n: normalizedCount(count),
    size: String(size || "1024x1024")
  };
}

async function generateViaImagesApi({
  provider,
  model,
  prompt,
  mode,
  inputImages,
  inputImage,
  referenceImageUrls,
  count,
  size,
  signal
}) {
  assertCapability(provider, "image");
  const fields = imageFields({ model, prompt, count, size });
  if (mode !== "edit") {
    return fetchJson(providerUrl(provider, "/images/generations"), {
      headers: authHeaders(provider),
      body: fields,
      signal,
      maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
    });
  }

  assertCapability(provider, "imageEdit");
  const files = imageFiles(inputImages, inputImage);
  const urls = referenceUrls(referenceImageUrls);
  if (files.length && urls.length) {
    throw new Error("BotCF image editing accepts either uploaded references or public HTTPS reference URLs");
  }
  if (urls.length) {
    return fetchJson(providerUrl(provider, "/images/edits"), {
      headers: authHeaders(provider),
      body: {
        ...fields,
        images: urls.map((image_url) => ({ image_url }))
      },
      signal,
      maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
    });
  }
  if (!files.length) throw new Error("BotCF image editing requires at least one reference image");
  return fetchMultipartForm(providerUrl(provider, "/images/edits"), {
    headers: authHeaders(provider),
    fields,
    files,
    signal,
    maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
  });
}

async function generateViaGeminiChat({
  provider,
  model,
  prompt,
  mode,
  inputImages,
  inputImage,
  referenceImageUrls,
  signal
}) {
  assertCapability(provider, "image");
  if (mode === "edit") assertCapability(provider, "imageEdit");
  const files = imageFiles(inputImages, inputImage);
  if (files.length) {
    throw new Error("BotCF Gemini image editing requires public HTTPS reference URLs");
  }
  const urls = referenceUrls(referenceImageUrls);
  if (mode === "edit" && !urls.length) {
    throw new Error("BotCF Gemini image editing requires at least one public HTTPS reference URL");
  }
  return fetchJson(providerUrl(provider, "/chat/completions"), {
    headers: authHeaders(provider),
    body: {
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...urls.map((url) => ({ type: "image_url", image_url: { url } }))
        ]
      }]
    },
    signal,
    maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
  });
}

async function generateImage(params) {
  if (isGeminiImageModel(params.model)) return generateViaGeminiChat(params);
  return generateViaImagesApi(params);
}

export function createBotcfAdapter(provider) {
  const compatible = createOpenAICompatibleAdapter(provider, { kind: "botcf" });
  return {
    ...compatible,
    kind: "botcf",
    generateImage: (params) => generateImage({ provider, ...params })
  };
}
