import { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Boxes,
  ChevronRight,
  DatabaseBackup,
  GitFork,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Menu,
  MessageSquare,
  Moon,
  Presentation,
  Server,
  Sparkles,
  Sun,
  Workflow,
  X
} from "lucide-react";
import { saveWorkspaceThemePreference } from "../features/workspace/workspaceRepository";
import type { MenuItem, ModuleId } from "../types";

type TopBarProps = {
  menuItems: MenuItem[];
  activeModule: ModuleId;
  pendingModule: ModuleId | null;
  apiReady: boolean;
  maskedApiKey: string;
  accessAddress: string;
  onModuleChange: (moduleId: ModuleId) => void;
  onModuleIntent: (moduleId: ModuleId) => void;
  onOpenWorkspaceData: () => void;
  onOpenApiConfig: () => void;
  onWorkspaceError: (message: string) => void;
  navigationScrollActive: boolean;
  onNavigationScroll: () => void;
};

const navigationMeta: Partial<Record<ModuleId, { label: string; note: string; icon: typeof MessageSquare }>> = {
  chat: { label: "AI 对话", note: "深度推理与创作", icon: MessageSquare },
  image: { label: "图像生成", note: "灵感可视化", icon: ImageIcon },
  agents: { label: "智能体", note: "角色与工具协作", icon: BrainCircuit },
  workflows: { label: "工作流", note: "多步骤自动执行", icon: Workflow },
  ppt: { label: "AI 一键 PPT", note: "从主题到成稿", icon: Presentation },
  mindmap: { label: "思维导图", note: "洞见结构化", icon: GitFork },
  assistants: { label: "助手库", note: "专属工作伙伴", icon: Boxes },
  translate: { label: "翻译", note: "自然表达转换", icon: Languages }
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "figma-brand compact" : "figma-brand"}>
      <span className="figma-brand-mark" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      {!compact ? (
        <span className="figma-brand-copy">
          <strong>AiStudio</strong>
          <small>CREATE WITH AI</small>
        </span>
      ) : null}
    </div>
  );
}

function ThemeButton({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="figma-icon-button"
      onClick={onToggle}
      aria-label="切换日夜主题"
      title="切换日夜主题"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function WorkspaceDataButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="figma-icon-button"
      onClick={onOpen}
      aria-label="管理工作区数据"
      title="管理工作区数据"
    >
      <DatabaseBackup size={16} />
    </button>
  );
}

function initialDarkTheme() {
  try {
    return window.localStorage.getItem("aistudio-theme") !== "light";
  } catch {
    return true;
  }
}

function TopBar({
  menuItems,
  activeModule,
  pendingModule,
  apiReady,
  maskedApiKey,
  accessAddress,
  onModuleChange,
  onModuleIntent,
  onOpenWorkspaceData,
  onOpenApiConfig,
  onWorkspaceError,
  navigationScrollActive,
  onNavigationScroll
}: TopBarProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileSidebarRef = useRef<HTMLElement | null>(null);
  const themeEffectInitializedRef = useRef(false);
  const [dark, setDark] = useState(initialDarkTheme);

  useEffect(() => {
    const shouldReport = themeEffectInitializedRef.current;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.studioTheme = dark ? "dark" : "light";
    const theme = dark ? "dark" : "light";
    try {
      window.localStorage.setItem("aistudio-theme", theme);
    } catch {
      if (shouldReport) {
        onWorkspaceError("无法写入主题启动偏好，请检查浏览器存储权限。");
      }
    }
    void saveWorkspaceThemePreference(theme).catch((error: unknown) => {
      if (shouldReport) {
        onWorkspaceError(error instanceof Error ? error.message : "无法保存工作区主题偏好。");
      }
    });
    themeEffectInitializedRef.current = true;
  }, [dark, onWorkspaceError]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeModule]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (desktopQuery.matches) setMobileNavOpen(false);
    };
    closeAtDesktop();
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => desktopQuery.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileNavOpen(false);
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileSidebarRef.current?.contains(target) || mobileMenuButtonRef.current?.contains(target)) return;
      setMobileNavOpen(false);
      const clickedInteractiveControl = target instanceof HTMLElement && Boolean(
        target.closest("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")
      );
      if (!clickedInteractiveControl) {
        requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
      }
    };

    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [mobileNavOpen]);

  const orderedItems = menuItems
    .filter((item) => navigationMeta[item.id])
    .sort((a, b) => a.order - b.order);

  const navigation = (className: string) => (
    <nav
      id="figma-public-navigation"
      className={className}
      data-scroll-active={navigationScrollActive ? "true" : "false"}
      aria-label="功能菜单"
      onScroll={onNavigationScroll}
    >
      {orderedItems.map((item) => {
        const meta = navigationMeta[item.id];
        if (!meta) return null;
        const Icon = meta.icon;
        const active = item.id === (pendingModule || activeModule);
        const pending = item.id === pendingModule;
        return (
          <button
            key={item.id}
            type="button"
            className={active
              ? pending ? "figma-nav-item active pending" : "figma-nav-item active"
              : "figma-nav-item"}
            disabled={!item.enabled}
            data-module-id={item.id}
            onPointerEnter={() => onModuleIntent(item.id)}
            onPointerDown={() => onModuleIntent(item.id)}
            onFocus={() => onModuleIntent(item.id)}
            onClick={() => {
              const focusWorkspace = mobileNavOpen;
              onModuleChange(item.id);
              setMobileNavOpen(false);
              if (focusWorkspace) {
                requestAnimationFrame(() => document.getElementById("workspace-main")?.focus({ preventScroll: true }));
              }
            }}
            aria-current={active ? "page" : undefined}
            aria-label={meta.label}
          >
            <Icon size={16} />
            <span>
              <strong>{meta.label}</strong>
              <small>{meta.note}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <header className="figma-mobile-header">
        <Brand />
        <div className="figma-mobile-actions">
          <WorkspaceDataButton onOpen={onOpenWorkspaceData} />
          <ThemeButton dark={dark} onToggle={() => setDark((value) => !value)} />
          <button
            type="button"
            ref={mobileMenuButtonRef}
            className="figma-icon-button"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label={mobileNavOpen ? "关闭功能菜单" : "打开功能菜单"}
            aria-expanded={mobileNavOpen}
            aria-controls="figma-public-navigation"
          >
            {mobileNavOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </header>

      <aside
        ref={mobileSidebarRef}
        className={mobileNavOpen ? "figma-sidebar mobile-open" : "figma-sidebar"}
      >
        <div className="figma-sidebar-brand">
          <Brand />
        </div>
        {navigation("figma-navigation")}
        <button
          type="button"
          className="figma-mobile-key-action"
          onClick={() => {
            setMobileNavOpen(false);
            onOpenApiConfig();
          }}
          aria-label={`更换 API Key，当前 ${maskedApiKey}`}
        >
          <KeyRound size={16} />
          <span>
            <strong>更换 API Key</strong>
            <small>{maskedApiKey}</small>
          </span>
        </button>
        <section className="figma-access-card" aria-label="访问状态">
          <div className="figma-access-topline">
            <span className={apiReady ? "figma-service-status ready" : "figma-service-status"}>
              <i />
              {apiReady ? "服务正常" : "等待连接"}
            </span>
            <span className="figma-access-actions">
              <WorkspaceDataButton onOpen={onOpenWorkspaceData} />
              <ThemeButton dark={dark} onToggle={() => setDark((value) => !value)} />
            </span>
          </div>
          <div className="figma-access-details">
            <div className="figma-access-detail figma-access-endpoint">
              <span className="figma-access-detail-icon" aria-hidden="true">
                <Server size={14} />
              </span>
              <span className="figma-access-detail-copy">
                <small>服务地址</small>
                <strong title={accessAddress}>{accessAddress}</strong>
              </span>
              <span className={apiReady ? "figma-access-detail-state ready" : "figma-access-detail-state"} aria-hidden="true" />
            </div>
            <button
              type="button"
              className="figma-access-detail figma-key-switch"
              onClick={onOpenApiConfig}
              aria-label={`更换 API Key，当前 ${maskedApiKey}`}
            >
              <span className="figma-access-detail-icon" aria-hidden="true">
                <KeyRound size={14} />
              </span>
              <span className="figma-access-detail-copy">
                <small>API Key</small>
                <strong>{maskedApiKey}</strong>
              </span>
              <ChevronRight className="figma-access-detail-chevron" size={15} aria-hidden="true" />
            </button>
          </div>
        </section>
      </aside>
    </>
  );
}

export default TopBar;
