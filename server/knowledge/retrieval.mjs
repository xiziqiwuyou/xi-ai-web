import { chunkText } from "./chunk-text.mjs";
import { cosineSimilarity, lexicalScore, rankChunks } from "./vector-store.mjs";

function normalizeChunk(chunk, index) {
  if (!chunk || typeof chunk !== "object") return null;
  const text = String(chunk.text || "").trim();
  if (!text) return null;
  return {
    id: String(chunk.id || `chunk-${index}`),
    index: Number.isFinite(Number(chunk.index)) ? Number(chunk.index) : index,
    documentId: chunk.documentId ? String(chunk.documentId) : undefined,
    documentName: chunk.documentName ? String(chunk.documentName) : undefined,
    text
  };
}

export async function retrieveContext({ query, context, chunks: inputChunks, embed, topK = 5 }) {
  const preparedChunks = Array.isArray(inputChunks)
    ? inputChunks.map(normalizeChunk).filter(Boolean)
    : [];
  const pastedChunks = context ? chunkText(context) : [];
  const chunks = [...preparedChunks, ...pastedChunks];
  if (!chunks.length) return { chunks: [], mode: "empty" };

  if (embed) {
    const texts = [query, ...chunks.map((chunk) => chunk.text)];
    const result = await embed(texts);
    const embeddings = Array.isArray(result?.embeddings) ? result.embeddings : [];
    if (embeddings.length === texts.length) {
      const [queryVector, ...chunkVectors] = embeddings;
      return {
        chunks: rankChunks(
          chunks.map((chunk, index) => ({ ...chunk, vector: chunkVectors[index] })),
          (chunk) => cosineSimilarity(queryVector, chunk.vector),
          topK
        ),
        mode: "embedding",
        usage: result.usage
      };
    }
  }

  return {
    chunks: rankChunks(chunks, (chunk) => lexicalScore(query, chunk.text), topK),
    mode: "lexical"
  };
}

export function formatRetrievedContext(chunks = []) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.documentName ? ` Source: ${chunk.documentName}` : "";
      const chunkIndex = Number.isFinite(Number(chunk.index)) ? ` Chunk: ${Number(chunk.index) + 1}` : "";
      return `[${index + 1}]${source}${chunkIndex}\n${chunk.text}`;
    })
    .join("\n\n");
}
