import type { ReactNode } from "react";
import TopBar from "./TopBar";
import type { MenuItem, ModuleId, SiteSettings } from "../types";

type AppShellProps = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  activeModule: ModuleId;
  onModuleChange: (moduleId: ModuleId) => void;
  children: ReactNode;
};

function AppShell({
  settings,
  menuItems,
  activeModule,
  onModuleChange,
  children
}: AppShellProps) {
  return (
    <div className="rednote-shell top-nav-shell">
      <a className="skip-main-link" href="#workspace-main">
        跳到工作区
      </a>
      <TopBar
        siteName={settings.siteName}
        menuItems={menuItems}
        activeModule={activeModule}
        onModuleChange={onModuleChange}
      />
      <main id="workspace-main" className="workspace-frame" tabIndex={-1}>
        <div className="workspace-canvas">{children}</div>
      </main>
    </div>
  );
}

export default AppShell;
