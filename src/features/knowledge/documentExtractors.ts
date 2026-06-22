export type ExtractedKnowledgeFile = {
  name: string;
  type: string;
  size: number;
  text: string;
};

const supportedExtensions = new Set(["txt", "md", "markdown", "csv", "json", "pdf"]);
const supportedMimeTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/x-ndjson",
  "application/pdf"
]);

function fileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) || "" : "";
}

function normalizeText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function normalizeJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\\d{1,3}/g, " ")
    .trim();
}

async function extractPdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const raw = new TextDecoder("latin1").decode(buffer);
  const matches = Array.from(raw.matchAll(/\(([^()]{2,1000})\)\s*Tj|\(([^()]{2,1000})\)\s*'/g));
  const tjArrayMatches = Array.from(raw.matchAll(/\[((?:\s*\([^()]{1,1000}\)\s*-?\d*\.?\d*)+)\]\s*TJ/g));
  const parts = [
    ...matches.map((match) => decodePdfLiteral(match[1] || match[2] || "")),
    ...tjArrayMatches.flatMap((match) =>
      Array.from(match[1].matchAll(/\(([^()]+)\)/g)).map((part) => decodePdfLiteral(part[1]))
    )
  ].filter(Boolean);
  return normalizeText(parts.join("\n"));
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export async function extractKnowledgeFile(file: File, maxUploadMb = 8): Promise<ExtractedKnowledgeFile> {
  const extension = fileExtension(file.name);
  const mimeType = file.type || "text/plain";
  const maxBytes = maxUploadMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error(`${file.name} 超过 ${maxUploadMb}MB 限制`);
  }

  if (!supportedExtensions.has(extension) && !supportedMimeTypes.has(mimeType)) {
    throw new Error(`${file.name} 格式暂不支持`);
  }

  const rawText = extension === "pdf" || mimeType === "application/pdf"
    ? await extractPdfText(file)
    : await file.text();
  const text = normalizeText(extension === "json" || mimeType === "application/json" ? normalizeJson(rawText) : rawText);

  if (!text) {
    throw new Error(`${file.name} 没有可读取的文本内容；扫描版 PDF 需要先 OCR`);
  }

  return {
    name: file.name,
    type: mimeType,
    size: file.size,
    text
  };
}
