import { cleanMenuLabel, moduleMeta } from "./moduleRegistry";
import type { MenuItem, ModuleId } from "../types";

type TopBarProps = {
  siteName: string;
  menuItems: MenuItem[];
  activeModule: ModuleId;
  onModuleChange: (moduleId: ModuleId) => void;
};

function TopBar({ siteName, menuItems, activeModule, onModuleChange }: TopBarProps) {
  return (
    <header className="top-bar top-nav-bar">
      <div className="top-brand">
        <span className="brand-badge">XI</span>
        <strong>{siteName}</strong>
      </div>

      <nav className="top-module-nav" aria-label="功能菜单">
        {menuItems.map((item) => {
          const itemMeta = moduleMeta[item.id];
          const Icon = itemMeta.icon;
          const label = cleanMenuLabel(item.id, item.label);
          const active = item.id === activeModule;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "top-module-button active" : "top-module-button"}
              disabled={!item.enabled}
              onClick={() => onModuleChange(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export default TopBar;
