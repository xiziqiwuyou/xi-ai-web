import { lazy } from "react";
import type {
  Assistant,
  AppPreset,
  ConversationSummary,
  GalleryItem,
  MenuItem,
  ModelCatalogEntry,
  ModuleId,
  PromptPreset,
  PublicBootstrapPayload,
  SearchServiceConfig,
  UserProviderConfig
} from "../types";

const ChatModule = lazy(() => import("../features/chat/ChatModule"));
const StudioModule = lazy(() => import("../features/studio/StudioModule"));
const AutomationModule = lazy(() => import("../features/automation/AutomationModule"));
const LangflowWorkflowModule = lazy(() => import("../features/automation/LangflowWorkflowModule"));

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
  langflow: PublicBootstrapPayload["langflow"];
  langflowWorkflows: PublicBootstrapPayload["langflowWorkflows"];
  toolSettings?: PublicBootstrapPayload["toolSettings"];
  userProvider: UserProviderConfig;
  searchService: SearchServiceConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onSearchServiceChange: (config: SearchServiceConfig) => void;
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
  langflow,
  langflowWorkflows,
  toolSettings,
  userProvider,
  searchService,
  onUserProviderChange,
  onSearchServiceChange,
  onGenerationResult,
  onModuleChange,
  onRequestApiConfig,
  onConversationsChange,
  onRefresh
}: ModuleRouterProps) {
  const item = menuItems.find((menuItem) => menuItem.id === activeModule);
  if (!item?.enabled) return null;

  if (activeModule === "chat") {
    return (
      <ChatModule
        enabled={settings.allowGuestChat}
        assistants={assistants}
        appPresets={appPresets}
        promptPresets={promptPresets}
        conversations={conversations}
        modelCatalog={modelCatalog}
        toolSettings={toolSettings || []}
        userProvider={userProvider}
        searchService={searchService}
        onUserProviderChange={onUserProviderChange}
        onSearchServiceChange={onSearchServiceChange}
        onRequestApiConfig={onRequestApiConfig}
        onConversationsChange={onConversationsChange}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeModule === "agents" || activeModule === "workflows") {
    if (activeModule === "workflows" && langflow.available) {
      return (
        <LangflowWorkflowModule
          status={langflow}
          workflows={langflowWorkflows}
          modelCatalog={modelCatalog}
          userProvider={userProvider}
          onUserProviderChange={onUserProviderChange}
          onRequestApiConfig={onRequestApiConfig}
        />
      );
    }
    return (
      <AutomationModule
        moduleId={activeModule}
        modelCatalog={modelCatalog}
        toolSettings={toolSettings || []}
        userProvider={userProvider}
        searchService={searchService}
        onUserProviderChange={onUserProviderChange}
        onSearchServiceChange={onSearchServiceChange}
        onGenerationResult={onGenerationResult}
        onRequestApiConfig={onRequestApiConfig}
      />
    );
  }

  if (
    activeModule === "image" ||
    activeModule === "ppt" ||
    activeModule === "mindmap" ||
    activeModule === "assistants" ||
    activeModule === "translate"
  ) {
    return (
      <StudioModule
        moduleId={activeModule}
        assistants={assistants}
        galleryItems={galleryItems}
        modelCatalog={modelCatalog}
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onGenerationResult={onGenerationResult}
        onModuleChange={onModuleChange}
        onRequestApiConfig={onRequestApiConfig}
      />
    );
  }

  return null;
}

export default ModuleRouter;
