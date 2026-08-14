import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Activity,
  CircleAlert,
  Database,
  FileSearch,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { ApiError, api } from "../../api";
import type {
  KnowledgeBase,
  KnowledgeRetrievalFilterReason,
  KnowledgeRetrievalLabResult,
  KnowledgeRetrievalMode
} from "../../types";
import KnowledgeCitationList from "./KnowledgeCitationList";
import {
  knowledgeEmbeddingConnectionsForBases,
  missingKnowledgeEmbeddingVendors,
  maximumSelectedKnowledgeBases
} from "./integrationState";

type KnowledgeRetrievalLabProps = {
  bases: KnowledgeBase[];
  selectedBaseId: string;
  csrfToken: string;
};

const modes: ReadonlyArray<{ value: KnowledgeRetrievalMode; label: string }> = [
  { value: "vector", label: "向量" },
  { value: "fulltext", label: "全文" },
  { value: "hybrid", label: "混合" }
];

const filterReasonLabels: Record<KnowledgeRetrievalFilterReason, string> = {
  minimum_relevance: "低于相关度",
  adjacent_chunk: "相邻分块抑制",
  top_k: "超出 Top K",
  token_budget: "超出 Token 预算"
};

const vendorLabels = {
  openai: "OpenAI",
  qwen: "通义千问"
} as const;

function retrievalReady(base: KnowledgeBase) {
  return base.status === "active" &&
    base.activeIndexVersion !== null &&
    base.readyDocumentCount > 0;
}

function initialBaseIds(bases: KnowledgeBase[], selectedBaseId: string) {
  const selected = bases.find((base) => base.id === selectedBaseId && retrievalReady(base));
  if (selected) return [selected.id];
  const firstReady = bases.find(retrievalReady);
  return firstReady ? [firstReady.id] : [];
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "检索测试失败";
}

function formatMilliseconds(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value < 10 ? `${value.toFixed(2)} ms` : `${value.toFixed(1)} ms`;
}

function formatScore(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(4);
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function KnowledgeRetrievalLab({
  bases,
  selectedBaseId,
  csrfToken
}: KnowledgeRetrievalLabProps) {
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>(
    () => initialBaseIds(bases, selectedBaseId)
  );
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<KnowledgeRetrievalMode>("vector");
  const [topK, setTopK] = useState(5);
  const [candidateCount, setCandidateCount] = useState(20);
  const [minimumRelevance, setMinimumRelevance] = useState(0);
  const [contextTokenBudget, setContextTokenBudget] = useState(2048);
  const [result, setResult] = useState<KnowledgeRetrievalLabResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const readyBaseIds = useMemo(
    () => new Set(bases.filter(retrievalReady).map((base) => base.id)),
    [bases]
  );
  const baseById = useMemo(
    () => new Map(bases.map((base) => [base.id, base])),
    [bases]
  );
  const missingVendors = mode === "fulltext"
    ? []
    : missingKnowledgeEmbeddingVendors(selectedBaseIds, bases);
  const parametersValid = topK >= 1 && topK <= 20 &&
    candidateCount >= 1 && candidateCount <= 100 &&
    minimumRelevance >= 0 && minimumRelevance <= 1 &&
    contextTokenBudget >= 64 && contextTokenBudget <= 32768;
  const canRun = Boolean(
    query.trim() &&
    selectedBaseIds.length &&
    selectedBaseIds.every((baseId) => readyBaseIds.has(baseId)) &&
    !missingVendors.length &&
    parametersValid &&
    !running
  );

  useEffect(() => {
    setSelectedBaseIds(initialBaseIds(bases, selectedBaseId));
    setResult(null);
    setError("");
  }, [bases, selectedBaseId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleBase = (baseId: string) => {
    if (!readyBaseIds.has(baseId) || running) return;
    setSelectedBaseIds((current) => {
      if (current.includes(baseId)) return current.filter((id) => id !== baseId);
      if (current.length >= maximumSelectedKnowledgeBases) return current;
      return [...current, baseId];
    });
    setResult(null);
    setError("");
  };

  const invalidateResult = () => {
    setResult(null);
    setError("");
  };

  const runRetrieval = async (event: FormEvent) => {
    event.preventDefault();
    if (!canRun) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const embeddingConnections = mode === "fulltext"
        ? undefined
        : knowledgeEmbeddingConnectionsForBases(selectedBaseIds, bases);
      const response = await api.runKnowledgeRetrievalLab(csrfToken, {
        query: query.trim(),
        knowledgeBaseIds: selectedBaseIds,
        ...(embeddingConnections ? { embeddingConnections } : {}),
        mode,
        topK,
        candidateCount,
        minimumRelevance,
        contextTokenBudget,
        trace: true
      }, controller.signal);
      if (!response.trace) throw new Error("检索服务未返回追踪信息");
      setResult(response);
    } catch (nextError: unknown) {
      if (!controller.signal.aborted) setError(errorMessage(nextError));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(false);
      }
    }
  };

  const cancelRetrieval = () => {
    abortRef.current?.abort();
  };

  const citationByChunkId = useMemo(
    () => new Map(result?.citations.map((citation) => [citation.chunkId, citation]) || []),
    [result]
  );

  return (
    <section className="knowledge-retrieval-lab" aria-labelledby="knowledge-retrieval-lab-title">
      <header className="knowledge-retrieval-heading">
        <div>
          <span className="knowledge-detail-icon"><FileSearch size={18} /></span>
          <span><h3 id="knowledge-retrieval-lab-title">检索实验室</h3><small>仅本次测试</small></span>
        </div>
        {result ? <span className="knowledge-retrieval-run-id">{formatMilliseconds(result.trace.timing.totalMs)}</span> : null}
      </header>

      <form className="knowledge-retrieval-form" onSubmit={(event) => void runRetrieval(event)}>
        <fieldset className="knowledge-retrieval-bases">
          <legend>知识库 <span>{selectedBaseIds.length}/{maximumSelectedKnowledgeBases}</span></legend>
          <div>
            {bases.map((base) => {
              const ready = readyBaseIds.has(base.id);
              const checked = selectedBaseIds.includes(base.id);
              return (
                <label key={base.id} className={checked ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready || running || (!checked && selectedBaseIds.length >= maximumSelectedKnowledgeBases)}
                    onChange={() => toggleBase(base.id)}
                  />
                  <Database size={14} aria-hidden="true" />
                  <span><strong>{base.name}</strong><small>{ready ? `${base.readyDocumentCount} 份可检索文档` : "索引未就绪"}</small></span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="knowledge-retrieval-modes">
          <legend>检索模式</legend>
          <div>
            {modes.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={mode === option.value}
                disabled={running}
                onClick={() => {
                  setMode(option.value);
                  invalidateResult();
                }}
              >{option.label}</button>
            ))}
          </div>
        </fieldset>

        <div className="knowledge-retrieval-parameters" aria-label="检索参数">
          <label><span>Top K</span><input type="number" min="1" max="20" step="1" value={topK} disabled={running} onChange={(event) => { setTopK(Number(event.target.value)); invalidateResult(); }} /></label>
          <label><span>候选数</span><input type="number" min="1" max="100" step="1" value={candidateCount} disabled={running} onChange={(event) => { setCandidateCount(Number(event.target.value)); invalidateResult(); }} /></label>
          <label><span>最低相关度</span><input type="number" min="0" max="1" step="0.05" value={minimumRelevance} disabled={running} onChange={(event) => { setMinimumRelevance(Number(event.target.value)); invalidateResult(); }} /></label>
          <label><span>Token 预算</span><input type="number" min="64" max="32768" step="64" value={contextTokenBudget} disabled={running} onChange={(event) => { setContextTokenBudget(Number(event.target.value)); invalidateResult(); }} /></label>
        </div>

        <label className="knowledge-retrieval-query">
          <span>测试查询</span>
          <textarea
            value={query}
            maxLength={2048}
            rows={3}
            disabled={running}
            onChange={(event) => {
              setQuery(event.target.value);
              invalidateResult();
            }}
          />
        </label>

        {missingVendors.length ? (
          <p className="knowledge-retrieval-inline-error" role="alert">
            <CircleAlert size={15} />缺少 {missingVendors.map((vendor) => vendorLabels[vendor]).join("、")} Embedding 连接
          </p>
        ) : null}
        {!parametersValid ? <p className="knowledge-retrieval-inline-error" role="alert"><CircleAlert size={15} />检索参数超出允许范围</p> : null}

        <div className="knowledge-retrieval-actions">
          <span><SlidersHorizontal size={14} />{mode === "fulltext" ? "无需 Embedding Key" : `${selectedBaseIds.length} 个知识库`}</span>
          {running ? (
            <button type="button" className="knowledge-workspace-button" onClick={cancelRetrieval}><X size={15} />停止</button>
          ) : (
            <button type="submit" className="knowledge-workspace-button primary" disabled={!canRun}><Search size={15} />运行检索</button>
          )}
        </div>
      </form>

      {error ? <p className="knowledge-retrieval-error" role="alert"><CircleAlert size={16} />{error}</p> : null}
      {running ? <div className="knowledge-retrieval-running" role="status"><LoaderCircle className="knowledge-cloud-spin" size={17} />正在检索</div> : null}

      {result ? (
        <div className="knowledge-retrieval-result">
          <section className="knowledge-retrieval-summary" aria-label="检索摘要">
            <div className="knowledge-retrieval-queries">
              <span><small>原始查询</small><strong>{result.trace.originalQuery}</strong></span>
              <span><small>有效查询</small><strong>{result.trace.effectiveQuery}</strong></span>
            </div>
            <dl>
              <div><dt>模式</dt><dd>{modes.find((item) => item.value === result.mode)?.label || result.mode}</dd></div>
              <div><dt>候选</dt><dd>{result.trace.stages.filter.fusedCandidates}</dd></div>
              <div><dt>入选</dt><dd>{result.trace.stages.context.selectedCandidates}</dd></div>
              <div><dt>上下文</dt><dd>{result.contextTokens}/{result.contextTokenBudget} Token</dd></div>
              <div><dt>截断</dt><dd>{result.contextTruncated ? "是" : "否"}</dd></div>
            </dl>
          </section>

          <section className="knowledge-retrieval-stages" aria-labelledby="knowledge-retrieval-stages-title">
            <header><Activity size={15} /><h4 id="knowledge-retrieval-stages-title">阶段追踪</h4></header>
            <dl>
              <div><dt>预检</dt><dd>{formatMilliseconds(result.trace.stages.preflight.durationMs)}</dd><small>{result.trace.stages.preflight.baseCount} 个知识库</small></div>
              <div><dt>查询向量</dt><dd>{formatMilliseconds(result.trace.stages.embedding.durationMs)}</dd><small>{result.trace.stages.embedding.groupCount} 个配置组</small></div>
              <div><dt>召回</dt><dd>{formatMilliseconds(result.trace.stages.recall.durationMs)}</dd><small>向量 {result.trace.stages.recall.vectorCandidates} · 全文 {result.trace.stages.recall.fullTextCandidates}</small></div>
              <div><dt>过滤</dt><dd>{result.trace.stages.filter.fusedCandidates}</dd><small>阈值 {result.trace.stages.filter.belowMinimumRelevance} · 相邻 {result.trace.stages.filter.adjacentSuppressed}</small></div>
              <div><dt>上下文</dt><dd>{result.trace.stages.context.selectedCandidates}</dd><small>{result.trace.stages.context.contextTokens}/{result.trace.stages.context.tokenBudget} Token</small></div>
            </dl>
          </section>

          <section className="knowledge-retrieval-candidates" aria-labelledby="knowledge-retrieval-candidates-title">
            <header><h4 id="knowledge-retrieval-candidates-title">候选明细</h4><span>{result.trace.candidates.length}</span></header>
            <ol>
              {result.trace.candidates.map((candidate) => {
                const citation = citationByChunkId.get(candidate.chunkId);
                return (
                  <li key={`${candidate.knowledgeBaseId}:${candidate.documentId}:${candidate.chunkId}`} className={candidate.selected ? "selected" : "filtered"}>
                    <div className="knowledge-retrieval-candidate-copy">
                      <strong>{citation ? `[${citation.id}] ${citation.documentName}` : `分块 ${shortId(candidate.chunkId)}`}</strong>
                      <small title={candidate.documentId}>{baseById.get(candidate.knowledgeBaseId)?.name || shortId(candidate.knowledgeBaseId)} · 文档 {shortId(candidate.documentId)}</small>
                    </div>
                    <dl className="knowledge-retrieval-scores">
                      <div><dt>向量分</dt><dd>{formatScore(candidate.scores.vector)}</dd></div>
                      <div><dt>向量排名</dt><dd>{candidate.ranks.vector ?? "-"}</dd></div>
                      <div><dt>全文分</dt><dd>{formatScore(candidate.scores.fulltext)}</dd></div>
                      <div><dt>全文排名</dt><dd>{candidate.ranks.fulltext ?? "-"}</dd></div>
                      <div><dt>相关度</dt><dd>{formatScore(candidate.scores.relevance)}</dd></div>
                      <div><dt>RRF</dt><dd>{formatScore(candidate.scores.rrf)}</dd></div>
                    </dl>
                    <span className={candidate.selected ? "accepted" : "rejected"}>
                      {candidate.selected ? `已入选${candidate.citationId ? ` · ${candidate.citationId}` : ""}` : candidate.filteredReason ? filterReasonLabels[candidate.filteredReason] : "已过滤"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {result.citations.length ? (
            <section className="knowledge-retrieval-final" aria-label="最终引用">
              <KnowledgeCitationList citations={result.citations} />
              <details>
                <summary>最终上下文</summary>
                <pre>{result.context}</pre>
              </details>
            </section>
          ) : (
            <div className="knowledge-retrieval-no-result" role="status">
              <CircleAlert size={20} />
              <span><strong>未检索到可靠结果</strong><small>没有生成知识回答或引用</small></span>
            </div>
          )}

          <section className="knowledge-retrieval-profiles" aria-label="检索配置指纹">
            <header><h4>配置指纹</h4><span>{result.trace.profiles.length}</span></header>
            <div>
              {result.trace.profiles.map((profile) => (
                <span key={`${profile.fingerprint}:${profile.indexVersions.join(",")}`}>
                  <code>{profile.fingerprint}</code>
                  <small>{profile.dimensions} 维 · 索引 v{profile.indexVersions.join(" / v")} · {profile.knowledgeBaseIds.length} 库</small>
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
