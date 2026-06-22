import { useEffect, useRef } from "react";
import { PlugZap, ShieldCheck, X } from "lucide-react";
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
  const previousOverflowRef = useRef("");
  const previousPaddingRightRef = useRef("");

  useEffect(() => {
    if (!open) return;
    previousOverflowRef.current = document.body.style.overflow;
    previousPaddingRightRef.current = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canClose) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflowRef.current;
      document.body.style.paddingRight = previousPaddingRightRef.current;
    };
  }, [canClose, onClose, open]);

  if (!open) return null;

  return (
    <div className="api-config-layer" role="dialog" aria-modal="true" aria-labelledby="api-config-title">
      <button
        type="button"
        className="api-config-scrim"
        onClick={() => {
          if (canClose) onClose();
        }}
        aria-label="关闭 API 配置"
      />
      <section className="api-config-dialog">
        <header className="api-config-head">
          <span className={ready ? "api-config-mark ready" : "api-config-mark"}>
            {ready ? <ShieldCheck size={22} /> : <PlugZap size={22} />}
          </span>
          <div>
            <small>{ready ? "连接信息已完整" : "首次使用需要连接信息"}</small>
            <h2 id="api-config-title">配置你的 API URL 和 Key</h2>
            <p>前台只在本次浏览器会话里保存，用于请求时携带给模型供应商。</p>
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
      </section>
    </div>
  );
}

export default ApiConnectionModal;
