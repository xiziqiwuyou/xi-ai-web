import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError
} from "../errors.mjs";

export class KnowledgeParserError extends KnowledgeError {
  constructor(code, message, { details, cause } = {}) {
    super(code, message, { status: 422, details, cause });
    this.name = "KnowledgeParserError";
    this.retryable = false;
  }
}

export function parserError(code, message, options) {
  return new KnowledgeParserError(code, message, options);
}

export function parserLimit(limit, details = {}) {
  return parserError(
    KNOWLEDGE_ERROR_CODES.PARSER_RESOURCE_LIMIT,
    "文档超过解析安全限制",
    { details: { limit, ...details } }
  );
}

export function normalizeParserFailure(error) {
  if (error instanceof KnowledgeParserError) return error;
  return parserError(
    KNOWLEDGE_ERROR_CODES.PARSER_FAILED,
    "文档解析失败",
    { cause: error }
  );
}
