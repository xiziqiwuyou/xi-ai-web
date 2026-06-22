import { CheckCircle2, Wrench } from "lucide-react";
import type { AgentTraceEvent } from "../../types";

function AgentTracePanel({ trace }: { trace: AgentTraceEvent[] }) {
  if (!trace.length) {
    return (
      <section className="agent-trace-panel empty">
        <Wrench size={18} />
        <span>本次任务没有调用工具，或模型直接完成了回答。</span>
      </section>
    );
  }

  return (
    <section className="agent-trace-panel">
      <header>
        <strong>工具轨迹</strong>
        <span>{trace.length} 次调用</span>
      </header>
      <div className="agent-trace-list">
        {trace.map((event) => (
          <article key={event.id} className={event.status}>
            <div>
              <CheckCircle2 size={15} />
              <strong>{event.label || event.toolName}</strong>
              <span>{new Date(event.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p>参数：{event.argumentsPreview || "{}"}</p>
            <p>结果：{event.resultPreview || "无返回"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AgentTracePanel;
