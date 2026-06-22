import { Cpu } from "lucide-react";
import { modelOptionLabel, modelsForCapability } from "./model-utils";
import type { ModelCapability, ModelCatalogEntry } from "../../types";

type ModelPickerProps = {
  models: ModelCatalogEntry[];
  capability: ModelCapability;
  value?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
};

function ModelPicker({
  models,
  capability,
  value,
  label = "模型",
  className = "",
  disabled,
  onChange
}: ModelPickerProps) {
  const availableModels = modelsForCapability(models, capability);
  const empty = !availableModels.length;
  const helpId = `model-picker-${capability}-help`;
  return (
    <label className={`model-picker ${className}`.trim()}>
      <Cpu size={16} />
      {label ? <span>{label}</span> : null}
      <select
        aria-label={label || "选择模型"}
        aria-describedby={empty ? helpId : undefined}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || empty}
      >
        {empty ? <option value="">暂无可用模型</option> : null}
        {availableModels.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {modelOptionLabel(entry)}
          </option>
        ))}
      </select>
      {empty ? (
        <small id={helpId} className="model-picker-empty">
          后台未启用支持该能力的模型
        </small>
      ) : null}
    </label>
  );
}

export default ModelPicker;
