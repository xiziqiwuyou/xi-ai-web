import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { api } from "./api";
import AppShell from "./app/AppShell";
import ModuleRouter from "./app/ModuleRouter";
import { cleanMenuLabel } from "./app/moduleRegistry";
import { preloadPublicModule } from "./app/publicModuleLoader";
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
  clearShellJwtHandoffUrl,
  emptyShellJwtHandoff,
  isUserProviderReady,
  loadUserProviderConfig,
  maskUserProviderKey,
  parseShellJwtHandoff,
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
  const [pendingModule, setPendingModule] = useState<ModuleId | null>(null);
  const [moduleTransitionError, setModuleTransitionError] = useState<ModuleId | null>(null);
  const [moduleTransitionPending, startModuleTransition] = useTransition();
  const moduleRequestIdRef = useRef(0);
  const [userProvider, setUserProvider] = useState<UserProviderConfig>(loadUserProviderConfig);
  const [shellJwtHandoff, setShellJwtHandoff] = useState(() =>
    isStandaloneRoute ? emptyShellJwtHandoff : parseShellJwtHandoff(window.location.hash)
  );
  const [shellJwtPending, setShellJwtPending] = useState(Boolean(shellJwtHandoff.token));
  const [apiConnectionError, setApiConnectionError] = useState(shellJwtHandoff.error);
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

  const transitionToModule = useCallback((moduleId: ModuleId, langflowAvailable: boolean) => {
    const requestId = moduleRequestIdRef.current + 1;
    moduleRequestIdRef.current = requestId;
    setPendingModule(moduleId);
    setModuleTransitionError(null);
    void preloadPublicModule(moduleId, langflowAvailable)
      .then(() => {
        if (moduleRequestIdRef.current !== requestId) return;
        startModuleTransition(() => {
          applyActiveModule(moduleId);
        });
      })
      .catch(() => {
        if (moduleRequestIdRef.current !== requestId) return;
        setPendingModule(null);
        setModuleTransitionError(moduleId);
        replacePublicUrl(activeModule);
      });
  }, [activeModule, applyActiveModule]);

  const applyPublicBootstrap = useCallback(
    (nextPayload: PublicBootstrapPayload) => {
      const requestedModule = publicModuleFromPath(window.location.pathname);
      const resolvedModule = resolvePublicModule(
        nextPayload.menuItems,
        requestedModule,
        nextPayload.settings.defaultModule
      );
      const canonicalPath = publicPathForModule(resolvedModule);

      moduleRequestIdRef.current += 1;
      setPendingModule(null);
      setModuleTransitionError(null);
      setPayload(nextPayload);
      applyActiveModule(resolvedModule);
      void preloadPublicModule(resolvedModule, nextPayload.langflow.available).catch(() => undefined);
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

  useLayoutEffect(() => {
    if (!shellJwtHandoff.present) return;
    clearShellJwtHandoffUrl(window.location, window.history);
  }, [shellJwtHandoff.present]);

  useEffect(() => {
    if (isStandaloneRoute || !shellJwtHandoff.present) {
      setShellJwtPending(false);
      return undefined;
    }

    setUserProvider((current) => sanitizeUserProviderConfig({ ...current, apiKey: "" }));
    const token = shellJwtHandoff.token;
    if (!token) {
      setShellJwtHandoff(emptyShellJwtHandoff);
      setShellJwtPending(false);
      return undefined;
    }

    let alive = true;
    void api.exchangeShellJwt(token)
      .then(({ apiKey }) => {
        if (!alive) return;
        const validatedKey = sanitizeUserProviderConfig({ apiKey }).apiKey;
        if (!validatedKey) {
          throw new Error("外部账号没有可用的默认 API Key");
        }
        setUserProvider((current) => sanitizeUserProviderConfig({
          ...current,
          apiKey: validatedKey
        }));
        setApiConnectionError("");
        setApiConfigOpen(false);
      })
      .catch((nextError: unknown) => {
        if (!alive) return;
        const message = nextError instanceof Error && nextError.message
          ? nextError.message
          : "外部登录令牌验证失败";
        setApiConnectionError(`${message}，请手动填写 API Key`);
      })
      .finally(() => {
        if (!alive) return;
        setShellJwtHandoff(emptyShellJwtHandoff);
        setShellJwtPending(false);
      });

    return () => {
      alive = false;
    };
  }, [isStandaloneRoute]);

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
      transitionToModule(resolvedModule, payload.langflow.available);
      if (publicPathForModule(resolvedModule) !== window.location.pathname) {
        replacePublicUrl(resolvedModule);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isStandaloneRoute, payload, transitionToModule]);

  useEffect(() => {
    if (moduleTransitionPending || !pendingModule || activeModule !== pendingModule) return;
    setPendingModule(null);
  }, [activeModule, moduleTransitionPending, pendingModule]);

  useEffect(() => {
    if (isStandaloneRoute) return;
    document.title = `${cleanMenuLabel(activeModule)} - ${PRODUCT_NAME}`;
  }, [activeModule, isStandaloneRoute]);

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

  useEffect(() => {
    if (isStandaloneRoute || !payload) return undefined;
    const connection = (navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }).connection;
    if (connection?.saveData || connection?.effectiveType?.includes("2g")) return undefined;

    const likelyModule = activeModule === "chat" ? "image" : "chat";
    const likelyItem = payload.menuItems.find((item) => item.id === likelyModule);
    if (!likelyItem || !isAvailablePublicMenuItem(likelyItem)) return undefined;

    const preload = () => {
      void preloadPublicModule(likelyModule, payload.langflow.available).catch(() => undefined);
    };
    const requestIdleCallback = window.requestIdleCallback;
    if (requestIdleCallback) {
      const idleId = requestIdleCallback(preload, { timeout: 2400 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(preload, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [activeModule, isStandaloneRoute, payload]);

  const preloadModule = useCallback((moduleId: ModuleId) => {
    if (!payload || moduleId === activeModule || moduleId === pendingModule) return;
    const item = payload.menuItems.find((menuItem) => menuItem.id === moduleId);
    if (!item || !isAvailablePublicMenuItem(item)) return;
    void preloadPublicModule(moduleId, payload.langflow.available).catch(() => undefined);
  }, [activeModule, payload, pendingModule]);

  const navigateToModule = useCallback(
    (moduleId: ModuleId) => {
      if (!payload) return;
      const item = payload.menuItems.find((menuItem) => menuItem.id === moduleId);
      if (!item || !isAvailablePublicMenuItem(item)) return;
      if (moduleId === activeModule && !pendingModule) return;

      pushPublicUrl(moduleId);
      transitionToModule(moduleId, payload.langflow.available);
    },
    [activeModule, payload, pendingModule, transitionToModule]
  );

  const updateConversations = useCallback((conversations: ConversationSummary[]) => {
    setPayload((current) => (current ? { ...current, conversations } : current));
  }, []);

  const updateUserProvider = useCallback((patch: Partial<UserProviderConfig>) => {
    if (typeof patch.apiKey === "string") setApiConnectionError("");
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

  if (loading || shellJwtPending) {
    return (
      <main className="boot-screen">
        <span className="boot-mark">XI</span>
        <strong>{shellJwtPending ? "正在验证访问令牌" : "正在打开工作台"}</strong>
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
        pendingModule={pendingModule}
        moduleTransitionPending={moduleTransitionPending || Boolean(pendingModule)}
        pendingModuleLabel={pendingModule ? cleanMenuLabel(pendingModule) : ""}
        moduleTransitionError={moduleTransitionError}
        moduleTransitionErrorLabel={moduleTransitionError ? cleanMenuLabel(moduleTransitionError) : ""}
        apiReady={isUserProviderReady(userProvider)}
        maskedApiKey={maskUserProviderKey(userProvider.apiKey)}
        accessAddress={(payload.settings.upstreamBaseUrl || "https://api.xi-ai.cn").replace(/^https?:\/\//i, "").replace(/\/$/, "") || "api.xi-ai.cn"}
        onModuleChange={navigateToModule}
        onModuleIntent={preloadModule}
        onRetryModule={() => {
          const path = moduleTransitionError ? publicPathForModule(moduleTransitionError) : null;
          if (path) window.location.assign(path);
        }}
        onOpenWorkspaceData={openWorkspaceData}
        onOpenApiConfig={() => setApiConfigOpen(true)}
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
            langflow={payload.langflow}
            langflowWorkflows={payload.langflowWorkflows}
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
        errorMessage={apiConnectionError}
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
