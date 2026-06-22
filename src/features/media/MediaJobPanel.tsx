import { RefreshCw, Timer, Trash2, Video } from "lucide-react";
import type { MediaJob } from "../../types";

type MediaJobPanelProps = {
  jobs: MediaJob[];
  busyId?: string;
  onRefresh: (job: MediaJob) => void;
  onSelect: (job: MediaJob) => void;
  onRemove?: (job: MediaJob) => void;
  onToggleAutoPoll?: (job: MediaJob) => void;
};

function statusLabel(status: MediaJob["status"]) {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "processing") return "处理中";
  return "已提交";
}

function MediaJobPanel({ jobs, busyId, onRefresh, onSelect, onRemove, onToggleAutoPoll }: MediaJobPanelProps) {
  if (!jobs.length) return null;

  return (
    <section className="media-job-panel">
      <header>
        <div>
          <strong>视频任务</strong>
          <span>{jobs.length} 条本地记录</span>
        </div>
      </header>
      <div className="media-job-list">
        {jobs.map((job) => (
          <article key={job.id} className={`media-job-card ${job.status}`}>
            <button type="button" className="media-job-main" onClick={() => onSelect(job)}>
              <Video size={16} />
              <span>
                <strong>{job.prompt || "视频任务"}</strong>
                <small>{statusLabel(job.status)} · {new Date(job.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small>
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={!job.providerJobId || busyId === job.id}
              onClick={() => onRefresh(job)}
              title={job.providerJobId ? "刷新状态" : "供应商未返回任务 ID"}
              aria-label={job.providerJobId ? "刷新状态" : "供应商未返回任务 ID"}
            >
              <RefreshCw size={15} className={busyId === job.id ? "spin" : ""} />
            </button>
            {onToggleAutoPoll ? (
              <button
                type="button"
                className={job.autoPoll ? "icon-button active-soft" : "icon-button"}
                onClick={() => onToggleAutoPoll(job)}
                title={job.autoPoll ? "关闭自动刷新" : "自动刷新"}
                aria-label={job.autoPoll ? "关闭自动刷新" : "自动刷新"}
              >
                <Timer size={15} />
              </button>
            ) : null}
            {onRemove ? (
              <button type="button" className="icon-button danger" onClick={() => onRemove(job)} title="删除本地任务" aria-label="删除本地任务">
                <Trash2 size={15} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default MediaJobPanel;
