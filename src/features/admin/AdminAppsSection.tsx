import type { FormEventHandler } from "react";
import { Layers3, Plus, Save, Trash2 } from "lucide-react";
import type { AppPreset } from "../../types";
import type { AppPresetDraft } from "./adminConsoleConfig";

type AdminAppsSectionProps = {
  apps: AppPreset[];
  selectedAppId: string | "new";
  form: AppPresetDraft;
  onSelect: (appId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<AppPresetDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
};

export function AdminAppsSection({
  apps,
  selectedAppId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete
}: AdminAppsSectionProps) {
  return (
    <section id="admin-section-apps" className="admin-section admin-app-section">
      <div className="section-title">
        <Layers3 size={17} />
        <h2>应用预设</h2>
      </div>
      <div className="provider-picker">
        <label htmlFor="admin-app-picker">
          <span>选择应用</span>
          <select id="admin-app-picker" value={selectedAppId} onChange={(event) => onSelect(event.target.value)}>
            {apps.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.category} / {preset.name}
              </option>
            ))}
            <option value="new">新增应用</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="新增应用"
          title="新增应用"
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </div>
      <form className="provider-form" onSubmit={onSubmit}>
        <label>
          应用名称
          <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label>
          分类
          <input value={form.category} onChange={(event) => onChange({ category: event.target.value })} />
        </label>
        <label>
          描述
          <input
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label>
          应用提示词
          <textarea
            value={form.prompt}
            onChange={(event) => onChange({ prompt: event.target.value })}
            rows={5}
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
            保存应用
          </button>
          {selectedAppId !== "new" ? (
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
