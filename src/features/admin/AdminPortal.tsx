import { FormEvent, useEffect, useState } from "react";
import { Home, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../../api";
import type { AdminBootstrapPayload, AdminStatus } from "../../types";
import { AdminConsole } from "./AdminConsole";

function AdminPortal() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [bootstrap, setBootstrap] = useState<AdminBootstrapPayload | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadAdmin = async () => {
    const nextStatus = await api.adminStatus();
    setStatus(nextStatus);
    if (nextStatus.authenticated) {
      const nextBootstrap = await api.adminBootstrap();
      setBootstrap(nextBootstrap);
    }
  };

  useEffect(() => {
    setNotice("");
    setError("");
    void loadAdmin().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "后台状态加载失败");
    });
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.adminLogin(password);
      setPassword("");
      await loadAdmin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api.adminLogout();
    setStatus(null);
    setBootstrap(null);
    await loadAdmin();
  };

  return (
    <main className="admin-portal">
      <section className="admin-portal-shell">
        <header className="admin-portal-head">
          <div className="admin-portal-brand">
            <span className="admin-brand-mark">
              <ShieldCheck size={18} />
            </span>
            <div>
              <span>Admin</span>
              <strong>开发者控制台</strong>
              <p>模型目录 · 菜单权限 · 运维审计</p>
            </div>
          </div>
          <a href="/" className="admin-home-link">
            <Home size={16} />
            返回前台
          </a>
        </header>

        {!status?.authenticated ? (
          <form className="admin-login admin-portal-login" onSubmit={login}>
            <div className="admin-login-icon">
              <LockKeyhole size={24} />
            </div>
            <div className="admin-login-copy">
              <strong>管理员登录</strong>
              <span>请输入部署时配置的 ADMIN_PASSWORD</span>
            </div>
            <label>
              管理员密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                placeholder="ADMIN_PASSWORD"
              />
            </label>
            <button type="submit" className="primary-action" disabled={busy || !password}>
              <KeyRound size={17} />
              {busy ? "验证中" : "进入后台"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : bootstrap ? (
          <AdminConsole
            bootstrap={bootstrap}
            notice={notice}
            error={error}
            onNotice={setNotice}
            onError={setError}
            onBootstrapChange={setBootstrap}
            onPublicRefresh={async () => undefined}
            onLogout={logout}
          />
        ) : (
          <div className="admin-loading">正在加载后台配置</div>
        )}
      </section>
    </main>
  );
}

export default AdminPortal;
