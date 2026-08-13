import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Plug, Plus, Trash2, Unplug, X } from "lucide-react";
import type { UserMcpConnection } from "../../types";
import type { ScopedUserMcpProfile, UserMcpProfileScope } from "./userMcpProfiles";

export type ActiveUserMcpConnection = {
  localProfileId: string;
  connection: UserMcpConnection;
};

type Props = {
  profiles: ScopedUserMcpProfile[];
  connections: ActiveUserMcpConnection[];
  disabled?: boolean;
  onAddAndConnect: (input: { label: string; endpoint: string; scope: UserMcpProfileScope }) => Promise<void>;
  onConnect: (profile: ScopedUserMcpProfile) => Promise<void>;
  onDisconnect: (profileId: string) => Promise<void>;
  onDelete: (profile: ScopedUserMcpProfile) => Promise<void>;
};

export default function UserMcpConnectionsMenu({
  profiles,
  connections,
  disabled = false,
  onAddAndConnect,
  onConnect,
  onDisconnect,
  onDelete
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [remember, setRemember] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    closeRef.current?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [open]);

  useEffect(() => {
    if (adding) labelRef.current?.focus();
  }, [adding]);

  const run = async (id: string, operation: () => Promise<void>) => {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MCP 操作失败，请重试。");
    } finally {
      setBusyId("");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("new", async () => {
      await onAddAndConnect({
        label,
        endpoint,
        scope: remember ? "remembered" : "session"
      });
      setLabel("");
      setEndpoint("");
      setRemember(false);
      setAdding(false);
    });
  };

  return (
    <div className="figma-user-mcp-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`figma-user-mcp-trigger${connections.length ? " active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        title="管理个人 MCP 服务"
        onClick={() => setOpen((current) => !current)}
      >
        <Plug size={14} aria-hidden="true" />
        <span>连接</span>
      </button>
      {open ? (
        <section id={panelId} className="figma-user-mcp-popover" role="dialog" aria-label="个人 MCP 服务">
          <header>
            <div>
              <strong>个人 MCP 服务</strong>
              <span>仅支持无需认证的公开 HTTPS 服务</span>
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="关闭"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            ><X size={15} /></button>
          </header>

          <div className="figma-user-mcp-list">
            {profiles.length ? profiles.map((profile) => {
              const active = connections.find((item) => item.localProfileId === profile.id);
              const busy = busyId === profile.id;
              return (
                <article key={`${profile.scope}:${profile.id}`}>
                  <div className="figma-user-mcp-profile-copy">
                    <strong>{profile.label}</strong>
                    <span>{profile.scope === "remembered" ? "已记住" : "仅本次会话"}</span>
                    <code title={profile.endpoint}>{profile.endpoint}</code>
                  </div>
                  <div className="figma-user-mcp-row-actions">
                    <button
                      type="button"
                      aria-label={active ? `断开 ${profile.label}` : `连接 ${profile.label}`}
                      title={active ? "断开" : "连接"}
                      disabled={Boolean(busyId)}
                      onClick={() => void run(profile.id, () => active
                        ? onDisconnect(profile.id)
                        : onConnect(profile))}
                    >
                      {busy ? <LoaderCircle className="is-spinning" size={15} /> : active ? <Unplug size={15} /> : <Plug size={15} />}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${profile.label}`}
                      title="删除本地配置"
                      disabled={Boolean(busyId)}
                      onClick={() => void run(profile.id, () => onDelete(profile))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            }) : <p className="figma-user-mcp-empty">尚未添加个人 MCP 服务。</p>}
          </div>

          {adding ? (
            <form className="figma-user-mcp-form" onSubmit={submit}>
              <label>
                <span>服务名称</span>
                <input ref={labelRef} value={label} maxLength={80} required onChange={(event) => setLabel(event.target.value)} />
              </label>
              <label>
                <span>HTTPS MCP 地址</span>
                <input
                  type="url"
                  inputMode="url"
                  value={endpoint}
                  maxLength={2048}
                  required
                  placeholder="https://mcp.example.com/mcp"
                  onChange={(event) => setEndpoint(event.target.value)}
                />
              </label>
              <label className="figma-user-mcp-remember">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>记住此服务（仅保存在当前浏览器）</span>
              </label>
              <div>
                <button type="button" onClick={() => setAdding(false)}>取消</button>
                <button type="submit" className="primary" disabled={Boolean(busyId)}>
                  {busyId === "new" ? <LoaderCircle className="is-spinning" size={15} /> : <Plug size={15} />}
                  保存并连接
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="figma-user-mcp-add" onClick={() => setAdding(true)}>
              <Plus size={15} />
              添加服务
            </button>
          )}
          {error ? <p className="figma-user-mcp-error" role="alert">{error}</p> : null}
          <p className="figma-user-mcp-safety">连接会把地址发送到本站服务端进行安全校验和工具发现；不会发送当前 API Key、浏览器 Cookie 或自定义请求头。</p>
        </section>
      ) : null}
    </div>
  );
}
