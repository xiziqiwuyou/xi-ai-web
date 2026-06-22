import { FormEvent, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Link2,
  RotateCcw,
  ShieldCheck
} from "lucide-react";
import type { UserProviderConfig } from "../../types";
import { connectionPresets, isUserProviderReady } from "./userProviderConfig";

type ApiConnectionFormProps = {
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onResetUserProvider?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  className?: string;
  autoFocus?: boolean;
  showReset?: boolean;
};

export function maskApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (!value) return "尚未填写";
  if (value.length <= 8) return "已填写";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function ApiConnectionForm({
  userProvider,
  onUserProviderChange,
  onResetUserProvider,
  onSubmit,
  submitLabel = "保存并开始使用",
  className = "settings-panel settings-form",
  autoFocus = false,
  showReset = true
}: ApiConnectionFormProps) {
  const [showKey, setShowKey] = useState(false);
  const ready = isUserProviderReady(userProvider);
  const baseUrlValue = userProvider.baseUrl.trim();
  const apiKeyValue = userProvider.apiKey.trim();
  const urlReady = /^https?:\/\//i.test(baseUrlValue);
  const keyReady = Boolean(apiKeyValue);

  const endpointHost = useMemo(() => {
    try {
      return new URL(userProvider.baseUrl).host;
    } catch {
      return "未识别的 URL";
    }
  }, [userProvider.baseUrl]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSubmit?.();
  };

  return (
    <form className={className} onSubmit={submit}>
      <div className="settings-section-title">
        <Link2 size={18} />
        <div>
          <strong>自带 API 连接</strong>
          <span>仅保存在当前浏览器会话中，不写入服务器数据文件。</span>
        </div>
      </div>

      <div className="settings-summary compact">
        <span>
          <Globe2 size={15} />
          {endpointHost}
        </span>
        <span>
          <KeyRound size={15} />
          {maskApiKey(userProvider.apiKey)}
        </span>
      </div>

      <label className="settings-field">
        <span className="settings-field-row">
          API URL
          <small className={urlReady ? "field-state good" : "field-state"}>
            {urlReady ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            {urlReady ? "已识别" : "需要 http/https"}
          </small>
        </span>
        <div className="settings-input-wrap">
          <Globe2 size={16} />
          <input
            aria-label="API URL"
            autoComplete="url"
            inputMode="url"
            name="apiUrl"
            type="url"
            value={userProvider.baseUrl}
            onChange={(event) => onUserProviderChange({ baseUrl: event.target.value })}
            placeholder="例如：https://api.openai.com/v1"
            autoFocus={autoFocus}
          />
        </div>
      </label>

      <div className="model-suggestions" aria-label="常用 API URL">
        {connectionPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={userProvider.baseUrl === preset.baseUrl ? "active" : ""}
            onClick={() => onUserProviderChange({ baseUrl: preset.baseUrl })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="settings-field">
        <span className="settings-field-row">
          API Key
          <small className={keyReady ? "field-state good" : "field-state"}>
            {keyReady ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            {keyReady ? "已填写" : "待填写"}
          </small>
        </span>
        <div className="settings-input-wrap">
          <KeyRound size={16} />
          <input
            aria-label="API Key"
            autoComplete="off"
            name="apiKey"
            type={showKey ? "text" : "password"}
            value={userProvider.apiKey}
            onChange={(event) => onUserProviderChange({ apiKey: event.target.value })}
            placeholder="例如：sk-..."
          />
          <button
            type="button"
            className="settings-icon-action"
            onClick={() => setShowKey((value) => !value)}
            aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
            title={showKey ? "隐藏 API Key" : "显示 API Key"}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      <div className={ready ? "settings-ready-card ready" : "settings-ready-card"}>
        {ready ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
        <div>
          <strong>{ready ? "可以发起请求" : "还需要补全连接信息"}</strong>
          <span>
            {ready
              ? "之后选择后台目录里的模型即可调用。"
              : "请确认 API URL 以 http:// 或 https:// 开头，并填写有效 Key。"}
          </span>
        </div>
      </div>

      <div className="api-form-actions">
        <button type="submit" className="primary-action" disabled={!ready}>
          <CheckCircle2 size={16} />
          {submitLabel}
        </button>
        {showReset && onResetUserProvider ? (
          <button
            type="button"
            className="secondary-action settings-reset"
            onClick={onResetUserProvider}
          >
            <RotateCcw size={16} />
            恢复默认
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default ApiConnectionForm;
