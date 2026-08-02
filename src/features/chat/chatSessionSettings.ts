import type { Message, OpenAIResponseVerbosity, ToolInvocationMode } from "../../types";

export const chatSettingsStorageKey = "xi-ai-web-chat-session-settings";

export const assistantAvatarPresets = [
  { id: "lumi", name: "光环机器人", image: "/assets/figma/avatar-lumi.png" },
  { id: "fox", name: "星愿小狐", image: "/assets/figma/avatar-fox.png" },
  { id: "orbit", name: "轨道小助手", image: "/assets/figma/avatar-orbit.png" },
  { id: "cloud", name: "云朵智脑", image: "/assets/figma/avatar-cloud.png" },
  { id: "piko", name: "灵感伙伴", image: "/assets/figma/avatar-piko.png" },
  { id: "nori", name: "未来向导", image: "/assets/figma/avatar-nori.png" }
] as const;

export const personalAvatarPresets = assistantAvatarPresets;

export const chatContextSizeValues = ["4", "16", "32", "64", "128", "256", "512", "1024"] as const;
export const chatContextMessageCountValues = [4, 8, 16, 32, 64, 128, 256] as const;
export const chatMaxTokenMaximum = 1_048_576;
export const chatTitleSummaryMessageCountValues = [2, 4, 6, 8, 12, 16] as const;
export const chatImageAttachmentLimitValues = [1, 2, 4, 6] as const;
export const chatToolInvocationModes = ["prompt", "function"] as const satisfies readonly ToolInvocationMode[];
export const chatResponseVerbosityValues = ["default", "low", "medium", "high"] as const;
export const chatMessageFontSizeValues = [13, 14, 15, 16, 17, 18] as const;
export const chatCodeThemeValues = ["auto", "light", "dark"] as const;
export const chatSendShortcutValues = ["enter", "ctrl-enter"] as const;

export type ChatImageAttachmentLimit = typeof chatImageAttachmentLimitValues[number];
export type ChatContextMessageCount = typeof chatContextMessageCountValues[number] | null;
export type ChatTitleSummaryMessageCount = typeof chatTitleSummaryMessageCountValues[number];
export type ChatMessageFontSize = typeof chatMessageFontSizeValues[number];
export type ChatCodeTheme = typeof chatCodeThemeValues[number];
export type ChatSendShortcut = typeof chatSendShortcutValues[number];
export type ChatResponseVerbosity = OpenAIResponseVerbosity;
export type AvatarPresetId = typeof assistantAvatarPresets[number]["id"];

export type ChatSessionSettings = {
  assistantAvatarId: string;
  userAvatarPresetId: AvatarPresetId;
  userAvatar: string | null;
  messageStyle: "bubble" | "list";
  temperature: number;
  topP: number;
  contextSize: typeof chatContextSizeValues[number];
  contextMessageCount: ChatContextMessageCount;
  maxTokensEnabled: boolean;
  maxTokens: number;
  titleSummaryEnabled: boolean;
  titleSummaryModelId: string;
  titleSummaryMessageCount: ChatTitleSummaryMessageCount;
  streamOutput: boolean;
  toolInvocationMode: ToolInvocationMode;
  maxImageAttachments: ChatImageAttachmentLimit;
  responseVerbosity: ChatResponseVerbosity;
  showUsage: boolean;
  showUserPrompts: boolean;
  useSerifFont: boolean;
  renderUserMarkdown: boolean;
  collapseThinking: boolean;
  showMessageOutline: boolean;
  messageFontSize: ChatMessageFontSize;
  renderMath: boolean;
  enableSingleDollarMath: boolean;
  codeTheme: ChatCodeTheme;
  styledCodeBlocks: boolean;
  showCodeLineNumbers: boolean;
  collapseCodeBlocks: boolean;
  wrapCode: boolean;
  enableCodePreview: boolean;
  showTokenEstimate: boolean;
  longPasteAsFile: boolean;
  enableCommandMenu: boolean;
  sendShortcut: ChatSendShortcut;
};

export const defaultChatSessionSettings: ChatSessionSettings = {
  assistantAvatarId: "lumi",
  userAvatarPresetId: "nori",
  userAvatar: null,
  messageStyle: "bubble",
  temperature: 0.7,
  topP: 0.9,
  contextSize: "16",
  contextMessageCount: 16,
  maxTokensEnabled: false,
  maxTokens: 16_384,
  titleSummaryEnabled: true,
  titleSummaryModelId: "gpt-5.4-mini",
  titleSummaryMessageCount: 4,
  streamOutput: true,
  toolInvocationMode: "function",
  maxImageAttachments: 4,
  responseVerbosity: "default",
  showUsage: true,
  showUserPrompts: true,
  useSerifFont: false,
  renderUserMarkdown: true,
  collapseThinking: true,
  showMessageOutline: false,
  messageFontSize: 15,
  renderMath: true,
  enableSingleDollarMath: true,
  codeTheme: "auto",
  styledCodeBlocks: true,
  showCodeLineNumbers: true,
  collapseCodeBlocks: false,
  wrapCode: false,
  enableCodePreview: true,
  showTokenEstimate: true,
  longPasteAsFile: false,
  enableCommandMenu: true,
  sendShortcut: "enter"
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function cleanSettingChoice<T extends string | number>(value: unknown, choices: readonly T[], fallback: T) {
  return choices.includes(value as T) ? value as T : fallback;
}

function settingBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanContextMessageCount(value: unknown): ChatContextMessageCount {
  if (value === null || value === 0 || value === "unlimited") return null;
  return cleanSettingChoice(value, chatContextMessageCountValues, 16);
}

function migratedMaxTokensEnabled(settings: Record<string, unknown>) {
  if (typeof settings.maxTokensEnabled === "boolean") return settings.maxTokensEnabled;
  return false;
}

function cleanSettingText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function migratedToolInvocationMode(settings: Record<string, unknown>) {
  if (chatToolInvocationModes.includes(settings.toolInvocationMode as ToolInvocationMode)) {
    return settings.toolInvocationMode as ToolInvocationMode;
  }
  return settings.toolMode === "询问后调用" ? "prompt" : "function";
}

export function sanitizeChatSessionSettings(value: unknown): ChatSessionSettings {
  const parsed = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const avatarIds = assistantAvatarPresets.map((preset) => preset.id);
  return {
    assistantAvatarId: cleanSettingChoice(parsed.assistantAvatarId, avatarIds, defaultChatSessionSettings.assistantAvatarId),
    userAvatarPresetId: cleanSettingChoice(parsed.userAvatarPresetId, avatarIds, defaultChatSessionSettings.userAvatarPresetId),
    userAvatar: typeof parsed.userAvatar === "string" && parsed.userAvatar.startsWith("data:image/")
      ? parsed.userAvatar
      : null,
    messageStyle: cleanSettingChoice(parsed.messageStyle, ["bubble", "list"] as const, defaultChatSessionSettings.messageStyle),
    temperature: clampNumber(parsed.temperature, defaultChatSessionSettings.temperature, 0, 1),
    topP: clampNumber(parsed.topP, defaultChatSessionSettings.topP, 0.1, 1),
    contextSize: cleanSettingChoice(parsed.contextSize, chatContextSizeValues, defaultChatSessionSettings.contextSize),
    contextMessageCount: cleanContextMessageCount(parsed.contextMessageCount),
    maxTokensEnabled: migratedMaxTokensEnabled(parsed),
    maxTokens: Math.trunc(clampNumber(parsed.maxTokens, defaultChatSessionSettings.maxTokens, 1, chatMaxTokenMaximum)),
    titleSummaryEnabled: settingBoolean(parsed.titleSummaryEnabled, defaultChatSessionSettings.titleSummaryEnabled),
    titleSummaryModelId: cleanSettingText(parsed.titleSummaryModelId, defaultChatSessionSettings.titleSummaryModelId, 160),
    titleSummaryMessageCount: cleanSettingChoice(parsed.titleSummaryMessageCount, chatTitleSummaryMessageCountValues, defaultChatSessionSettings.titleSummaryMessageCount),
    streamOutput: settingBoolean(parsed.streamOutput, defaultChatSessionSettings.streamOutput),
    toolInvocationMode: migratedToolInvocationMode(parsed),
    maxImageAttachments: cleanSettingChoice(parsed.maxImageAttachments, chatImageAttachmentLimitValues, defaultChatSessionSettings.maxImageAttachments),
    responseVerbosity: cleanSettingChoice(parsed.responseVerbosity, chatResponseVerbosityValues, defaultChatSessionSettings.responseVerbosity),
    showUsage: settingBoolean(parsed.showUsage, defaultChatSessionSettings.showUsage),
    showUserPrompts: settingBoolean(parsed.showUserPrompts, defaultChatSessionSettings.showUserPrompts),
    useSerifFont: settingBoolean(parsed.useSerifFont, defaultChatSessionSettings.useSerifFont),
    renderUserMarkdown: settingBoolean(parsed.renderUserMarkdown, defaultChatSessionSettings.renderUserMarkdown),
    collapseThinking: settingBoolean(parsed.collapseThinking, defaultChatSessionSettings.collapseThinking),
    showMessageOutline: settingBoolean(parsed.showMessageOutline, defaultChatSessionSettings.showMessageOutline),
    messageFontSize: cleanSettingChoice(parsed.messageFontSize, chatMessageFontSizeValues, defaultChatSessionSettings.messageFontSize),
    renderMath: settingBoolean(parsed.renderMath, defaultChatSessionSettings.renderMath),
    enableSingleDollarMath: settingBoolean(parsed.enableSingleDollarMath, defaultChatSessionSettings.enableSingleDollarMath),
    codeTheme: cleanSettingChoice(parsed.codeTheme, chatCodeThemeValues, defaultChatSessionSettings.codeTheme),
    styledCodeBlocks: settingBoolean(parsed.styledCodeBlocks, defaultChatSessionSettings.styledCodeBlocks),
    showCodeLineNumbers: settingBoolean(parsed.showCodeLineNumbers, defaultChatSessionSettings.showCodeLineNumbers),
    collapseCodeBlocks: settingBoolean(parsed.collapseCodeBlocks, defaultChatSessionSettings.collapseCodeBlocks),
    wrapCode: settingBoolean(parsed.wrapCode, defaultChatSessionSettings.wrapCode),
    enableCodePreview: settingBoolean(parsed.enableCodePreview, defaultChatSessionSettings.enableCodePreview),
    showTokenEstimate: settingBoolean(parsed.showTokenEstimate, defaultChatSessionSettings.showTokenEstimate),
    longPasteAsFile: settingBoolean(parsed.longPasteAsFile, defaultChatSessionSettings.longPasteAsFile),
    enableCommandMenu: settingBoolean(parsed.enableCommandMenu, defaultChatSessionSettings.enableCommandMenu),
    sendShortcut: cleanSettingChoice(parsed.sendShortcut, chatSendShortcutValues, defaultChatSessionSettings.sendShortcut)
  };
}

export function loadChatSessionSettings() {
  if (typeof window === "undefined") return defaultChatSessionSettings;
  try {
    const raw = window.sessionStorage.getItem(chatSettingsStorageKey);
    return raw ? sanitizeChatSessionSettings(JSON.parse(raw)) : defaultChatSessionSettings;
  } catch {
    try {
      window.sessionStorage.removeItem(chatSettingsStorageKey);
    } catch {
      // Storage can be unavailable for both reads and cleanup.
    }
    return defaultChatSessionSettings;
  }
}

export function saveChatSessionSettings(settings: ChatSessionSettings) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(chatSettingsStorageKey, JSON.stringify(sanitizeChatSessionSettings(settings)));
  } catch {
    // Session settings remain active in memory when browser storage is unavailable.
  }
}

export function estimatedTokenCount(value: string) {
  const text = value.trim();
  if (!text) return 0;
  const latin = (text.match(/[\x00-\xff]/g) || []).length;
  const nonLatin = text.length - latin;
  return Math.max(1, Math.ceil((latin / 4) + (nonLatin / 1.6)));
}

export function selectChatHistory(
  messages: readonly Message[],
  settings: Pick<ChatSessionSettings, "contextSize" | "contextMessageCount" | "maxTokensEnabled" | "maxTokens">
) {
  const messageLimit = settings.contextMessageCount === null ? messages.length : Math.max(1, settings.contextMessageCount);
  const candidates = messages.slice(-messageLimit);
  const windowTokens = Math.max(1, Number(settings.contextSize) || 16) * 1024;
  const outputReserve = settings.maxTokensEnabled ? Math.max(1, settings.maxTokens) : 4096;
  const historyBudget = Math.max(1024, windowTokens - outputReserve - 2048);
  const selected: Message[] = [];
  let consumedTokens = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index];
    const messageTokens = estimatedTokenCount(message.content) + 8;
    if (selected.length && consumedTokens + messageTokens > historyBudget) break;
    selected.unshift(message);
    consumedTokens += messageTokens;
  }

  return selected;
}
