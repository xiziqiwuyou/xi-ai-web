import { Save, ServerCog, ToggleLeft } from "lucide-react";
import { vendorLabels } from "../../components/workbench";
import { adminCapabilityLabels } from "./adminConsoleConfig";
import type { MenuItem, SiteSettings, ToolSetting } from "../../types";

export function AdminToolsSection({
  tools,
  onEnabledChange,
  onSave
}: {
  tools: ToolSetting[];
  onEnabledChange: (name: string, enabled: boolean) => void;
  onSave: () => void;
}) {
  return (
    <section id="admin-section-tools" className="admin-section admin-tools-section">
      <div className="section-title"><ServerCog size={17} /><h2>工具权限</h2></div>
      <fieldset className="admin-option-fieldset">
        <legend>可用工具</legend>
        <div className="admin-tool-grid">
          {tools.map((tool) => (
            <label key={tool.name} className="admin-tool-card">
              <input type="checkbox" checked={tool.enabled} onChange={(event) => onEnabledChange(tool.name, event.target.checked)} />
              <span className="admin-tool-card-copy">
                <span className="admin-tool-card-heading">
                  <strong>{tool.label}</strong>
                  <b>{tool.execution === "search" ? "独立搜索" : tool.execution === "provider" ? "厂商托管" : "应用执行"}</b>
                </span>
                <small>{tool.description}</small>
                <span className="admin-tool-card-meta">
                  <em>{tool.execution === "search" ? "不依赖主模型能力" : adminCapabilityLabels[tool.requiredCapability || "toolCalling"]}</em>
                  <em>{tool.execution === "search" ? "独立搜索服务" : (tool.supportedVendors || []).map((vendor) => vendorLabels[vendor] || vendor).join(" / ") || "全部厂商"}</em>
                  {tool.requiresContext ? <em>需要请求上下文</em> : null}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="primary-action" onClick={onSave} disabled={!tools.length}><Save size={16} />保存工具权限</button>
    </section>
  );
}

export function AdminSiteSection({
  settings,
  onChange,
  onSave
}: {
  settings: SiteSettings;
  onChange: (patch: Partial<SiteSettings>) => void;
  onSave: () => void;
}) {
  return (
    <section id="admin-section-site" className="admin-section admin-site-section">
      <div className="section-title"><ServerCog size={17} /><h2>系统设置</h2></div>
      <div className="admin-site-form-grid">
        <label>站点名称<input value={settings.siteName} onChange={(event) => onChange({ siteName: event.target.value })} /></label>
        <label className="admin-site-upstream-field">
          统一上游 API 域名
          <input type="url" inputMode="url" value={settings.upstreamBaseUrl} onChange={(event) => onChange({ upstreamBaseUrl: event.target.value })} placeholder="https://api.xi-ai.cn" spellCheck={false} />
          <small>前台只填写 API Key；填写域名即可，系统会按厂商补全 `/v1` 或 `/v1beta` API 路径。</small>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={settings.allowGuestChat} onChange={(event) => onChange({ allowGuestChat: event.target.checked })} />
          允许访客直接使用对话
        </label>
      </div>
      <div className="admin-form-actions admin-site-actions">
        <button type="button" className="primary-action" onClick={onSave}><Save size={16} />保存系统设置</button>
      </div>
    </section>
  );
}

export function AdminMenusSection({
  items,
  onChange,
  onSave
}: {
  items: MenuItem[];
  onChange: (id: string, patch: Partial<MenuItem>) => void;
  onSave: () => void;
}) {
  return (
    <section id="admin-section-menus" className="admin-section admin-menu-section">
      <div className="section-title"><ToggleLeft size={17} /><h2>菜单管理</h2></div>
      <div className="menu-editor">
        {items.map((item) => (
          <article key={item.id} className="menu-edit-row">
            <label className="menu-name-field">
              <span>菜单名称 <code>{item.id}</code></span>
              <input value={item.label} onChange={(event) => onChange(item.id, { label: event.target.value })} />
            </label>
            <label><input type="checkbox" checked={item.visible} onChange={(event) => onChange(item.id, { visible: event.target.checked })} />显示</label>
            <label><input type="checkbox" checked={item.enabled} onChange={(event) => onChange(item.id, { enabled: event.target.checked })} />启用</label>
          </article>
        ))}
      </div>
      <button type="button" className="primary-action" onClick={onSave}><Save size={16} />保存菜单</button>
    </section>
  );
}
