import fs from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";
import { normalizeExtractedText } from "./text-utils.mjs";

function isPasswordFailure(error) {
  return error?.name === "PasswordException" ||
    error?.code === "NEED_PASSWORD" ||
    error?.code === "INCORRECT_PASSWORD";
}

export async function parsePdf(filePath, limits) {
  const source = await fs.readFile(filePath);
  if (source.byteLength > limits.maxSourceBytes) {
    throw parserLimit("maxSourceBytes", {
      actual: source.byteLength,
      max: limits.maxSourceBytes
    });
  }
  const loadingTask = getDocument({
    data: new Uint8Array(source),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0
  });
  let document;
  try {
    document = await loadingTask.promise;
    if (document.numPages > limits.maxPdfPages) {
      throw parserLimit("maxPdfPages", {
        actual: document.numPages,
        max: limits.maxPdfPages
      });
    }
    const blocks = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ disableNormalization: false });
        const text = normalizeExtractedText(
          content.items
            .filter((item) => item && typeof item.str === "string")
            .map((item) => item.str)
            .join(" ")
        );
        if (text) {
          blocks.push({
            text,
            locator: { type: "pdf_page", page: pageNumber }
          });
        }
      } finally {
        page.cleanup();
      }
    }
    return { blocks, needsOcr: blocks.length === 0 };
  } catch (error) {
    if (error?.code === KNOWLEDGE_ERROR_CODES.PARSER_RESOURCE_LIMIT) throw error;
    if (isPasswordFailure(error)) {
      throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_ENCRYPTED, "不支持加密的 PDF 文档");
    }
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "PDF 文档已损坏或无法解析", {
      cause: error
    });
  } finally {
    await document?.destroy?.().catch(() => {});
    await loadingTask.destroy?.().catch(() => {});
  }
}
