import { api } from "../../api";
import type { KnowledgeCloudDocument, KnowledgeUploadGrant } from "../../types";

export const knowledgeUploadAccept = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm"
].join(",");

const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html"
};

export function knowledgeFileMimeType(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return mimeByExtension[extension] || file.type || "application/octet-stream";
}

function trimEtag(value: string | null) {
  return String(value || "").trim().replace(/^W\//u, "").replace(/^"|"$/gu, "") || undefined;
}

function validateUploadUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || !url.search) {
    throw new Error("对象存储上传地址无效，请重新选择文件");
  }
  return url.toString();
}

export async function putKnowledgeObject(
  upload: KnowledgeUploadGrant,
  body: Blob,
  signal?: AbortSignal
) {
  if (body.size !== upload.constraints.contentLength) {
    throw new Error("待上传文件大小与授权不一致，请重新选择文件");
  }
  const response = await fetch(validateUploadUrl(upload.uploadUrl), {
    method: "PUT",
    body,
    headers: upload.requiredHeaders,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal
  });
  if (!response.ok) {
    throw new Error(`对象存储上传失败（HTTP ${response.status}）`);
  }
  return {
    etag: trimEtag(response.headers.get("etag")),
    versionId: response.headers.get("x-cos-version-id") || undefined
  };
}

export type KnowledgeFileUploadResult = {
  document: KnowledgeCloudDocument;
  pendingDocument: KnowledgeCloudDocument;
};

export async function uploadKnowledgeFile(
  csrfToken: string,
  baseId: string,
  file: File,
  options: {
    signal?: AbortSignal;
    onGrant?: (document: KnowledgeCloudDocument) => void | Promise<void>;
    onStage?: (stage: "grant" | "upload" | "finalize") => void;
  } = {}
): Promise<KnowledgeFileUploadResult> {
  if (!file.size) throw new Error("不能上传空文件");
  const declaredMimeType = knowledgeFileMimeType(file);
  options.onStage?.("grant");
  const granted = await api.createKnowledgeUploadGrant(csrfToken, baseId, {
    displayName: file.name,
    declaredMimeType,
    declaredBytes: file.size
  });
  await options.onGrant?.(granted.document);
  options.onStage?.("upload");
  const object = await putKnowledgeObject(granted.upload, file, options.signal);
  options.onStage?.("finalize");
  const finalized = await api.finalizeKnowledgeUpload(
    csrfToken,
    granted.document.id,
    object
  );
  return {
    document: finalized.document,
    pendingDocument: granted.document
  };
}
