import { useId, useRef, useState } from "react";
import { MonitorSmartphone, X } from "lucide-react";
import { ConfirmationDialog, Dialog } from "../../components/ui";
import type { UserProviderConfig } from "../../types";
import ProgressSyncPanel from "./ProgressSyncPanel";

type ProgressSyncDialogProps = {
  open: boolean;
  initialMode: "send" | "receive";
  initialCode?: string;
  userProvider: UserProviderConfig;
  onClose: () => void;
};

function ProgressSyncDialog({
  open,
  initialMode,
  initialCode = "",
  userProvider,
  onClose
}: ProgressSyncDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const replaceActionRef = useRef<(() => void) | null>(null);
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [apiKeyConfirmationOpen, setApiKeyConfirmationOpen] = useState(false);
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);

  const closeDialog = () => {
    if (apiKeyConfirmationOpen || replaceConfirmationOpen) return;
    onClose();
  };

  return (
    <>
      <Dialog
        open={open && !apiKeyConfirmationOpen && !replaceConfirmationOpen}
        labelledBy={titleId}
        describedBy={descriptionId}
        onClose={closeDialog}
        initialFocusRef={closeButtonRef}
        className="workspace-data-dialog progress-sync-dialog"
      >
        <header className="workspace-data-header">
          <span className="workspace-data-mark" aria-hidden="true">
            <MonitorSmartphone size={19} />
          </span>
          <div>
            <small>ONE-TIME TRANSFER</small>
            <h2 id={titleId}>跨设备同步</h2>
            <p id={descriptionId}>一次性传输当前稳定进度，后续修改不会自动同步。</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="ui-icon-button workspace-data-close"
            onClick={closeDialog}
            aria-label="关闭跨设备同步"
          >
            <X size={17} />
          </button>
        </header>

        <div className="workspace-data-body progress-sync-dialog-body">
          <ProgressSyncPanel
            userProvider={userProvider}
            initialMode={initialMode}
            initialCode={initialCode}
            includeApiKey={includeApiKey}
            onRequestApiKeyInclusion={() => setApiKeyConfirmationOpen(true)}
            onDisableApiKeyInclusion={() => setIncludeApiKey(false)}
            restoreMode={restoreMode}
            onRestoreModeChange={setRestoreMode}
            onRequestReplace={(action) => {
              replaceActionRef.current = action;
              setReplaceConfirmationOpen(true);
            }}
          />
        </div>
      </Dialog>

      <ConfirmationDialog
        open={apiKeyConfirmationOpen}
        title="同时传输 API Key？"
        description="API Key 默认不会同步。启用后，它只会进入由两台设备临时密钥端到端加密的快照；服务端无法读取，但接收设备将获得该 Key 的使用权限。"
        confirmLabel="确认包含 API Key"
        onCancel={() => setApiKeyConfirmationOpen(false)}
        onConfirm={() => {
          setIncludeApiKey(true);
          setApiKeyConfirmationOpen(false);
        }}
      />

      <ConfirmationDialog
        open={replaceConfirmationOpen}
        title="替换本机工作区？"
        description="本机现有工作区将被接收到的加密快照完整替换。此操作不会影响发送设备，但会覆盖本机当前进度。"
        confirmLabel="确认替换并恢复"
        onCancel={() => {
          replaceActionRef.current = null;
          setReplaceConfirmationOpen(false);
        }}
        onConfirm={() => {
          const action = replaceActionRef.current;
          replaceActionRef.current = null;
          setReplaceConfirmationOpen(false);
          action?.();
        }}
      />
    </>
  );
}

export default ProgressSyncDialog;
