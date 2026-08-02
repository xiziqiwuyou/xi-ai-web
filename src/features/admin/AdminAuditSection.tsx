import { Download, FileText } from "lucide-react";
import type { AdminAuditEntry } from "../../types";

type AdminAuditSectionProps = {
  auditLog: AdminAuditEntry[];
  actionFilter: string;
  limit: number;
  onActionFilterChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onLoad: () => void | Promise<void>;
  onExport: () => void;
};

export function AdminAuditSection({
  auditLog,
  actionFilter,
  limit,
  onActionFilterChange,
  onLimitChange,
  onLoad,
  onExport
}: AdminAuditSectionProps) {
  return (
    <section id="admin-section-audit" className="admin-section">
      <div className="section-title">
        <FileText size={17} />
        <h2>审计记录</h2>
      </div>
      <div className="admin-filter-row">
        <label>
          操作类型
          <input
            value={actionFilter}
            placeholder="model-update"
            onChange={(event) => onActionFilterChange(event.target.value)}
          />
        </label>
        <label>
          记录数量
          <input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value) || 80)}
          />
        </label>
        <button type="button" className="secondary-action compact-action" onClick={() => void onLoad()}>
          查询
        </button>
        <button type="button" className="secondary-action compact-action" onClick={onExport} disabled={!auditLog.length}>
          <Download size={15} />
          导出
        </button>
      </div>
      {auditLog.length ? (
        <div className="admin-audit-list">
          {auditLog.slice(0, 12).map((item) => (
            <p key={item.id}>
              <strong>{item.action}</strong>
              <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              <code>{JSON.stringify(item.details).slice(0, 120)}</code>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
