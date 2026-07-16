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
        <strong>{ready ? "API 已连接" : "API 未配置"}</strong>
        <span>{ready ? modelLabel || "可以开始使用" : "填写 URL 与 Key"}</span>
      </div>
      <button type="button" className="secondary-action compact-action" onClick={onOpenSettings}>
        {ready ? "更改" : "配置"}
      </button>
    </div>
  );
}

export default ConnectionStatus;
