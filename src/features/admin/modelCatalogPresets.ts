import type { MediaEndpointConfig, ModelCapability, ModelDefaultFor, ProviderKind } from "../../types";

export type ModelPreset = {
  id: string;
  label: string;
  vendor: ProviderKind;
  model: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  mediaConfig?: MediaEndpointConfig;
};

export const modelCatalogPresets: ModelPreset[] = [
  {
    id: "openai-chat",
    label: "OpenAI 对话/视觉",
    vendor: "openai",
    model: "gpt-4.1-mini",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: ["chat"]
  },
  {
    id: "openai-image",
    label: "OpenAI 绘画",
    vendor: "openai",
    model: "gpt-image-1",
    capabilities: ["image"],
    defaultFor: ["image"]
  },
  {
    id: "openai-tts",
    label: "OpenAI 语音",
    vendor: "openai",
    model: "gpt-4o-mini-tts",
    capabilities: ["tts", "audio"],
    defaultFor: ["tts"]
  },
  {
    id: "openai-embedding",
    label: "OpenAI 向量",
    vendor: "openai",
    model: "text-embedding-3-small",
    capabilities: ["embedding"],
    defaultFor: ["embedding"]
  },
  {
    id: "claude-chat",
    label: "Claude 对话/视觉",
    vendor: "anthropic",
    model: "claude-sonnet-4-5",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: []
  },
  {
    id: "gemini-chat",
    label: "Gemini 对话/视觉",
    vendor: "gemini",
    model: "gemini-2.5-flash",
    capabilities: ["chat", "vision", "toolCalling", "streaming"],
    defaultFor: []
  },
  {
    id: "compatible-video",
    label: "兼容接口视频",
    vendor: "openai-compatible",
    model: "video-model",
    capabilities: ["video"],
    defaultFor: ["video"],
    mediaConfig: {
      generatePath: "/video/generations",
      statusPath: "/video/generations/status",
      idJsonPath: "id",
      statusJsonPath: "status",
      assetJsonPath: "url",
      requestShape: "openai-compatible"
    }
  }
];
