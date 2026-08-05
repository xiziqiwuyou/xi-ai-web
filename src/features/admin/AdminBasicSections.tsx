import { type FormEvent, useEffect, useState } from "react";
import { KeyRound, Save, ServerCog, ToggleLeft } from "lucide-react";
import { vendorLabels } from "../../components/workbench";
import { adminCapabilityLabels } from "./adminConsoleConfig";
import type { AdminCredentialUpdate, MenuItem, SiteSettings, ToolSetting } from "../../types";

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
  adminUsername,
  settings,
  onChange,
  onSave,
  onCredentialsSave
}: {
  adminUsername: string;
  settings: SiteSettings;
  onChange: (patch: Partial<SiteSettings>) => void;
  onSave: () => void;
  onCredentialsSave: (credentials: AdminCredentialUpdate) => Promise<void>;
}) {
  const [username, setUsername] = useState(adminUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialError, setCredentialError] = useState("");
  const updateProgressSync = (patch: Partial<SiteSettings["progressSync"]>) => {
    onChange({ progressSync: { ...settings.progressSync, ...patch } });
  };

  useEffect(() => setUsername(adminUsername), [adminUsername]);

  const saveCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCredentialError("");
    if (newPassword && newPassword !== confirmPassword) {
      setCredentialError("两次输入的新密码不一致。");
      return;
    }
    if (newPassword && newPassword.length < 16) {
      setCredentialError("新密码至少需要 16 个字符。");
      return;
    }
    setCredentialBusy(true);
    try {
      await onCredentialsSave({
        currentPassword,
        username: username.trim(),
        password: newPassword
      });
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : "管理员凭据更新失败。");
    } finally {
      setCredentialBusy(false);
    }
  };

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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={settings.progressSync.enabled}
            onChange={(event) => updateProgressSync({ enabled: event.target.checked })}
          />
          启用跨设备临时同步
        </label>
        <label>
          同步码有效期（秒）
          <input
            type="number"
            min={180}
            max={1800}
            step={60}
            value={settings.progressSync.ttlSeconds}
            onChange={(event) => updateProgressSync({ ttlSeconds: Number(event.target.value) })}
          />
        </label>
        <label>
          单次密文上限（MB）
          <input
            type="number"
            min={5}
            max={64}
            step={1}
            value={settings.progressSync.maxPayloadMb}
            onChange={(event) => updateProgressSync({ maxPayloadMb: Number(event.target.value) })}
          />
        </label>
        <label>
          单 IP 尝试次数
          <input
            type="number"
            min={1}
            max={20}
            value={settings.progressSync.maxIpJoinAttempts}
            onChange={(event) => updateProgressSync({ maxIpJoinAttempts: Number(event.target.value) })}
          />
        </label>
        <label>
          单同步码尝试次数
          <input
            type="number"
            min={1}
            max={10}
            value={settings.progressSync.maxSessionJoinAttempts}
            onChange={(event) => updateProgressSync({ maxSessionJoinAttempts: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="admin-form-actions admin-site-actions">
        <button type="button" className="primary-action" onClick={onSave}><Save size={16} />保存系统设置</button>
      </div>

      <form className="admin-credential-form" onSubmit={saveCredentials}>
        <div className="admin-credential-heading">
          <span aria-hidden="true"><KeyRound size={17} /></span>
          <div>
            <h3>后台登录凭据</h3>
            <p>修改后所有后台会话都会退出，需要使用新凭据重新登录。</p>
          </div>
        </div>
        <div className="admin-credential-grid">
          <label>
            新管理员用户名
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <label>
            当前密码
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="用于确认本次修改"
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              value={newPassword}
              onChange={(event) => {
                const value = event.target.value;
                setNewPassword(value);
                if (!value) setConfirmPassword("");
              }}
              autoComplete="new-password"
              placeholder="留空则保持当前密码"
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="再次输入新密码"
              disabled={!newPassword}
            />
          </label>
        </div>
        {credentialError ? <p className="form-error" role="alert">{credentialError}</p> : null}
        <div className="admin-form-actions admin-site-actions">
          <button
            type="submit"
            className="secondary-action"
            disabled={credentialBusy || !currentPassword || !username.trim()}
          >
            <KeyRound size={16} />
            {credentialBusy ? "正在更新" : "更新登录凭据"}
          </button>
        </div>
      </form>
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
