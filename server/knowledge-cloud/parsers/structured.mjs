import fs from "node:fs";
import fsp from "node:fs/promises";
import { parse as parseCsvStream } from "csv-parse";
import { parse as parseHtmlAst } from "parse5";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";
import { normalizeExtractedText, requireMeaningfulBlocks } from "./text-utils.mjs";

async function readUtf8(filePath, limits) {
  const buffer = await fsp.readFile(filePath);
  if (buffer.byteLength > limits.maxSourceBytes) {
    throw parserLimit("maxSourceBytes", {
      actual: buffer.byteLength,
      max: limits.maxSourceBytes
    });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch (error) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "文本文件不是有效的 UTF-8", {
      cause: error
    });
  }
}

export async function parsePlainText(filePath, limits) {
  const text = await readUtf8(filePath, limits);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  for (let start = 0; start < lines.length; start += 40) {
    const end = Math.min(lines.length, start + 40);
    const value = normalizeExtractedText(lines.slice(start, end).join("\n"));
    if (!value) continue;
    blocks.push({
      text: value,
      locator: { type: "text_lines", lineStart: start + 1, lineEnd: end }
    });
  }
  return requireMeaningfulBlocks(blocks);
}

export async function parseMarkdown(filePath, limits) {
  const text = await readUtf8(filePath, limits);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const headings = [];
  let blockStart = 0;
  let current = [];
  const flush = (lineEnd) => {
    const value = normalizeExtractedText(current.join("\n"));
    if (value) {
      blocks.push({
        text: value,
        locator: {
          type: "markdown_lines",
          lineStart: blockStart + 1,
          lineEnd,
          ...(headings.length ? { headingPath: headings.filter(Boolean) } : {})
        }
      });
    }
    current = [];
  };
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush(index);
      const level = heading[1].length;
      headings.splice(level - 1);
      headings[level - 1] = normalizeExtractedText(heading[2]).slice(0, 240);
      blockStart = index;
      current.push(line);
      return;
    }
    if (!line.trim() && current.length) {
      flush(index + 1);
      blockStart = index + 1;
      return;
    }
    if (!current.length) blockStart = index;
    current.push(line);
  });
  flush(lines.length);
  return requireMeaningfulBlocks(blocks);
}

export async function parseCsv(filePath, limits) {
  const parser = fs.createReadStream(filePath).pipe(parseCsvStream({
    bom: true,
    info: true,
    relax_column_count: true,
    relax_quotes: false,
    skip_empty_lines: true,
    max_record_size: Math.min(limits.maxSourceBytes, limits.maxNormalizedBytes)
  }));
  const blocks = [];
  let headers = [];
  let previousEndLine = 0;
  let row = 0;
  try {
    for await (const entry of parser) {
      const record = Array.isArray(entry.record) ? entry.record : [];
      row += 1;
      if (record.length > limits.maxCsvColumns) {
        throw parserLimit("maxCsvColumns", {
          actual: record.length,
          max: limits.maxCsvColumns
        });
      }
      if (row > limits.maxSpreadsheetRows) {
        throw parserLimit("maxSpreadsheetRows", {
          actual: row,
          max: limits.maxSpreadsheetRows
        });
      }
      const endLine = Number(entry.info?.lines) || previousEndLine + 1;
      const startLine = previousEndLine + 1;
      previousEndLine = endLine;
      const normalized = record.map((value) => normalizeExtractedText(value));
      if (row === 1) headers = normalized.slice(0, limits.maxCsvColumns).map((value) => value.slice(0, 120));
      const text = normalized.map((value, index) => {
        const label = headers[index] || `column_${index + 1}`;
        return `${label}: ${value}`;
      }).join(" | ");
      if (!normalizeExtractedText(text)) continue;
      blocks.push({
        text,
        locator: {
          type: "csv_rows",
          rowStart: row,
          rowEnd: row,
          lineStart: startLine,
          lineEnd: endLine,
          ...(headers.length ? { headers: headers.slice(0, 20).map((value) => value.slice(0, 64)) } : {})
        }
      });
    }
  } catch (error) {
    if (error?.code === KNOWLEDGE_ERROR_CODES.PARSER_RESOURCE_LIMIT) throw error;
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "CSV 文件格式无效", {
      cause: error
    });
  }
  return requireMeaningfulBlocks(blocks);
}

function jsonPathSegment(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`;
}

export async function parseJson(filePath, limits) {
  const text = await readUtf8(filePath, limits);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "JSON 文件格式无效", {
      cause: error
    });
  }
  const blocks = [];
  let nodes = 0;
  const visit = (current, currentPath, depth) => {
    nodes += 1;
    if (nodes > limits.maxJsonNodes) {
      throw parserLimit("maxJsonNodes", { actual: nodes, max: limits.maxJsonNodes });
    }
    if (depth > limits.maxJsonDepth) {
      throw parserLimit("maxJsonDepth", { actual: depth, max: limits.maxJsonDepth });
    }
    if (current === null || typeof current !== "object") {
      const rendered = typeof current === "string" ? current : JSON.stringify(current);
      const normalized = normalizeExtractedText(rendered);
      if (normalized) {
        blocks.push({
          text: `${currentPath}: ${normalized}`,
          locator: { type: "json_path", path: currentPath }
        });
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${currentPath}[${index}]`, depth + 1));
      return;
    }
    for (const [key, entry] of Object.entries(current)) {
      visit(entry, `${currentPath}${jsonPathSegment(key)}`, depth + 1);
    }
  };
  visit(value, "$", 0);
  return requireMeaningfulBlocks(blocks);
}

const HTML_IGNORED_TAGS = new Set(["script", "style", "noscript", "template", "svg", "math"]);
const HTML_BLOCK_TAGS = new Set(["p", "li", "blockquote", "pre", "td", "th", "dt", "dd"]);

export async function parseHtml(filePath, limits) {
  const text = await readUtf8(filePath, limits);
  let document;
  try {
    document = parseHtmlAst(text, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch (error) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "HTML 文件格式无效", {
      cause: error
    });
  }
  const blocks = [];
  const headingPath = [];
  let nodes = 0;
  let ordinal = 0;
  const counted = new WeakSet();
  const countNode = (node, depth) => {
    if (depth > limits.maxHtmlDepth) {
      throw parserLimit("maxHtmlDepth", { actual: depth, max: limits.maxHtmlDepth });
    }
    if (counted.has(node)) return;
    counted.add(node);
    nodes += 1;
    if (nodes > limits.maxHtmlNodes) {
      throw parserLimit("maxHtmlNodes", { actual: nodes, max: limits.maxHtmlNodes });
    }
  };
  const nodeText = (root, rootDepth) => {
    const pieces = [];
    const stack = [{ node: root, depth: rootDepth }];
    while (stack.length) {
      const current = stack.pop();
      countNode(current.node, current.depth);
      if (current.node.nodeName === "#text") {
        pieces.push(current.node.value || "");
        continue;
      }
      const tag = String(current.node.tagName || "").toLowerCase();
      if (HTML_IGNORED_TAGS.has(tag)) continue;
      if (tag === "br") pieces.push("\n");
      const children = current.node.childNodes || [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], depth: current.depth + 1 });
      }
    }
    return pieces.join(" ");
  };
  const stack = [{ node: document, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    const { node, depth } = current;
    countNode(node, depth);
    const tag = String(node.tagName || "").toLowerCase();
    if (HTML_IGNORED_TAGS.has(tag)) continue;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const value = normalizeExtractedText(nodeText(node, depth));
      if (value) {
        const level = Number(heading[1]);
        headingPath.splice(level - 1);
        headingPath[level - 1] = value.slice(0, 240);
        ordinal += 1;
        blocks.push({
          text: value,
          locator: {
            type: "html_block",
            tag,
            ordinal,
            ...(headingPath.length ? { headingPath: headingPath.filter(Boolean) } : {}),
            ...(node.sourceCodeLocation?.startLine
              ? { lineStart: node.sourceCodeLocation.startLine, lineEnd: node.sourceCodeLocation.endLine }
              : {})
          }
        });
      }
      continue;
    }
    if (HTML_BLOCK_TAGS.has(tag)) {
      const value = normalizeExtractedText(nodeText(node, depth));
      if (value) {
        ordinal += 1;
        blocks.push({
          text: value,
          locator: {
            type: "html_block",
            tag,
            ordinal,
            ...(headingPath.length ? { headingPath: headingPath.filter(Boolean) } : {}),
            ...(node.sourceCodeLocation?.startLine
              ? { lineStart: node.sourceCodeLocation.startLine, lineEnd: node.sourceCodeLocation.endLine }
              : {})
          }
        });
      }
      continue;
    }
    const children = node.childNodes || [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: depth + 1 });
    }
  }
  return requireMeaningfulBlocks(blocks);
}
