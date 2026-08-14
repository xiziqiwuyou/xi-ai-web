# Knowledge RAG Evaluation

The deterministic evaluator measures retrieval quality without storing query text, document text, provider credentials, or signed source URLs.

Run it against a sanitized fixture:

```powershell
node scripts/knowledge-rag-eval.mjs tests/fixtures/knowledge-rag-evaluation.sample.json 10
```

The package scripts expose the same evaluator without changing its fixture or report contract:

```powershell
npm run knowledge:rag-eval -- tests/fixtures/knowledge-rag-evaluation.sample.json 10
npm run knowledge:rag-eval:sample
```

Each case contains:

- `id`: a bounded non-secret test identifier;
- `answerable`: whether the corpus is expected to contain evidence;
- `expectedChunkIds`: accepted relevant chunk identifiers;
- `returned`: ranked chunk identifiers plus whether citation authorization succeeded;
- `latencyMs`: end-to-end retrieval latency for the test run.

The report includes Recall@K, mean reciprocal rank, no-answer accuracy, citation correctness, and p50/p95 latency. Keep the fixture independent from production UUIDs and never include document content or API Keys.

This evaluator is a regression gate, not a production analytics store. A staging runner may project sanitized retrieval traces into this format, but the project must not persist user questions or chunk text merely to calculate these metrics.
