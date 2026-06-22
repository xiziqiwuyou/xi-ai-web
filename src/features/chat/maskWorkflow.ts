import type { AppPreset, Assistant, PromptPreset } from "../../types";

export type ChatMaskWorkflow =
  | {
      id: string;
      type: "assistant";
      title: string;
      description: string;
      category: string;
      color: string;
      assistantId: string;
      prompt: string;
    }
  | {
      id: string;
      type: "app";
      title: string;
      description: string;
      category: string;
      color: string;
      appId: string;
      prompt: string;
    }
  | {
      id: string;
      type: "prompt";
      title: string;
      description: string;
      category: string;
      color: string;
      promptId: string;
      prompt: string;
    };

export function buildChatMaskWorkflows(
  assistants: Assistant[],
  apps: AppPreset[],
  promptPresets: PromptPreset[] = []
): ChatMaskWorkflow[] {
  const assistantMasks = assistants.map((assistant) => ({
    id: `assistant:${assistant.id}`,
    type: "assistant" as const,
    title: assistant.name,
    description: assistant.description,
    category: "助手",
    color: assistant.color || "#ff2442",
    assistantId: assistant.id,
    prompt: assistant.systemPrompt
  }));

  const appMasks = apps
    .filter((app) => app.enabled)
    .map((app) => ({
      id: `app:${app.id}`,
      type: "app" as const,
      title: app.name,
      description: app.description,
      category: app.category || "应用",
      color: "#ff2442",
      appId: app.id,
      prompt: app.prompt
    }));

  const promptMasks = promptPresets
    .filter((prompt) => prompt.enabled)
    .map((prompt) => ({
      id: `prompt:${prompt.id}`,
      type: "prompt" as const,
      title: prompt.title,
      description: prompt.prompt.slice(0, 80),
      category: "提示词",
      color: "#356bff",
      promptId: prompt.id,
      prompt: prompt.prompt
    }));

  return [...assistantMasks, ...appMasks, ...promptMasks];
}

export function starterPromptFromMask(mask: ChatMaskWorkflow, inputHint = "") {
  if (mask.type === "assistant") return inputHint;
  if (mask.type === "prompt") return mask.prompt;
  const hint = inputHint.trim() || "请在这里补充你的具体任务、背景和限制条件。";
  return `${mask.prompt}\n\n用户输入:\n${hint}`;
}
