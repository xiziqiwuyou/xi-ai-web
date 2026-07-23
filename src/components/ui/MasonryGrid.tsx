import type { ReactNode } from "react";

type MasonryGridProps = {
  children: ReactNode;
  className?: string;
  label?: string;
};

function MasonryGrid({ children, className = "", label }: MasonryGridProps) {
  return (
    <div className={`masonry-grid ${className}`.trim()} role="list" aria-label={label}>
      {children}
    </div>
  );
}

export default MasonryGrid;
