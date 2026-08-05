import { fileTypeFromBuffer } from "file-type";

import { assertSafePublicHttpsUrl } from "./upstream-security.mjs";

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

async function responseBuffer(response, maxBytes) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel("image exceeds content-length limit").catch(() => undefined);
    throw new Error("远程图片超过允许大小");
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("远程图片超过允许大小");
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("image exceeds byte limit").catch(() => undefined);
        throw new Error("远程图片超过允许大小");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

async function fetchedResponseBuffer(response, maxBytes) {
  if (!response.ok) {
    throw new Error(response.status >= 300 && response.status < 400
      ? "远程图片地址不允许重定向"
      : `远程图片读取失败（HTTP ${response.status}）`);
  }
  return responseBuffer(response, maxBytes);
}

export async function importPublicImageAsset(value, {
  fetchImpl = fetch,
  validateUrl = assertSafePublicHttpsUrl,
  maxBytes = 20 * 1024 * 1024,
  timeoutMs = 30_000
} = {}) {
  const safeUrl = await validateUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("image import timeout")),
    boundedPositiveInteger(timeoutMs, 30_000, 120_000)
  );

  try {
    const byteLimit = boundedPositiveInteger(maxBytes, 20 * 1024 * 1024, 20 * 1024 * 1024);
    const buffer = await fetchedResponseBuffer(await fetchImpl(safeUrl, {
      method: "GET",
      headers: { Accept: "image/png,image/jpeg,image/webp" },
      redirect: "error",
      signal: controller.signal
    }), byteLimit);
    if (!buffer.length) throw new Error("远程图片内容为空");
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowedImageTypes.has(detected.mime)) {
      throw new Error("远程地址返回的不是受支持图片");
    }
    return {
      dataUrl: `data:${detected.mime};base64,${buffer.toString("base64")}`,
      mimeType: detected.mime
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("远程图片读取超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
