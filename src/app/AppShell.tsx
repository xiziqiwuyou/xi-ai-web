import { useLayoutEffect, useRef, type ReactNode } from "react";
import { CircleAlert, LoaderCircle, LockKeyhole, RotateCcw } from "lucide-react";
import TopBar from "./TopBar";
import { useShellScrollActivity } from "./useShellScrollActivity";
import type { MenuItem, ModuleId } from "../types";

export type ModuleCanvasPhase = "idle" | "exiting" | "entering";

type AppShellProps = {
  menuItems: MenuItem[];
  activeModule: ModuleId;
  moduleCanvasPhase: ModuleCanvasPhase;
  pendingModule: ModuleId | null;
  moduleTransitionPending: boolean;
  pendingModuleLabel: string;
  moduleTransitionError: ModuleId | null;
  moduleTransitionErrorLabel: string;
  apiReady: boolean;
  maskedApiKey: string;
  accessAddress: string;
  onModuleChange: (moduleId: ModuleId) => void;
  onModuleIntent: (moduleId: ModuleId) => void;
  onRetryModule: () => void;
  onOpenWorkspaceData: () => void;
  progressSyncEnabled: boolean;
  onOpenProgressSync: () => void;
  onOpenApiConfig: () => void;
  onWorkspaceError: (message: string) => void;
  children: ReactNode;
};

function AppShell({
  menuItems,
  activeModule,
  moduleCanvasPhase,
  pendingModule,
  moduleTransitionPending,
  pendingModuleLabel,
  moduleTransitionError,
  moduleTransitionErrorLabel,
  apiReady,
  maskedApiKey,
  accessAddress,
  onModuleChange,
  onModuleIntent,
  onRetryModule,
  onOpenWorkspaceData,
  progressSyncEnabled,
  onOpenProgressSync,
  onOpenApiConfig,
  onWorkspaceError,
  children
}: AppShellProps) {
  const shellScroll = useShellScrollActivity();
  const workspaceRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    workspace.scrollTop = 0;
    workspace.scrollLeft = 0;
  }, [activeModule]);

  return (
    <div
      className="figma-studio-shell"
      data-active-module={activeModule}
      data-module-transition={moduleTransitionPending ? "pending" : "idle"}
    >
      <a className="skip-main-link" href="#workspace-main">
        跳到工作区
      </a>
      <TopBar
        menuItems={menuItems}
        activeModule={activeModule}
        pendingModule={pendingModule}
        apiReady={apiReady}
        maskedApiKey={maskedApiKey}
        accessAddress={accessAddress}
        onModuleChange={onModuleChange}
        onModuleIntent={onModuleIntent}
        onOpenWorkspaceData={onOpenWorkspaceData}
        progressSyncEnabled={progressSyncEnabled}
        onOpenProgressSync={onOpenProgressSync}
        onOpenApiConfig={onOpenApiConfig}
        onWorkspaceError={onWorkspaceError}
        navigationScrollActive={shellScroll.activeOwner === "navigation"}
        onNavigationScroll={() => shellScroll.markActive("navigation")}
      />
      <main
        ref={workspaceRef}
        id="workspace-main"
        className="figma-workspace"
        data-scroll-owner="public-workspace"
        data-scroll-active={shellScroll.activeOwner === "workspace" ? "true" : "false"}
        tabIndex={-1}
        onScroll={() => shellScroll.markActive("workspace")}
      >
        {moduleTransitionPending && pendingModule ? (
          <div className="figma-module-transition" role="status" aria-live="polite" aria-atomic="true">
            <span className="figma-module-transition-rail" aria-hidden="true"><i /></span>
            <span className="figma-module-transition-copy">
              <span className="figma-module-transition-spinner" aria-hidden="true"><LoaderCircle size={14} /></span>
              正在打开 <strong>{pendingModuleLabel}</strong>
            </span>
          </div>
        ) : null}
        {moduleTransitionError ? (
          <div className="figma-module-transition-error" role="alert">
            <span><CircleAlert size={15} />无法打开 <strong>{moduleTransitionErrorLabel}</strong>，当前页面已保留。</span>
            <button type="button" onClick={onRetryModule}><RotateCcw size={14} />重试</button>
          </div>
        ) : null}
        <div
          key={activeModule}
          className="figma-workspace-canvas"
          data-module-canvas={activeModule}
          data-transition-phase={moduleCanvasPhase}
          aria-busy={moduleTransitionPending}
        >
          {children}
        </div>
        <footer className="figma-public-footer">
          <span>
            <LockKeyhole size={14} />
            此访问链接由管理员授权
          </span>
          <code>KEY · {apiReady ? "已配置" : "未配置"}</code>
        </footer>
      </main>
    </div>
  );
}

export default AppShell;
