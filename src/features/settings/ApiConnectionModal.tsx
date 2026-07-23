import { X } from "lucide-react";
import { Dialog } from "../../components/ui";
import ApiConnectionForm from "./ApiConnectionForm";
import { isUserProviderReady } from "./userProviderConfig";
import type { UserProviderConfig } from "../../types";

type ApiConnectionModalProps = {
  open: boolean;
  required: boolean;
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onClose: () => void;
};

function ApiConnectionModal({
  open,
  required,
  userProvider,
  onUserProviderChange,
  onClose
}: ApiConnectionModalProps) {
  const ready = isUserProviderReady(userProvider);
  const canClose = !required || ready;

  return (
    <Dialog
      open={open}
      labelledBy="api-config-title"
      describedBy="api-config-description"
      onClose={onClose}
      canClose={canClose}
      closeOnEscape={canClose}
      closeOnScrim={canClose}
      className="api-config-dialog"
    >
      <header className="api-config-head">
        <div>
          <small>API CONNECTION</small>
          <h2 id="api-config-title">连接 API</h2>
          <p id="api-config-description">连接信息仅保存在当前浏览器会话中。</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={!canClose}
          title={canClose ? "关闭" : "请先填写 API URL 和 Key"}
          aria-label="关闭"
        >
          <X size={17} />
        </button>
      </header>

      <ApiConnectionForm
        userProvider={userProvider}
        onUserProviderChange={onUserProviderChange}
        onSubmit={onClose}
        className="api-config-form"
        autoFocus
      />
    </Dialog>
  );
}

export default ApiConnectionModal;
