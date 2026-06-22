import crypto from "node:crypto";

function redactSecrets(text) {
  return String(text || "")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted-api-key]")
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g, "[redacted-token]");
}

function normalizeText(text) {
  return redactSecrets(text).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function chunkText(text, { maxChars = 900, overlapChars = 120 } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (!value) return;
    chunks.push({
      id: crypto.createHash("sha1").update(`${chunks.length}:${value}`).digest("hex"),
      index: chunks.length,
      text: value
    });
    buffer = value.slice(Math.max(0, value.length - overlapChars));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let index = 0; index < paragraph.length; index += maxChars - overlapChars) {
        const textChunk = paragraph.slice(index, index + maxChars).trim();
        if (textChunk) {
          chunks.push({
            id: crypto.createHash("sha1").update(`${chunks.length}:${textChunk}`).digest("hex"),
            index: chunks.length,
            text: textChunk
          });
        }
      }
      buffer = "";
      continue;
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) flush();
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush();
  return chunks;
}
