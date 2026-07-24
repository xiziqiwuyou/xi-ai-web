import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Loader2, Send, Workflow } from "lucide-react";
import { streamLangflowWorkflow } from "../../api";
import { compactModelLabel, modelOptionLabel, modelsForCapability, vendorLabels } from "../../components/workbench/model-utils";
import type { LangflowStatus, LangflowStreamEvent, LangflowWorkflow, ModelCatalogEntry, UserProviderConfig } from "../../types";
import { createClientId } from "../../utils/clientId";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";

type LangflowWorkflowModuleProps = {
  status: LangflowStatus;
  workflows: LangflowWorkflow[];
  modelCatalog: ModelCatalogEntry[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onRequestApiConfig: () => void;
};

type WorkflowMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function localId(prefix: string) {
  return createClientId(prefix);
}

export default function LangflowWorkflowModule({
  status,
  workflows,
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onRequestApiConfig
}: LangflowWorkflowModuleProps) {
  const availableModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const [selectedId, setSelectedId] = useState(workflows[0]?.id || "");
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedId) || workflows[0];
  const [modelId, setModelId] = useState(userProvider.lastModelId || availableModels[0]?.id || "");
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionIdRef = useRef<string>(createClientId());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!workflows.some((workflow) => workflow.id === selectedId)) {
      setSelectedId(workflows[0]?.id || "");
    }
  }, [selectedId, workflows]);

  useEffect(() => {
    const nextModelId = userProvider.lastModelId && availableModels.some((model) => model.id === userProvider.lastModelId)
      ? userProvider.lastModelId
      : availableModels[0]?.id || "";
    setModelId(nextModelId);
  }, [availableModels, userProvider.lastModelId]);

  useEffect(() => {
    sessionIdRef.current = createClientId();
    setMessages(selectedWorkflow?.welcomeMessage ? [{ id: localId("welcome"), role: "assistant", content: selectedWorkflow.welcomeMessage }] : []);
    setDraft("");
    setNotice("");
    abortRef.current?.abort();
    setBusy(false);
  }, [selectedWorkflow?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedModel = availableModels.find((model) => model.id === modelId) || availableModels[0];

  const selectWorkflow = (workflow: LangflowWorkflow) => {
    if (busy) return;
    setSelectedId(workflow.id);
  };

  const handleStreamEvent = (messageId: string, event: LangflowStreamEvent) => {
    if (event.type === "meta") {
      sessionIdRef.current = event.sessionId || sessionIdRef.current;
      return;
    }
    if (event.type === "token") {
      if (!event.token) return;
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, content: `${message.content}${event.token}` }
        : message));
      return;
    }
    if (event.type === "done") {
      if (event.text) {
        setMessages((current) => current.map((message) => message.id === messageId && !message.content
          ? { ...message, content: event.text }
          : message));
      }
      return;
    }
    if (event.type === "error") {
      setNotice(event.error);
    }
  };

  const submit = async () => {
    const input = draft.trim();
    if (!input || !selectedWorkflow || busy) return;
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel) {
      setNotice("暂无可用对话模型，请先在后台配置模型目录。");
      return;
    }

    const userMessage: WorkflowMessage = { id: localId("user"), role: "user", content: input };
    const assistantMessage: WorkflowMessage = { id: localId("assistant"), role: "assistant", content: "" };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setNotice("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      await streamLangflowWorkflow(
        selectedWorkflow.id,
        {
          input,
          sessionId: sessionIdRef.current,
          connection: userConnectionPayload(userProvider),
          modelId: selectedModel.id
        },
        (event) => handleStreamEvent(assistantMessage.id, event),
        controller.signal
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setNotice(error instanceof Error ? error.message : "工作流运行失败");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view automation-page langflow-workflow-page" data-testid="langflow-workflows-module">
      <header className="figma-page-hero automation-hero">
        <p>04 / WORKFLOWS</p>
        <div className="automation-hero-title"><span aria-hidden="true"><Workflow size={20} /></span><h1>工作流</h1></div>
        <span>选择一个已发布的流程，像普通对话一样完成多步骤任务。</span>
      </header>

      {!status.available ? (
        <div className="langflow-workflow-notice" role="status">
          <strong>{status.enabled ? "工作流服务尚未就绪" : "工作流服务未启用"}</strong>
          <span>管理员完成 Langflow 服务配置并发布流程后，这里会出现可用工作流。</span>
        </div>
      ) : null}

      {!selectedWorkflow ? (
        <div className="langflow-workflow-empty">
          <Workflow size={24} />
          <strong>还没有已发布的工作流</strong>
          <span>请先在后台配置 Langflow Flow ID 并发布。</span>
        </div>
      ) : (
        <div className="langflow-workflow-layout">
          <aside className="langflow-workflow-library" aria-label="工作流列表">
            <header><span>已发布流程</span><b>{workflows.length}</b></header>
            <div>
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  className={workflow.id === selectedWorkflow.id ? "active" : undefined}
                  onClick={() => selectWorkflow(workflow)}
                  disabled={busy}
                >
                  <span className="langflow-workflow-library-icon"><Workflow size={15} /></span>
                  <span><strong>{workflow.name}</strong><small>{workflow.description || "已发布工作流"}</small></span>
                </button>
              ))}
            </div>
          </aside>

          <section className="langflow-workflow-chat" aria-label={`${selectedWorkflow.name} 对话`}>
            <header className="langflow-workflow-chat-header">
              <div>
                <span className="langflow-workflow-kicker"><Bot size={13} /> 工作流助手</span>
                <h2>{selectedWorkflow.name}</h2>
                <p>{selectedWorkflow.description}</p>
              </div>
              <label className="langflow-workflow-model">
                <span>使用模型</span>
                <select
                  value={selectedModel?.id || ""}
                  onChange={(event) => {
                    setModelId(event.target.value);
                    onUserProviderChange({ lastModelId: event.target.value });
                  }}
                  disabled={busy || !availableModels.length}
                >
                  {availableModels.map((model) => <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>)}
                </select>
              </label>
            </header>

            <div className="langflow-workflow-messages" aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`langflow-workflow-message ${message.role}`}>
                  <span className="langflow-workflow-avatar">{message.role === "assistant" ? <Bot size={15} /> : "我"}</span>
                  <p>{message.content || (busy && message.role === "assistant" ? "正在运行工作流..." : "")}</p>
                </article>
              ))}
              {!messages.length ? <div className="langflow-workflow-message-empty">从一个问题开始，让流程帮你完成后续步骤。</div> : null}
            </div>

            {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
            <div className="langflow-workflow-composer">
              <textarea
                rows={4}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={selectedWorkflow.inputPlaceholder || "输入任务或继续追问..."}
                disabled={busy}
              />
              <div>
                <span>{selectedModel ? `${vendorLabels[selectedModel.vendor] || selectedModel.vendor} · ${compactModelLabel(selectedModel)}` : "等待模型"}</span>
                <button type="button" className="figma-primary-action" onClick={() => void submit()} disabled={busy || !draft.trim()}>
                  {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  {busy ? "运行中" : "发送"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
