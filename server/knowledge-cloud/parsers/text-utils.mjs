import crypto from "node:crypto";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function normalizeExtractedText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function requireMeaningfulBlocks(blocks, { needsOcr = false } = {}) {
  const normalized = blocks
    .map((block) => ({ ...block, text: normalizeExtractedText(block.text) }))
    .filter((block) => block.text.length > 0);
  if (normalized.length) return normalized;
  if (needsOcr) return [];
  throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_EMPTY, "文档中没有可提取的文本");
}

export function splitTextByUtf8Bytes(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return [text];
  const parts = [];
  let current = "";
  let currentBytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (current && currentBytes + characterBytes > maxBytes) {
      parts.push(current.trim());
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

export function createPersistedChunks(blocks, limits, { cryptoModule = crypto } = {}) {
  const chunks = [];
  for (const block of blocks) {
    const parts = splitTextByUtf8Bytes(block.text, limits.maxChunkBytes);
    for (let part = 0; part < parts.length; part += 1) {
      const textContent = parts[part];
      const textBytes = Buffer.byteLength(textContent, "utf8");
      const sourceLocator = parts.length > 1
        ? { ...block.locator, part: part + 1, parts: parts.length }
        : block.locator;
      const serializedLocator = JSON.stringify(sourceLocator);
      if (Buffer.byteLength(serializedLocator, "utf8") > 2048) {
        throw parserLimit("sourceLocatorBytes", { max: 2048 });
      }
      chunks.push({
        id: cryptoModule.randomUUID(),
        ordinal: chunks.length,
        text_content: textContent,
        text_bytes: textBytes,
        token_estimate: Math.max(1, Math.ceil([...textContent].length / 4)),
        source_locator: sourceLocator,
        content_hash: crypto
          .createHash("sha256")
          .update(textContent, "utf8")
          .update("\0")
          .update(serializedLocator, "utf8")
          .digest("hex")
      });
      if (chunks.length > limits.maxChunksPerDocument) {
        throw parserLimit("maxChunksPerDocument", { max: limits.maxChunksPerDocument });
      }
    }
  }
  return chunks;
}

export function createNormalizedArtifact(parserVersion, mimeType, blocks, limits) {
  const header = JSON.stringify({
    schema: "xi-ai-normalized-document/v1",
    parserVersion,
    mimeType
  });
  const body = blocks.map((block) => JSON.stringify({
    text: block.text,
    sourceLocator: block.locator
  }));
  const buffer = Buffer.from(`${[header, ...body].join("\n")}\n`, "utf8");
  if (buffer.byteLength > limits.maxNormalizedBytes) {
    throw parserLimit("maxNormalizedBytes", {
      actual: buffer.byteLength,
      max: limits.maxNormalizedBytes
    });
  }
  return buffer;
}
