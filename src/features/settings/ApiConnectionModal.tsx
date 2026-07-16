import { PlugZap, ShieldCheck, X } from "lucide-react";
import { Dialog } from "../../components/ui";
import ApiConnectionForm from "./ApiConnectionForm";
import { isUserProviderReady } from "./userProviderConfig";
import type { UserProviderConfig } from "../../types";

type ApiConnectionModalProps = {
  open: boolean;
  required: boolean;
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onResetUserProvider: () => void;
  onClose: () => void;
};

function ApiConnectionModal({
  open,
  required,
  userProvider,
  onUserProviderChange,
  onResetUserProvider,
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
          <span className={ready ? "api-config-mark ready" : "api-config-mark"}>
            {ready ? <ShieldCheck size={22} /> : <PlugZap size={22} />}
          </span>
          <div>
            <small>{ready ? "连接信息已完整" : "首次使用需要连接信息"}</small>
            <h2 id="api-config-title">配置你的 API URL 和 Key</h2>
            <p id="api-config-description">仅在本次浏览器会话中保存，不写入服务器。</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={!canClose}
            title={canClose ? "关闭" : "请先补全 API URL 和 Key"}
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </header>

        <ApiConnectionForm
          userProvider={userProvider}
          onUserProviderChange={onUserProviderChange}
          onResetUserProvider={onResetUserProvider}
          onSubmit={onClose}
          className="api-config-form"
          autoFocus
        />
    </Dialog>
  );
}

export default ApiConnectionModal;
