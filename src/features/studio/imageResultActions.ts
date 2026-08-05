import { api } from "../../api";

export type ImageResultTransform = {
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
};

export type ImageCopyResult = "image" | "url";

function normalizedRotation(value: number) {
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}

async function sourceImageBlob(url: string) {
  const canUseServerImport = /^https:\/\//i.test(url);
  try {
    const response = await fetch(url);
    if (response.ok) return response.blob();
    if (!canUseServerImport) throw new Error(`结果图片读取失败（HTTP ${response.status}）`);
  } catch {
    if (!canUseServerImport) throw new Error("无法读取结果图片，图片宿主可能禁止跨域访问");
  }

  try {
    const imported = await api.importImageResult(url);
    const response = await fetch(imported.dataUrl);
    if (!response.ok) throw new Error("同源图片导入结果无效");
    return response.blob();
  } catch {
    throw new Error("无法读取结果图片，图片宿主可能禁止跨域访问");
  }
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法解析结果图片"));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法将结果图片导出为 PNG"));
    }, "image/png");
  });
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue with the compatibility path used on HTTP and restricted clipboards.
  }

  const textarea = document.createElement("textarea");
  const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Text clipboard is unavailable");
  } finally {
    textarea.remove();
    restoreTarget?.focus({ preventScroll: true });
  }
}

export async function transformedImageBlob(url: string, transform: ImageResultTransform) {
  const source = await sourceImageBlob(url);
  const image = await loadImage(source);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("结果图片尺寸无效");
  }
  const rotation = normalizedRotation(transform.rotation);
  const swapsDimensions = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapsDimensions ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapsDimensions ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片变换");

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvasBlob(canvas);
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取导出的图片"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

export async function imageInputFromResult(url: string, transform: ImageResultTransform, fileName: string) {
  const blob = await transformedImageBlob(url, transform);
  return {
    dataUrl: await blobToDataUrl(blob),
    name: fileName,
    mimeType: "image/png"
  };
}

export async function downloadImageResult(url: string, transform: ImageResultTransform, fileName: string) {
  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(await transformedImageBlob(url, transform));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function copyImageResult(url: string, transform: ImageResultTransform): Promise<ImageCopyResult> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    await copyText(url);
    return "url";
  }

  try {
    const blob = await transformedImageBlob(url, transform);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "image";
  } catch (error) {
    try {
      await copyText(url);
      return "url";
    } catch {
      throw error;
    }
  }
}
