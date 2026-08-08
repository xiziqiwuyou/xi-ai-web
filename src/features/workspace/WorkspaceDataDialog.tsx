import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  DatabaseBackup,
  Download,
  FileJson,
  HardDrive,
  RefreshCw,
  Upload,
  X
} from "lucide-react";
import { ConfirmationDialog, Dialog } from "../../components/ui";
import type { WorkspaceDataCounts, WorkspaceExportEnvelope } from "../../types";
import { previewWorkspaceImport } from "./workspaceArchive";
import {
  exportWorkspaceArchive,
  getWorkspaceStorageSummary,
  restoreWorkspaceArchive,
  type WorkspaceStorageSummary
} from "./workspaceRepository";

type WorkspaceDataDialogProps = {
  open: boolean;
  initialError?: string;
  onClose: () => void;
};

type BusyAction = "summary" | "export" | "preview" | "restore" | null;
type RestoreMode = "merge" | "replace";

const countItems: ReadonlyArray<{
  key: keyof WorkspaceDataCounts;
  label: string;
}> = [
  { key: "conversations", label: "对话" },
  { key: "galleryItems", label: "画廊" },
  { key: "artifacts", label: "作品" },
  { key: "knowledgeDocuments", label: "知识文档" },
  { key: "mediaJobs", label: "媒体任务" },
  { key: "userAgents", label: "智能体" },
  { key: "agentSkills", label: "Skills" },
  { key: "workflows", label: "工作流" },
  { key: "agentMemories", label: "记忆" },
  { key: "preferences", label: "偏好" }
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatBytes(value?: number) {
  if (!Number.isFinite(value)) return "未知";
  const bytes = Math.max(0, Number(value));
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
}

function CountsGrid({ counts }: { counts: WorkspaceDataCounts }) {
  return (
    <dl className="workspace-data-counts">
      {countItems.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{counts[item.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function WorkspaceDataDialog({
  open,
  initialError = "",
  onClose
}: WorkspaceDataDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<WorkspaceStorageSummary | null>(null);
  const [preview, setPreview] = useState<WorkspaceExportEnvelope | null>(null);
  const [fileName, setFileName] = useState("");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState("");

  const refreshSummary = async () => {
    setBusy("summary");
    try {
      setSummary(await getWorkspaceStorageSummary());
    } catch (nextError) {
      setError(errorMessage(nextError, "无法读取工作区存储状态。"));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(initialError);
    void refreshSummary();
  }, [initialError, open]);

  const exportArchive = async () => {
    setBusy("export");
    setError("");
    try {
      const { blob, filename } = await exportWorkspaceArchive();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (nextError) {
      setError(errorMessage(nextError, "工作区导出失败。"));
    } finally {
      setBusy(null);
    }
  };

  const selectImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setError("");
    setFileName(file?.name || "");
    if (!file) return;
    setBusy("preview");
    try {
      setPreview(await previewWorkspaceImport(file));
    } catch (nextError) {
      setError(errorMessage(nextError, "工作区文件预览失败。"));
    } finally {
      setBusy(null);
    }
  };

  const restoreArchive = async () => {
    if (!preview) return;
    setBusy("restore");
    setError("");
    try {
      await restoreWorkspaceArchive(preview, restoreMode);
      window.location.reload();
    } catch (nextError) {
      setReplaceConfirmationOpen(false);
      setError(errorMessage(nextError, "工作区恢复失败，现有数据未更改。"));
      setBusy(null);
    }
  };

  const requestRestore = () => {
    if (!preview) return;
    if (restoreMode === "replace") {
      setReplaceConfirmationOpen(true);
      return;
    }
    void restoreArchive();
  };

  const closeDialog = () => {
    if (busy || replaceConfirmationOpen) return;
    setPreview(null);
    setFileName("");
    setRestoreMode("merge");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const storageError = summary && !summary.available ? summary.error : "";
  const operationBusy = busy !== null;

  return (
    <>
      <Dialog
        open={open && !replaceConfirmationOpen}
        labelledBy={titleId}
        describedBy={descriptionId}
        onClose={closeDialog}
        canClose={!operationBusy && !replaceConfirmationOpen}
        initialFocusRef={closeButtonRef}
        className="workspace-data-dialog"
      >
        <header className="workspace-data-header">
          <span className="workspace-data-mark" aria-hidden="true">
            <DatabaseBackup size={19} />
          </span>
          <div>
            <small>LOCAL WORKSPACE</small>
            <h2 id={titleId}>工作区数据</h2>
            <p id={descriptionId}>查看当前浏览器中的私有数据，并导出或恢复完整工作区。</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="ui-icon-button workspace-data-close"
            onClick={closeDialog}
            disabled={operationBusy}
            aria-label="关闭工作区数据"
          >
            <X size={17} />
          </button>
        </header>

        <div className="workspace-data-body">
          <section className="workspace-data-section workspace-data-summary" aria-labelledby={`${titleId}-summary`}>
            <div className="workspace-data-section-heading">
              <div>
                <h3 id={`${titleId}-summary`}>本地存储概况</h3>
                <p>{summary?.database || "xi-ai-web-workspace"}</p>
              </div>
              <button
                type="button"
                className="ui-icon-button"
                onClick={() => void refreshSummary()}
                disabled={operationBusy}
                aria-label="刷新工作区概况"
                title="刷新工作区概况"
              >
                <RefreshCw size={15} className={busy === "summary" ? "workspace-data-spin" : ""} />
              </button>
            </div>

            {summary ? <CountsGrid counts={summary.counts} /> : <p className="workspace-data-loading">正在读取工作区…</p>}

            <div className="workspace-storage-meta">
              <span>
                <HardDrive size={14} />
                {summary?.available ? "IndexedDB 可用" : "IndexedDB 不可用"}
              </span>
              <span>已用 {formatBytes(summary?.usage)} / {formatBytes(summary?.quota)}</span>
              <span>{summary?.persisted === true ? "已获持久存储" : "浏览器管理存储保留"}</span>
            </div>
          </section>

          <section className="workspace-data-section" aria-labelledby={`${titleId}-export`}>
            <div className="workspace-data-section-heading">
              <div>
                <h3 id={`${titleId}-export`}>导出备份</h3>
                <p>生成带版本、计数和 SHA-256 完整性校验的 JSON 文件。</p>
              </div>
              <FileJson size={18} aria-hidden="true" />
            </div>
            <button
              type="button"
              className="ui-button workspace-data-primary"
              onClick={() => void exportArchive()}
              disabled={operationBusy || summary?.available === false}
            >
              <Download size={15} />
              {busy === "export" ? "正在导出…" : "导出工作区"}
            </button>
          </section>

          <section className="workspace-data-section" aria-labelledby={`${titleId}-import`}>
            <div className="workspace-data-section-heading">
              <div>
                <h3 id={`${titleId}-import`}>导入与恢复</h3>
                <p>文件会先完成结构、版本、计数和完整性校验，不会立即写入。</p>
              </div>
              <Upload size={18} aria-hidden="true" />
            </div>

            <input
              ref={fileInputRef}
              className="workspace-data-file-input"
              type="file"
              accept=".json,.xiworkspace.json,application/json"
              aria-label="选择工作区文件"
              onChange={(event) => void selectImportFile(event)}
              disabled={operationBusy}
            />
            <button
              type="button"
              className="ui-button workspace-data-file-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={operationBusy}
            >
              <Upload size={15} />
              {busy === "preview" ? "正在校验…" : "选择工作区文件"}
            </button>
            <span className="workspace-data-file-name" title={fileName}>{fileName || "尚未选择文件"}</span>

            {preview ? (
              <div className="workspace-import-preview">
                <div>
                  <strong>导入预览</strong>
                  <span>{new Date(preview.exportedAt).toLocaleString()}</span>
                </div>
                <CountsGrid counts={preview.counts} />
                <fieldset className="workspace-restore-modes">
                  <legend>恢复方式</legend>
                  <label>
                    <input
                      type="radio"
                      name="workspace-restore-mode"
                      value="merge"
                      checked={restoreMode === "merge"}
                      onChange={() => setRestoreMode("merge")}
                      disabled={operationBusy}
                    />
                    <span><strong>合并</strong><small>保留本地非冲突记录，同 ID 使用较新版本。</small></span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="workspace-restore-mode"
                      value="replace"
                      checked={restoreMode === "replace"}
                      onChange={() => setRestoreMode("replace")}
                      disabled={operationBusy}
                    />
                    <span><strong>替换</strong><small>原子替换完整工作区，需要再次确认。</small></span>
                  </label>
                </fieldset>
                <button
                  type="button"
                  className={restoreMode === "replace" ? "ui-button workspace-data-danger" : "ui-button workspace-data-primary"}
                  onClick={requestRestore}
                  disabled={operationBusy}
                >
                  {busy === "restore" ? "正在恢复…" : restoreMode === "replace" ? "替换工作区" : "合并到工作区"}
                </button>
              </div>
            ) : null}
          </section>

          {error || storageError ? (
            <p className="workspace-data-error" role="alert">{error || storageError}</p>
          ) : null}
        </div>
      </Dialog>

      <ConfirmationDialog
        open={replaceConfirmationOpen}
        title="替换完整工作区？"
        description="当前工作区的全部集合将被所选备份原子替换。文件已通过校验，但此操作完成后会重新加载页面。"
        confirmLabel="确认替换"
        busy={busy === "restore"}
        onCancel={() => {
          if (busy !== "restore") setReplaceConfirmationOpen(false);
        }}
        onConfirm={() => void restoreArchive()}
      />

    </>
  );
}

export default WorkspaceDataDialog;
