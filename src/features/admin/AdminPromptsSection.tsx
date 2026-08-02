import type { FormEventHandler } from "react";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import type { ModuleId, PromptPreset } from "../../types";
import { promptModuleOptions, type PromptPresetDraft } from "./adminConsoleConfig";

type AdminPromptsSectionProps = {
  prompts: PromptPreset[];
  selectedPromptId: string | "new";
  form: PromptPresetDraft;
  onSelect: (promptId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<PromptPresetDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
};

export function AdminPromptsSection({
  prompts,
  selectedPromptId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete
}: AdminPromptsSectionProps) {
  return (
    <section id="admin-section-prompts" className="admin-section admin-prompt-section">
      <div className="section-title">
        <FileText size={17} />
        <h2>提示词预设</h2>
      </div>
      <div className="provider-picker">
        <label htmlFor="admin-prompt-picker">
          <span>选择提示词</span>
          <select
            id="admin-prompt-picker"
            value={selectedPromptId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {prompts.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.moduleId} / {preset.title}
              </option>
            ))}
            <option value="new">新增预设</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="新增提示词预设"
          title="新增提示词预设"
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </div>
      <form className="provider-form" onSubmit={onSubmit}>
        <label>
          所属功能
          <select
            value={form.moduleId}
            onChange={(event) => onChange({ moduleId: event.target.value as ModuleId })}
          >
            {promptModuleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          按钮标题
          <input
            value={form.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label>
          提示词内容
          <textarea
            value={form.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            rows={4}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          前台启用
        </label>
        <div className="admin-form-actions">
          <button type="submit" className="primary-action">
            <Save size={16} />
            保存预设
          </button>
          {selectedPromptId !== "new" ? (
            <button type="button" className="secondary-action danger-action" onClick={onDelete}>
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
