import type { ReactNode } from "react";

type GenerationOptionsProps = {
  children: ReactNode;
  className?: string;
};

function GenerationOptions({ children, className = "" }: GenerationOptionsProps) {
  return <div className={`workbench-options ${className}`.trim()}>{children}</div>;
}

export default GenerationOptions;
