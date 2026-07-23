import { FormEvent, useState } from "react";
import { Check, Eye, EyeOff, Globe2, KeyRound } from "lucide-react";
import type { UserProviderConfig } from "../../types";
import { isUserProviderReady } from "./userProviderConfig";

type ApiConnectionFormProps = {
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  className?: string;
  autoFocus?: boolean;
};

function ApiConnectionForm({
  userProvider,
  onUserProviderChange,
  onSubmit,
  submitLabel = "保存并开始使用",
  className = "settings-panel settings-form",
  autoFocus = false
}: ApiConnectionFormProps) {
  const [showKey, setShowKey] = useState(false);
  const ready = isUserProviderReady(userProvider);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSubmit?.();
  };

  return (
    <form className={className} onSubmit={submit}>
      <label className="settings-field">
        <span>API URL</span>
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

      <label className="settings-field">
        <span>API Key</span>
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

      <div className="api-form-actions">
        <button type="submit" className="primary-action" disabled={!ready}>
          <Check size={16} />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

export default ApiConnectionForm;
