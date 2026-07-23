import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import TopBar from "./TopBar";
import type { MenuItem, ModuleId } from "../types";

type AppShellProps = {
  menuItems: MenuItem[];
  activeModule: ModuleId;
  apiReady: boolean;
  accessAddress: string;
  accessKey: string;
  onModuleChange: (moduleId: ModuleId) => void;
  onOpenWorkspaceData: () => void;
  onWorkspaceError: (message: string) => void;
  children: ReactNode;
};

function maskAccessKey(value: string) {
  const key = value.trim();
  if (!key) return "未连接";
  if (key.length <= 7) return `${key.slice(0, 2)}••••${key.slice(-2)}`;
  return `${key.slice(0, 4)}••••••${key.slice(-3)}`;
}

function AppShell({
  menuItems,
  activeModule,
  apiReady,
  accessAddress,
  accessKey,
  onModuleChange,
  onOpenWorkspaceData,
  onWorkspaceError,
  children
}: AppShellProps) {
  return (
    <div className="figma-studio-shell" data-active-module={activeModule}>
      <a className="skip-main-link" href="#workspace-main">
        跳到工作区
      </a>
      <TopBar
        menuItems={menuItems}
        activeModule={activeModule}
        apiReady={apiReady}
        accessAddress={accessAddress}
        onModuleChange={onModuleChange}
        onOpenWorkspaceData={onOpenWorkspaceData}
        onWorkspaceError={onWorkspaceError}
      />
      <main id="workspace-main" className="figma-workspace" data-scroll-owner="public-workspace" tabIndex={-1}>
        <div key={activeModule} className="figma-workspace-canvas">
          {children}
        </div>
        <footer className="figma-public-footer">
          <span>
            <LockKeyhole size={14} />
            此访问链接由管理员授权
          </span>
          <code>KEY · {maskAccessKey(accessKey)}</code>
        </footer>
      </main>
    </div>
  );
}

export default AppShell;
