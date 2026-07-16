import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="workbench-empty">
      <span aria-hidden="true">
        <Icon size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default EmptyState;
