import { CheckCircle2, PlugZap } from "lucide-react";

type ConnectionStatusProps = {
  ready: boolean;
  modelLabel?: string;
  onOpenSettings: () => void;
};

function ConnectionStatus({ ready, modelLabel, onOpenSettings }: ConnectionStatusProps) {
  return (
    <div className={ready ? "connection-status ready" : "connection-status"}>
      <div className="connection-status-icon">
        {ready ? <CheckCircle2 size={18} /> : <PlugZap size={18} />}
      </div>
      <div>
        <strong>{ready ? modelLabel || "模型已选择" : "等待 API 配置"}</strong>
        <span>
          {ready
            ? "请求会使用你本次会话填写的 API URL 和 Key。"
            : "先填写 API URL 和 API Key，再开始调用模型。"}
        </span>
      </div>
      <button type="button" className="secondary-action compact-action" onClick={onOpenSettings}>
        配置 API
      </button>
    </div>
  );
}

export default ConnectionStatus;
