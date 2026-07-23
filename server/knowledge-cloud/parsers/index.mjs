import fs from "node:fs/promises";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parseOfficeDocument } from "./office.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";
import { parsePdf } from "./pdf.mjs";
import {
  parseCsv,
  parseHtml,
  parseJson,
  parseMarkdown,
  parsePlainText
} from "./structured.mjs";

export const KNOWLEDGE_PARSER_VERSION = "knowledge-parser/1";

const DOCUMENT_TYPES = Object.freeze({
  ".pdf": {
    kind: "pdf",
    mimeType: "application/pdf",
    declared: ["application/pdf"]
  },
  ".docx": {
    kind: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    declared: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
  },
  ".xlsx": {
    kind: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    declared: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
  },
  ".pptx": {
    kind: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    declared: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
  },
  ".txt": { kind: "text", mimeType: "text/plain", declared: ["text/plain"] },
  ".md": { kind: "markdown", mimeType: "text/markdown", declared: ["text/markdown", "text/plain"] },
  ".markdown": { kind: "markdown", mimeType: "text/markdown", declared: ["text/markdown", "text/plain"] },
  ".csv": { kind: "csv", mimeType: "text/csv", declared: ["text/csv", "application/csv", "text/plain"] },
  ".json": { kind: "json", mimeType: "application/json", declared: ["application/json", "text/json"] },
  ".html": { kind: "html", mimeType: "text/html", declared: ["text/html", "application/xhtml+xml"] },
  ".htm": { kind: "html", mimeType: "text/html", declared: ["text/html", "application/xhtml+xml"] }
});

function validateDeclaredMimeType(definition, declaredMimeType) {
  const declared = String(declaredMimeType || "").trim().toLowerCase();
  if (!definition.declared.includes(declared)) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH, "声明的 MIME 类型与文件扩展名不一致", {
      details: { declaredMimeType: declared, expectedMimeType: definition.mimeType }
    });
  }
}

function validateDetectedType(definition, detected) {
  if (["text", "markdown", "csv", "json", "html"].includes(definition.kind)) {
    if (detected) {
      throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH, "文件内容签名与文本类型不一致", {
        details: { detectedMimeType: detected.mime }
      });
    }
    return;
  }
  if (definition.kind === "pdf") {
    if (detected?.mime !== "application/pdf") {
      throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH, "文件内容不是有效的 PDF", {
        details: { detectedMimeType: detected?.mime || null }
      });
    }
    return;
  }
  const officeMimes = new Set([
    definition.mimeType,
    "application/zip",
    "application/x-zip-compressed"
  ]);
  if (detected && !officeMimes.has(detected.mime)) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH, "文件内容不是有效的 Office 文档", {
      details: { detectedMimeType: detected.mime }
    });
  }
}

export async function parseKnowledgeDocument({
  filePath,
  displayName,
  declaredMimeType,
  limits
}) {
  const extension = path.extname(String(displayName || "")).toLowerCase();
  const definition = DOCUMENT_TYPES[extension];
  if (!definition) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_UNSUPPORTED, "不支持此文档类型", {
      details: { extension: extension || null }
    });
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 1) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_EMPTY, "上传文件为空");
  }
  if (stat.size > limits.maxSourceBytes) {
    throw parserLimit("maxSourceBytes", { actual: stat.size, max: limits.maxSourceBytes });
  }
  validateDeclaredMimeType(definition, declaredMimeType);
  const detected = await fileTypeFromFile(filePath);
  validateDetectedType(definition, detected);

  let blocks;
  let needsOcr = false;
  if (definition.kind === "pdf") {
    const result = await parsePdf(filePath, limits);
    blocks = result.blocks;
    needsOcr = result.needsOcr;
  } else if (["docx", "xlsx", "pptx"].includes(definition.kind)) {
    blocks = await parseOfficeDocument(filePath, definition.kind, limits);
  } else if (definition.kind === "markdown") {
    blocks = await parseMarkdown(filePath, limits);
  } else if (definition.kind === "csv") {
    blocks = await parseCsv(filePath, limits);
  } else if (definition.kind === "json") {
    blocks = await parseJson(filePath, limits);
  } else if (definition.kind === "html") {
    blocks = await parseHtml(filePath, limits);
  } else {
    blocks = await parsePlainText(filePath, limits);
  }
  return {
    parserVersion: KNOWLEDGE_PARSER_VERSION,
    mimeType: definition.mimeType,
    blocks,
    needsOcr
  };
}

export function supportedKnowledgeDocumentTypes() {
  return Object.entries(DOCUMENT_TYPES).map(([extension, definition]) => ({
    extension,
    mimeType: definition.mimeType
  }));
}
