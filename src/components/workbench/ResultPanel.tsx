import { CheckCircle2, FileText } from "lucide-react";
import AssetGallery from "./AssetGallery";
import EmptyState from "./EmptyState";
import type { GenerationResult } from "../../types";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ResultPanelProps = {
  title: string;
  result: GenerationResult | null;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  actions?: ReactNode;
};

type RetrievalChunk = {
  id?: string;
  index?: number;
  documentId?: string;
  documentName?: string;
  text: string;
  score?: number;
};

function retrievalChunksFrom(raw: unknown): RetrievalChunk[] {
  if (!raw || typeof raw !== "object") return [];
  const retrieval = (raw as { retrieval?: { chunks?: unknown } }).retrieval;
  if (!retrieval || !Array.isArray(retrieval.chunks)) return [];
  return retrieval
    .chunks
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object") return null;
      const value = chunk as Partial<RetrievalChunk>;
      if (!value.text) return null;
      return {
        id: value.id,
        index: value.index,
        documentId: value.documentId,
        documentName: value.documentName,
        text: String(value.text),
        score: typeof value.score === "number" ? value.score : undefined
      };
    })
    .filter(Boolean) as RetrievalChunk[];
}

function statusLabel(status: GenerationResult["status"]) {
  if (status === "submitted") return "已提交";
  if (status === "failed") return "失败";
  return "已完成";
}

function ResultPanel({
  title,
  result,
  emptyIcon = FileText,
  emptyTitle = "结果会显示在这里",
  emptyDescription = "提交后会经由本地服务端代理转发，API Key 只保存在当前浏览器会话。",
  actions
}: ResultPanelProps) {
  const retrievalChunks = result ? retrievalChunksFrom(result.raw) : [];

  return (
    <section className="workbench-result">
      <header className="workbench-result-head">
        <div>
          <strong>{title}</strong>
          <span>{result ? statusLabel(result.status) : "等待请求"}</span>
        </div>
        <div className="workbench-result-meta">
          {result ? (
            <span className="result-status">
              <CheckCircle2 size={15} />
              {new Date(result.createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          ) : null}
          {actions ? <div className="workbench-result-actions">{actions}</div> : null}
        </div>
      </header>

      {result ? (
        <div className="workbench-result-body">
          {result.text ? <div className="result-text">{result.text}</div> : null}
          {retrievalChunks.length ? (
            <section className="retrieval-panel">
              <header>
                <strong>召回片段</strong>
                <span>{retrievalChunks.length} 条</span>
              </header>
              <div className="retrieval-list">
                {retrievalChunks.map((chunk, index) => (
                  <article key={chunk.id || `${chunk.index || index}-${index}`}>
                    <div>
                      <strong>
                        {chunk.documentName ? `${chunk.documentName} / ` : ""}
                        片段 {typeof chunk.index === "number" ? chunk.index + 1 : index + 1}
                      </strong>
                      {typeof chunk.score === "number" ? <span>相关度 {chunk.score}</span> : null}
                    </div>
                    <p>{chunk.text}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <AssetGallery assets={result.assets || []} />
          {result.raw ? (
            <details className="raw-result">
              <summary>原始返回</summary>
              <pre>{JSON.stringify(result.raw, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      )}
    </section>
  );
}

export default ResultPanel;
