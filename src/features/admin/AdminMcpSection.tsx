import { useEffect, useState, type FormEventHandler } from "react";
import { Network, Plus, RefreshCw, Save, ShieldAlert, Trash2 } from "lucide-react";
import type { McpDiscoveryResult, McpServerProfile } from "../../types";
import type { McpServerDraft } from "./adminConsoleConfig";

type AdminMcpSectionProps = {
  profiles: McpServerProfile[];
  globalExecutionEnabled: boolean;
  userConnectionsEnabled: boolean;
  selectedProfileId: string | "new";
  form: McpServerDraft;
  onSelect: (profileId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<McpServerDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
  onDiscover: () => Promise<McpDiscoveryResult>;
  onExecutionPolicyChange: (patch: { enabled?: boolean; userConnectionsEnabled?: boolean }) => Promise<void>;
  onSaveExecution: (
    profileId: string,
    executionEnabled: boolean,
    allowedToolNames: string[]
  ) => Promise<McpServerProfile>;
};

export function AdminMcpSection({
  profiles,
  globalExecutionEnabled,
  userConnectionsEnabled,
  selectedProfileId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete,
  onDiscover,
  onExecutionPolicyChange,
  onSaveExecution
}: AdminMcpSectionProps) {
  const [discovery, setDiscovery] = useState<McpDiscoveryResult | null>(null);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [executionBusy, setExecutionBusy] = useState(false);

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

  const saveExecution = async () => {
    if (selectedProfileId === "new" || executionBusy) return;
    setExecutionBusy(true);
    try {
      await onSaveExecution(selectedProfileId, form.executionEnabled, form.allowedToolNames);
    } finally {
      setExecutionBusy(false);
    }
  };

  const setGlobalExecution = async (enabled: boolean) => {
    if (executionBusy) return;
    setExecutionBusy(true);
    try {
      await onExecutionPolicyChange({ enabled });
    } catch {
      // The parent owns the visible error state.
    } finally {
      setExecutionBusy(false);
    }
  };

  const toggleAllowedTool = (name: string, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...form.allowedToolNames, name])]
      : form.allowedToolNames.filter((item) => item !== name);
    onChange({ allowedToolNames: next });
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
          <strong>管理员受控的远程 MCP</strong>
          <span>仅允许公开 HTTPS 服务。执行默认关闭，工具白名单由服务端重新发现核验，每次调用仍需对话用户明确确认。</span>
        </p>
      </div>

      <div className="admin-mcp-execution-switch">
        <div>
          <strong>远程工具执行</strong>
          <span>默认关闭。开启后仍需逐个服务、逐个工具授权，且每次调用都由用户确认。</span>
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={globalExecutionEnabled}
            disabled={executionBusy}
            onChange={(event) => void setGlobalExecution(event.target.checked)}
          />
          {globalExecutionEnabled ? "已开启" : "已关闭"}
        </label>
      </div>

      <div className="admin-mcp-execution-switch">
        <div>
          <strong>允许用户添加 MCP 服务</strong>
          <span>默认关闭。开启后，用户可在 AI 对话中临时连接无需认证的公开 HTTPS MCP 服务；地址仅保存在用户浏览器，服务端只保留短期会话连接。</span>
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={userConnectionsEnabled}
            disabled={executionBusy || !globalExecutionEnabled}
            onChange={(event) => void (async () => {
              setExecutionBusy(true);
              try {
                await onExecutionPolicyChange({ userConnectionsEnabled: event.target.checked });
              } catch {
                // The parent owns the visible error state.
              } finally {
                setExecutionBusy(false);
              }
            })()}
          />
          {userConnectionsEnabled ? "已开启" : "已关闭"}
        </label>
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
                  <label className="admin-mcp-tool-allow">
                    <input
                      type="checkbox"
                      checked={form.allowedToolNames.includes(tool.name)}
                      disabled={executionBusy}
                      onChange={(event) => toggleAllowedTool(tool.name, event.target.checked)}
                    />
                    允许在 AI 对话中请求此工具
                  </label>
                  {tool.inputSchema ? <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre> : null}
                </article>
              ))}
            </div>
          ) : <p className="admin-mini-copy">服务没有返回可展示的工具。</p>}
        </section>
      ) : null}

      {selectedProfileId !== "new" ? (
        <div className="admin-mcp-execution-config">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={form.executionEnabled}
              disabled={!form.enabled || executionBusy}
              onChange={(event) => onChange({ executionEnabled: event.target.checked })}
            />
            启用此服务的工具执行
          </label>
          <p>白名单保存时会由服务端重新发现工具并核对名称。发现描述和返回内容始终按不可信数据处理。</p>
          <button
            type="button"
            className="primary-action"
            disabled={executionBusy || !form.enabled}
            onClick={() => void saveExecution()}
          >
            <ShieldAlert size={16} />
            {executionBusy ? "正在保存" : "保存执行权限"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default AdminMcpSection;
