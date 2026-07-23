import type {
  AgentTraceEvent,
  GenerationResult,
  KnowledgeBase,
  KnowledgeCitation,
  KnowledgeRetrievalRequest
} from "../../types";
import {
  isKnowledgeBaseReady,
  knowledgeEmbeddingConnectionsForBases,
  missingKnowledgeEmbeddingVendors
} from "../knowledge-cloud/integrationState";

const maximumCloudKnowledgeBases = 3;

export type AutomationKnowledgeCatalog = {
  status: "loading" | "authenticated" | "anonymous" | "unavailable";
  csrfToken: string;
  bases: KnowledgeBase[];
};

export type CloudKnowledgeRequestContext = {
  knowledgeBaseIds: string[];
  embeddingConnections: NonNullable<KnowledgeRetrievalRequest["embeddingConnections"]>;
  csrfToken: string;
};

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maximum = 2048) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(text) ? text : "";
}

export function stableKnowledgeBaseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 160)).filter(Boolean))];
}

export function prepareCloudKnowledgeRequestContext(
  value: unknown,
  catalog: AutomationKnowledgeCatalog
): CloudKnowledgeRequestContext | null {
  const knowledgeBaseIds = stableKnowledgeBaseIds(value);
  if (!knowledgeBaseIds.length) return null;
  if (knowledgeBaseIds.length > maximumCloudKnowledgeBases) {
    throw new Error("一次运行最多引用 3 个云知识库。");
  }
  if (catalog.status !== "authenticated" || !catalog.csrfToken) {
    throw new Error("知识库账号已退出，请重新登录后再引用云知识库。");
  }

  const visibleById = new Map(catalog.bases.map((base) => [base.id, base]));
  const missingIds = knowledgeBaseIds.filter((id) => !visibleById.has(id));
  if (missingIds.length) {
    throw new Error("部分知识库已不存在或无权访问，请重新选择。");
  }
  const unavailableBases = knowledgeBaseIds
    .map((id) => visibleById.get(id))
    .filter((base): base is KnowledgeBase => Boolean(base && !isKnowledgeBaseReady(base)));
  if (unavailableBases.length) {
    throw new Error(`知识库“${unavailableBases.map((base) => base.name).join("、")}”的索引尚未就绪。`);
  }
  const missingProfileBases = knowledgeBaseIds
    .map((id) => visibleById.get(id))
    .filter((base): base is KnowledgeBase => Boolean(base && !base.embeddingProfile?.vendor));
  if (missingProfileBases.length) {
    throw new Error(`知识库“${missingProfileBases.map((base) => base.name).join("、")}”缺少可用的 Embedding 配置。`);
  }

  const missingVendors = missingKnowledgeEmbeddingVendors(knowledgeBaseIds, catalog.bases);
  if (missingVendors.length) {
    const labels = missingVendors.map((vendor) => vendor === "qwen" ? "Qwen" : "OpenAI");
    throw new Error(`请先在知识库页面配置 ${labels.join("、")} Embedding 连接。`);
  }

  return {
    knowledgeBaseIds,
    embeddingConnections: knowledgeEmbeddingConnectionsForBases(knowledgeBaseIds, catalog.bases) || {},
    csrfToken: catalog.csrfToken
  };
}

function safeLocator(value: unknown) {
  const source = recordFrom(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, entry]) => (
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
      ))
      .slice(0, 20)
  );
}

function knowledgeCitationFrom(value: unknown): KnowledgeCitation | null {
  const source = recordFrom(value);
  const sourceLink = recordFrom(source?.source);
  const id = cleanText(source?.id, 80);
  const knowledgeBaseId = cleanText(source?.knowledgeBaseId, 160);
  const knowledgeBaseName = cleanText(source?.knowledgeBaseName, 240);
  const documentId = cleanText(source?.documentId, 160);
  const documentName = cleanText(source?.documentName, 500);
  const chunkId = cleanText(source?.chunkId, 160);
  const openPath = cleanText(sourceLink?.openPath, 2048);
  const downloadPath = cleanText(sourceLink?.downloadPath, 2048);
  const chunkOrdinal = Number(source?.chunkOrdinal);
  const score = Number(source?.score);
  if (
    !id || !knowledgeBaseId || !knowledgeBaseName || !documentId || !documentName || !chunkId ||
    !openPath || !downloadPath || source?.mode !== "vector" || sourceLink?.method !== "GET" ||
    !Number.isSafeInteger(chunkOrdinal) || chunkOrdinal < 0 || !Number.isFinite(score)
  ) {
    return null;
  }
  return {
    id,
    knowledgeBaseId,
    knowledgeBaseName,
    documentId,
    documentName,
    chunkId,
    chunkOrdinal,
    locator: safeLocator(source.locator),
    score,
    mode: "vector",
    source: { method: "GET", openPath, downloadPath }
  };
}

export function mergeKnowledgeCitations(...groups: ReadonlyArray<readonly KnowledgeCitation[]>) {
  const citations = new Map<string, KnowledgeCitation>();
  groups.flat().forEach((citation) => {
    const key = `${citation.knowledgeBaseId}:${citation.documentId}:${citation.chunkId}`;
    if (!citations.has(key)) citations.set(key, citation);
  });
  return [...citations.values()];
}

export function knowledgeCitationsFromResult(result: GenerationResult | null | undefined) {
  const raw = recordFrom(result?.raw);
  const values = raw?.knowledgeCitations;
  if (!Array.isArray(values)) return [];
  return values
    .map(knowledgeCitationFrom)
    .filter((citation): citation is KnowledgeCitation => citation !== null);
}

export function withKnowledgeCitations(
  result: GenerationResult,
  citations: readonly KnowledgeCitation[]
) {
  const merged = mergeKnowledgeCitations(knowledgeCitationsFromResult(result), citations);
  if (!merged.length) return result;
  return {
    ...result,
    raw: {
      ...(recordFrom(result.raw) || {}),
      knowledgeCitations: merged
    }
  };
}

export function agentTraceFromResult(result: GenerationResult | null | undefined) {
  const raw = recordFrom(result?.raw);
  const values = raw?.toolTrace;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value): AgentTraceEvent[] => {
    const source = recordFrom(value);
    const status = source?.status;
    const id = cleanText(source?.id, 160);
    const toolName = cleanText(source?.toolName, 160);
    const label = cleanText(source?.label, 240);
    if (!id || !toolName || !label || (status !== "completed" && status !== "failed")) return [];
    return [{
      id,
      toolName,
      label,
      argumentsPreview: cleanText(source?.argumentsPreview, 2000),
      resultPreview: cleanText(source?.resultPreview, 4000),
      status,
      createdAt: cleanText(source?.createdAt, 80)
    }];
  });
}
