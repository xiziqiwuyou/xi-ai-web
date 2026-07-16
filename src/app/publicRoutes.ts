import type { MenuItem, ModuleId } from "../types";

export const PRODUCT_NAME = "xi-ai-web";

export const publicRoutes = [
  { id: "chat", path: "/chat" },
  { id: "image", path: "/image" },
  { id: "mindmap", path: "/mindmap" },
  { id: "agents", path: "/agents" },
  { id: "apps", path: "/apps" },
  { id: "gallery", path: "/gallery" }
] as const satisfies ReadonlyArray<{ id: ModuleId; path: `/${string}` }>;

export type PublicModuleId = (typeof publicRoutes)[number]["id"];

const routeByModule = new Map<ModuleId, string>(
  publicRoutes.map((route) => [route.id, route.path])
);
const moduleByRoute = new Map<string, PublicModuleId>(
  publicRoutes.map((route) => [route.path, route.id])
);
const publicModuleIds = new Set<ModuleId>(publicRoutes.map((route) => route.id));

export const mobilePrimaryModuleIds = new Set<ModuleId>([
  "chat",
  "image",
  "mindmap",
  "agents"
]);

export const mobileMoreModuleIds = new Set<ModuleId>(["apps", "gallery"]);

export function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isPublicModuleId(moduleId: ModuleId): moduleId is PublicModuleId {
  return publicModuleIds.has(moduleId);
}

export function publicModuleFromPath(pathname: string): PublicModuleId | null {
  return moduleByRoute.get(normalizePathname(pathname)) || null;
}

export function publicPathForModule(moduleId: ModuleId): string | null {
  return routeByModule.get(moduleId) || null;
}

export function isVisiblePublicMenuItem(item: MenuItem) {
  return item.visible && isPublicModuleId(item.id);
}

export function isAvailablePublicMenuItem(item: MenuItem) {
  return isVisiblePublicMenuItem(item) && item.enabled;
}

export function resolvePublicModule(
  menuItems: MenuItem[],
  requestedModule: ModuleId | null,
  defaultModule: ModuleId
): PublicModuleId {
  const visibleItems = menuItems.filter(isVisiblePublicMenuItem);
  const availableItems = visibleItems.filter((item) => item.enabled);
  const requested = availableItems.find((item) => item.id === requestedModule);
  const configuredDefault = availableItems.find((item) => item.id === defaultModule);
  const visibleRequested = visibleItems.find((item) => item.id === requestedModule);
  const visibleDefault = visibleItems.find((item) => item.id === defaultModule);

  return (
    requested?.id ||
    configuredDefault?.id ||
    availableItems[0]?.id ||
    visibleRequested?.id ||
    visibleDefault?.id ||
    visibleItems[0]?.id ||
    "chat"
  ) as PublicModuleId;
}
