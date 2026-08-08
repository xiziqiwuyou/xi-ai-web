import { useEffect, useState, type FormEventHandler } from "react";
import { Network, Plus, RefreshCw, Save, ShieldAlert, Trash2 } from "lucide-react";
import type { McpDiscoveryResult, McpServerProfile } from "../../types";
import type { McpServerDraft } from "./adminConsoleConfig";

type AdminMcpSectionProps = {
  profiles: McpServerProfile[];
  selectedProfileId: string | "new";
  form: McpServerDraft;
  onSelect: (profileId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<McpServerDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
  onDiscover: () => Promise<McpDiscoveryResult>;
};

export function AdminMcpSection({
  profiles,
  selectedProfileId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete,
  onDiscover
}: AdminMcpSectionProps) {
  const [discovery, setDiscovery] = useState<McpDiscoveryResult | null>(null);
  const [discoverBusy, setDiscoverBusy] = useState(false);

  useEffect(() => {
    setDiscovery(null);
  }, [selectedProfileId]);

  const discover = async () => {
    if (selectedProfileId === "new" || !form.enabled || discoverBusy) return;
    setDiscoverBusy(true);
    try {
      setDiscovery(await onDiscover());
    } catch {
      setDiscovery(null);
    } finally {
      setDiscoverBusy(false);
    }
  };

  return (
    <section id="admin-section-mcp" className="admin-section admin-mcp-section">
      <div className="section-title">
        <Network size={17} />
        <h2>MCP 服务</h2>
      </div>
      <div className="admin-mcp-boundary-note" role="note">
        <ShieldAlert size={17} aria-hidden="true" />
        <p>
          <strong>仅管理员配置，当前只做能力发现</strong>
          <span>服务端只允许公开 HTTPS 地址，并会在每次发现前重新校验 DNS。发现结果是不可信描述，不会发送给模型，也不会执行远程工具。</span>
        </p>
      </div>

      <div className="provider-picker">
        <label htmlFor="admin-mcp-profile-picker">
          <span>选择 MCP 服务</span>
          <select
            id="admin-mcp-profile-picker"
            value={selectedProfileId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}{profile.enabled ? "" : "（已停用）"}
              </option>
            ))}
            <option value="new">新增 MCP 服务</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="新增 MCP 服务"
          title="新增 MCP 服务"
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </div>

      <form className="provider-form admin-mcp-form" onSubmit={onSubmit}>
        <label>
          服务显示名称
          <input
            value={form.label}
            maxLength={120}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="例如：团队知识工具"
          />
        </label>
        <label>
          MCP 服务地址
          <input
            type="url"
            aria-label="MCP 服务地址"
            inputMode="url"
            value={form.endpoint}
            maxLength={2048}
            onChange={(event) => onChange({ endpoint: event.target.value })}
            placeholder="https://mcp.example.com/mcp"
            spellCheck={false}
          />
          <small>不要填写用户名、密码、Token、查询参数或自定义请求头。</small>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          启用此服务
        </label>
        <div className="admin-form-actions">
          <button type="submit" className="primary-action">
            <Save size={16} />
            {selectedProfileId === "new" ? "保存 MCP 服务" : "保存修改"}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void discover()}
            disabled={selectedProfileId === "new" || !form.enabled || discoverBusy}
          >
            <RefreshCw size={16} className={discoverBusy ? "is-spinning" : undefined} />
            {discoverBusy ? "发现中" : "发现工具"}
          </button>
          {selectedProfileId !== "new" ? (
            <button type="button" className="secondary-action danger-action" onClick={onDelete}>
              <Trash2 size={16} />
              删除服务
            </button>
          ) : null}
        </div>
      </form>

      {discovery ? (
        <section className="admin-mcp-discovery" aria-live="polite">
          <div className="admin-mcp-discovery-heading">
            <div>
              <h3>发现结果</h3>
              <p>协议 {discovery.protocolVersion} · {discovery.tools.length} 个工具{discovery.truncated ? " · 结果已截断" : ""}</p>
            </div>
            <span>仅展示</span>
          </div>
          {discovery.tools.length ? (
            <div className="admin-mcp-tool-list">
              {discovery.tools.map((tool) => (
                <article key={tool.name} className="admin-mcp-tool-row">
                  <div>
                    <strong>{tool.label}</strong>
                    <code>{tool.name}</code>
                  </div>
                  <p>{tool.description || "暂无描述"}</p>
                  {tool.inputSchema ? <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre> : null}
                </article>
              ))}
            </div>
          ) : <p className="admin-mini-copy">服务没有返回可展示的工具。</p>}
        </section>
      ) : null}
    </section>
  );
}

export default AdminMcpSection;
