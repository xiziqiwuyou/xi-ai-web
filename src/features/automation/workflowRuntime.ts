import type { KnowledgeDocument } from "../../types";

const maxTemplateLength = 12000;
const maxKnowledgeOutputLength = 12000;

export function renderWorkflowTemplate(template: string, task: string, input: string) {
  return template
    .slice(0, maxTemplateLength)
    .replaceAll("{{task}}", task)
    .replaceAll("{{input}}", input)
    .trim()
    .slice(0, maxTemplateLength);
}

function queryTerms(value: string) {
  const normalized = value.toLocaleLowerCase().slice(0, 4000);
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const terms = new Set(words.filter((word) => word.length > 1));
  for (const word of words) {
    if (!/[\p{Script=Han}]/u.test(word) || word.length < 3) continue;
    for (let index = 0; index < word.length - 1; index += 1) {
      terms.add(word.slice(index, index + 2));
    }
  }
  return [...terms].slice(0, 80);
}

function occurrenceCount(value: string, term: string) {
  let count = 0;
  let offset = 0;
  while (count < 12) {
    const index = value.indexOf(term, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + term.length;
  }
  return count;
}

export type WorkflowKnowledgeMatch = {
  documentId: string;
  documentName: string;
  chunkId: string;
  index: number;
  score: number;
  text: string;
};

export function retrieveWorkflowKnowledge(
  documents: KnowledgeDocument[],
  documentIds: string[],
  query: string,
  topK = 4
) {
  const selectedIds = new Set(documentIds);
  const terms = queryTerms(query);
  const normalizedQuery = query.trim().toLocaleLowerCase().slice(0, 800);
  const limit = Math.max(1, Math.min(12, Math.round(topK) || 4));
  const matches = documents
    .filter((document) => selectedIds.has(document.id))
    .flatMap((document) => document.chunks.map((chunk): WorkflowKnowledgeMatch => {
      const text = chunk.text.slice(0, 2400);
      const searchable = `${document.name}\n${text}`.toLocaleLowerCase();
      const exactBoost = normalizedQuery.length > 2 && searchable.includes(normalizedQuery) ? 24 : 0;
      const termScore = terms.reduce((score, term) => score + occurrenceCount(searchable, term), 0);
      const titleScore = terms.reduce((score, term) => score + (document.name.toLocaleLowerCase().includes(term) ? 3 : 0), 0);
      return {
        documentId: document.id,
        documentName: document.name,
        chunkId: chunk.id,
        index: chunk.index,
        score: exactBoost + termScore + titleScore,
        text
      };
    }))
    .sort((left, right) => right.score - left.score || left.documentName.localeCompare(right.documentName) || left.index - right.index);

  const ranked = matches.some((match) => match.score > 0)
    ? matches.filter((match) => match.score > 0).slice(0, limit)
    : matches.slice(0, limit);
  const text = ranked.map((match) => (
    `[${match.documentName} · 片段 ${match.index + 1}]\n${match.text.slice(0, 1200)}`
  )).join("\n\n").slice(0, maxKnowledgeOutputLength);

  return { text, matches: ranked };
}
