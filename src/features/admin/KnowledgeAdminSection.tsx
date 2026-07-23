import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Clipboard,
  Database,
  FileClock,
  HardDrive,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Trash2,
  Users,
  XCircle
} from "lucide-react";
import { api } from "../../api";
import type {
  KnowledgeAdminAccount,
  KnowledgeAdminAuditEntry,
  KnowledgeAdminEffectiveLimits,
  KnowledgeAdminInvite,
  KnowledgeAdminJob,
  KnowledgeAdminLimits,
  KnowledgeAdminMaintenanceResult,
  KnowledgeAdminOverview,
  KnowledgeAdminReadiness,
  KnowledgeAdminReconcileResult,
  KnowledgeAdminSettings,
  KnowledgeRegistrationMode
} from "../../types";

export type KnowledgeAdminSectionId =
  | "knowledge-overview"
  | "knowledge-accounts"
  | "knowledge-registration"
  | "knowledge-limits"
  | "knowledge-jobs"
  | "knowledge-audit";

export type KnowledgeAdminConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
};

type Props = {
  section: KnowledgeAdminSectionId;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  requestConfirmation?: (confirmation: KnowledgeAdminConfirmation) => void;
};

const limitLabels: Array<{ key: keyof KnowledgeAdminLimits; label: string; unit?: string }> = [
  { key: "defaultQuotaBytes", label: "新账号默认总容量", unit: "bytes" },
  { key: "maxKnowledgeBasesPerAccount", label: "每账号知识库数" },
  { key: "maxDocumentsPerAccount", label: "每账号文档数" },
  { key: "maxDocumentsPerKnowledgeBase", label: "每知识库文档数" },
  { key: "maxFileBytes", label: "单文件上限", unit: "bytes" },
  { key: "maxChunksPerAccount", label: "每账号 chunks 数" },
  { key: "maxConcurrentUploadsPerAccount", label: "并发上传数" },
  { key: "maxConcurrentIngestionsPerAccount", label: "并发解析数" },
  { key: "maxConcurrentEmbeddingsPerAccount", label: "并发向量化数" },
  { key: "retrievalRequestsPerMinutePerAccount", label: "每分钟检索请求数" },
  { key: "maxRetrievalTopK", label: "检索最大 Top K" }
];

const overrideLabels: Array<{
  key: keyof KnowledgeAdminEffectiveLimits;
  label: string;
  unit?: string;
}> = [
  { key: "quotaBytes", label: "账号总容量覆盖", unit: "bytes" },
  { key: "maxKnowledgeBasesPerAccount", label: "知识库数覆盖" },
  { key: "maxDocumentsPerAccount", label: "文档数覆盖" },
  { key: "maxDocumentsPerKnowledgeBase", label: "单库文档数覆盖" },
  { key: "maxFileBytes", label: "单文件上限覆盖", unit: "bytes" },
  { key: "maxChunksPerAccount", label: "chunks 数覆盖" },
  { key: "maxConcurrentUploadsPerAccount", label: "并发上传覆盖" },
  { key: "maxConcurrentIngestionsPerAccount", label: "并发解析覆盖" },
  { key: "maxConcurrentEmbeddingsPerAccount", label: "并发向量化覆盖" },
  { key: "retrievalRequestsPerMinutePerAccount", label: "检索频率覆盖" },
  { key: "maxRetrievalTopK", label: "Top K 覆盖" }
];

const statusLabels: Record<KnowledgeAdminAccount["status"], string> = {
  active: "正常",
  frozen: "已冻结",
  deleting: "清理中"
};

const inviteStatusLabels: Record<KnowledgeAdminInvite["status"], string> = {
  active: "有效",
  consumed: "已使用",
  revoked: "已撤销",
  expired: "已过期"
};

const jobStatusLabels: Record<KnowledgeAdminJob["status"], string> = {
  queued: "排队中",
  running: "运行中",
  retry: "等待重试",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消"
};

function formatBytes(value: string | number | null | undefined) {
  try {
    const bytes = BigInt(String(value ?? 0));
    if (bytes === 0n) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0;
    let scaled = Number(bytes);
    while (scaled >= 1024 && index < units.length - 1) {
      scaled /= 1024;
      index += 1;
    }
    return `${scaled.toFixed(index ? 1 : 0)} ${units[index]}`;
  } catch {
    return "-";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "知识库后台请求失败";
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail?: string; icon: typeof Activity }) {
  return (
    <article className="knowledge-admin-metric">
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function ReasonField({ value, onChange, id = "knowledge-admin-reason" }: { value: string; onChange: (value: string) => void; id?: string }) {
  return (
    <label className="knowledge-admin-reason" htmlFor={id}>
      操作原因
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder="例如：内测配额调整" required />
    </label>
  );
}

function PageActions({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <div className="knowledge-admin-page-actions">
      <button type="button" className="secondary-action compact-action" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={15} className={loading ? "admin-loading-spinner" : undefined} />
        {loading ? "加载中" : "刷新"}
      </button>
    </div>
  );
}

function useSectionRequest(section: KnowledgeAdminSectionId, onError: (message: string) => void) {
  const [loading, setLoading] = useState(false);
  const run = async <T,>(request: () => Promise<T>, onSuccess: (value: T) => void) => {
    setLoading(true);
    try {
      onSuccess(await request());
    } catch (error) {
      onError(errorText(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    onError("");
  }, [section, onError]);
  return { loading, run };
}

function OverviewSection({ onError }: { onError: (message: string) => void }) {
  const [overview, setOverview] = useState<KnowledgeAdminOverview | null>(null);
  const { loading, run } = useSectionRequest("knowledge-overview", onError);
  const load = () => void run(api.knowledgeAdminOverview, (value) => setOverview(value));
  useEffect(load, []);

  return (
    <section id="admin-section-knowledge-overview" className="admin-section knowledge-admin-section">
      <div className="section-title"><ServerCog size={17} /><h2>知识库运行概览</h2></div>
      <PageActions loading={loading} onRefresh={load} />
      {overview ? (
        <>
          <div className="knowledge-admin-metrics">
            <Metric label="账号" value={String(overview.accounts.total)} detail={`${overview.accounts.active} 正常 · ${overview.accounts.frozen} 冻结`} icon={Users} />
            <Metric label="知识库" value={String(overview.knowledgeBases)} detail={`${overview.documents} 份文档`} icon={Database} />
            <Metric label="活跃会话" value={String(overview.activeSessions)} detail={`${overview.chunks} 个 chunks`} icon={ShieldCheck} />
            <Metric label="存储使用" value={formatBytes(overview.storage.usedBytes)} detail={`配额 ${formatBytes(overview.storage.quotaBytes)}`} icon={HardDrive} />
            <Metric label="排队任务" value={String(overview.jobs.queued)} detail={`${overview.jobs.running} 运行中`} icon={Activity} />
            <Metric label="失败任务" value={String(overview.jobs.failed)} detail="仅显示任务状态，不展示正文" icon={AlertCircle} />
          </div>
          <div className="knowledge-admin-status-strip">
            <span>注册模式</span><strong>{overview.registrationMode === "open" ? "公开注册" : overview.registrationMode === "invite_only" ? "仅邀请码" : "已关闭"}</strong>
            <span>对象存储</span><strong>{overview.objectStore.state === "configured" ? "已配置（未探测）" : "未探测"}</strong>
          </div>
        </>
      ) : <p className="admin-loading">正在读取知识库运营数据。</p>}
    </section>
  );
}

function AccountsSection({ onNotice, onError, requestConfirmation }: Omit<Props, "section">) {
  const [accounts, setAccounts] = useState<KnowledgeAdminAccount[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [resetCode, setResetCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const { loading, run } = useSectionRequest("knowledge-accounts", onError);
  const selected = accounts.find((account) => account.id === selectedId) || null;

  const load = (requestedCursor: string | null = currentCursor) => void run(
    () => api.knowledgeAdminAccounts({ search: search.trim() || undefined, status: status || undefined, cursor: requestedCursor || undefined, limit: 20 }),
    (page) => {
      setAccounts(page.items);
      setCurrentCursor(requestedCursor);
      setNextCursor(page.nextCursor);
      if (selectedId && !page.items.some((item) => item.id === selectedId)) setSelectedId(null);
    }
  );
  useEffect(() => { load(null); }, []);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const item of overrideLabels) next[item.key] = selected.limitOverrides[item.key] === undefined ? "" : String(selected.limitOverrides[item.key]);
    setOverrideDraft(next);
    setReason("");
    setResetCode(null);
  }, [selectedId]);

  const runConfirmed = (title: string, description: string, confirmLabel: string, action: () => Promise<void>) => {
    if (!reason.trim()) {
      onError("请先填写操作原因");
      return;
    }
    if (requestConfirmation) requestConfirmation({ title, description, confirmLabel, action });
    else void action();
  };

  const updateStatus = (nextStatus: "active" | "frozen") => {
    if (!selected) return;
    runConfirmed(
      nextStatus === "frozen" ? "冻结知识库账号？" : "解冻知识库账号？",
      nextStatus === "frozen" ? "冻结会撤销会话并使现有管理员重置流程失效，不会删除数据。" : "解冻只恢复后续登录和新增操作，不会改变历史数据。",
      nextStatus === "frozen" ? "确认冻结" : "确认解冻",
      async () => {
        await api.updateKnowledgeAdminAccount(selected.id, { expectedVersion: selected.version, status: nextStatus, reason: reason.trim() });
        onNotice(nextStatus === "frozen" ? "账号已冻结" : "账号已解冻");
        load(null);
      }
    );
  };

  const revokeSessions = () => {
    if (!selected) return;
    runConfirmed("撤销此账号的全部会话？", "会让该账号在其他设备重新登录，知识库内容不会被删除。", "撤销会话", async () => {
      const result = await api.revokeKnowledgeAdminSessions(selected.id, reason.trim());
      onNotice(`已撤销 ${result.revokedSessions} 个会话`);
      load(null);
    });
  };

  const issueReset = () => {
    if (!selected) return;
    runConfirmed("签发一次性管理员重置码？", "旧密码和恢复码会失效。重置码只在本次响应中显示，15 分钟后过期。", "签发重置码", async () => {
      const result = await api.issueKnowledgeAdminReset(selected.id, reason.trim());
      setResetCode({ value: result.resetCode, expiresAt: result.expiresAt });
      onNotice("重置码已生成，请立即交给账号本人");
      load(null);
    });
  };

  const deleteAccount = () => {
    if (!selected) return;
    runConfirmed(
      "删除知识库账号？",
      "账号会进入清理状态，全部会话失效，知识库、文档、向量和对象存储资源会由后台任务可靠清理。此操作不能用普通账号恢复。",
      "确认删除账号",
      async () => {
        const result = await api.deleteKnowledgeAdminAccount(selected.id, {
          expectedVersion: selected.version,
          reason: reason.trim()
        });
        onNotice(`账号已进入清理队列：${result.knowledgeBasesMarked} 个知识库，${result.documentsMarked} 份文档`);
        setSelectedId(null);
        load(null);
      }
    );
  };

  const saveOverrides = () => {
    if (!selected) return;
    const limitOverrides: Record<string, number | null> = {};
    for (const item of overrideLabels) {
      const value = overrideDraft[item.key]?.trim() || "";
      limitOverrides[item.key] = value ? Number(value) : null;
    }
    if (Object.values(limitOverrides).some((value) => value !== null && !Number.isSafeInteger(value))) {
      onError("账号覆盖值必须是整数");
      return;
    }
    if (!reason.trim()) { onError("请先填写操作原因"); return; }
    void run(
      () => api.updateKnowledgeAdminAccount(selected.id, { expectedVersion: selected.version, limitOverrides, reason: reason.trim() }),
      () => { onNotice("账号限额覆盖已保存"); load(null); }
    );
  };

  const copyCode = async () => {
    if (!resetCode) return;
    try {
      await navigator.clipboard.writeText(resetCode.value);
      onNotice("重置码已复制");
    } catch {
      onError("浏览器未允许自动复制，请手动选择重置码");
    }
  };

  return (
    <section id="admin-section-knowledge-accounts" className="admin-section knowledge-admin-section">
      <div className="section-title"><Users size={17} /><h2>知识库账号</h2></div>
      <div className="knowledge-admin-filter-row">
        <label>账号搜索<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按账号名前缀搜索" /></label>
        <label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="active">正常</option><option value="frozen">冻结</option><option value="deleting">清理中</option></select></label>
        <button type="button" className="primary-action" onClick={() => load(null)} disabled={loading}><RefreshCw size={15} />查询</button>
      </div>
      <div className="knowledge-admin-table" aria-label="知识库账号列表">
        <div className="knowledge-admin-table-head"><span>账号</span><span>状态</span><span>资源</span><span>容量</span><span>操作</span></div>
        {accounts.map((account) => (
          <button type="button" className={`knowledge-admin-table-row${selectedId === account.id ? " is-selected" : ""}`} key={account.id} onClick={() => setSelectedId(account.id)}>
            <span><strong>{account.username}</strong><small>{account.id.slice(0, 8)} · {formatDate(account.createdAt)}</small></span>
            <span><em className={`knowledge-admin-status is-${account.status}`}>{statusLabels[account.status]}</em></span>
            <span><strong>{account.knowledgeBaseCount} 库</strong><small>{account.documentCount} 文档 · {account.chunkCount} chunks</small></span>
            <span><strong>{formatBytes(account.usedBytes)}</strong><small>/ {formatBytes(account.quotaBytes)}</small></span>
            <span className="knowledge-admin-row-action">管理 <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
      {!accounts.length && !loading ? <p className="admin-loading">没有匹配的知识库账号。</p> : null}
      {currentCursor || nextCursor ? <div className="knowledge-admin-pagination"><button type="button" className="secondary-action compact-action" onClick={() => load(null)} disabled={loading || !currentCursor}>回到第一页</button><button type="button" className="secondary-action compact-action" onClick={() => load(nextCursor)} disabled={loading || !nextCursor}>下一页</button></div> : null}

      {selected ? (
        <div className="knowledge-admin-inspector">
          <div className="knowledge-admin-inspector-heading"><div><span>ACCOUNT CONTROL</span><h3>{selected.username}</h3></div><em className={`knowledge-admin-status is-${selected.status}`}>{statusLabels[selected.status]}</em></div>
          <div className="knowledge-admin-detail-grid">
            <span><small>活跃会话</small><strong>{selected.activeSessionCount}</strong></span>
            <span><small>登录失败</small><strong>{selected.failedLoginCount}</strong></span>
            <span><small>已用容量</small><strong>{formatBytes(selected.usedBytes)}</strong></span>
            <span><small>超限项</small><strong>{selected.overLimit.length ? selected.overLimit.length : "无"}</strong></span>
          </div>
          <div className="knowledge-admin-control-actions">
            <button type="button" className={selected.status === "frozen" ? "primary-action" : "secondary-action danger-action"} onClick={() => updateStatus(selected.status === "frozen" ? "active" : "frozen")} disabled={selected.status === "deleting"}><Lock size={15} />{selected.status === "frozen" ? "解冻账号" : "冻结账号"}</button>
            <button type="button" className="secondary-action" onClick={revokeSessions} disabled={selected.status === "deleting"}><RotateCcw size={15} />撤销全部会话</button>
            <button type="button" className="secondary-action" onClick={issueReset} disabled={selected.status === "deleting"}><KeyRound size={15} />签发管理员重置码</button>
            <button type="button" className="danger-action" onClick={deleteAccount} disabled={selected.status === "deleting"}><Trash2 size={15} />删除账号</button>
          </div>
          {resetCode ? <div className="knowledge-admin-one-time" role="status"><div><strong>一次性重置码</strong><span>仅显示在当前页面状态，{formatDate(resetCode.expiresAt)} 过期</span></div><code>{resetCode.value}</code><button type="button" className="secondary-action compact-action" onClick={() => void copyCode()}><Clipboard size={15} />复制</button></div> : null}
          <div className="knowledge-admin-overrides">
            <div className="knowledge-admin-subheading"><div><h3>账号限额覆盖</h3><span>留空表示继承全局设置。降低限额不会删除现有内容。</span></div><Save size={16} /></div>
            <div className="knowledge-admin-limit-grid">
              {overrideLabels.map((item) => <label key={item.key}>{item.label}{item.unit === "bytes" ? <small>字节</small> : null}<input type="number" min={0} value={overrideDraft[item.key] || ""} placeholder="继承全局" onChange={(event) => setOverrideDraft((current) => ({ ...current, [item.key]: event.target.value }))} /></label>)}
            </div>
            <ReasonField value={reason} onChange={setReason} id="knowledge-account-reason" />
            <button type="button" className="primary-action" onClick={saveOverrides} disabled={loading}><Save size={15} />保存账号覆盖</button>
          </div>
        </div>
      ) : <p className="admin-mini-copy">选择一个账号查看运营字段和管理操作。后台不会读取密码、恢复码、API Key 或文档正文。</p>}
    </section>
  );
}

function RegistrationSection({ onNotice, onError }: Omit<Props, "section">) {
  const [settings, setSettings] = useState<KnowledgeAdminSettings | null>(null);
  const [invites, setInvites] = useState<KnowledgeAdminInvite[]>([]);
  const [mode, setMode] = useState<KnowledgeRegistrationMode>("invite_only");
  const [hours, setHours] = useState("168");
  const [reason, setReason] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const { loading, run } = useSectionRequest("knowledge-registration", onError);
  const load = () => void run(
    () => Promise.all([api.knowledgeAdminSettings(), api.knowledgeAdminInvites({ limit: 20 })]),
    ([nextSettings, page]) => { setSettings(nextSettings); setMode(nextSettings.registrationMode); setInvites(page.items); }
  );
  useEffect(load, []);

  const saveMode = () => {
    if (!settings || !reason.trim()) { onError("请填写注册模式变更原因"); return; }
    void run(
      () => api.updateKnowledgeAdminSettings({ expectedVersion: settings.version, registrationMode: mode, limits: settings.limits, reason: reason.trim() }),
      (next) => { setSettings(next); onNotice("注册模式已保存"); setReason(""); }
    );
  };

  const createInvite = () => {
    if (!reason.trim()) { onError("请填写邀请码创建原因"); return; }
    void run(
      () => api.createKnowledgeAdminInvite({ expiresInHours: Math.max(1, Number(hours) || 168), reason: reason.trim() }),
      (result) => { setInviteCode(result.inviteCode); onNotice("邀请码已生成，只显示一次"); setReason(""); load(); }
    );
  };

  const revokeInvite = (invite: KnowledgeAdminInvite) => {
    if (!reason.trim()) { onError("请填写邀请码撤销原因"); return; }
    void run(() => api.revokeKnowledgeAdminInvite(invite.id, reason.trim()), () => { onNotice("邀请码已撤销"); setReason(""); load(); });
  };

  return (
    <section id="admin-section-knowledge-registration" className="admin-section knowledge-admin-section">
      <div className="section-title"><KeyRound size={17} /><h2>注册与邀请码</h2></div>
      <div className="knowledge-admin-settings-block">
        <div className="knowledge-admin-subheading"><div><h3>账号注册模式</h3><span>只投影注册状态；不会返回数据库或 COS 配置。</span></div><ShieldCheck size={16} /></div>
        <div className="knowledge-admin-mode-grid" role="radiogroup" aria-label="知识库注册模式">
          {([["disabled", "关闭注册", "仅已有账号可以登录"], ["invite_only", "仅邀请码", "默认的受控注册方式"], ["open", "公开注册", "仍受服务端限速保护"]] as const).map(([value, label, detail]) => <label key={value} className={mode === value ? "is-selected" : ""}><input type="radio" name="knowledge-registration-mode" value={value} checked={mode === value} onChange={() => setMode(value)} /><strong>{label}</strong><span>{detail}</span></label>)}
        </div>
        <ReasonField value={reason} onChange={setReason} id="knowledge-registration-reason" />
        <button type="button" className="primary-action" onClick={saveMode} disabled={loading || !settings}><Save size={15} />保存注册模式</button>
      </div>
      <div className="knowledge-admin-settings-block">
        <div className="knowledge-admin-subheading"><div><h3>创建邀请码</h3><span>明文只在创建响应中显示，数据库仅保存哈希。</span></div><PlusIcon /></div>
        <div className="knowledge-admin-inline-form"><label>有效期（小时）<input type="number" min={1} max={8760} value={hours} onChange={(event) => setHours(event.target.value)} /></label><button type="button" className="primary-action" onClick={createInvite} disabled={loading}><KeyRound size={15} />生成邀请码</button></div>
        {inviteCode ? <div className="knowledge-admin-one-time invite" role="status"><div><strong>本次邀请码</strong><span>离开此页面后不会再次从列表读取明文</span></div><code>{inviteCode}</code><button type="button" className="secondary-action compact-action" onClick={() => { void navigator.clipboard?.writeText(inviteCode); onNotice("邀请码已复制"); }}><Clipboard size={15} />复制</button></div> : null}
      </div>
      <div className="knowledge-admin-list-block"><div className="knowledge-admin-subheading"><div><h3>邀请码状态</h3><span>已消费、撤销和过期的邀请码只保留运营元数据。</span></div><PageActions loading={loading} onRefresh={load} /></div><div className="knowledge-admin-invite-list">{invites.map((invite) => <article key={invite.id}><span><strong>{inviteStatusLabels[invite.status]}</strong><small>{invite.id.slice(0, 8)} · 到期 {formatDate(invite.expiresAt)}</small></span><span>{invite.consumedByAccountId ? `账号 ${invite.consumedByAccountId.slice(0, 8)}` : "未消费"}</span>{invite.status === "active" ? <button type="button" className="secondary-action danger-action compact-action" onClick={() => revokeInvite(invite)} disabled={loading}><XCircle size={14} />撤销</button> : <span />}</article>)}</div></div>
    </section>
  );
}

function PlusIcon() { return <span className="knowledge-admin-section-icon" aria-hidden="true">+</span>; }

function LimitsSection({ onNotice, onError }: Omit<Props, "section">) {
  const [settings, setSettings] = useState<KnowledgeAdminSettings | null>(null);
  const [limits, setLimits] = useState<KnowledgeAdminLimits | null>(null);
  const [reason, setReason] = useState("");
  const { loading, run } = useSectionRequest("knowledge-limits", onError);
  const load = () => void run(api.knowledgeAdminSettings, (next) => { setSettings(next); setLimits(next.limits); });
  useEffect(load, []);
  const save = () => {
    if (!settings || !limits || !reason.trim()) { onError("请填写限额变更原因"); return; }
    void run(() => api.updateKnowledgeAdminSettings({ expectedVersion: settings.version, registrationMode: settings.registrationMode, limits, reason: reason.trim() }), (next) => { setSettings(next); setLimits(next.limits); setReason(""); onNotice("全局运行限额已保存"); });
  };
  return <section id="admin-section-knowledge-limits" className="admin-section knowledge-admin-section"><div className="section-title"><HardDrive size={17} /><h2>运行限额</h2></div><p className="admin-mini-copy">全局默认值只影响新账号和后续新增操作。降低限额不会删除已有数据或停止运行中的任务。</p>{limits ? <div className="knowledge-admin-limit-grid global">{limitLabels.map((item) => <label key={item.key}>{item.label}{item.unit === "bytes" ? <small>字节</small> : null}<input type="number" min={0} value={limits[item.key]} onChange={(event) => setLimits((current) => current ? ({ ...current, [item.key]: Number(event.target.value) }) : current)} /></label>)}</div> : <p className="admin-loading">正在读取运行限额。</p>}<ReasonField value={reason} onChange={setReason} id="knowledge-limits-reason" /><button type="button" className="primary-action" onClick={save} disabled={loading || !limits}><Save size={15} />保存运行限额</button></section>;
}

function JobsSection({ onNotice, onError, requestConfirmation }: Omit<Props, "section">) {
  const [jobs, setJobs] = useState<KnowledgeAdminJob[]>([]);
  const [readiness, setReadiness] = useState<KnowledgeAdminReadiness | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<KnowledgeAdminMaintenanceResult | null>(null);
  const [reconcileResult, setReconcileResult] = useState<KnowledgeAdminReconcileResult | null>(null);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const [operationLimit, setOperationLimit] = useState("50");
  const [reconcileAccountId, setReconcileAccountId] = useState("");
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { loading, run } = useSectionRequest("knowledge-jobs", onError);
  const load = (requestedCursor: string | null = currentCursor) => void run(
    () => Promise.all([
      api.knowledgeAdminJobs({ status: status || undefined, kind: kind || undefined, cursor: requestedCursor || undefined, limit: 30 }),
      api.knowledgeAdminReadiness()
    ]),
    ([page, nextReadiness]) => {
      setJobs(page.items);
      setReadiness(nextReadiness);
      setCurrentCursor(requestedCursor);
      setNextCursor(page.nextCursor);
    }
  );
  useEffect(() => { load(null); }, []);
  const replaceJob = (next: KnowledgeAdminJob) => {
    setJobs((current) => current.map((job) => job.id === next.id ? next : job));
    setReason("");
  };

  const runMaintenance = () => {
    if (!reason.trim()) {
      onError("请先填写操作原因");
      return;
    }
    const action = () => run(
      () => api.runKnowledgeAdminMaintenance({
        limit: Math.max(1, Math.min(500, Number(operationLimit) || 50)),
        reason: reason.trim()
      }),
      (result) => {
        setMaintenanceResult(result);
        setReconcileResult(null);
        onNotice(`已清理 ${result.expiredUploads.cleaned} 个过期上传，释放 ${result.expiredReservations.released} 条预留`);
        load(null);
      }
    );
    if (requestConfirmation) {
      requestConfirmation({
        title: "运行知识库维护？",
        description: "会清理过期上传、过期会话、过期邀请码、过期管理员重置和可最终删除账号，不会直接修改可用文档正文。",
        confirmLabel: "确认运行维护",
        action
      });
    } else {
      void action();
    }
  };

  const queueReconcile = () => {
    if (!reason.trim()) {
      onError("请先填写操作原因");
      return;
    }
    const action = () => run(
      () => api.queueKnowledgeAdminReconcile({
        accountId: reconcileAccountId.trim() || undefined,
        limit: Math.max(1, Math.min(500, Number(operationLimit) || 50)),
        reason: reason.trim()
      }),
      (result) => {
        setReconcileResult(result);
        setMaintenanceResult(null);
        onNotice(`已排队 ${result.queuedJobs} 个对账任务`);
        load(null);
      }
    );
    if (requestConfirmation) {
      requestConfirmation({
        title: "排队知识库对账？",
        description: reconcileAccountId.trim()
          ? "将为指定账号排队重新对账，帮助修复预留、会话和资源计数的偏差。"
          : "将为当前范围内的账号排队重新对账，帮助修复预留、会话和资源计数的偏差。",
        confirmLabel: "确认排队",
        action
      });
    } else {
      void action();
    }
  };

  const retry = (job: KnowledgeAdminJob) => {
    if (!reason.trim()) { onError("请填写任务操作原因"); return; }
    void run(
      () => api.retryKnowledgeAdminJob(job.id, reason.trim()),
      ({ job: next }) => { replaceJob(next); onNotice("任务已重新排队"); }
    );
  };
  const cancel = (job: KnowledgeAdminJob) => {
    if (!reason.trim()) { onError("请填写任务操作原因"); return; }
    const action = () => run(
      () => api.cancelKnowledgeAdminJob(job.id, reason.trim()),
      ({ job: next }) => { replaceJob(next); onNotice("任务已取消"); }
    );
    if (requestConfirmation) {
      requestConfirmation({
        title: "取消任务",
        description: "运行中的解析会在租约检查点停止，已完成的原子写入不会被回滚。",
        confirmLabel: "确认取消",
        action
      });
    } else {
      void action();
    }
  };
  return (
    <section id="admin-section-knowledge-jobs" className="admin-section knowledge-admin-section">
      <div className="section-title"><Activity size={17} /><h2>任务与存储健康</h2></div>
      {readiness ? (
        <>
          <div className="knowledge-admin-status-strip">
            <span>运行状态</span><strong>{readiness.status}</strong>
            <span>数据库</span><strong>{readiness.checks.database}</strong>
            <span>向量扩展</span><strong>{readiness.checks.vectorExtension}</strong>
            <span>对象存储</span><strong>{readiness.checks.objectStore === "configured" ? "已配置" : "未探测"}</strong>
          </div>
          <div className="knowledge-admin-metrics compact">
            <Metric label="队列积压" value={String(readiness.metrics.queue.queued)} detail={`${readiness.metrics.queue.running} 运行 · ${readiness.metrics.queue.failed} 失败`} icon={Activity} />
            <Metric label="过期预留" value={String(readiness.metrics.storage.staleReservationCount)} detail={formatBytes(readiness.metrics.storage.staleReservationBytes)} icon={HardDrive} />
            <Metric label="未完成向量" value={String(readiness.metrics.vectors.incompleteChunks)} detail={`${readiness.metrics.vectors.failedChunks} 失败 chunks`} icon={Database} />
            <Metric label="删除清理" value={String(readiness.metrics.cleanup.deletingAccounts)} detail={`${readiness.metrics.cleanup.deletingKnowledgeBases} 库 · ${readiness.metrics.cleanup.deletingDocuments} 文档`} icon={Trash2} />
          </div>
        </>
      ) : null}
      <div className="knowledge-admin-filter-row">
        <label>任务状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{Object.entries(jobStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>任务类型<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">全部</option><option value="parse">解析</option><option value="cleanup">清理</option><option value="reconcile">对账</option><option value="reindex">重建索引</option></select></label>
        <button type="button" className="primary-action" onClick={() => load(null)} disabled={loading}><RefreshCw size={15} />查询</button>
      </div>
      <ReasonField value={reason} onChange={setReason} id="knowledge-jobs-reason" />
      <div className="knowledge-admin-ops-panel">
        <div className="knowledge-admin-inline-form">
          <label>处理上限<input type="number" min={1} max={500} value={operationLimit} onChange={(event) => setOperationLimit(event.target.value)} /></label>
          <label>指定账号 ID<input value={reconcileAccountId} onChange={(event) => setReconcileAccountId(event.target.value)} placeholder="留空则按上限批量排队" /></label>
        </div>
        <div className="knowledge-admin-control-actions">
          <button type="button" className="secondary-action" onClick={queueReconcile} disabled={loading}><Database size={15} />排队对账</button>
          <button type="button" className="secondary-action" onClick={runMaintenance} disabled={loading}><RefreshCw size={15} />运行维护</button>
        </div>
        {reconcileResult ? <p className="admin-mini-copy">已创建 {reconcileResult.queuedJobs} 个对账任务。</p> : null}
        {maintenanceResult ? (
          <p className="admin-mini-copy">
            维护完成：清理上传 {maintenanceResult.expiredUploads.cleaned}，释放预留 {maintenanceResult.expiredReservations.released}，过期会话 {maintenanceResult.expiredSessions}，最终删除账号 {maintenanceResult.finalizedAccountIds.length}。
          </p>
        ) : null}
      </div>
      <p className="admin-mini-copy"><HardDrive size={14} /> 对象存储健康状态只显示配置/未探测，不在没有探测器时伪装成“健康”。任务错误仅展示受限错误码。</p>
      <div className="knowledge-admin-job-list">
        {jobs.map((job) => (
          <article key={job.id}>
            <span><strong>{jobStatusLabels[job.status]}</strong><small>{job.kind} · {job.id.slice(0, 8)}</small></span>
            <span>{job.progressTotal ? `${job.progressCurrent}/${job.progressTotal}` : "-"}</span>
            <span>{job.errorCode || "无错误"}</span>
            <span>{job.leaseActive ? "租约中" : "无活动租约"}</span>
            <time>{formatDate(job.updatedAt)}</time>
            <span className="knowledge-admin-job-actions">
              {["failed", "cancelled"].includes(job.status) ? <button type="button" className="secondary-action compact-action" onClick={() => retry(job)} disabled={loading}><RotateCcw size={14} />重试</button> : null}
              {["queued", "running", "retry"].includes(job.status) ? <button type="button" className="danger-action compact-action" onClick={() => cancel(job)} disabled={loading}><XCircle size={14} />取消</button> : null}
            </span>
          </article>
        ))}
      </div>
      {!jobs.length && !loading ? <p className="admin-loading">当前没有任务记录。</p> : null}
      {currentCursor || nextCursor ? <div className="knowledge-admin-pagination"><button type="button" className="secondary-action compact-action" onClick={() => load(null)} disabled={loading || !currentCursor}>回到第一页</button><button type="button" className="secondary-action compact-action" onClick={() => load(nextCursor)} disabled={loading || !nextCursor}>下一页</button></div> : null}
    </section>
  );
}

function AuditSection({ onError }: { onError: (message: string) => void }) {
  const [entries, setEntries] = useState<KnowledgeAdminAuditEntry[]>([]);
  const [operation, setOperation] = useState("");
  const [result, setResult] = useState("");
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const { loading, run } = useSectionRequest("knowledge-audit", onError);
  const load = (requestedCursor: string | null = currentCursor) => void run(() => api.knowledgeAdminAudit({ operation: operation.trim() || undefined, result: result || undefined, cursor: requestedCursor || undefined, limit: 50 }), (page) => { setEntries(page.items); setCurrentCursor(requestedCursor); setNextCursor(page.nextCursor); });
  useEffect(() => { load(null); }, []);
  return <section id="admin-section-knowledge-audit" className="admin-section knowledge-admin-section"><div className="section-title"><FileClockIcon /><h2>知识库审计</h2></div><div className="knowledge-admin-filter-row"><label>操作类型<input value={operation} onChange={(event) => setOperation(event.target.value)} placeholder="account.reset.issue" /></label><label>结果<select value={result} onChange={(event) => setResult(event.target.value)}><option value="">全部</option><option value="succeeded">成功</option><option value="failed">失败</option></select></label><button type="button" className="primary-action" onClick={() => load(null)} disabled={loading}><RefreshCw size={15} />查询</button></div><div className="knowledge-admin-audit-list">{entries.map((entry) => <article key={entry.id}><div><strong>{entry.operation}</strong><small>{entry.targetType} · {entry.targetId || "global"} · {formatDate(entry.createdAt)}</small></div><em className={entry.result === "succeeded" ? "is-success" : "is-failed"}>{entry.result === "succeeded" ? "成功" : "失败"}</em><p>{entry.reason}</p><code>{JSON.stringify(entry.metadata)}</code></article>)}</div>{!entries.length && !loading ? <p className="admin-loading">暂无知识库审计记录。</p> : null}{currentCursor || nextCursor ? <div className="knowledge-admin-pagination"><button type="button" className="secondary-action compact-action" onClick={() => load(null)} disabled={loading || !currentCursor}>回到第一页</button><button type="button" className="secondary-action compact-action" onClick={() => load(nextCursor)} disabled={loading || !nextCursor}>下一页</button></div> : null}</section>;
}

function FileClockIcon() { return <FileClock size={17} />; }

export function KnowledgeAdminSection({ section, onNotice, onError, requestConfirmation }: Props) {
  if (section === "knowledge-overview") return <OverviewSection onError={onError} />;
  if (section === "knowledge-accounts") return <AccountsSection onNotice={onNotice} onError={onError} requestConfirmation={requestConfirmation} />;
  if (section === "knowledge-registration") return <RegistrationSection onNotice={onNotice} onError={onError} />;
  if (section === "knowledge-limits") return <LimitsSection onNotice={onNotice} onError={onError} />;
  if (section === "knowledge-jobs") return <JobsSection onNotice={onNotice} onError={onError} requestConfirmation={requestConfirmation} />;
  return <AuditSection onError={onError} />;
}

export default KnowledgeAdminSection;
