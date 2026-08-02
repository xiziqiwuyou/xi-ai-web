import type { RefObject } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Layers3,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Upload
} from "lucide-react";
import type { AdminBackupItem, AdminOpsPayload } from "../../types";
import { formatBytes, formatUptime } from "./adminConsoleConfig";

type AdminOverviewSectionProps = {
  importInputRef: RefObject<HTMLInputElement | null>;
  opsSummary: AdminOpsPayload | null;
  backups: AdminBackupItem[];
  opsLoading: boolean;
  onExportMetadata: () => void | Promise<void>;
  onImportFile: (file: File) => void | Promise<void>;
  onReload: () => void | Promise<void>;
  onRestoreBackup: (backup: AdminBackupItem) => void;
};

function formatInvocationDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

function formatInvocationTime(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function AdminOverviewSection({
  importInputRef,
  opsSummary,
  backups,
  opsLoading,
  onExportMetadata,
  onImportFile,
  onReload,
  onRestoreBackup
}: AdminOverviewSectionProps) {
  return (
    <section id="admin-section-overview" className="admin-section admin-ops-panel">
      <div className="section-title">
        <ServerCog size={17} />
        <h2>运营工具</h2>
      </div>
      <input
        ref={importInputRef}
        type="file"
        hidden
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void onImportFile(file);
          event.currentTarget.value = "";
        }}
      />
      <div className="admin-ops-toolbar">
        <div className="admin-form-actions">
          <button type="button" className="secondary-action" onClick={onExportMetadata}>
            <Download size={16} />
            导出元数据
          </button>
          <button type="button" className="secondary-action" onClick={() => importInputRef.current?.click()}>
            <Upload size={16} />
            导入元数据
          </button>
        </div>
        <button type="button" className="secondary-action compact-action" onClick={() => void onReload()} disabled={opsLoading}>
          <RefreshCw size={16} />
          {opsLoading ? "刷新中" : "刷新运营状态"}
        </button>
      </div>
      <p className="admin-mini-copy">导入会先预检，确认后自动创建 `data/backups` 备份并写入审计记录。</p>
      {opsSummary ? (
        <>
          <div className="admin-ops-grid">
            <article>
              <Activity size={16} />
              <strong>{opsSummary.runtime.mode}</strong>
              <span>运行模式 · {formatUptime(opsSummary.runtime.uptimeSeconds)}</span>
              <span>元数据 · {opsSummary.runtime.metadataFile}</span>
            </article>
            <article>
              <Layers3 size={16} />
              <strong>{opsSummary.counts.enabledModels}/{opsSummary.counts.modelCatalog}</strong>
              <span>启用模型 / 模型总数</span>
            </article>
            <article>
              <ShieldCheck size={16} />
              <strong>{opsSummary.checklist.filter((item) => item.ok).length}/{opsSummary.checklist.length}</strong>
              <span>上线清单通过项</span>
            </article>
            <article>
              <FileText size={16} />
              <strong>{opsSummary.counts.backups}</strong>
              <span>数据备份 · 审计 {opsSummary.counts.auditRecords}</span>
            </article>
          </div>
          <section className="admin-model-usage" aria-labelledby="admin-model-usage-title">
            <div className="admin-model-usage-heading">
              <div>
                <Activity size={16} />
                <h3 id="admin-model-usage-title">模型调用统计</h3>
              </div>
              <span>按最近 5,000 条真实调用记录聚合</span>
            </div>
            {opsSummary.modelInvocations?.length ? (
              <div className="admin-model-usage-table" role="table" aria-label="模型调用统计">
                <div className="admin-model-usage-header" role="row">
                  <span role="columnheader">模型</span>
                  <span role="columnheader">次数</span>
                  <span role="columnheader">最近调用</span>
                  <span role="columnheader">平均耗时</span>
                  <span role="columnheader">累计耗时</span>
                </div>
                {opsSummary.modelInvocations.map((item) => (
                  <div className="admin-model-usage-row" role="row" key={item.modelId}>
                    <div className="admin-model-usage-model" role="cell">
                      <strong>{item.displayName}</strong>
                      <span>{item.vendor} · {item.requestModel}</span>
                    </div>
                    <div role="cell">
                      <span className="admin-model-usage-label">次数</span>
                      <strong>{item.calls.toLocaleString("zh-CN")}</strong>
                      <small>成功 {item.successCalls} · 失败 {item.errorCalls + item.cancelledCalls}</small>
                    </div>
                    <div role="cell">
                      <span className="admin-model-usage-label">最近调用</span>
                      <time dateTime={item.lastCalledAt}>{formatInvocationTime(item.lastCalledAt)}</time>
                    </div>
                    <div role="cell">
                      <span className="admin-model-usage-label">平均耗时</span>
                      <strong>{formatInvocationDuration(item.averageDurationMs)}</strong>
                    </div>
                    <div role="cell">
                      <span className="admin-model-usage-label">累计耗时</span>
                      <strong>{formatInvocationDuration(item.totalDurationMs)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-model-usage-empty">
                暂无模型调用记录。完成一次对话或生成任务后，这里会显示实际统计。
              </div>
            )}
          </section>
          <div className="admin-checklist">
            {opsSummary.checklist.map((item) => (
              <p key={item.id} className={item.ok ? "ok" : "warn"}>
                {item.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </p>
            ))}
          </div>
          {opsSummary.modelCoverage.some((item) => !item.covered) ? (
            <div className="admin-validation">
              <AlertCircle size={16} />
              <div>
                <strong>模型能力缺口</strong>
                {opsSummary.modelCoverage
                  .filter((item) => !item.covered)
                  .map((item) => (
                    <span key={item.moduleId}>
                      {item.label}: 缺少 {item.missing.join(", ")}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="admin-backup-list">
        {(backups.length ? backups : opsSummary?.backups || []).slice(0, 8).map((backup) => (
          <article key={backup.name}>
            <div>
              <strong>{backup.name}</strong>
              <span>
                {formatBytes(backup.size)} · {new Date(backup.modifiedAt).toLocaleString("zh-CN")}
              </span>
            </div>
            <button type="button" className="secondary-action compact-action" onClick={() => onRestoreBackup(backup)}>
              <RotateCcw size={15} />
              恢复
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
