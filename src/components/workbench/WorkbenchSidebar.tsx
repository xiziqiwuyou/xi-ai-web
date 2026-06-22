import type { ReactNode } from "react";

type WorkbenchSidebarProps = {
  children: ReactNode;
  className?: string;
};

function WorkbenchSidebar({ children, className = "" }: WorkbenchSidebarProps) {
  return (
    <aside className={`workbench-panel workbench-sidebar ${className}`.trim()}>
      {children}
    </aside>
  );
}

export default WorkbenchSidebar;
