import { FormEvent, useEffect, useState } from "react";
import { Home, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../../api";
import type { AdminBootstrapPayload, AdminStatus } from "../../types";
import { AdminConsole } from "./AdminConsole";

function AdminPortal() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [bootstrap, setBootstrap] = useState<AdminBootstrapPayload | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadAdmin = async () => {
    const nextStatus = await api.adminStatus();
    setStatus(nextStatus);
    if (nextStatus.authenticated) {
      const nextBootstrap = await api.adminBootstrap();
      setBootstrap(nextBootstrap);
    } else {
      setBootstrap(null);
    }
  };

  useEffect(() => {
    document.title = "Admin - xi-ai-web";
    setNotice("");
    setError("");
    void loadAdmin()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "后台状态加载失败");
      })
      .finally(() => setInitializing(false));
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

  if (status?.authenticated && bootstrap) {
    return (
      <main className="admin-portal is-authenticated">
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
      </main>
    );
  }

  return (
    <main className="admin-portal is-login">
      <section className="admin-login-stage" data-scroll-owner>
        <header className="admin-login-header">
          <a href="/" className="admin-login-brand" aria-label="返回 xi-ai-web 前台">
            <span className="admin-brand-mark" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <span>
              <strong>xi-ai-web</strong>
              <small>开发者后台</small>
            </span>
          </a>
          <a href="/" className="admin-home-link" aria-label="返回前台" title="返回前台">
            <Home size={16} />
            <span className="admin-action-label">返回前台</span>
          </a>
        </header>

        <div className="admin-login-main">
          {initializing ? (
            <div className="admin-loading-card" role="status" aria-live="polite">
              <LoaderCircle size={22} className="admin-loading-spinner" />
              <strong>正在检查登录状态</strong>
            </div>
          ) : (
            <form className="admin-login admin-portal-login" onSubmit={login}>
              <div className="admin-login-icon" aria-hidden="true">
                <LockKeyhole size={22} />
              </div>
              <div className="admin-login-copy">
                <span>ADMIN ACCESS</span>
                <h1>管理员登录</h1>
                <p>使用部署环境中配置的管理员密码。</p>
              </div>
              <label htmlFor="admin-password">
                管理员密码
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  placeholder="输入管理员密码"
                />
              </label>
              <button type="submit" className="primary-action admin-login-submit" disabled={busy || !password}>
                <KeyRound size={17} />
                {busy ? "验证中" : "进入后台"}
              </button>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

export default AdminPortal;
