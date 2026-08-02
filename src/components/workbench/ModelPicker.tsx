import { Cpu } from "lucide-react";
import { FigmaMenu, type FigmaMenuOption } from "../ui";
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
  const options: FigmaMenuOption[] = availableModels.map((entry) => ({
    value: entry.id,
    label: modelOptionLabel(entry)
  }));
  return (
    <div className={`model-picker ${className}`.trim()}>
      <FigmaMenu
        className="model-picker-menu"
        label={label || "模型"}
        ariaLabel={label || "选择模型"}
        ariaDescribedBy={empty ? helpId : undefined}
        value={value || ""}
        options={options}
        onChange={onChange}
        disabled={disabled || empty}
        triggerIcon={<Cpu size={16} />}
        triggerText={empty ? "暂无可用模型" : undefined}
      />
      {empty ? (
        <small id={helpId} className="model-picker-empty">
          后台未启用支持该能力的模型
        </small>
      ) : null}
    </div>
  );
}

export default ModelPicker;
