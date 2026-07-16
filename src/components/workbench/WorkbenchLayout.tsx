import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import WorkbenchMain from "./WorkbenchMain";
import WorkbenchSidebar from "./WorkbenchSidebar";

type WorkbenchLayoutProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  badges?: string[];
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarTitle?: string;
  sidebarPosition?: "start" | "end";
  mobileNavigation?: ReactNode;
};

function WorkbenchLayout({
  title,
  icon: Icon,
  sidebar,
  children,
  className = "",
  sidebarTitle,
  sidebarPosition = "start",
  mobileNavigation
}: WorkbenchLayoutProps) {
  const sidebarPanel = (
    <WorkbenchSidebar>
      <div className="workbench-sidebar-top compact">
        <header className="workbench-head">
          <span className="workbench-mark" aria-hidden="true">
            <Icon size={18} />
          </span>
          <strong>{sidebarTitle || title}</strong>
        </header>
      </div>

      {sidebar}
    </WorkbenchSidebar>
  );

  const mainPanel = (
    <WorkbenchMain>
      <div className="workbench-main-stage">{children}</div>
    </WorkbenchMain>
  );

  return (
    <section
      className={`workbench-layout sidebar-${sidebarPosition} ${className}`.trim()}
      aria-label={title}
    >
      {mobileNavigation ? <div className="workbench-mobile-navigation">{mobileNavigation}</div> : null}
      {sidebarPosition === "end" ? mainPanel : sidebarPanel}
      {sidebarPosition === "end" ? sidebarPanel : mainPanel}
    </section>
  );
}

export default WorkbenchLayout;
