import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  CheckCircle2,
  Columns2,
  Copy,
  Download,
  Expand,
  FileText,
  FileUp,
  GitFork,
  Languages,
  Loader2,
  Minus,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Wand2,
  X
} from "lucide-react";

import { api } from "../../api";
import { compactModelLabel, modelsForCapability, vendorLabels } from "../../components/workbench";
import { Dialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import { loadImageGenerationHistory, saveImageGenerationTiming } from "../workspace/workspaceRepository";
import { createClientId } from "../../utils/clientId";
import { filterRequestedImageModels, imageModelCapabilities, imageModelSupportsResolution } from "./imageCapabilities";
import { estimateImageDurationMs, formatDurationMs } from "./imageGenerationTiming";
import { StudioModelSelect, useStudioModel, type StudioModuleProps } from "./studioShared";

import type {
  Assistant,
  GalleryItem,
  GenerationModuleId,
  GenerationResult,
  ImageAspectRatio,
  ImageGenerationMode,
  ImageInputPayload,
  ImageOutputFormat,
  ImageResolution,
  ModelCatalogEntry,
  ModuleId,
  UserProviderConfig
} from "../../types";


const imageCountOptions: readonly FigmaMenuOption[] = [
  { value: "1", label: "1 张" },
  { value: "2", label: "2 张" },
  { value: "4", label: "4 张" }
];

const imageQualityOptions: readonly FigmaMenuOption[] = [
  { value: "low", label: "低", detail: "优先生成速度" },
  { value: "medium", label: "中", detail: "平衡速度与细节" },
  { value: "high", label: "高", detail: "优先画面细节" }
];

type ImageDisplayResolution = Exclude<ImageResolution, "512px">;
type ImageSizePreset = {
  value: string;
  label: string;
  detail: string;
  resolution: ImageDisplayResolution;
  aspectRatio: ImageAspectRatio;
};

const imageSizePresets = [
  { value: "1K-square", label: "1K · 正方形", detail: "标准方形画布", resolution: "1K", aspectRatio: "1:1" },
  { value: "1K-landscape", label: "1K · 横版", detail: "标准横向构图", resolution: "1K", aspectRatio: "16:9" },
  { value: "1K-portrait", label: "1K · 竖版", detail: "标准竖向构图", resolution: "1K", aspectRatio: "9:16" },
  { value: "2K-square", label: "2K · 正方形", detail: "高清方形画布", resolution: "2K", aspectRatio: "1:1" },
  { value: "2K-landscape", label: "2K · 横版", detail: "高清横向构图", resolution: "2K", aspectRatio: "16:9" },
  { value: "2K-portrait", label: "2K · 竖版", detail: "高清竖向构图", resolution: "2K", aspectRatio: "9:16" },
  { value: "4K-square", label: "4K · 正方形", detail: "超清方形画布", resolution: "4K", aspectRatio: "1:1" },
  { value: "4K-landscape", label: "4K · 横版", detail: "超清横向构图", resolution: "4K", aspectRatio: "16:9" },
  { value: "4K-portrait", label: "4K · 竖版", detail: "超清竖向构图", resolution: "4K", aspectRatio: "9:16" }
] as const satisfies readonly ImageSizePreset[];

type ImageSizePresetValue = (typeof imageSizePresets)[number]["value"];
type ImageQuality = "low" | "medium" | "high";

const defaultImageSizePreset = imageSizePresets[0];
const fixedImageOutputFormat: ImageOutputFormat = "png";

function imageSizePreset(value: ImageSizePresetValue) {
  return imageSizePresets.find((preset) => preset.value === value) || defaultImageSizePreset;
}

function imageSizeOptionsForModel(model: ModelCatalogEntry | undefined): readonly FigmaMenuOption[] {
  return imageSizePresets
    .filter((preset) => imageModelSupportsResolution(model, preset.resolution))
    .map(({ value, label, detail }) => ({ value, label, detail }));
}

const defaultImagePrompt = "一座漂浮在深海中的未来图书馆，蓝紫色生物荧光，电影感";

const inspirationImages = [
  {
    src: "/assets/figma/inspiration-01.jpg",
    alt: "夜色中的城市街区",
    prompt: "俯瞰夜色中的城市街区，密集灯光与冷色调，电影感城市摄影"
  },
  {
    src: "/assets/figma/inspiration-02.jpg",
    alt: "黑色小狗肖像",
    prompt: "黑色小狗的正面肖像，简洁浅色背景，真实毛发与柔和自然光"
  },
  {
    src: "/assets/figma/inspiration-03.jpg",
    alt: "蓝紫色深空星云",
    prompt: "蓝紫色深空星云与发光行星，细节丰富，史诗感太空摄影"
  },
  {
    src: "/assets/figma/inspiration-04.jpg",
    alt: "未来机器人",
    prompt: "未来机器人站在极简空间中，金属材质，柔和侧光，写实科幻摄影"
  },
  {
    src: "/assets/figma/inspiration-05.jpg",
    alt: "滨海城市天际线",
    prompt: "晴朗天空下的滨海城市天际线，开阔视角，清透自然光，写实航拍"
  },
  {
    src: "/assets/figma/inspiration-06.jpg",
    alt: "日式街道",
    prompt: "安静的日式街道与传统建筑，清晨柔光，整洁构图，写实旅行摄影"
  }
] as const;

function imageRequestSize(aspectRatio: ImageAspectRatio, resolution: ImageDisplayResolution) {
  const sizes: Record<ImageDisplayResolution, Record<ImageAspectRatio, string>> = {
    "1K": {
      "1:1": "1024x1024",
      "3:2": "1536x1024",
      "2:3": "1024x1536",
      "16:9": "1536x1024",
      "9:16": "1024x1536"
    },
    "2K": {
      "1:1": "2048x2048",
      "3:2": "2048x1360",
      "2:3": "1360x2048",
      "16:9": "2048x1152",
      "9:16": "1152x2048"
    },
    "4K": {
      "1:1": "2880x2880",
      "3:2": "3072x2048",
      "2:3": "2048x3072",
      "16:9": "3840x2160",
      "9:16": "2160x3840"
    }
  };
  return sizes[resolution][aspectRatio];
}

function supportsImageResolution(model: ModelCatalogEntry | undefined, resolution: ImageResolution) {
  if (resolution === "1K") return true;
  if (!model) return false;
  if (resolution === "512px") return model.vendor === "gemini" && /^gemini-3\.1-flash-image(?:$|-)/i.test(model.model);
  if (model.vendor === "openai") return /^gpt-image-2(?:$|-)/i.test(model.model);
  if (model.vendor === "botcf") return true;
  if (model.vendor === "gemini") return /^gemini-3(?:\.|-)/i.test(model.model);
  return false;
}

function readImageFile(file: File, maxUploadMb = 8, pngOnly = false) {
  return new Promise<ImageInputPayload>((resolve, reject) => {
    if (pngOnly ? file.type !== "image/png" : !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      reject(new Error(pngOnly ? "蒙版仅支持 PNG 图片" : "仅支持 PNG、JPEG 或 WebP 图片"));
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      reject(new Error(`图片不能超过 ${maxUploadMb}MB`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => resolve({
      dataUrl: String(reader.result || ""),
      name: file.name,
      mimeType: file.type
    });
    reader.readAsDataURL(file);
  });
}

export function ImageStudio({
  galleryItems,
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [prompt, setPrompt] = useState(defaultImagePrompt);
  const [originalPrompt, setOriginalPrompt] = useState(defaultImagePrompt);
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [promptOptimizerModelId, setPromptOptimizerModelId] = useState("");
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [mode, setMode] = useState<ImageGenerationMode>("generate");
  const [sizePresetValue, setSizePresetValue] = useState<ImageSizePresetValue>(defaultImageSizePreset.value);
  const [count, setCount] = useState("1");
  const [quality, setQuality] = useState<ImageQuality>("low");
  const [inputImages, setInputImages] = useState<ImageInputPayload[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [referenceImageUrlDraft, setReferenceImageUrlDraft] = useState("");
  const [maskImage, setMaskImage] = useState<ImageInputPayload | null>(null);
  const [batchOffset, setBatchOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedMs, setEstimatedMs] = useState(30_000);
  const [timingHistory, setTimingHistory] = useState<Awaited<ReturnType<typeof loadImageGenerationHistory>>>([]);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const inputImageRef = useRef<HTMLInputElement | null>(null);
  const maskImageRef = useRef<HTMLInputElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(
    modelCatalog,
    "image",
    userProvider,
    onUserProviderChange,
    filterRequestedImageModels
  );
  const imageCapabilities = useMemo(() => imageModelCapabilities(selectedModel), [selectedModel]);
  const supportsEdit = imageCapabilities.supportsEdit;
  const supportsMask = imageCapabilities.supportsMask;
  const usesBotcf = selectedModel?.vendor === "botcf";
  const usesBotcfGemini = Boolean(
    usesBotcf && /^gemini-[a-z0-9.-]*image(?:$|[-_])/i.test(selectedModel?.model || "")
  );
  const maxReferenceImages = imageCapabilities.maxReferenceImages;
  const inputImage = inputImages[0] || null;
  const sizeOptions = useMemo(
    () => imageSizeOptionsForModel(selectedModel),
    [selectedModel]
  );
  const selectedSizePreset = imageSizePreset(sizePresetValue);
  const chatModels = useMemo(() => modelsForCapability(modelCatalog, "chat"), [modelCatalog]);
  const promptOptimizerModel = chatModels.find((model) => model.id === promptOptimizerModelId) || chatModels[0];
  const resultImages = useMemo(
    () => result?.assets?.filter((asset) => asset.type === "image") || [],
    [result]
  );
  const generatedInspirations = useMemo(() => {
    const items: Array<{ src: string; alt: string; prompt: string }> = [];
    resultImages.forEach((asset, index) => {
      items.push({ src: asset.url, alt: `本次生成图像 ${index + 1}`, prompt: prompt.trim() });
    });
    galleryItems
      .filter((item) => item.sourceModule === "image")
      .forEach((item) => {
        item.assets
          ?.filter((asset) => asset.type === "image")
          .forEach((asset, index) => {
            items.push({ src: asset.url, alt: `${item.title || "已生成图像"} ${index + 1}`, prompt: item.prompt });
          });
      });
    return [...new Map(items.map((item) => [item.src, item])).values()];
  }, [galleryItems, prompt, resultImages]);
  const inspirationPool = useMemo(
    () => [
      ...new Map(
        [...generatedInspirations, ...inspirationImages].map((item) => [item.src, item])
      ).values()
    ],
    [generatedInspirations]
  );
  const visibleInspirations = useMemo(() => {
    if (!inspirationPool.length) return [];
    const visibleCount = Math.min(6, inspirationPool.length);
    return Array.from(
      { length: visibleCount },
      (_, index) => inspirationPool[(index + batchOffset) % inspirationPool.length]
    );
  }, [batchOffset, inspirationPool]);

  useEffect(() => {
    void loadImageGenerationHistory().then(setTimingHistory);
  }, []);

  useEffect(() => () => generationAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!busy || !startedAtMs) return undefined;
    const update = () => setElapsedMs(Date.now() - startedAtMs);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [busy, startedAtMs]);

  useEffect(() => {
    setEstimatedMs(estimateImageDurationMs(timingHistory, {
      modelId: selectedModel?.id || "",
      mode,
      resolution: selectedSizePreset.resolution,
      aspectRatio: selectedSizePreset.aspectRatio,
      count: Number(count) || 1
    }));
  }, [count, mode, selectedModel?.id, selectedSizePreset, timingHistory]);

  useEffect(() => {
    setBatchOffset((current) => inspirationPool.length ? current % inspirationPool.length : 0);
  }, [inspirationPool.length]);

  useEffect(() => {
    if (!supportsEdit && mode === "edit") setMode("generate");
  }, [mode, supportsEdit]);

  useEffect(() => {
    setInputImages((current) => usesBotcfGemini ? [] : current.slice(0, maxReferenceImages));
    if (!usesBotcf) {
      setReferenceImageUrls([]);
      setReferenceImageUrlDraft("");
    }
  }, [maxReferenceImages, usesBotcf, usesBotcfGemini]);

  useEffect(() => {
    if (imageModelSupportsResolution(selectedModel, selectedSizePreset.resolution)) return;
    const fallback = imageSizePresets.find((preset) => (
      preset.resolution === "1K" && preset.aspectRatio === selectedSizePreset.aspectRatio
    )) || defaultImageSizePreset;
    setSizePresetValue(fallback.value);
  }, [selectedModel, selectedSizePreset]);

  const optimizePrompt = async () => {
    if (!prompt.trim() || !promptOptimizerModel) return;
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    setOptimizingPrompt(true);
    setNotice("");
    setOriginalPrompt(prompt.trim());
    try {
      const response = await api.optimizeImagePrompt({
        connection: userConnectionPayload(userProvider),
        modelId: promptOptimizerModel.id,
        prompt: prompt.trim()
      });
      setOptimizedPrompt(response.prompt);
      setPromptPreviewOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提示词优化失败");
    } finally {
      setOptimizingPrompt(false);
    }
  };

  const selectImageFile = async (
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: ImageInputPayload | null) => void,
    maxUploadMb = 8,
    pngOnly = false
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setter(await readImageFile(file, maxUploadMb, pngOnly));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片读取失败");
    }
  };

  const selectReferenceImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    try {
      const parsed = await Promise.all(files.map((file) => readImageFile(file)));
      let overflowed = false;
      setInputImages((current) => {
        const existing = new Set(current.map((item) => item.dataUrl));
        const next = [...current, ...parsed.filter((item) => !existing.has(item.dataUrl))];
        overflowed = next.length > maxReferenceImages;
        return next.slice(0, maxReferenceImages);
      });
      setNotice(overflowed ? `参考图最多支持 ${maxReferenceImages} 张` : "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片读取失败");
    }
  };

  const addReferenceImageUrl = () => {
    const value = referenceImageUrlDraft.trim();
    if (!value) return;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("参考图链接必须是公开 HTTPS 地址");
      }
      setReferenceImageUrls((current) => {
        if (current.includes(url.toString())) return current;
        if (current.length >= 4) {
          setNotice("参考图链接最多支持 4 条");
          return current;
        }
        return [...current, url.toString()];
      });
      setReferenceImageUrlDraft("");
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "参考图链接无效");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !prompt.trim()) {
      setNotice("请输入画面描述并选择模型。");
      return;
    }
    if (mode === "edit" && !inputImages.length && !referenceImageUrls.length) {
      setNotice(usesBotcfGemini ? "请添加公开 HTTPS 参考图链接。" : "请先上传需要编辑的参考图。");
      return;
    }
    if (mode === "edit" && inputImages.length && referenceImageUrls.length) {
      setNotice("请使用上传参考图或 HTTPS 参考图链接中的一种方式。");
      return;
    }
    setBusy(true);
    const requestStartedAt = Date.now();
    const requestStartedIso = new Date(requestStartedAt).toISOString();
    setStartedAtMs(requestStartedAt);
    setElapsedMs(0);
    setNotice("");
    let requestSucceeded = false;
    let requestCancelled = false;
    const controller = new AbortController();
    generationAbortRef.current = controller;
    try {
      const nextResult = await api.generate("image", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        options: {
          mode,
          count: Number(count),
          aspectRatio: selectedSizePreset.aspectRatio,
          imageSize: selectedSizePreset.resolution,
          size: imageRequestSize(selectedSizePreset.aspectRatio, selectedSizePreset.resolution),
          inputImage: mode === "edit" ? inputImage || undefined : undefined,
          inputImages: mode === "edit" ? inputImages : undefined,
          referenceImageUrls: mode === "edit" && usesBotcf ? referenceImageUrls : undefined,
          maskImage: mode === "edit" && supportsMask ? maskImage || undefined : undefined,
          quality: imageCapabilities.supportsQuality ? quality : undefined,
          outputFormat: fixedImageOutputFormat
        }
      }, controller.signal);
      setResult(nextResult);
      requestSucceeded = true;
      onGenerationResult({
        ...nextResult,
        sourceModule: "image",
        prompt: prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      requestCancelled = controller.signal.aborted;
      setNotice(requestCancelled ? "已取消本次图片生成" : error instanceof Error ? error.message : "图像生成失败");
    } finally {
      const completedAt = new Date().toISOString();
      const timingRecord: Awaited<ReturnType<typeof loadImageGenerationHistory>>[number] = {
        id: createClientId("image-timing"),
        modelId: selectedModel.id,
        mode,
        resolution: selectedSizePreset.resolution,
        aspectRatio: selectedSizePreset.aspectRatio,
        count: Number(count) || 1,
        status: requestSucceeded ? "completed" : requestCancelled ? "cancelled" : "failed",
        startedAt: requestStartedIso,
        completedAt,
        updatedAt: completedAt,
        durationMs: Date.now() - requestStartedAt
      };
      setTimingHistory((current) => [timingRecord, ...current].slice(0, 60));
      void saveImageGenerationTiming(timingRecord).catch(() => undefined);
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        setBusy(false);
        setStartedAtMs(0);
      }
    }
  };

  return (
    <section className="figma-module-view figma-image-page" data-testid="image-module">
      <header className="figma-page-hero figma-image-hero">
        <p>02 / VISUALS</p>
        <h1>图像生成</h1>
        <span>把文字灵感转换为一幅独有画面。</span>
      </header>

      <div className="figma-image-builder">
        <form className="figma-image-form" onSubmit={submit}>
        <section className="figma-image-composer" aria-labelledby="image-prompt-title">
          <div className="figma-image-mode-row">
            <div className="figma-section-kicker">
              <span id="image-prompt-title">PROMPT</span>
            </div>
            <div className="figma-image-mode" role="group" aria-label="图像任务模式">
              <button
                type="button"
                className={mode === "generate" ? "active" : ""}
                aria-pressed={mode === "generate"}
                disabled={busy}
                onClick={() => setMode("generate")}
              >
                文生图
              </button>
              <button
                type="button"
                className={mode === "edit" ? "active" : ""}
                aria-pressed={mode === "edit"}
                disabled={busy || !supportsEdit}
                onClick={() => setMode("edit")}
              >
                图片编辑
              </button>
            </div>
          </div>
          <textarea
            aria-label="图像提示词"
            value={prompt}
            disabled={busy}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (event.target.value !== optimizedPrompt) setPromptPreviewOpen(false);
            }}
            rows={3}
            placeholder="描述你想看见的画面..."
          />
          <div className="figma-image-prompt-tools">
            <button type="button" disabled={busy || optimizingPrompt || !prompt.trim() || !promptOptimizerModel} onClick={() => void optimizePrompt()}>
              {optimizingPrompt ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
              {optimizingPrompt ? "正在优化" : "优化提示词"}
            </button>
            <FigmaMenu
              className="figma-image-optimizer-menu"
              label="优化模型"
              value={promptOptimizerModel?.id || ""}
              options={chatModels.map((model) => ({ value: model.id, label: compactModelLabel(model), detail: model.vendorLabel || vendorLabels[model.vendor] || model.vendor }))}
              onChange={setPromptOptimizerModelId}
              ariaLabel="提示词优化模型"
              disabled={busy || optimizingPrompt || !chatModels.length}
            />
          </div>
          {promptPreviewOpen && optimizedPrompt ? (
            <div className="figma-image-prompt-preview" aria-label="优化后的提示词">
              <div><span>优化预览</span><button type="button" onClick={() => setPromptPreviewOpen(false)} aria-label="关闭优化预览"><X size={14} /></button></div>
              <p>{optimizedPrompt}</p>
              <footer>
                <button type="button" onClick={() => { setPrompt(originalPrompt); setPromptPreviewOpen(false); }}>恢复原文</button>
                <button type="button" className="active" onClick={() => { setOriginalPrompt(prompt); setPrompt(optimizedPrompt); setPromptPreviewOpen(false); }}>应用优化</button>
              </footer>
            </div>
          ) : null}
          {mode === "edit" ? (
            <div className="figma-image-upload-grid">
              {!usesBotcfGemini ? (
                <div className="figma-image-upload-field figma-image-reference-field">
                  <span>{usesBotcf ? "参考图" : "原图"}</span>
                  <div className="figma-image-reference-control">
                    {inputImages.length ? (
                      <div className="figma-image-reference-list" aria-label="已上传参考图">
                        {inputImages.map((image, index) => (
                          <figure key={image.dataUrl}>
                            <img src={image.dataUrl} alt={`参考图 ${index + 1}`} />
                            <button
                              type="button"
                              className="icon"
                              disabled={busy}
                              aria-label={`移除参考图 ${index + 1}`}
                              title={`移除参考图 ${index + 1}`}
                              onClick={() => setInputImages((current) => current.filter((item) => item.dataUrl !== image.dataUrl))}
                            >
                              <X size={13} />
                            </button>
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    <button type="button" disabled={busy} onClick={() => inputImageRef.current?.click()}>
                      <FileUp size={15} />
                      {usesBotcf
                        ? inputImages.length ? "添加参考图" : "上传参考图"
                        : inputImages.length ? "更换原图" : "上传原图"}
                    </button>
                  </div>
                  <input
                    ref={inputImageRef}
                    type="file"
                    hidden
                    multiple={usesBotcf}
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void selectReferenceImages(event)}
                  />
                </div>
              ) : null}
              {usesBotcf ? (
                <div className="figma-image-upload-field figma-image-url-field">
                  <span>参考图链接</span>
                  <div className="figma-image-url-control">
                    <input
                      aria-label="参考图链接"
                      type="url"
                      value={referenceImageUrlDraft}
                      disabled={busy}
                      placeholder="https://..."
                      onChange={(event) => setReferenceImageUrlDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addReferenceImageUrl();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="icon"
                      disabled={busy || !referenceImageUrlDraft.trim()}
                      aria-label="添加参考图链接"
                      title="添加参考图链接"
                      onClick={addReferenceImageUrl}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  {referenceImageUrls.length ? (
                    <div className="figma-image-url-list" aria-label="已添加参考图链接">
                      {referenceImageUrls.map((url, index) => (
                        <span key={url}>
                          <em>{`链接 ${index + 1}`}</em>
                          <button
                            type="button"
                            className="icon"
                            disabled={busy}
                            aria-label={`移除参考图链接 ${index + 1}`}
                            title={`移除参考图链接 ${index + 1}`}
                            onClick={() => setReferenceImageUrls((current) => current.filter((item) => item !== url))}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {supportsMask ? (
                <div className="figma-image-upload-field">
                  <span>蒙版（PNG）</span>
                  <div>
                    {maskImage ? <img src={maskImage.dataUrl} alt="图片编辑蒙版" /> : null}
                    <button type="button" disabled={busy} onClick={() => maskImageRef.current?.click()}>
                      <FileUp size={15} />
                      {maskImage ? "更换蒙版" : "上传蒙版"}
                    </button>
                    {maskImage ? (
                      <button type="button" className="icon" disabled={busy} aria-label="移除蒙版" title="移除蒙版" onClick={() => setMaskImage(null)}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={maskImageRef}
                    type="file"
                    hidden
                    accept="image/png"
                    onChange={(event) => void selectImageFile(event, setMaskImage, 4, true)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <section className="figma-image-control-deck figma-image-parameters" aria-labelledby="image-parameters-title">
            <div className="figma-image-control-heading">
              <h2 id="image-parameters-title">创作参数</h2>
              <div className="figma-image-eta" aria-live="polite">
                <span>{busy ? "正在生成" : "预计耗时"}</span>
                <strong>{busy ? `${formatDurationMs(elapsedMs)} / 约 ${formatDurationMs(estimatedMs)}` : formatDurationMs(estimatedMs)}</strong>
              </div>
            </div>
            <div className="figma-image-parameter-grid">
              <StudioModelSelect
                className="figma-studio-field figma-model-field figma-image-model-field"
                models={models}
                selectedModel={selectedModel}
                onChange={chooseModel}
                ariaLabel="图像生成模型"
                disabled={busy}
                placement="up"
              />
              <FigmaMenu
                className="figma-studio-field"
                label="尺寸"
                value={sizePresetValue}
                options={sizeOptions}
                onChange={(value) => setSizePresetValue(value as ImageSizePresetValue)}
                ariaLabel="图像尺寸"
                disabled={busy}
                placement="up"
              />
              <FigmaMenu
                className="figma-studio-field"
                label="质量"
                value={quality}
                options={imageQualityOptions}
                onChange={(value) => setQuality(value as ImageQuality)}
                ariaLabel="生成质量"
                disabled={busy}
                placement="up"
              />
              <FigmaMenu
                className="figma-studio-field"
                label="生成数量"
                value={count}
                options={imageCountOptions}
                onChange={setCount}
                ariaLabel="生成数量"
                disabled={busy}
                placement="up"
              />
            </div>
            <div className="figma-image-composer-footer">
              <div className="figma-image-timing-meta">
                <span>{timingHistory.length ? `基于 ${timingHistory.filter((item) => item.status === "completed").length} 次记录` : "首次生成将建立估算记录"}</span>
                {busy ? <div className="figma-image-progress"><i style={{ width: `${Math.min(92, Math.round((elapsedMs / Math.max(estimatedMs, 1)) * 100))}%` }} /></div> : null}
              </div>
              {busy ? (
                <button type="button" className="figma-secondary-action" onClick={() => generationAbortRef.current?.abort()}>
                  <X size={16} />
                  取消生成
                </button>
              ) : (
                <button type="submit" className="figma-primary-action" disabled={!prompt.trim() || !selectedModel}>
                  <Wand2 size={16} />
                  立即生成
                </button>
              )}
            </div>
          </section>
        </section>
        </form>

      {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
      {!models.length ? <p className="figma-module-notice" role="status">暂无可用图像模型。</p> : null}

      {resultImages.length ? (
        <section className="figma-image-results" aria-labelledby="image-results-title">
          <header>
            <h2 id="image-results-title">本次结果</h2>
            <span>{resultImages.length} 张</span>
          </header>
          <div role="list" aria-label="本次生成图片">
            {resultImages.map((asset, index) => (
              <figure key={`${asset.url}-${index}`} role="listitem">
                <img src={asset.url} alt={`生成结果 ${index + 1}`} />
                <a href={asset.url} download={`xi-ai-image-${index + 1}.${fixedImageOutputFormat}`} aria-label={`下载生成结果 ${index + 1}`} title="下载图片">
                  <Download size={15} />
                </a>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <section className="figma-inspiration-section" aria-labelledby="inspiration-title">
        <header>
          <h2 id="inspiration-title">灵感瀑布流</h2>
          <button
            type="button"
            onClick={() => setBatchOffset((current) => (
              inspirationPool.length ? (current + 2) % inspirationPool.length : 0
            ))}
          >
            换一批 →
          </button>
        </header>
        <div className="figma-inspiration-waterfall" role="list" aria-label="图像灵感">
          {visibleInspirations.map((item, index) => (
            <button
              key={item.src}
              type="button"
              role="listitem"
              className={`figma-inspiration-card figma-inspiration-card-${(index % 3) + 1}`}
              onClick={() => {
                setPrompt(item.prompt);
              }}
              aria-label={`复用灵感：${item.alt}`}
            >
              <img src={item.src} alt={item.alt} loading="lazy" />
              <span>点击使用此灵感</span>
            </button>
          ))}
        </div>
      </section>
      </div>
    </section>
  );
}
