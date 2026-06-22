import { lazy } from "react";
import { cleanMenuLabel, generationModuleIds, moduleMeta, placeholderModuleIds } from "./moduleRegistry";
import type {
  Assistant,
  AppPreset,
  ConversationSummary,
  GalleryItem,
  GenerationModuleId,
  MenuItem,
  ModelCatalogEntry,
  ModuleId,
  PromptPreset,
  PublicBootstrapPayload,
  UserProviderConfig
} from "../types";

const AgentsModule = lazy(() => import("../features/agents/AgentsModule"));
const AppsModule = lazy(() => import("../features/apps/AppsModule"));
const ChatModule = lazy(() => import("../features/chat/ChatModule"));
const GalleryModule = lazy(() => import("../features/gallery/GalleryModule"));
const GenerationModule = lazy(() => import("../features/generation/GenerationModule"));
const MindmapModule = lazy(() => import("../features/mindmap/MindmapModule"));

type ModuleRouterProps = {
  activeModule: ModuleId;
  settings: PublicBootstrapPayload["settings"];
  menuItems: MenuItem[];
  assistants: Assistant[];
  appPresets: AppPreset[];
  conversations: ConversationSummary[];
  galleryItems: GalleryItem[];
  modelCatalog: ModelCatalogEntry[];
  promptPresets: PromptPreset[];
  toolSettings?: PublicBootstrapPayload["toolSettings"];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onClearGallery: () => void;
  onRemoveGalleryItem: (id: string) => void;
  onRemoveGalleryItems: (ids: string[]) => void;
  onUpdateGalleryItem: (id: string, patch: Partial<GalleryItem>) => void;
  onModuleChange: (moduleId: ModuleId) => void;
  onRequestApiConfig: () => void;
  onConversationsChange: (conversations: ConversationSummary[]) => void;
  onRefresh: () => Promise<PublicBootstrapPayload>;
};

function ModuleRouter({
  activeModule,
  settings,
  menuItems,
  assistants,
  appPresets,
  conversations,
  galleryItems,
  modelCatalog,
  promptPresets,
  toolSettings = [],
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onClearGallery,
  onRemoveGalleryItem,
  onRemoveGalleryItems,
  onUpdateGalleryItem,
  onModuleChange,
  onRequestApiConfig,
  onConversationsChange,
  onRefresh
}: ModuleRouterProps) {
  const item = menuItems.find((menuItem) => menuItem.id === activeModule);
  if (!item || !item.enabled) {
    return (
      <EmptyModule
        moduleId={activeModule}
        title="暂未开放"
        description="当前功能未启用，可在后台菜单管理中开启。"
        highlights={["后台控制", "按需开放", "安全边界"]}
      />
    );
  }

  if (placeholderModuleIds.has(activeModule)) {
    const meta = moduleMeta[activeModule];
    return (
      <EmptyModule
        moduleId={activeModule}
        title={cleanMenuLabel(activeModule, item.label)}
        description={meta.description}
        highlights={meta.highlights}
      />
    );
  }

  if (activeModule === "chat") {
    return (
      <ChatModule
        enabled={settings.allowGuestChat}
        assistants={assistants}
        appPresets={appPresets}
        promptPresets={promptPresets}
        conversations={conversations}
        modelCatalog={modelCatalog}
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onRequestApiConfig={onRequestApiConfig}
        onConversationsChange={onConversationsChange}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeModule === "apps") {
    return (
      <AppsModule
        appPresets={appPresets}
        modelCatalog={modelCatalog}
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onRequestApiConfig={onRequestApiConfig}
        onGenerationResult={onGenerationResult}
      />
    );
  }

  if (activeModule === "agents") {
    const meta = moduleMeta.agents;
    return (
      <AgentsModule
        title={meta.title}
        description={meta.description}
        assistants={assistants}
        modelCatalog={modelCatalog}
        promptPresets={promptPresets}
        toolSettings={toolSettings}
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onRequestApiConfig={onRequestApiConfig}
        onGenerationResult={onGenerationResult}
      />
    );
  }

  if (activeModule === "gallery") {
    return (
      <GalleryModule
        items={galleryItems}
        onClearGallery={onClearGallery}
        onRemoveGalleryItem={onRemoveGalleryItem}
        onRemoveGalleryItems={onRemoveGalleryItems}
        onUpdateGalleryItem={onUpdateGalleryItem}
        onNavigateModule={onModuleChange}
      />
    );
  }

  if (activeModule === "mindmap") {
    const meta = moduleMeta.mindmap;
    return (
      <MindmapModule
        title={meta.title}
        description={meta.description}
        modelCatalog={modelCatalog}
        promptPresets={promptPresets}
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onGenerationResult={onGenerationResult}
        onRequestApiConfig={onRequestApiConfig}
      />
    );
  }

  if (!generationModuleIds.has(activeModule as GenerationModuleId)) {
    const meta = moduleMeta[activeModule];
    return (
      <EmptyModule
        moduleId={activeModule}
        title={cleanMenuLabel(activeModule, item.label)}
        description={meta.description}
        highlights={meta.highlights}
      />
    );
  }

  const meta = moduleMeta[activeModule];
  return (
    <GenerationModule
      moduleId={activeModule as GenerationModuleId}
      title={meta.title}
      description={meta.description}
      assistants={assistants}
      galleryItems={galleryItems}
      modelCatalog={modelCatalog}
      promptPresets={promptPresets}
      userProvider={userProvider}
      onUserProviderChange={onUserProviderChange}
      onGenerationResult={onGenerationResult}
      onRemoveGalleryItem={onRemoveGalleryItem}
      onUpdateGalleryItem={onUpdateGalleryItem}
      onRequestApiConfig={onRequestApiConfig}
    />
  );
}

function EmptyModule({
  moduleId,
  title,
  description,
  highlights
}: {
  moduleId: ModuleId;
  title: string;
  description: string;
  highlights: string[];
}) {
  const Icon = moduleMeta[moduleId].icon;
  const status = moduleMeta[moduleId].status === "planned" ? "即将接入" : "工作台";

  return (
    <section className="module-placeholder">
      <div className="placeholder-note">
        <span className="placeholder-mark">
          <Icon size={28} />
        </span>
        <small>{status}</small>
        <strong>{title}</strong>
        <p>{description}</p>
        <div className="placeholder-grid">
          {highlights.map((highlight) => (
            <span key={highlight}>{highlight}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ModuleRouter;
