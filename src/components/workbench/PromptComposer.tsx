import type { KeyboardEvent, ReactNode } from "react";
import { AlertCircle, Loader2, Play } from "lucide-react";
import PromptPresetGrid from "./PromptPresetGrid";

type PromptComposerProps = {
  label: string;
  value: string;
  placeholder: string;
  rows?: number;
  submitLabel: string;
  busy?: boolean;
  disabled?: boolean;
  notice?: string;
  presets?: string[];
  children?: ReactNode;
  onChange: (value: string) => void;
  onPresetPick?: (value: string) => void;
};

function PromptComposer({
  label,
  value,
  placeholder,
  rows = 5,
  submitLabel,
  busy,
  disabled,
  notice,
  presets = [],
  children,
  onChange,
  onPresetPick
}: PromptComposerProps) {
  const canSubmit = !disabled && !busy;
  const submitHint = "输入内容后可提交";
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (!canSubmit) return;
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="prompt-composer-panel" aria-busy={busy || undefined}>
      <label className="prompt-field">
        <span className="prompt-field-row">
          {label}
          <small>{submitHint}</small>
        </span>
        <textarea
          data-testid="workbench-prompt-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
        />
      </label>
      <div className="prompt-meta-row">
        <span>{value.trim().length ? `${value.trim().length} 字` : "等待输入"}</span>
        <span aria-live="polite" role="status">
          {busy ? "请求处理中" : canSubmit ? submitHint : "补全连接和内容后可提交"}
        </span>
      </div>

      <PromptPresetGrid presets={presets} onPick={onPresetPick} />

      {children}

      {notice ? (
        <p className="workbench-notice bad">
          <AlertCircle size={16} />
          {notice}
        </p>
      ) : null}

      <button type="submit" className="primary-action workbench-submit" disabled={disabled}>
        {busy ? <Loader2 size={17} className="spin" /> : <Play size={17} />}
        {busy ? "请求中" : submitLabel}
      </button>
    </div>
  );
}

export default PromptComposer;
