import { useId, useRef, useState } from "react";
import { Ellipsis, PlugZap, ShieldCheck, X } from "lucide-react";
import Dialog from "../components/ui/Dialog";
import { cleanMenuLabel, moduleMeta } from "./moduleRegistry";
import { mobileMoreModuleIds, mobilePrimaryModuleIds } from "./publicRoutes";
import type { MenuItem, ModuleId } from "../types";

type TopBarProps = {
  siteName: string;
  menuItems: MenuItem[];
  activeModule: ModuleId;
  apiReady: boolean;
  onModuleChange: (moduleId: ModuleId) => void;
  onRequestApiConfig: () => void;
};

function TopBar({
  siteName,
  menuItems,
  activeModule,
  apiReady,
  onModuleChange,
  onRequestApiConfig
}: TopBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTitleId = useId();
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const activeItem = menuItems.find((item) => item.id === activeModule);
  const activeLabel = cleanMenuLabel(activeModule, activeItem?.label);
  const mobilePrimaryItems = menuItems.filter((item) => mobilePrimaryModuleIds.has(item.id));
  const mobileMoreItems = menuItems.filter((item) => mobileMoreModuleIds.has(item.id));
  const moreActive = mobileMoreModuleIds.has(activeModule);

  const openApiConfig = () => {
    setMoreOpen(false);
    window.setTimeout(() => {
      moreTriggerRef.current?.focus({ preventScroll: true });
      onRequestApiConfig();
    }, 0);
  };

  return (
    <>
      <header className="top-bar top-nav-bar">
        <div className="top-brand">
          <span className="brand-badge">XI</span>
          <span className="top-brand-copy">
            <strong>{siteName}</strong>
            <span>{activeLabel}</span>
          </span>
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

      <nav className="mobile-nav" aria-label="主要功能">
        {mobilePrimaryItems.map((item) => {
          const Icon = moduleMeta[item.id].icon;
          const fullLabel = cleanMenuLabel(item.id, item.label);
          const label = item.id === "mindmap" ? "导图" : fullLabel;
          const active = item.id === activeModule;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "mobile-nav-button active" : "mobile-nav-button"}
              disabled={!item.enabled}
              onClick={() => onModuleChange(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={fullLabel}
              title={fullLabel}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          ref={moreTriggerRef}
          type="button"
          className={moreActive ? "mobile-nav-button active" : "mobile-nav-button"}
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="更多功能"
          title="更多功能"
        >
          <Ellipsis size={20} />
          <span>更多</span>
        </button>
      </nav>

      <Dialog
        open={moreOpen}
        variant="sheet"
        labelledBy={moreTitleId}
        onClose={() => setMoreOpen(false)}
        className="mobile-more-sheet"
      >
        <header className="mobile-more-header">
          <h2 id={moreTitleId}>更多</h2>
          <button
            type="button"
            className="ui-icon-button"
            onClick={() => setMoreOpen(false)}
            aria-label="关闭更多菜单"
            title="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="mobile-more-list">
          {mobileMoreItems.map((item) => {
            const Icon = moduleMeta[item.id].icon;
            const label = cleanMenuLabel(item.id, item.label);
            const active = item.id === activeModule;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? "mobile-more-row active" : "mobile-more-row"}
                disabled={!item.enabled}
                onClick={() => {
                  setMoreOpen(false);
                  onModuleChange(item.id);
                }}
                aria-current={active ? "page" : undefined}
              >
                <span className="mobile-more-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{label}</strong>
                  {!item.enabled ? <small>暂未开放</small> : null}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={apiReady ? "mobile-api-status ready" : "mobile-api-status"}
          onClick={openApiConfig}
        >
          <span aria-hidden="true">
            {apiReady ? <ShieldCheck size={18} /> : <PlugZap size={18} />}
          </span>
          <span>
            <strong>{apiReady ? "API 已连接" : "连接 API"}</strong>
            <small>{apiReady ? "URL 与 Key 仅保存在本次会话" : "填写 API URL 与 Key 后使用"}</small>
          </span>
        </button>
      </Dialog>
    </>
  );
}

export default TopBar;
