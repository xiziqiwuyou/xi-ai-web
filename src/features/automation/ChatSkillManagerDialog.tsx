import { useEffect, useId, useState, type FormEvent } from "react";
import { Plus, Puzzle, Save, Trash2, X } from "lucide-react";
import { ConfirmationDialog, Dialog } from "../../components/ui";
import { createClientId } from "../../utils/clientId";
import type { AgentSkillDefinition, ToolSetting } from "../../types";
import { supportedVendorLabels, toolExecutionLabel } from "./toolCompatibility";

type ChatSkillManagerDialogProps = {
  open: boolean;
  skills: AgentSkillDefinition[];
  tools: ToolSetting[];
  onSave: (skills: AgentSkillDefinition[]) => Promise<void>;
  onClose: () => void;
};

function nextSkill() {
  const now = new Date().toISOString();
  return {
    id: createClientId("skill"),
    name: "新 Skill",
    description: "",
    instructions: "明确这项对话能力的目标、边界和输出格式。",
    allowedTools: [],
    requiredCapabilities: ["chat"],
    createdAt: now,
    updatedAt: now
  } satisfies AgentSkillDefinition;
}

function cloneSkill(skill: AgentSkillDefinition) {
  return structuredClone(skill);
}

export default function ChatSkillManagerDialog({
  open,
  skills,
  tools,
  onSave,
  onClose
}: ChatSkillManagerDialogProps) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState(skills[0]?.id || "");
  const [draft, setDraft] = useState<AgentSkillDefinition | null>(skills[0] ? cloneSkill(skills[0]) : null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const selected = skills.find((skill) => skill.id === selectedId);
    if (selected) {
      setDraft(cloneSkill(selected));
      return;
    }
    if (draft?.id === selectedId) return;
    const fallback = skills[0];
    setSelectedId(fallback?.id || "");
    setDraft(fallback ? cloneSkill(fallback) : null);
  }, [draft?.id, selectedId, skills]);

  const selectSkill = (id: string) => {
    const skill = skills.find((item) => item.id === id);
    if (!skill) return;
    setSelectedId(id);
    setDraft(cloneSkill(skill));
    setNotice("");
  };

  const createSkill = () => {
    const skill = nextSkill();
    setSelectedId(skill.id);
    setDraft(skill);
    setNotice("");
  };

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.name.trim() || !draft.instructions.trim()) {
      setNotice("请填写 Skill 名称和指令。");
      return;
    }
    const normalized: AgentSkillDefinition = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      instructions: draft.instructions.trim(),
      allowedTools: [...draft.allowedTools],
      requiredCapabilities: [...draft.requiredCapabilities],
      updatedAt: new Date().toISOString()
    };
    const nextSkills = skills.some((skill) => skill.id === normalized.id)
      ? skills.map((skill) => skill.id === normalized.id ? normalized : skill)
      : [normalized, ...skills];
    setBusy(true);
    try {
      await onSave(nextSkills);
      setSelectedId(normalized.id);
      setNotice("Skill 已保存到当前浏览器。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Skill 保存失败。");
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!draft) return;
    const remaining = skills.filter((skill) => skill.id !== draft.id);
    setBusy(true);
    try {
      await onSave(remaining);
      setSelectedId(remaining[0]?.id || "");
      setDraft(remaining[0] ? cloneSkill(remaining[0]) : null);
      setNotice("Skill 已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Skill 删除失败。");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <Dialog
        open={open && !confirmDelete}
        labelledBy={titleId}
        className="figma-chat-skill-dialog"
        onClose={onClose}
      >
        <header className="figma-chat-skill-dialog-header">
          <div>
            <small>CHAT SKILLS</small>
            <h2 id={titleId}>对话 Skill</h2>
          </div>
          <button type="button" className="figma-settings-close" onClick={onClose} aria-label="关闭对话 Skill">
            <X size={17} />
          </button>
        </header>

        <div className="figma-chat-skill-dialog-body">
          <aside aria-label="Skill 列表" className="figma-chat-skill-library">
            <button type="button" className="figma-chat-skill-create" onClick={createSkill} disabled={busy}>
              <Plus size={15} />
              新建 Skill
            </button>
            <div>
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className={skill.id === selectedId ? "active" : ""}
                  aria-pressed={skill.id === selectedId}
                  onClick={() => selectSkill(skill.id)}
                >
                  <Puzzle size={15} />
                  <span><strong>{skill.name}</strong><small>{skill.description || "对话能力"}</small></span>
                </button>
              ))}
            </div>
          </aside>

          <form className="figma-chat-skill-editor" onSubmit={(event) => void saveDraft(event)}>
            {draft ? (
              <>
                <label>
                  <span>名称</span>
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>
                  <span>描述</span>
                  <input value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </label>
                <label className="figma-chat-skill-instructions">
                  <span>Skill 指令</span>
                  <textarea aria-label="Skill 指令" rows={10} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
                </label>
                <fieldset className="figma-chat-skill-tools">
                  <legend>允许工具</legend>
                  {tools.map((tool) => {
                    const checked = draft.allowedTools.includes(tool.name);
                    return (
                      <label key={tool.name} className={!tool.enabled ? "disabled" : ""}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!tool.enabled && !checked}
                          onChange={(event) => setDraft({
                            ...draft,
                            allowedTools: event.target.checked
                              ? [...new Set([...draft.allowedTools, tool.name])]
                              : draft.allowedTools.filter((name) => name !== tool.name)
                          })}
                        />
                        <span>
                          <strong>{tool.label}</strong>
                          <small>{toolExecutionLabel(tool)} · {supportedVendorLabels(tool)}</small>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                {notice ? <p className="figma-module-notice" role="status">{notice}</p> : null}
                <footer>
                  {skills.some((skill) => skill.id === draft.id) ? (
                    <button type="button" className="figma-chat-skill-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>
                      <Trash2 size={15} />删除
                    </button>
                  ) : <span />}
                  <button type="submit" className="figma-primary-action" disabled={busy}>
                    <Save size={15} />{busy ? "保存中" : "保存 Skill"}
                  </button>
                </footer>
              </>
            ) : <div className="figma-empty-state"><Puzzle size={24} /><strong>创建第一个 Skill</strong></div>}
          </form>
        </div>
      </Dialog>

      <ConfirmationDialog
        open={confirmDelete}
        title="删除这个 Skill？"
        description="关联此 Skill 的智能体和工作流不会被删除，但将不再获得它的指令。"
        confirmLabel="确认删除"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteDraft()}
      />
    </>
  );
}
