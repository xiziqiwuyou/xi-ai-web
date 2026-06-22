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
};

function WorkbenchLayout({
  title,
  icon: Icon,
  sidebar,
  children
}: WorkbenchLayoutProps) {
  return (
    <section className="workbench-layout" aria-label={title}>
      <WorkbenchSidebar>
        <div className="workbench-sidebar-top compact">
          <header className="workbench-head">
            <span className="workbench-mark">
              <Icon size={20} />
            </span>
            <div>
              <strong>{title}</strong>
            </div>
          </header>
        </div>

        {sidebar}
      </WorkbenchSidebar>
      <WorkbenchMain>
        <div className="workbench-main-tabs" aria-label={`${title} 结果视图`}>
          <span className="active">结果</span>
          <span>任务</span>
          <span>详情</span>
        </div>
        <div className="workbench-main-stage">{children}</div>
      </WorkbenchMain>
    </section>
  );
}

export default WorkbenchLayout;
