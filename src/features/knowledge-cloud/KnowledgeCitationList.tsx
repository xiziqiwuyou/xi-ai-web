import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { api } from "../../api";
import type { KnowledgeCitation } from "../../types";

type KnowledgeCitationListProps = {
  citations?: KnowledgeCitation[];
};

function locatorLabel(locator: Record<string, unknown>) {
  const values = Object.values(locator)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map(String)
    .slice(0, 2);
  return values.join(" · ");
}

export default function KnowledgeCitationList({ citations = [] }: KnowledgeCitationListProps) {
  const [error, setError] = useState("");
  const uniqueCitations = [...new Map(
    citations.map((citation) => [
      `${citation.knowledgeBaseId}:${citation.documentId}:${citation.chunkId}`,
      citation
    ])
  ).values()];
  if (!uniqueCitations.length) return null;

  const openSource = async (citation: KnowledgeCitation, disposition: "inline" | "attachment") => {
    setError("");
    try {
      const result = await api.knowledgeSourceUrl(citation.documentId, citation.chunkId, disposition);
      const link = document.createElement("a");
      link.href = result.source.url;
      link.target = disposition === "inline" ? "_blank" : "_self";
      link.rel = "noopener noreferrer";
      if (disposition === "attachment") link.download = citation.documentName;
      link.click();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "无法打开知识来源");
    }
  };

  return (
    <section className="knowledge-citation-list" aria-label="知识来源">
      <header><strong>来源</strong><span>{uniqueCitations.length}</span></header>
      <div>
        {uniqueCitations.map((citation) => (
          <article key={`${citation.knowledgeBaseId}-${citation.documentId}-${citation.chunkId}`}>
            <FileText size={14} aria-hidden="true" />
            <button type="button" onClick={() => void openSource(citation, "inline")}>
              <strong>[{citation.id}] {citation.documentName}</strong>
              <small>{citation.knowledgeBaseName}{locatorLabel(citation.locator) ? ` · ${locatorLabel(citation.locator)}` : ""}</small>
            </button>
            <button type="button" className="icon" aria-label={`打开来源 ${citation.documentName}`} title="打开来源" onClick={() => void openSource(citation, "inline")}><ExternalLink size={13} /></button>
            <button type="button" className="icon" aria-label={`下载来源 ${citation.documentName}`} title="下载来源" onClick={() => void openSource(citation, "attachment")}><Download size={13} /></button>
          </article>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
