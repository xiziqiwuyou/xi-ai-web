import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="workbench-empty">
      <span>
        <Icon size={34} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default EmptyState;
