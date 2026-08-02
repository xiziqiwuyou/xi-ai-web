import type { FormEventHandler } from "react";
import { Plus, Save, Trash2, Workflow } from "lucide-react";
import type { AdminBootstrapPayload, AdminLangflowWorkflow } from "../../types";
import type { LangflowWorkflowDraft } from "./adminConsoleConfig";

type AdminLangflowSectionProps = {
  langflow: AdminBootstrapPayload["langflow"];
  workflows: AdminLangflowWorkflow[];
  selectedWorkflowId: string | "new";
  form: LangflowWorkflowDraft;
  onSelect: (workflowId: string) => void;
  onCreate: () => void;
  onChange: (patch: Partial<LangflowWorkflowDraft>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: () => void;
};

export function AdminLangflowSection({
  langflow,
  workflows,
  selectedWorkflowId,
  form,
  onSelect,
  onCreate,
  onChange,
  onSubmit,
  onDelete
}: AdminLangflowSectionProps) {
  return (
    <section id="admin-section-workflows" className="admin-section admin-langflow-section">
      <div className="section-title">
        <Workflow size={17} />
        <h2>Langflow 工作流发布</h2>
      </div>
      <p className="admin-mini-copy">
        先在私有 Langflow 编辑器中编排并测试 Flow，再把 Flow ID 映射到这里。前台用户只能运行已启用的映射。
      </p>
      <p className={`admin-inline-status${langflow.available ? " ok" : " warn"}`}>
        {langflow.available
          ? "Langflow 网关已配置"
          : langflow.enabled
            ? "Langflow 已启用，但服务器配置尚未完成"
            : "Langflow 当前未启用"}
      </p>
      <div className="provider-picker">
        <label htmlFor="admin-langflow-workflow-picker">
          <span>选择已发布工作流</span>
          <select
            id="admin-langflow-workflow-picker"
            value={selectedWorkflowId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name} · {workflow.flowId}
              </option>
            ))}
            <option value="new">新增发布映射</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="新增工作流发布映射"
          title="新增工作流发布映射"
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </div>
      <form className="provider-form" onSubmit={onSubmit}>
        <label>
          Langflow Flow ID
          <input
            value={form.flowId}
            onChange={(event) => onChange({ flowId: event.target.value })}
            placeholder="Langflow 中的 Flow ID"
          />
        </label>
        <label>
          前台显示名称
          <input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label>
          工作流说明
          <input
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        <label>
          欢迎语
          <textarea
            rows={3}
            value={form.welcomeMessage}
            onChange={(event) => onChange({ welcomeMessage: event.target.value })}
          />
        </label>
        <label>
          输入框提示
          <input
            value={form.inputPlaceholder}
            onChange={(event) => onChange({ inputPlaceholder: event.target.value })}
          />
        </label>
        <label>
          标签
          <input
            value={form.tags}
            onChange={(event) => onChange({ tags: event.target.value })}
            placeholder="例如：研究, 写作"
          />
        </label>
        <label>
          排序
          <input
            type="number"
            min={0}
            max={10000}
            value={form.order}
            onChange={(event) => onChange({ order: Number(event.target.value) || 0 })}
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
            保存发布映射
          </button>
          {selectedWorkflowId !== "new" ? (
            <button type="button" className="secondary-action danger-action" onClick={onDelete}>
              <Trash2 size={16} />
              删除映射
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
