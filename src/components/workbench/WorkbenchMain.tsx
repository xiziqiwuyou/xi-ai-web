import type { ReactNode } from "react";

type WorkbenchMainProps = {
  children: ReactNode;
  className?: string;
};

function WorkbenchMain({ children, className = "" }: WorkbenchMainProps) {
  return <main className={`workbench-panel workbench-main ${className}`.trim()}>{children}</main>;
}

export default WorkbenchMain;
