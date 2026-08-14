import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_FIXTURE_BYTES = 4 * 1024 * 1024;
const MAX_CASES = 10_000;
const MAX_RESULTS_PER_CASE = 200;

function boundedId(value, label) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 200 || /[\u0000-\u001f\u007f]/u.test(id)) {
    throw new TypeError(`${label} must be a bounded identifier`);
  }
  return id;
}

function finiteNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be non-negative`);
  return number;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

function roundMetric(value) {
  return Number(value.toFixed(6));
}

function normalizeCase(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`cases[${index}] must be an object`);
  }
  const expected = Array.isArray(value.expectedChunkIds)
    ? [...new Set(value.expectedChunkIds.map((id, idIndex) => boundedId(id, `cases[${index}].expectedChunkIds[${idIndex}]`)))]
    : [];
  const returned = Array.isArray(value.returned)
    ? value.returned.slice(0, MAX_RESULTS_PER_CASE).map((entry, resultIndex) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new TypeError(`cases[${index}].returned[${resultIndex}] must be an object`);
        }
        return {
          chunkId: boundedId(entry.chunkId, `cases[${index}].returned[${resultIndex}].chunkId`),
          citationAuthorized: entry.citationAuthorized !== false
        };
      })
    : [];
  const answerable = value.answerable !== false;
  if (answerable && expected.length === 0) {
    throw new TypeError(`cases[${index}] requires expectedChunkIds when answerable`);
  }
  return {
    id: boundedId(value.id ?? `case-${index + 1}`, `cases[${index}].id`),
    answerable,
    expected,
    returned,
    latencyMs: finiteNonNegative(value.latencyMs ?? 0, `cases[${index}].latencyMs`)
  };
}

export function evaluateKnowledgeRetrievalCases(input, { k = 10 } = {}) {
  const cases = Array.isArray(input) ? input : input?.cases;
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > MAX_CASES) {
    throw new TypeError(`cases must contain 1 to ${MAX_CASES} entries`);
  }
  const topK = Math.min(MAX_RESULTS_PER_CASE, Math.max(1, Math.trunc(Number(k) || 10)));
  const normalized = cases.map(normalizeCase);
  let recallTotal = 0;
  let reciprocalRankTotal = 0;
  let answerableCount = 0;
  let noAnswerCorrect = 0;
  let noAnswerCount = 0;
  let correctCitations = 0;
  let citationCount = 0;

  const results = normalized.map((entry) => {
    const expected = new Set(entry.expected);
    const ranked = entry.returned.slice(0, topK);
    const relevant = ranked.filter((result) => expected.has(result.chunkId));
    const firstRelevantIndex = ranked.findIndex((result) => expected.has(result.chunkId));
    const recall = entry.answerable ? relevant.length / expected.size : 0;
    const reciprocalRank = firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0;
    if (entry.answerable) {
      answerableCount += 1;
      recallTotal += recall;
      reciprocalRankTotal += reciprocalRank;
    } else {
      noAnswerCount += 1;
      if (entry.returned.length === 0) noAnswerCorrect += 1;
    }
    for (const result of entry.returned) {
      citationCount += 1;
      if (result.citationAuthorized && expected.has(result.chunkId)) correctCitations += 1;
    }
    return {
      id: entry.id,
      recallAtK: roundMetric(recall),
      reciprocalRank: roundMetric(reciprocalRank),
      noAnswerCorrect: entry.answerable ? null : entry.returned.length === 0,
      latencyMs: entry.latencyMs
    };
  });

  const latencies = normalized.map((entry) => entry.latencyMs);
  return {
    schema: "xi-ai-knowledge-rag-evaluation/v1",
    caseCount: normalized.length,
    k: topK,
    metrics: {
      recallAtK: roundMetric(answerableCount ? recallTotal / answerableCount : 0),
      mrr: roundMetric(answerableCount ? reciprocalRankTotal / answerableCount : 0),
      noAnswerAccuracy: roundMetric(noAnswerCount ? noAnswerCorrect / noAnswerCount : 1),
      citationCorrectness: roundMetric(citationCount ? correctCitations / citationCount : 1),
      latencyMsP50: percentile(latencies, 0.5),
      latencyMsP95: percentile(latencies, 0.95)
    },
    results
  };
}

export async function evaluateKnowledgeFixtureFile(filePath, options) {
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size < 2 || stat.size > MAX_FIXTURE_BYTES) {
    throw new TypeError(`fixture must be a JSON file no larger than ${MAX_FIXTURE_BYTES} bytes`);
  }
  return evaluateKnowledgeRetrievalCases(JSON.parse(await fs.readFile(resolved, "utf8")), options);
}

async function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) throw new TypeError("Usage: node scripts/knowledge-rag-eval.mjs <fixture.json> [k]");
  const report = await evaluateKnowledgeFixtureFile(fixturePath, { k: process.argv[3] });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Knowledge RAG evaluation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
