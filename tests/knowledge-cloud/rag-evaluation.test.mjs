import assert from "node:assert/strict";
import test from "node:test";
import { evaluateKnowledgeRetrievalCases } from "../../scripts/knowledge-rag-eval.mjs";

test("knowledge RAG evaluation reports deterministic retrieval and citation metrics", () => {
  const report = evaluateKnowledgeRetrievalCases({
    cases: [
      {
        id: "answer-1",
        answerable: true,
        expectedChunkIds: ["chunk-a", "chunk-b"],
        returned: [
          { chunkId: "chunk-x", citationAuthorized: true },
          { chunkId: "chunk-a", citationAuthorized: true },
          { chunkId: "chunk-b", citationAuthorized: false }
        ],
        latencyMs: 120
      },
      {
        id: "answer-2",
        expectedChunkIds: ["chunk-c"],
        returned: [{ chunkId: "chunk-c", citationAuthorized: true }],
        latencyMs: 80
      },
      {
        id: "no-answer",
        answerable: false,
        expectedChunkIds: [],
        returned: [],
        latencyMs: 40
      }
    ]
  }, { k: 2 });

  assert.equal(report.schema, "xi-ai-knowledge-rag-evaluation/v1");
  assert.equal(report.metrics.recallAtK, 0.75);
  assert.equal(report.metrics.mrr, 0.75);
  assert.equal(report.metrics.noAnswerAccuracy, 1);
  assert.equal(report.metrics.citationCorrectness, 0.5);
  assert.equal(report.metrics.latencyMsP50, 80);
  assert.equal(report.metrics.latencyMsP95, 120);
});

test("knowledge RAG evaluation rejects unbounded or incomplete fixtures", () => {
  assert.throws(
    () => evaluateKnowledgeRetrievalCases({ cases: [{ id: "missing", expectedChunkIds: [], returned: [] }] }),
    /requires expectedChunkIds/u
  );
  assert.throws(
    () => evaluateKnowledgeRetrievalCases({ cases: [{ id: "bad\nvalue", answerable: false }] }),
    /bounded identifier/u
  );
});
