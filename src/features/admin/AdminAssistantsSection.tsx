import type { FormEventHandler } from "react";
import { Bot, Plus, Save, Trash2 } from "lucide-react";
import { AssistantAvatar } from "../assistants/AssistantAvatar";
import { assistantAvatarOptions } from "../assistants/assistantAvatars";
import type { Assistant } from "../../types";
import type { AssistantDraft } from "./adminConsoleConfig";

type AdminAssistantsSectionProps = {
  assistants: Assistant[];
  selectedAssistantId: string | "new";
  form: AssistantDraft;
  onSelect: (assistantId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<AssistantDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
};

export function AdminAssistantsSection({
  assistants,
  selectedAssistantId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete
}: AdminAssistantsSectionProps) {
  return (
    <section id="admin-section-assistants" className="admin-section">
      <div className="section-title">
        <Bot size={17} />
        <h2>助手库</h2>
      </div>
      <div className="provider-picker">
        <label htmlFor="admin-assistant-picker">
          <span>选择助手</span>
          <select
            id="admin-assistant-picker"
            value={selectedAssistantId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {assistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.category} / {assistant.name}{assistant.enabled ? "" : "（停用）"}
              </option>
            ))}
            <option value="new">新增助手</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="新增助手"
          title="新增助手"
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </div>
      <form className="provider-form" onSubmit={onSubmit}>
        <label>
          助手名称
          <input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label>
          描述
          <input
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label>
          分类
          <input
            aria-label="助手分类"
            value={form.category}
            onChange={(event) => onChange({ category: event.target.value })}
          />
        </label>
        <label>
          标签
          <input
            aria-label="助手标签"
            value={form.tags}
            onChange={(event) => onChange({ tags: event.target.value })}
            placeholder="写作, 营销, 润色"
          />
        </label>
        <label className="admin-assistant-avatar-picker">
          助手头像
          <span>
            <AssistantAvatar avatar={form.avatar} color={form.color} />
            <select
              aria-label="助手头像"
              value={form.avatar}
              onChange={(event) => onChange({ avatar: event.target.value })}
            >
              {assistantAvatarOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </span>
        </label>
        <label>
          颜色
          <input
            type="color"
            value={form.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </label>
        <label>
          系统提示词
          <textarea
            value={form.systemPrompt}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
            rows={5}
          />
        </label>
        <label>
          开场问题
          <textarea
            aria-label="助手开场问题"
            value={form.starterPrompts}
            onChange={(event) => onChange({ starterPrompts: event.target.value })}
            rows={4}
            placeholder="每行一个可直接使用的问题"
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
            保存助手
          </button>
          {selectedAssistantId !== "new" ? (
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
