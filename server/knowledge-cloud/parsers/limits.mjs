export const DEFAULT_KNOWLEDGE_PARSER_LIMITS = Object.freeze({
  maxSourceBytes: 100 * 1024 * 1024,
  maxNormalizedBytes: 128 * 1024 * 1024,
  maxZipEntries: 10_000,
  maxZipEntryBytes: 64 * 1024 * 1024,
  maxZipUncompressedBytes: 512 * 1024 * 1024,
  maxZipCompressionRatio: 100,
  maxXmlBytes: 64 * 1024 * 1024,
  maxXmlDepth: 64,
  maxXmlNodes: 500_000,
  maxPdfPages: 5_000,
  maxSlides: 5_000,
  maxSpreadsheetRows: 100_000,
  maxSpreadsheetCells: 1_000_000,
  maxCsvColumns: 2_000,
  maxJsonDepth: 64,
  maxJsonNodes: 500_000,
  maxHtmlDepth: 128,
  maxHtmlNodes: 500_000,
  maxChunkBytes: 12_000,
  maxChunksPerDocument: 50_000,
  parseTimeoutMs: 120_000
});

export function resolveKnowledgeParserLimits(overrides = {}) {
  const limits = { ...DEFAULT_KNOWLEDGE_PARSER_LIMITS };
  for (const [key, fallback] of Object.entries(DEFAULT_KNOWLEDGE_PARSER_LIMITS)) {
    const value = Number(overrides[key]);
    if (Number.isSafeInteger(value) && value > 0) limits[key] = value;
    else limits[key] = fallback;
  }
  return Object.freeze(limits);
}
