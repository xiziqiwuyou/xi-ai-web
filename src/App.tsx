import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import AppShell from "./app/AppShell";
import ModuleRouter from "./app/ModuleRouter";
import { loadGalleryItems, saveGalleryItems } from "./features/gallery/galleryStorage";
import ApiConnectionModal from "./features/settings/ApiConnectionModal";
import {
  defaultUserProviderConfig,
  isUserProviderReady,
  loadUserProviderConfig,
  sanitizeUserProviderConfig,
  saveUserProviderConfig
} from "./features/settings/userProviderConfig";
import type {
  ConversationSummary,
  GalleryItem,
  MenuItem,
  ModuleId,
  PublicBootstrapPayload,
  UserProviderConfig
} from "./types";

const AdminPortal = lazy(() => import("./features/admin/AdminPortal"));
const fallbackModule: ModuleId = "chat";
const publicMenuItem = (item: MenuItem) => item.visible;

function ModuleLoading() {
  return (
    <main className="boot-screen inline">
      <span className="boot-mark">XI</span>
      <strong>正在加载工作台</strong>
    </main>
  );
}

function chooseInitialModule(payload: PublicBootstrapPayload): ModuleId {
  const preferred = payload.menuItems.find(
    (item) => item.id === payload.settings.defaultModule && publicMenuItem(item)
  );
  return preferred?.id || payload.menuItems.find(publicMenuItem)?.id || fallbackModule;
}

function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const isAdminRoute = normalizedPath === "/admin";
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PublicBootstrapPayload | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>(fallbackModule);
  const [userProvider, setUserProvider] = useState<UserProviderConfig>(loadUserProviderConfig);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(loadGalleryItems);
  const [error, setError] = useState("");

  const loadPublicBootstrap = useCallback(async () => {
    const nextPayload = await api.publicBootstrap();
    setPayload(nextPayload);
    setActiveModule((current) => {
      const stillVisible = nextPayload.menuItems.some((item) => item.id === current && item.visible);
      return stillVisible ? current : chooseInitialModule(nextPayload);
    });
    return nextPayload;
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      setLoading(false);
      return;
    }

    let alive = true;
    loadPublicBootstrap()
      .then((nextPayload) => {
        if (!alive) return;
        setActiveModule(chooseInitialModule(nextPayload));
      })
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
  }, [isAdminRoute, loadPublicBootstrap]);

  useEffect(() => {
    saveUserProviderConfig(userProvider);
  }, [userProvider]);

  useEffect(() => {
    if (isAdminRoute || loading || !payload) return;
    if (!isUserProviderReady(userProvider)) setApiConfigOpen(true);
  }, [isAdminRoute, loading, payload, userProvider]);

  useEffect(() => {
    if (isAdminRoute) return;
    saveGalleryItems(galleryItems);
  }, [galleryItems, isAdminRoute]);

  const updateConversations = useCallback((conversations: ConversationSummary[]) => {
    setPayload((current) => (current ? { ...current, conversations } : current));
  }, []);

  const updateUserProvider = useCallback((patch: Partial<UserProviderConfig>) => {
    setUserProvider((current) => sanitizeUserProviderConfig({ ...current, ...patch }));
  }, []);

  const resetUserProvider = useCallback(() => {
    setUserProvider(defaultUserProviderConfig);
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
    return payload?.menuItems.filter(publicMenuItem) || [];
  }, [payload?.menuItems]);

  if (isAdminRoute) {
    return (
      <Suspense fallback={<ModuleLoading />}>
        <AdminPortal />
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
        settings={payload.settings}
        menuItems={visibleMenuItems}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
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
            onUserProviderChange={updateUserProvider}
            onGenerationResult={addGalleryItem}
            onClearGallery={clearGallery}
            onRemoveGalleryItem={removeGalleryItem}
            onRemoveGalleryItems={removeGalleryItems}
            onUpdateGalleryItem={updateGalleryItem}
            onModuleChange={setActiveModule}
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
        onResetUserProvider={resetUserProvider}
        onClose={() => {
          if (isUserProviderReady(userProvider)) setApiConfigOpen(false);
        }}
      />
    </>
  );
}

export default App;
