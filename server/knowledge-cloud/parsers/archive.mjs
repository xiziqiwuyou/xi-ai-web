import yauzl from "yauzl";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";

const OFFICE_ENTRY_PATTERN = /^(?:\[Content_Types\]\.xml|word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/i;

async function readEntryBuffer(zipFile, entry, limits) {
  if (entry.uncompressedSize > limits.maxZipEntryBytes) {
    throw parserLimit("maxZipEntryBytes", {
      entry: entry.fileName,
      actual: entry.uncompressedSize,
      max: limits.maxZipEntryBytes
    });
  }
  const stream = await zipFile.openReadStreamPromise(entry);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    if (bytes > limits.maxZipEntryBytes) {
      stream.destroy();
      throw parserLimit("maxZipEntryBytes", {
        entry: entry.fileName,
        actual: bytes,
        max: limits.maxZipEntryBytes
      });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

export async function inspectOfficeArchive(filePath, limits) {
  let zipFile;
  try {
    zipFile = await yauzl.openPromise(filePath, {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true
    });
    const entries = new Map();
    let entryCount = 0;
    let totalCompressed = 0;
    let totalUncompressed = 0;
    for await (const entry of zipFile.eachEntry()) {
      if (/\/$/.test(entry.fileName)) continue;
      entryCount += 1;
      if (entryCount > limits.maxZipEntries) {
        throw parserLimit("maxZipEntries", { actual: entryCount, max: limits.maxZipEntries });
      }
      if (entry.isEncrypted?.()) {
        throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_ENCRYPTED, "不支持加密的 Office 文档");
      }
      if (entry.canDecodeFileData && !entry.canDecodeFileData()) {
        throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_UNSUPPORTED, "Office 文档使用了不支持的压缩格式");
      }
      totalCompressed += entry.compressedSize;
      totalUncompressed += entry.uncompressedSize;
      if (totalUncompressed > limits.maxZipUncompressedBytes) {
        throw parserLimit("maxZipUncompressedBytes", {
          actual: totalUncompressed,
          max: limits.maxZipUncompressedBytes
        });
      }
      const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize);
      if (ratio > limits.maxZipCompressionRatio) {
        throw parserLimit("maxZipCompressionRatio", {
          entry: entry.fileName,
          actual: Number(ratio.toFixed(2)),
          max: limits.maxZipCompressionRatio
        });
      }
      if (OFFICE_ENTRY_PATTERN.test(entry.fileName)) {
        entries.set(entry.fileName, await readEntryBuffer(zipFile, entry, limits));
      }
    }
    const totalRatio = totalUncompressed / Math.max(1, totalCompressed);
    if (totalRatio > limits.maxZipCompressionRatio) {
      throw parserLimit("maxZipCompressionRatio", {
        actual: Number(totalRatio.toFixed(2)),
        max: limits.maxZipCompressionRatio
      });
    }
    return { entries, entryCount, totalCompressed, totalUncompressed };
  } catch (error) {
    if (error?.code === KNOWLEDGE_ERROR_CODES.PARSER_RESOURCE_LIMIT ||
        error?.code === KNOWLEDGE_ERROR_CODES.PARSER_ENCRYPTED ||
        error?.code === KNOWLEDGE_ERROR_CODES.PARSER_UNSUPPORTED) {
      throw error;
    }
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "Office 文档压缩包已损坏", {
      cause: error
    });
  } finally {
    zipFile?.close();
  }
}

export function officeArchiveType(entries) {
  if (entries.has("word/document.xml")) return "docx";
  if ([...entries.keys()].some((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))) return "pptx";
  if (entries.has("xl/workbook.xml") &&
      [...entries.keys()].some((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))) {
    return "xlsx";
  }
  return null;
}
