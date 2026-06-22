function dotProduct(left, right) {
  const length = Math.min(left.length, right.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Number(left[index]) * Number(right[index]);
  return total;
}

function magnitude(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length) return 0;
  const divisor = magnitude(left) * magnitude(right);
  return divisor ? dotProduct(left, right) / divisor : 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function lexicalScore(query, text) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const textValue = String(text || "").toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (textValue.includes(token)) score += 1;
  }
  return score / queryTokens.length;
}

export function rankChunks(chunks, scoreFn, topK = 5) {
  return chunks
    .map((chunk) => ({ ...chunk, score: scoreFn(chunk) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
