import type { ImageBackground, ImageOutputFormat, ModelCatalogEntry } from "../../types";

export type ImageModelCapabilities = {
  supportsGenerate: boolean;
  supportsEdit: boolean;
  supportsMask: boolean;
  maxReferenceImages: number;
  supportsAspectRatio: boolean;
  resolutions: readonly string[];
  supportsQuality: boolean;
  supportsBackground: boolean;
  backgrounds: readonly ImageBackground[];
  formats: readonly ImageOutputFormat[];
  supportsCompression: boolean;
  supportsCustomSize: boolean;
  isAsync: boolean;
  note?: string;
};

const openAiFormats: readonly ImageOutputFormat[] = ["png", "jpeg", "webp"];
const allBackgrounds: readonly ImageBackground[] = ["auto", "opaque", "transparent"];

export function imageModelCapabilities(model?: ModelCatalogEntry): ImageModelCapabilities {
  if (!model) {
    return {
      supportsGenerate: false,
      supportsEdit: false,
      supportsMask: false,
      maxReferenceImages: 0,
      supportsAspectRatio: false,
      resolutions: [],
      supportsQuality: false,
      supportsBackground: false,
      backgrounds: [],
      formats: [],
      supportsCompression: false,
      supportsCustomSize: false,
      isAsync: false
    };
  }

  const actual = model.model.toLowerCase();
  const isOpenAiImage = model.vendor === "openai" || model.vendor === "openai-compatible";
  const isGptImage2 = /^gpt-image-2(?:$|-)/i.test(actual);
  const isBotcf = model.vendor === "botcf";
  const isGeminiImage = model.vendor === "gemini" && (model.capabilities.includes("image") || /nano-banana|image/i.test(actual));
  const isAsync = isBotcf && /(?:^|[_-])(?:nano|nana)-banana-2(?:$|[_-])/.test(actual) && !/_sync$/i.test(actual);

  if (isGeminiImage) {
    return {
      supportsGenerate: true,
      supportsEdit: model.capabilities.includes("imageEdit"),
      supportsMask: false,
      maxReferenceImages: 1,
      supportsAspectRatio: true,
      resolutions: ["1K", "2K", "4K"],
      supportsQuality: false,
      supportsBackground: false,
      backgrounds: [],
      formats: [],
      supportsCompression: false,
      supportsCustomSize: false,
      isAsync,
      note: "Gemini 图片接口使用原生 generateContent 参数"
    };
  }

  if (isOpenAiImage || isBotcf) {
    const supportsOpenAiFields = isOpenAiImage;
    return {
      supportsGenerate: true,
      supportsEdit: model.capabilities.includes("imageEdit"),
      supportsMask: model.vendor === "openai",
      maxReferenceImages: isBotcf ? 4 : isGptImage2 ? 16 : 16,
      supportsAspectRatio: true,
      resolutions: isGptImage2 || isBotcf || (model.vendor === "openai" && !/^gpt-image-/i.test(actual)) ? ["1K", "2K", "4K"] : ["1K"],
      supportsQuality: supportsOpenAiFields,
      supportsBackground: supportsOpenAiFields,
      backgrounds: supportsOpenAiFields ? allBackgrounds : [],
      formats: supportsOpenAiFields ? openAiFormats : [],
      supportsCompression: supportsOpenAiFields,
      supportsCustomSize: isGptImage2,
      isAsync,
      note: isBotcf ? "BotCF 图片接口会按参考图自动切换 generations / edits" : undefined
    };
  }

  return {
    supportsGenerate: model.capabilities.includes("image"),
    supportsEdit: model.capabilities.includes("imageEdit"),
    supportsMask: false,
    maxReferenceImages: 1,
    supportsAspectRatio: true,
    resolutions: ["1K"],
    supportsQuality: false,
    supportsBackground: false,
    backgrounds: [],
    formats: [],
    supportsCompression: false,
    supportsCustomSize: false,
    isAsync
  };
}

export function imageModelSupportsResolution(model: ModelCatalogEntry | undefined, resolution: string) {
  return imageModelCapabilities(model).resolutions.includes(resolution);
}

export function filterRequestedImageModels(models: ModelCatalogEntry[]) {
  const requested = models.filter((entry) =>
    (entry.vendor === "openai" && ["gpt-image-1", "gpt-image-1.5", "gpt-image-2", "gpt-image-2-vip"].includes(entry.model)) ||
    (entry.vendor === "gemini" && entry.id === "gemini-nano-banana-2")
  );
  // Keep the local contract fixtures and older admin catalogs usable until the
  // requested aliases have been seeded into the runtime catalog.
  return requested.length >= 2 ? requested : models;
}
