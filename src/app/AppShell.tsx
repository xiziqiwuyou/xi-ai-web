import type { ReactNode } from "react";
import TopBar from "./TopBar";
import type { MenuItem, ModuleId, SiteSettings } from "../types";

type AppShellProps = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  activeModule: ModuleId;
  apiReady: boolean;
  onModuleChange: (moduleId: ModuleId) => void;
  onRequestApiConfig: () => void;
  children: ReactNode;
};

function AppShell({
  settings,
  menuItems,
  activeModule,
  apiReady,
  onModuleChange,
  onRequestApiConfig,
  children
}: AppShellProps) {
  return (
    <div className="rednote-shell top-nav-shell" data-active-module={activeModule}>
      <a className="skip-main-link" href="#workspace-main">
        跳到工作区
      </a>
      <TopBar
        siteName={settings.siteName}
        menuItems={menuItems}
        activeModule={activeModule}
        apiReady={apiReady}
        onModuleChange={onModuleChange}
        onRequestApiConfig={onRequestApiConfig}
      />
      <main
        key={activeModule}
        id="workspace-main"
        className="workspace-frame"
        data-scroll-owner={activeModule === "chat" ? undefined : "public-workspace"}
        tabIndex={-1}
      >
        <div className="workspace-canvas">{children}</div>
      </main>
    </div>
  );
}

export default AppShell;
