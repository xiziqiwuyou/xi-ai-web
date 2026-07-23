import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { api } from "./api";
import AppShell from "./app/AppShell";
import ModuleRouter from "./app/ModuleRouter";
import { cleanMenuLabel } from "./app/moduleRegistry";
import {
  isAvailablePublicMenuItem,
  isVisiblePublicMenuItem,
  normalizePathname,
  PRODUCT_NAME,
  publicModuleFromPath,
  publicPathForModule,
  resolvePublicModule
} from "./app/publicRoutes";
import { loadGalleryItems, saveGalleryItems } from "./features/gallery/galleryStorage";
import ApiConnectionModal from "./features/settings/ApiConnectionModal";
import {
  loadSearchServiceConfig,
  sanitizeSearchServiceConfig,
  saveSearchServiceConfig
} from "./features/settings/searchServiceConfig";
import {
  isUserProviderReady,
  loadUserProviderConfig,
  sanitizeUserProviderConfig,
  saveUserProviderConfig
} from "./features/settings/userProviderConfig";
import WorkspaceDataDialog from "./features/workspace/WorkspaceDataDialog";
import type {
  ConversationSummary,
  GalleryItem,
  MenuItem,
  ModuleId,
  PublicBootstrapPayload,
  SearchServiceConfig,
  UserProviderConfig
} from "./types";

const AdminPortal = lazy(() => import("./features/admin/AdminPortal"));
const KnowledgeCloudPortal = lazy(() => import("./features/knowledge-cloud/KnowledgeCloudPortal"));
const fallbackModule: ModuleId = "chat";

function ModuleLoading() {
  return (
    <main className="boot-screen inline">
      <span className="boot-mark">XI</span>
      <strong>正在加载工作台</strong>
    </main>
  );
}

function replacePublicUrl(moduleId: ModuleId) {
  const path = publicPathForModule(moduleId);
  if (!path) return;
  window.history.replaceState({ moduleId }, "", path);
}

function pushPublicUrl(moduleId: ModuleId) {
  const path = publicPathForModule(moduleId);
  if (!path || normalizePathname(window.location.pathname) === path) return;
  window.history.pushState({ moduleId }, "", path);
}

function App() {
  const normalizedPath = normalizePathname(window.location.pathname);
  const isAdminRoute = normalizedPath === "/admin";
  const isKnowledgeRoute = normalizedPath === "/knowledge";
  const isStandaloneRoute = isAdminRoute || isKnowledgeRoute;
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PublicBootstrapPayload | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>(
    () => publicModuleFromPath(window.location.pathname) || fallbackModule
  );
  const [userProvider, setUserProvider] = useState<UserProviderConfig>(loadUserProviderConfig);
  const [searchService, setSearchService] = useState<SearchServiceConfig>(loadSearchServiceConfig);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [workspaceDataOpen, setWorkspaceDataOpen] = useState(false);
  const [workspaceDataError, setWorkspaceDataError] = useState("");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryHydrated, setGalleryHydrated] = useState(false);
  const [error, setError] = useState("");

  const applyActiveModule = useCallback((moduleId: ModuleId) => {
    setActiveModule(moduleId);
  }, []);

  const applyPublicBootstrap = useCallback(
    (nextPayload: PublicBootstrapPayload) => {
      const requestedModule = publicModuleFromPath(window.location.pathname);
      const resolvedModule = resolvePublicModule(
        nextPayload.menuItems,
        requestedModule,
        nextPayload.settings.defaultModule
      );
      const canonicalPath = publicPathForModule(resolvedModule);

      setPayload(nextPayload);
      applyActiveModule(resolvedModule);
      if (canonicalPath && window.location.pathname !== canonicalPath) {
        replacePublicUrl(resolvedModule);
      }
      return nextPayload;
    },
    [applyActiveModule]
  );

  const loadPublicBootstrap = useCallback(async () => {
    const nextPayload = await api.publicBootstrap();
    return applyPublicBootstrap(nextPayload);
  }, [applyPublicBootstrap]);

  useEffect(() => {
    if (isStandaloneRoute) {
      document.title = `${isAdminRoute ? "Admin" : "知识库"} - ${PRODUCT_NAME}`;
      setLoading(false);
      return;
    }

    let alive = true;
    loadPublicBootstrap()
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "应用启动失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isAdminRoute, isStandaloneRoute, loadPublicBootstrap]);

  useEffect(() => {
    if (isStandaloneRoute || !payload) return;

    const handlePopState = () => {
      const requestedModule = publicModuleFromPath(window.location.pathname);
      const resolvedModule = resolvePublicModule(
        payload.menuItems,
        requestedModule,
        payload.settings.defaultModule
      );
      applyActiveModule(resolvedModule);
      if (publicPathForModule(resolvedModule) !== window.location.pathname) {
        replacePublicUrl(resolvedModule);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyActiveModule, isStandaloneRoute, payload]);

  useEffect(() => {
    if (isStandaloneRoute || !payload) return;
    document.title = `${cleanMenuLabel(activeModule)} - ${PRODUCT_NAME}`;
  }, [activeModule, isStandaloneRoute, payload]);

  useEffect(() => {
    if (isStandaloneRoute) return;
    saveUserProviderConfig(userProvider);
  }, [isStandaloneRoute, userProvider]);

  useEffect(() => {
    if (isStandaloneRoute) return;
    saveSearchServiceConfig(searchService);
  }, [isStandaloneRoute, searchService]);

  useEffect(() => {
    if (isStandaloneRoute) return;
    let alive = true;
    loadGalleryItems()
      .then((items) => {
        if (!alive) return;
        setGalleryItems((current) => {
          const merged = new Map(items.map((item) => [item.id, item]));
          current.forEach((item) => merged.set(item.id, item));
          return [...merged.values()].slice(0, 50);
        });
      })
      .catch((nextError: unknown) => {
        if (!alive) return;
        setWorkspaceDataError(nextError instanceof Error ? nextError.message : "无法读取本地画廊数据。");
        setWorkspaceDataOpen(true);
      })
      .finally(() => {
        if (alive) setGalleryHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [isStandaloneRoute]);

  useEffect(() => {
    if (isStandaloneRoute || loading || !payload) return;
    if (!isUserProviderReady(userProvider)) {
      setApiConfigOpen(true);
    }
  }, [activeModule, isStandaloneRoute, loading, payload, userProvider]);

  useEffect(() => {
    if (isStandaloneRoute || !galleryHydrated) return;
    void saveGalleryItems(galleryItems).catch((nextError: unknown) => {
      setWorkspaceDataError(nextError instanceof Error ? nextError.message : "无法保存本地画廊数据。");
      setWorkspaceDataOpen(true);
    });
  }, [galleryHydrated, galleryItems, isStandaloneRoute]);

  const navigateToModule = useCallback(
    (moduleId: ModuleId) => {
      if (!payload) return;
      const item = payload.menuItems.find((menuItem) => menuItem.id === moduleId);
      if (!item || !isAvailablePublicMenuItem(item)) return;

      applyActiveModule(moduleId);
      pushPublicUrl(moduleId);
    },
    [applyActiveModule, payload]
  );

  const updateConversations = useCallback((conversations: ConversationSummary[]) => {
    setPayload((current) => (current ? { ...current, conversations } : current));
  }, []);

  const updateUserProvider = useCallback((patch: Partial<UserProviderConfig>) => {
    setUserProvider((current) => sanitizeUserProviderConfig({ ...current, ...patch }));
  }, []);

  const updateSearchService = useCallback((next: SearchServiceConfig) => {
    setSearchService(sanitizeSearchServiceConfig(next));
  }, []);

  const openWorkspaceData = useCallback(() => {
    setWorkspaceDataError("");
    setWorkspaceDataOpen(true);
  }, []);

  const reportWorkspaceError = useCallback((message: string) => {
    setWorkspaceDataError(message);
    setWorkspaceDataOpen(true);
  }, []);

  const addGalleryItem = useCallback((item: GalleryItem) => {
    setGalleryItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 50));
  }, []);

  const clearGallery = useCallback(() => {
    setGalleryItems([]);
  }, []);

  const removeGalleryItem = useCallback((id: string) => {
    setGalleryItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const removeGalleryItems = useCallback((ids: string[]) => {
    const removeIds = new Set(ids);
    setGalleryItems((current) => current.filter((item) => !removeIds.has(item.id)));
  }, []);

  const updateGalleryItem = useCallback((id: string, patch: Partial<GalleryItem>) => {
    setGalleryItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const visibleMenuItems = useMemo<MenuItem[]>(() => {
    return payload?.menuItems.filter(isVisiblePublicMenuItem) || [];
  }, [payload?.menuItems]);

  if (isAdminRoute) {
    return (
      <Suspense fallback={<ModuleLoading />}>
        <AdminPortal />
      </Suspense>
    );
  }

  if (isKnowledgeRoute) {
    return (
      <Suspense fallback={<ModuleLoading />}>
        <KnowledgeCloudPortal />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <main className="boot-screen">
        <span className="boot-mark">XI</span>
        <strong>正在打开工作台</strong>
      </main>
    );
  }

  if (!payload || error) {
    return (
      <main className="boot-screen">
        <span className="boot-mark">!</span>
        <strong>{error || "无法加载工作台"}</strong>
      </main>
    );
  }

  return (
    <>
      <AppShell
        menuItems={visibleMenuItems}
        activeModule={activeModule}
        apiReady={isUserProviderReady(userProvider)}
        accessAddress={userProvider.baseUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "") || "等待连接"}
        accessKey={userProvider.apiKey}
        onModuleChange={navigateToModule}
        onOpenWorkspaceData={openWorkspaceData}
        onWorkspaceError={reportWorkspaceError}
      >
        <Suspense fallback={<ModuleLoading />}>
          <ModuleRouter
            activeModule={activeModule}
            settings={payload.settings}
            menuItems={visibleMenuItems}
            assistants={payload.assistants}
            appPresets={payload.appPresets}
            conversations={payload.conversations}
            galleryItems={galleryItems}
            modelCatalog={payload.modelCatalog}
            promptPresets={payload.promptPresets}
            toolSettings={payload.toolSettings}
            userProvider={userProvider}
            searchService={searchService}
            onUserProviderChange={updateUserProvider}
            onSearchServiceChange={updateSearchService}
            onGenerationResult={addGalleryItem}
            onClearGallery={clearGallery}
            onRemoveGalleryItem={removeGalleryItem}
            onRemoveGalleryItems={removeGalleryItems}
            onUpdateGalleryItem={updateGalleryItem}
            onModuleChange={navigateToModule}
            onRequestApiConfig={() => setApiConfigOpen(true)}
            onConversationsChange={updateConversations}
            onRefresh={loadPublicBootstrap}
          />
        </Suspense>
      </AppShell>
      <ApiConnectionModal
        open={apiConfigOpen}
        required={!isUserProviderReady(userProvider)}
        userProvider={userProvider}
        onUserProviderChange={updateUserProvider}
        onClose={() => {
          if (isUserProviderReady(userProvider)) {
            setApiConfigOpen(false);
          }
        }}
      />
      <WorkspaceDataDialog
        open={workspaceDataOpen}
        initialError={workspaceDataError}
        onClose={() => {
          setWorkspaceDataOpen(false);
          setWorkspaceDataError("");
        }}
      />
    </>
  );
}

export default App;
