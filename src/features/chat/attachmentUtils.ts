import type { ChatAttachment } from "../../types";

const maxImageBytes = 4 * 1024 * 1024;
const maxTextBytes = 512 * 1024;
const supportedTextExtensions = new Set(["txt", "md", "markdown", "csv", "json"]);

function extension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) || "" : "";
}

function fileId(file: File) {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${file.name}`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
    reader.readAsDataURL(file);
  });
}

function normalizeText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export async function createChatAttachment(file: File, kindHint: "image" | "text"): Promise<ChatAttachment> {
  if (kindHint === "image") {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} 不是图片文件`);
    if (file.size > maxImageBytes) throw new Error(`${file.name} 超过 4MB 图片限制`);
    return {
      id: fileId(file),
      kind: "image",
      name: file.name,
      mimeType: file.type || "image/png",
      size: file.size,
      dataUrl: await readAsDataUrl(file)
    };
  }

  if (file.size > maxTextBytes) throw new Error(`${file.name} 超过 512KB 文本限制`);
  const ext = extension(file.name);
  if (!file.type.startsWith("text/") && file.type !== "application/json" && !supportedTextExtensions.has(ext)) {
    throw new Error(`${file.name} 暂不支持作为文本附件`);
  }

  return {
    id: fileId(file),
    kind: "text",
    name: file.name,
    mimeType: file.type || "text/plain",
    size: file.size,
    text: normalizeText(await file.text()).slice(0, 12000)
  };
}

export function attachmentSummary(attachment: ChatAttachment) {
  if (attachment.kind === "image") return "图片";
  if (attachment.kind === "audio") return "音频";
  return `${(attachment.text || "").length.toLocaleString("zh-CN")} 字`;
}

