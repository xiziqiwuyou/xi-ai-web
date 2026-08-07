import type {
  MediaEndpointConfig,
  ModelCapability,
  ModelDefaultFor,
  ModelEndpointProtocol,
  ProviderKind
} from "../../types";
import { defaultEndpointProtocolForVendor } from "./adminConsoleConfig";

export type ModelPreset = {
  id: string;
  label: string;
  vendor: ProviderKind;
  endpointProtocol: ModelEndpointProtocol;
  model: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  contextWindowTokens?: number;
  maxInputCharacters?: number;
  mediaConfig?: MediaEndpointConfig;
};

type ModelPresetSource = Omit<ModelPreset, "endpointProtocol"> & {
  endpointProtocol?: ModelEndpointProtocol;
};

function presetContextWindowTokens(preset: ModelPresetSource) {
  const model = preset.model.toLowerCase();
  if (/^gpt-4\.1(?:-|$)/.test(model)) return 1_047_576;
  if (/^gemini-(?:2\.5|3)/.test(model)) return 1_048_576;
  if (preset.vendor === "anthropic") return 200_000;
  if (preset.vendor === "kimi") return 262_144;
  if (preset.vendor === "qwen") return 1_000_000;
  return 128_000;
}

function shippedHostedCapabilities(preset: ModelPresetSource): ModelCapability[] {
  if (!preset.capabilities.includes("chat")) return [];
  if (preset.vendor === "openai") return ["webSearch", "codeExecution"];
  if (preset.vendor === "anthropic") {
    return /(?:fable-5|sonnet-5|opus-4-[678]|sonnet-4-6)/i.test(preset.model)
      ? ["webSearch", "urlContext", "codeExecution"]
      : [];
  }
  if (preset.vendor === "gemini") return ["webSearch", "urlContext", "codeExecution"];
  if (preset.vendor === "qwen") {
    if (/^qwen3[.-]6-flash/i.test(preset.model)) return ["webSearch", "codeExecution"];
    if (/^qwen3[.-]7-max/i.test(preset.model)) return ["webSearch"];
  }
  return [];
}

const baseModelCatalogPresets: ModelPresetSource[] = [
  {
    id: "openai-gpt-5-6-sol",
    label: "GPT-5.6 Sol",
    vendor: "openai",
    model: "gpt-5.6-sol",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "openai-gpt-5-6-terra",
    label: "GPT-5.6 Terra",
    vendor: "openai",
    model: "gpt-5.6-terra",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "openai-gpt-5-6-luna",
    label: "GPT-5.6 Luna",
    vendor: "openai",
    model: "gpt-5.6-luna",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: ["chat"]
  },
  {
    id: "openai-gpt-image-2",
    label: "GPT Image 2",
    vendor: "openai",
    model: "gpt-image-2",
    capabilities: ["image", "imageEdit"],
    defaultFor: ["image"]
  },
  {
    id: "openai-gpt-image-2-vip",
    label: "GPT Image 2 VIP",
    vendor: "openai",
    model: "gpt-image-2-vip",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "openai-gpt-image-1-5",
    label: "GPT Image 1.5",
    vendor: "openai",
    model: "gpt-image-1.5",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-gpt-image-2",
    label: "BotCF Image2",
    vendor: "botcf",
    model: "gpt-image-2",
    capabilities: ["image", "imageEdit"],
    defaultFor: ["image"]
  },
  {
    id: "botcf-gpt-image-2-2k",
    label: "BotCF Image2 2K",
    vendor: "botcf",
    model: "gpt-image-2-2k",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-gpt-image-2-4k",
    label: "BotCF Image2 4K",
    vendor: "botcf",
    model: "gpt-image-2-4k",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-grok-imagine-image",
    label: "BotCF Grok Imagine",
    vendor: "botcf",
    model: "grok-imagine-image",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-grok-imagine-image-quality",
    label: "BotCF Grok Imagine Quality",
    vendor: "botcf",
    model: "grok-imagine-image-quality",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-gemini-3-1-flash-image",
    label: "BotCF Gemini 3.1 Flash Image",
    vendor: "botcf",
    model: "gemini-3.1-flash-image",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-gemini-3-pro-image",
    label: "BotCF Gemini 3 Pro Image",
    vendor: "botcf",
    model: "gemini-3-pro-image",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-nana-banana-2-sync",
    label: "BotCF Nana Banana 2",
    vendor: "botcf",
    model: "nana-banana-2_sync",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-nana-banana-pro-sync",
    label: "BotCF Nana Banana Pro",
    vendor: "botcf",
    model: "nana-banana-pro_sync",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "botcf-nana-banana-2-4k-sync",
    label: "BotCF Nana Banana 2 4K",
    vendor: "botcf",
    model: "nana-banana-2-4k_sync",
    capabilities: ["image", "imageEdit"],
    defaultFor: []
  },
  {
    id: "openai-gpt-4o-mini-tts",
    label: "GPT-4o Mini TTS",
    vendor: "openai",
    model: "gpt-4o-mini-tts",
    capabilities: ["tts", "audio"],
    defaultFor: ["tts"]
  },
  {
    id: "openai-gpt-4o-transcribe",
    label: "GPT-4o Transcribe",
    vendor: "openai",
    model: "gpt-4o-transcribe",
    capabilities: ["stt", "audio"],
    defaultFor: ["stt"]
  },
  {
    id: "openai-text-embedding-3-small",
    label: "Text Embedding 3 Small",
    vendor: "openai",
    model: "text-embedding-3-small",
    capabilities: ["embedding"],
    defaultFor: ["embedding"]
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    vendor: "anthropic",
    model: "claude-sonnet-5",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    vendor: "anthropic",
    model: "claude-opus-4-8",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    vendor: "anthropic",
    model: "claude-sonnet-4-6",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    vendor: "anthropic",
    model: "claude-haiku-4-5",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "gemini-3-5-flash",
    label: "Gemini 3.5 Flash",
    vendor: "gemini",
    model: "gemini-3.5-flash",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "gemini-3-1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    vendor: "gemini",
    model: "gemini-3.1-pro-preview",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "gemini-3-1-flash-image",
    label: "Gemini 3.1 Flash Image",
    vendor: "gemini",
    model: "gemini-3.1-flash-image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: []
  },
  {
    id: "gemini-nano-banana-2",
    label: "Nano Banana 2",
    vendor: "gemini",
    model: "gemini-3.1-flash-image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: []
  },
  {
    id: "gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    vendor: "gemini",
    model: "gemini-3-pro-image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: []
  },
  {
    id: "gemini-2-5-flash-image",
    label: "Gemini 2.5 Flash Image",
    vendor: "gemini",
    model: "gemini-2.5-flash-image",
    capabilities: ["image", "imageEdit", "vision"],
    defaultFor: []
  },
  {
    id: "gemini-embedding-2",
    label: "Gemini Embedding 2",
    vendor: "gemini",
    model: "gemini-embedding-2",
    capabilities: ["embedding"],
    defaultFor: []
  },
  {
    id: "kimi-k3",
    label: "Kimi K3",
    vendor: "kimi",
    model: "kimi-k3",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "kimi-k2-7-code",
    label: "Kimi K2.7 Code",
    vendor: "kimi",
    model: "kimi-k2.7-code",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "kimi-k2-7-code-highspeed",
    label: "Kimi K2.7 Code Highspeed",
    vendor: "kimi",
    model: "kimi-k2.7-code-highspeed",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "kimi-k2-6",
    label: "Kimi K2.6",
    vendor: "kimi",
    model: "kimi-k2.6",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    vendor: "deepseek",
    model: "deepseek-v4-flash",
    endpointProtocol: "openai-responses",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    vendor: "deepseek",
    model: "deepseek-v4-pro",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen3-7-max",
    label: "Qwen 3.7 Max",
    vendor: "qwen",
    model: "qwen3.7-max",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen3-7-plus",
    label: "Qwen 3.7 Plus",
    vendor: "qwen",
    model: "qwen3.7-plus",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen3-6-flash",
    label: "Qwen 3.6 Flash",
    vendor: "qwen",
    model: "qwen3.6-flash",
    capabilities: ["chat", "vision", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen3-coder-plus",
    label: "Qwen 3 Coder Plus",
    vendor: "qwen",
    model: "qwen3-coder-plus",
    capabilities: ["chat", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen3-5-omni-plus",
    label: "Qwen 3.5 Omni Plus",
    vendor: "qwen",
    model: "qwen3.5-omni-plus",
    capabilities: ["chat", "vision", "audio", "toolCalling"],
    defaultFor: []
  },
  {
    id: "qwen-text-embedding-v4",
    label: "Qwen Text Embedding V4",
    vendor: "qwen",
    model: "text-embedding-v4",
    capabilities: ["embedding"],
    defaultFor: []
  },
];

export const modelCatalogPresets: ModelPreset[] = baseModelCatalogPresets.map((preset) => ({
  ...preset,
  endpointProtocol: preset.endpointProtocol || defaultEndpointProtocolForVendor(preset.vendor),
  contextWindowTokens: preset.contextWindowTokens || presetContextWindowTokens(preset),
  maxInputCharacters: preset.maxInputCharacters || 100_000,
  capabilities: [...new Set([...preset.capabilities, ...shippedHostedCapabilities(preset)])]
}));
