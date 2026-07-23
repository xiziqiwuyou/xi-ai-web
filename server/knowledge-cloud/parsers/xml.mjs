import { SaxesParser } from "saxes";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";

export function parseBoundedXml(buffer, limits, handlers = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength > limits.maxXmlBytes) {
    throw parserLimit("maxXmlBytes", {
      actual: buffer?.byteLength || 0,
      max: limits.maxXmlBytes
    });
  }
  let depth = 0;
  let nodes = 0;
  let parseFailure = null;
  const parser = new SaxesParser({ xmlns: false, fragment: false });
  parser.on("doctype", () => {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_UNSUPPORTED, "文档 XML 不允许包含 DTD");
  });
  parser.on("opentag", (tag) => {
    depth += 1;
    nodes += 1;
    if (depth > limits.maxXmlDepth) {
      throw parserLimit("maxXmlDepth", { actual: depth, max: limits.maxXmlDepth });
    }
    if (nodes > limits.maxXmlNodes) {
      throw parserLimit("maxXmlNodes", { actual: nodes, max: limits.maxXmlNodes });
    }
    handlers.openTag?.(tag);
  });
  parser.on("text", (text) => handlers.text?.(text));
  parser.on("cdata", (text) => handlers.text?.(text));
  parser.on("closetag", (tag) => {
    handlers.closeTag?.(tag);
    depth -= 1;
  });
  parser.on("error", (error) => {
    parseFailure = error;
  });
  try {
    parser.write(buffer.toString("utf8")).close();
  } catch (error) {
    if (error?.code) throw error;
    parseFailure = error;
  }
  if (parseFailure) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "文档 XML 已损坏", {
      cause: parseFailure
    });
  }
  return { nodes, maxDepth: depth };
}

export function xmlAttribute(tag, names) {
  for (const name of names) {
    const value = tag.attributes?.[name];
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "value" in value) return String(value.value);
  }
  return null;
}
