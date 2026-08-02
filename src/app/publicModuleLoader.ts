import type { ModuleId } from "../types";

const modulePromises = new Map<string, Promise<unknown>>();

function loadOnce<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = modulePromises.get(key);
  if (cached) return cached as Promise<T>;

  const request = loader().catch((error: unknown) => {
    modulePromises.delete(key);
    throw error;
  });
  modulePromises.set(key, request);
  return request;
}

export function loadChatModule() {
  return loadOnce("chat", () => import("../features/chat/ChatModule"));
}

export function loadStudioModule() {
  return loadOnce("studio", () => import("../features/studio/StudioModule"));
}

export function loadAutomationModule() {
  return loadOnce("automation", () => import("../features/automation/AutomationModule"));
}

export function loadLangflowWorkflowModule() {
  return loadOnce("langflow", () => import("../features/automation/LangflowWorkflowModule"));
}

export function preloadPublicModule(moduleId: ModuleId, langflowAvailable = false) {
  if (moduleId === "chat") return loadChatModule();
  if (moduleId === "agents") return loadAutomationModule();
  if (moduleId === "workflows") {
    return langflowAvailable ? loadLangflowWorkflowModule() : loadAutomationModule();
  }
  if (["image", "ppt", "mindmap", "assistants", "translate"].includes(moduleId)) {
    return loadStudioModule();
  }
  return Promise.resolve();
}
