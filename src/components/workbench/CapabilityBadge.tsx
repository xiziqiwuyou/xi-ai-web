import type { ReactNode } from "react";

type CapabilityBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn";
};

function CapabilityBadge({ children, tone = "neutral" }: CapabilityBadgeProps) {
  return <span className={`capability-badge ${tone}`}>{children}</span>;
}

export default CapabilityBadge;
