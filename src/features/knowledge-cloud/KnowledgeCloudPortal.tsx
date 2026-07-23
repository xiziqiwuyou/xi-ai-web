import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { ApiError, api } from "../../api";
import type {
  KnowledgeAccount,
  KnowledgeAuthResponse,
  KnowledgePublicConfig,
  KnowledgeRegistrationMode
} from "../../types";
import { clearKnowledgeEmbeddingConnections } from "./embeddingConnections";
import {
  clearLiveKnowledgeClientState,
  emitKnowledgeSessionChanged
} from "./integrationState";
import KnowledgeCloudWorkspace from "./KnowledgeCloudWorkspace";

type KnowledgeView = "loading" | "login" | "register" | "recover" | "admin-reset" | "recovery" | "account" | "unavailable";
type CopyRecoveryResult = "copied" | "selected" | "unavailable";

type FormState = {
  username: string;
  password: string;
  inviteCode: string;
  recoveryCode: string;
  newPassword: string;
};

const emptyForm: FormState = {
  username: "",
  password: "",
  inviteCode: "",
  recoveryCode: "",
  newPassword: ""
};

function selectElementText(target: HTMLElement | null) {
  if (!target) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection.toString() === target.textContent;
}

async function copyRecoveryText(value: string, fallbackTarget: HTMLElement | null): Promise<CopyRecoveryResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return "copied";
    }
  } catch {
    // Continue with the compatibility path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }
  if (copied) return "copied";
  return selectElementText(fallbackTarget) ? "selected" : "unavailable";
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "知识库服务暂时不可用";
}

function registrationLabel(mode: KnowledgeRegistrationMode) {
  if (mode === "open") return "公开注册";
  if (mode === "invite_only") return "邀请码注册";
  return "暂未开放注册";
}

function KnowledgeCloudPortal() {
  const [view, setView] = useState<KnowledgeView>("loading");
  const [config, setConfig] = useState<KnowledgePublicConfig | null>(null);
  const [account, setAccount] = useState<KnowledgeAccount | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const recoveryCodeElement = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "知识库 - xi-ai-web";
    const dark = window.localStorage.getItem("aistudio-theme") !== "light";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.studioTheme = dark ? "dark" : "light";
    let alive = true;
    Promise.all([api.knowledgePublicConfig(), api.knowledgeSession()])
      .then(([nextConfig, session]) => {
        if (!alive) return;
        setConfig(nextConfig);
        if (session.authenticated && session.account) {
          setAccount(session.account);
          setCsrfToken(session.csrfToken || "");
          setView("account");
        } else {
          clearKnowledgeEmbeddingConnections();
          setView("login");
        }
      })
      .catch((nextError: unknown) => {
        if (!alive) return;
        setError(errorMessage(nextError));
        setView("unavailable");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "recovery" || recoveryAcknowledged) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "恢复码尚未确认保存";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [recoveryAcknowledged, view]);

  const passwordHint = useMemo(() => {
    const minimum = config?.accountRules.passwordMinLength || 10;
    return `至少 ${minimum} 个字符`;
  }, [config]);

  const updateForm = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  };

  const acceptAuth = (response: KnowledgeAuthResponse) => {
    if (response.account) setAccount(response.account);
    setCsrfToken(response.csrfToken || "");
    emitKnowledgeSessionChanged(Boolean(response.account));
    setForm(emptyForm);
    if (response.recoveryCode) {
      setRecoveryCode(response.recoveryCode);
      setRecoveryAcknowledged(false);
      setCopied(false);
      setView("recovery");
    } else {
      setView("account");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (view === "login") {
        acceptAuth(await api.knowledgeLogin({ username: form.username, password: form.password }));
      } else if (view === "register") {
        acceptAuth(await api.knowledgeRegister({
          username: form.username,
          password: form.password,
          ...(form.inviteCode.trim() ? { inviteCode: form.inviteCode.trim() } : {})
        }));
      } else if (view === "recover") {
        acceptAuth(await api.knowledgeRecover({
          username: form.username,
          recoveryCode: form.recoveryCode,
          newPassword: form.newPassword
        }));
      } else if (view === "admin-reset") {
        acceptAuth(await api.knowledgeAdminReset({
          username: form.username,
          resetCode: form.recoveryCode,
          newPassword: form.newPassword
        }));
      }
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const copyRecoveryCode = async () => {
    setError("");
    const result = await copyRecoveryText(recoveryCode, recoveryCodeElement.current);
    if (result === "copied") {
      setCopied(true);
      setNotice("恢复码已复制");
      return;
    }
    setCopied(false);
    if (result === "selected") {
      setNotice("恢复码已选中，请按 Ctrl/Cmd+C 完成复制");
      return;
    }
    setError("浏览器未允许自动复制，请手动保存恢复码");
  };

  const downloadRecoveryCode = () => {
    const blob = new Blob([`${recoveryCode}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xi-ai-knowledge-recovery-code.txt";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("恢复码文件已下载");
  };

  const finishRecoveryConfirmation = () => {
    setRecoveryCode("");
    setRecoveryAcknowledged(false);
    setCopied(false);
    setNotice("");
    setView("account");
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await api.knowledgeLogout(csrfToken);
      setAccount(null);
      setCsrfToken("");
      clearLiveKnowledgeClientState();
      setView("login");
      setNotice("已退出知识库账号");
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const regenerateRecoveryCode = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api.knowledgeRegenerateRecoveryCode(csrfToken);
      if (response.account) setAccount(response.account);
      setRecoveryCode(response.recoveryCode);
      setRecoveryAcknowledged(false);
      setCopied(false);
      setView("recovery");
    } catch (nextError: unknown) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  };

  const backToHome = () => {
    if (view === "recovery" && !recoveryAcknowledged) return;
    window.location.assign("/chat");
  };

  const switchView = (nextView: KnowledgeView) => {
    setError("");
    setNotice("");
    setView(nextView);
  };

  const authContent = (
    <section className="knowledge-cloud-main">
      <div className="knowledge-cloud-intro">
        <span className="knowledge-cloud-kicker">PRIVATE KNOWLEDGE</span>
        <h1>你的知识，<br /><em>只属于你的空间。</em></h1>
        <p>知识库账号与主站访问分开管理。一个账号可以拥有多个知识库，并在不同设备继续使用。</p>
        <div className="knowledge-cloud-points" aria-label="知识库账号规则">
          <span><Check size={14} />不提供分享与协作</span>
          <span><Check size={14} />恢复码只显示一次</span>
          <span><Check size={14} />主站 API Key 不会写入知识库</span>
        </div>
      </div>

      <section className="knowledge-cloud-panel" aria-live="polite">
        {view === "loading" ? (
          <div className="knowledge-cloud-state"><RefreshCw className="knowledge-cloud-spin" size={22} /><strong>正在检查知识库状态</strong></div>
        ) : null}

        {view === "unavailable" ? (
          <div className="knowledge-cloud-state knowledge-cloud-state-error">
            <span className="knowledge-cloud-state-icon"><KeyRound size={20} /></span>
            <strong>知识库暂时不可用</strong>
            <p>{error || "请稍后重试，或联系开发者检查云知识库配置。"}</p>
            <button type="button" className="knowledge-cloud-primary" onClick={() => window.location.reload()}><RefreshCw size={16} />重新检查</button>
          </div>
        ) : null}

        {view === "recovery" ? (
          <div className="knowledge-cloud-recovery">
            <div className="knowledge-cloud-panel-heading"><span className="knowledge-cloud-icon"><KeyRound size={19} /></span><div><span>ONE-TIME RECOVERY</span><h2>请立即保存恢复码</h2></div></div>
            <p className="knowledge-cloud-warning">这是找回知识库账号的唯一凭据。关闭此页面后，系统不会再次显示原恢复码。</p>
            <code ref={recoveryCodeElement} className="knowledge-cloud-recovery-code">{recoveryCode}</code>
            <div className="knowledge-cloud-recovery-actions">
              <button type="button" className="knowledge-cloud-secondary" onClick={() => void copyRecoveryCode()}><Copy size={16} />{copied ? "已复制" : "复制恢复码"}</button>
              <button type="button" className="knowledge-cloud-secondary" onClick={downloadRecoveryCode}><Download size={16} />下载文本</button>
            </div>
            <label className="knowledge-cloud-check"><input type="checkbox" checked={recoveryAcknowledged} onChange={(event) => setRecoveryAcknowledged(event.target.checked)} /><span>我已将恢复码保存在安全位置</span></label>
            <button type="button" className="knowledge-cloud-primary" disabled={!recoveryAcknowledged} onClick={finishRecoveryConfirmation}>进入知识空间<ArrowLeft size={16} className="knowledge-cloud-forward" /></button>
            {error ? <p className="knowledge-cloud-error" role="alert">{error}</p> : null}
            {notice ? <p className="knowledge-cloud-notice">{notice}</p> : null}
          </div>
        ) : null}

        {view === "login" || view === "register" || view === "recover" || view === "admin-reset" ? (
          <>
            <div className="knowledge-cloud-panel-heading"><span className="knowledge-cloud-icon"><KeyRound size={19} /></span><div><span>{view === "login" ? "KNOWLEDGE LOGIN" : view === "register" ? "CREATE ACCOUNT" : view === "admin-reset" ? "ADMIN RESET" : "ACCOUNT RECOVERY"}</span><h2>{view === "login" ? "登录知识库" : view === "register" ? "创建知识账号" : view === "admin-reset" ? "使用管理员重置码" : "使用恢复码找回"}</h2></div></div>
            {view !== "recover" && view !== "admin-reset" ? (
              <div className="knowledge-cloud-tabs" role="tablist" aria-label="知识库账号操作">
                <button type="button" role="tab" aria-selected={view === "login"} className={view === "login" ? "active" : ""} onClick={() => switchView("login")}>登录</button>
                {config?.registrationMode !== "disabled" ? <button type="button" role="tab" aria-selected={view === "register"} className={view === "register" ? "active" : ""} onClick={() => switchView("register")}>注册</button> : null}
              </div>
            ) : null}
            <form className="knowledge-cloud-form" onSubmit={(event) => void submit(event)}>
              <label><span>知识库账号</span><input autoComplete="username" value={form.username} onChange={(event) => updateForm({ username: event.target.value })} placeholder="输入账号名" required /></label>
              {view === "recover" || view === "admin-reset" ? <label><span>{view === "admin-reset" ? "管理员重置码" : "恢复码"}</span><input autoComplete="one-time-code" value={form.recoveryCode} onChange={(event) => updateForm({ recoveryCode: event.target.value })} placeholder={view === "admin-reset" ? "XI-KB-RESET-..." : "XI-KB-..."} required /></label> : null}
              {view !== "recover" && view !== "admin-reset" ? <label><span>密码 <small>{passwordHint}</small></span><input type="password" autoComplete={view === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => updateForm({ password: event.target.value })} placeholder="输入知识库密码" required /></label> : null}
              {view === "recover" || view === "admin-reset" ? <label><span>新密码 <small>{passwordHint}</small></span><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => updateForm({ newPassword: event.target.value })} placeholder="设置新密码" required /></label> : null}
              {view === "register" && config?.registrationMode === "invite_only" ? <label><span>邀请码</span><input value={form.inviteCode} onChange={(event) => updateForm({ inviteCode: event.target.value })} placeholder="输入开发者提供的邀请码" required /></label> : null}
              <button type="submit" className="knowledge-cloud-primary" disabled={busy}>{busy ? <RefreshCw className="knowledge-cloud-spin" size={16} /> : <KeyRound size={16} />}{busy ? "处理中" : view === "login" ? "登录并继续" : view === "register" ? "创建账号" : view === "admin-reset" ? "验证管理员重置码" : "验证恢复码"}</button>
            </form>
            {view === "login" || view === "register" ? <button type="button" className="knowledge-cloud-text-button" onClick={() => switchView("recover")}>忘记密码？使用恢复码</button> : null}
            {view === "recover" ? <><button type="button" className="knowledge-cloud-text-button" onClick={() => switchView("admin-reset")}>恢复码也已丢失？使用管理员重置码</button><button type="button" className="knowledge-cloud-text-button" onClick={() => switchView("login")}>返回账号登录</button></> : null}
            {view === "admin-reset" ? <><button type="button" className="knowledge-cloud-text-button" onClick={() => switchView("recover")}>改用个人恢复码</button><button type="button" className="knowledge-cloud-text-button" onClick={() => switchView("login")}>返回账号登录</button></> : null}
            <div className="knowledge-cloud-meta"><span>当前状态</span><strong>{registrationLabel(config?.registrationMode || "disabled")}</strong></div>
            {error ? <p className="knowledge-cloud-error" role="alert">{error}</p> : null}
            {notice ? <p className="knowledge-cloud-notice" role="status">{notice}</p> : null}
          </>
        ) : null}
      </section>
    </section>
  );

  return (
    <main className="knowledge-cloud-portal">
      <header className="knowledge-cloud-header">
        <button type="button" className="knowledge-cloud-back" onClick={backToHome} disabled={view === "recovery" && !recoveryAcknowledged}><ArrowLeft size={16} /><span>返回工作台</span></button>
        <div className="knowledge-cloud-brand" aria-label="xi-ai-web 知识库"><span className="knowledge-cloud-mark" aria-hidden="true"><ShieldCheck size={17} /></span><span><strong>xi-ai-web</strong><small>KNOWLEDGE SPACE</small></span></div>
        <span className="knowledge-cloud-status"><i />独立知识账号</span>
      </header>
      {view === "account" && account ? (
        <KnowledgeCloudWorkspace
          account={account}
          csrfToken={csrfToken}
          onAccountChange={setAccount}
          onLogout={logout}
          onRotateRecoveryCode={regenerateRecoveryCode}
        />
      ) : authContent}
    </main>
  );
}

export default KnowledgeCloudPortal;
