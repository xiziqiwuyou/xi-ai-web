import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  Check,
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
import { compactModelLabel, modelsForCapability, preferredModelFor, vendorLabels } from "../../components/workbench";
import { Dialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import { queueAssistantLaunch } from "../assistants/assistantLaunch";
import { exportPptxFromMarkdown } from "../generation/pptxExport";
import { downloadText, mindmapToSvg } from "../mindmap/mindmapExport";
import { parseMindmap } from "../mindmap/mindmapParser";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
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

type FigmaPublicModuleId = "image" | "ppt" | "mindmap" | "assistants" | "translate";
type TranslationTone = "自然专业" | "简洁" | "营销感";

type StudioModuleProps = {
  moduleId: FigmaPublicModuleId;
  assistants: Assistant[];
  galleryItems: GalleryItem[];
  modelCatalog: ModelCatalogEntry[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onModuleChange: (moduleId: ModuleId) => void;
  onRequestApiConfig: () => void;
};

const languageOptions = ["自动检测", "中文（简体）", "英语（美式）", "日本語", "한국어", "Français", "Deutsch", "Español"];

const imageAspectRatioOptions: readonly FigmaMenuOption[] = [
  { value: "1:1", label: "1 : 1", detail: "方形画布" },
  { value: "3:2", label: "3 : 2", detail: "横向构图" },
  { value: "2:3", label: "2 : 3", detail: "竖向构图" },
  { value: "16:9", label: "16 : 9", detail: "宽屏画布" },
  { value: "9:16", label: "9 : 16", detail: "竖屏画布" }
];

const imageCountOptions: readonly FigmaMenuOption[] = [
  { value: "1", label: "1 张" },
  { value: "2", label: "2 张" },
  { value: "4", label: "4 张" }
];

const imageResolutionOptions: readonly FigmaMenuOption[] = [
  { value: "512px", label: "512", detail: "快速预览" },
  { value: "1K", label: "1K", detail: "标准分辨率" },
  { value: "2K", label: "2K", detail: "高清输出" },
  { value: "4K", label: "4K", detail: "超清输出" }
];

const imageQualityOptions: readonly FigmaMenuOption[] = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" }
];

const imageFormatOptions: readonly FigmaMenuOption[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" }
];

const imageCompressionOptions: readonly FigmaMenuOption[] = [
  { value: "60", label: "60%" },
  { value: "80", label: "80%" },
  { value: "100", label: "100%" }
];

const pptAudienceOptions: readonly FigmaMenuOption[] = [
  { value: "企业管理层", label: "企业管理层" },
  { value: "潜在投资人", label: "潜在投资人" },
  { value: "内部团队", label: "内部团队" },
  { value: "公开听众", label: "公开听众" }
];

const pptDurationOptions: readonly FigmaMenuOption[] = [
  { value: "5 分钟", label: "5 分钟" },
  { value: "8–10 分钟", label: "8–10 分钟" },
  { value: "20 分钟", label: "20 分钟" },
  { value: "30 分钟", label: "30 分钟" }
];

const pptVisualToneOptions: readonly FigmaMenuOption[] = [
  { value: "未来专业", label: "未来专业" },
  { value: "极简科技", label: "极简科技" },
  { value: "专业商务", label: "专业商务" },
  { value: "明快创意", label: "明快创意" }
];

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

const pptStages = [
  "发现叙事主线",
  "生成页面结构",
  "匹配视觉素材",
  "润色关键表达"
] as const;

const pptPromptIdeas = [
  "年度战略复盘",
  "新品发布方案",
  "市场进入策略",
  "行业趋势解读"
] as const;

const mindmapBranches = ["用户洞察", "价值主张", "产品策略", "增长实验"] as const;

const defaultMindmapSource = `# 构建 AI 驱动的产品增长体系
## 用户洞察
### 核心人群
### 真实需求
### 使用场景
## 价值主张
### 差异优势
### 核心体验
### 可信证明
## 产品策略
### 最小闭环
### 版本节奏
### 质量指标
## 增长实验
### 内容触达
### 渠道合作
### 留存优化`;

const mindmapCapabilities = [
  { icon: Expand, title: "一键展开", detail: "从中心主题延展更多观点" },
  { icon: Shuffle, title: "AI 重组", detail: "按时间、优先级或因果排序" },
  { icon: Download, title: "导出图片", detail: "生成可分享的高清结构图" }
] as const;

const preferredAssistantCategories = [
  "通用效率",
  "内容创作",
  "编程开发",
  "学习研究",
  "商业办公",
  "生活创意"
] as const;

function assistantCategories(assistants: Assistant[]) {
  const available = new Set(assistants.map((assistant) => assistant.category || "通用效率"));
  const preferred = preferredAssistantCategories.filter((category) => available.has(category));
  const additional = [...available]
    .filter((category) => !preferredAssistantCategories.includes(category as (typeof preferredAssistantCategories)[number]))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  return ["全部", ...preferred, ...additional];
}

const translationCapabilities = [
  { icon: FileUp, title: "文件翻译", detail: "上传 DOCX、PDF 或字幕文件" },
  { icon: BookOpen, title: "术语库", detail: "锁定品牌、产品和行业术语" },
  { icon: Columns2, title: "双语对照", detail: "保留段落级对照与审校痕迹" }
] as const;

const defaultTranslationSource = "今天，我们正式发布全新的 AI 创作工作台。它将复杂的思考过程转化为清晰、有影响力的内容，让每个团队都能更快地把想法变成成果。";
const defaultTranslationResult = "Today, we are officially launching our new AI creation workspace. It turns complex thinking into clear, impactful content—helping every team transform ideas into outcomes with greater speed.";

function StudioModule(props: StudioModuleProps) {
  switch (props.moduleId) {
    case "image":
      return <ImageStudio {...props} />;
    case "ppt":
      return <PptStudio {...props} />;
    case "mindmap":
      return <MindmapStudio {...props} />;
    case "assistants":
      return <AssistantsStudio {...props} />;
    case "translate":
      return <TranslateStudio {...props} />;
  }
}

function useStudioModel(
  modelCatalog: ModelCatalogEntry[],
  capability: "chat" | "image",
  userProvider: UserProviderConfig,
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void
) {
  const models = useMemo(() => modelsForCapability(modelCatalog, capability), [capability, modelCatalog]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ||
    preferredModelFor(models, capability, userProvider.lastModelId);

  useEffect(() => {
    if (!models.length) {
      setSelectedModelId("");
      return;
    }
    setSelectedModelId((current) =>
      models.some((model) => model.id === current)
        ? current
        : preferredModelFor(models, capability, userProvider.lastModelId)?.id || ""
    );
  }, [capability, models, userProvider.lastModelId]);

  const chooseModel = (modelId: string) => {
    setSelectedModelId(modelId);
    onUserProviderChange({ lastModelId: modelId });
  };

  return { models, selectedModel, chooseModel };
}

function StudioModelSelect({
  models,
  selectedModel,
  onChange,
  ariaLabel,
  className = "figma-studio-field figma-model-field",
  disabled = false
}: {
  models: ModelCatalogEntry[];
  selectedModel?: ModelCatalogEntry;
  onChange: (modelId: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const options = models.map<FigmaMenuOption>((model) => ({
    value: model.id,
    label: compactModelLabel(model),
    detail: `${vendorLabels[model.vendor] || model.vendor} · ${model.capabilities.includes("image")
      ? model.capabilities.includes("imageEdit") ? "图像生成 · 图片编辑" : "图像生成 · 视觉创作"
      : model.capabilities.includes("vision")
        ? "图像理解 · 多模态"
        : "通用创作 · 稳定输出"}`
  }));

  return (
    <FigmaMenu
      className={className}
      label="模型"
      value={selectedModel?.id || ""}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled || !models.length}
    />
  );
}

function imageRequestSize(aspectRatio: ImageAspectRatio, resolution: ImageResolution) {
  const sizes: Record<ImageResolution, Record<ImageAspectRatio, string>> = {
    "512px": {
      "1:1": "512x512",
      "3:2": "768x512",
      "2:3": "512x768",
      "16:9": "768x432",
      "9:16": "432x768"
    },
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
      "1:1": "3072x3072",
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

function ImageStudio({
  galleryItems,
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [prompt, setPrompt] = useState(defaultImagePrompt);
  const [mode, setMode] = useState<ImageGenerationMode>("generate");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [style, setStyle] = useState("写实");
  const [count, setCount] = useState("4");
  const [quality, setQuality] = useState("auto");
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("png");
  const [outputCompression, setOutputCompression] = useState("80");
  const [inputImages, setInputImages] = useState<ImageInputPayload[]>([]);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [referenceImageUrlDraft, setReferenceImageUrlDraft] = useState("");
  const [maskImage, setMaskImage] = useState<ImageInputPayload | null>(null);
  const [batchOffset, setBatchOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const inputImageRef = useRef<HTMLInputElement | null>(null);
  const maskImageRef = useRef<HTMLInputElement | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(
    modelCatalog,
    "image",
    userProvider,
    onUserProviderChange
  );
  const usesOpenAIImageOptions = selectedModel?.vendor === "openai" || selectedModel?.vendor === "openai-compatible";
  const supportsEdit = Boolean(selectedModel?.capabilities.includes("imageEdit"));
  const supportsMask = selectedModel?.vendor === "openai";
  const usesBotcf = selectedModel?.vendor === "botcf";
  const usesBotcfGemini = Boolean(
    usesBotcf && /^gemini-[a-z0-9.-]*image(?:$|[-_])/i.test(selectedModel?.model || "")
  );
  const maxReferenceImages = usesBotcf ? 4 : 1;
  const inputImage = inputImages[0] || null;
  const resolutionOptions = useMemo(
    () => imageResolutionOptions.map((option) => ({
      ...option,
      disabled: !supportsImageResolution(selectedModel, option.value as ImageResolution)
    })),
    [selectedModel]
  );
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
    if (!supportsImageResolution(selectedModel, resolution)) setResolution("1K");
  }, [resolution, selectedModel]);

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
    setNotice("");
    try {
      const nextResult = await api.generate("image", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        options: {
          mode,
          count: Number(count),
          aspectRatio,
          imageSize: resolution,
          size: imageRequestSize(aspectRatio, resolution),
          inputImage: mode === "edit" ? inputImage || undefined : undefined,
          inputImages: mode === "edit" ? inputImages : undefined,
          referenceImageUrls: mode === "edit" && usesBotcf ? referenceImageUrls : undefined,
          maskImage: mode === "edit" && supportsMask ? maskImage || undefined : undefined,
          stylePreset: style,
          quality: usesOpenAIImageOptions ? quality : undefined,
          outputFormat: usesOpenAIImageOptions ? outputFormat : undefined,
          outputCompression: usesOpenAIImageOptions && outputFormat !== "png"
            ? Number(outputCompression)
            : undefined
        }
      });
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "image",
        prompt: prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图像生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view figma-image-page" data-testid="image-module">
      <header className="figma-page-hero figma-image-hero">
        <p>02 / VISUALS</p>
        <h1>图像生成</h1>
        <span>把文字灵感转换为一幅独有画面。</span>
      </header>

      <form className="figma-image-builder" onSubmit={submit}>
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
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="描述你想看见的画面..."
          />
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
          <div className="figma-image-composer-footer">
            <div className="figma-prompt-chips" aria-label="当前创作参数">
              <button type="button" className={aspectRatio === "1:1" ? "active" : ""} aria-pressed={aspectRatio === "1:1"} onClick={() => setAspectRatio("1:1")}>
                {aspectRatio}
              </button>
              <button type="button" className={style === "写实" ? "active" : ""} aria-pressed={style === "写实"} onClick={() => setStyle("写实")}>
                写实
              </button>
            </div>
            <button type="submit" className="figma-primary-action" disabled={busy || !prompt.trim() || !selectedModel}>
              {busy ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
              {busy ? "正在生成" : "立即生成"}
            </button>
          </div>
        </section>

        <aside className="figma-image-parameters" aria-labelledby="image-parameters-title">
          <header>
            <h2 id="image-parameters-title">创作参数</h2>
          </header>
          <StudioModelSelect
            models={models}
            selectedModel={selectedModel}
            onChange={chooseModel}
            ariaLabel="图像生成模型"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-studio-field"
            label="画面比例"
            value={aspectRatio}
            options={imageAspectRatioOptions}
            onChange={(value) => setAspectRatio(value as ImageAspectRatio)}
            ariaLabel="画面比例"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-studio-field"
            label="分辨率"
            value={resolution}
            options={resolutionOptions}
            onChange={(value) => setResolution(value as ImageResolution)}
            ariaLabel="图像分辨率"
            disabled={busy}
          />
          <FigmaMenu
            className="figma-studio-field"
            label="生成数量"
            value={count}
            options={imageCountOptions}
            onChange={setCount}
            ariaLabel="生成数量"
            disabled={busy}
          />
          {usesOpenAIImageOptions ? (
            <>
              <FigmaMenu
                className="figma-studio-field"
                label="生成质量"
                value={quality}
                options={imageQualityOptions}
                onChange={setQuality}
                ariaLabel="生成质量"
                disabled={busy}
              />
              <FigmaMenu
                className="figma-studio-field"
                label="输出格式"
                value={outputFormat}
                options={imageFormatOptions}
                onChange={(value) => setOutputFormat(value as ImageOutputFormat)}
                ariaLabel="输出格式"
                disabled={busy}
              />
              {outputFormat !== "png" ? (
                <FigmaMenu
                  className="figma-studio-field"
                  label="压缩质量"
                  value={outputCompression}
                  options={imageCompressionOptions}
                  onChange={setOutputCompression}
                  ariaLabel="压缩质量"
                  disabled={busy}
                />
              ) : null}
            </>
          ) : null}
        </aside>
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
                <a href={asset.url} download={`xi-ai-image-${index + 1}.${outputFormat}`} aria-label={`下载生成结果 ${index + 1}`} title="下载图片">
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
                setStyle("写实");
              }}
              aria-label={`复用灵感：${item.alt}`}
            >
              <img src={item.src} alt={item.alt} loading="lazy" />
              <span>点击使用此灵感</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function PptStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("生成式 AI 如何重塑企业创新");
  const [audience, setAudience] = useState("企业管理层");
  const [duration, setDuration] = useState("8–10 分钟");
  const [visualTone, setVisualTone] = useState("未来专业");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(modelCatalog, "chat", userProvider, onUserProviderChange);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !topic.trim()) {
      setNotice("请输入演示主题并确认模型可用。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const prompt = `${topic.trim()}\n目标受众：${audience}\n演讲时长：${duration}\n视觉语气：${visualTone}\n内容规模：约 8 页`;
      const nextResult = await api.generate("ppt", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt
      });
      setResult(nextResult);
      onGenerationResult({ ...nextResult, sourceModule: "ppt", prompt, modelId: selectedModel.id });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT 生成失败");
    } finally {
      setBusy(false);
    }
  };

  const downloadDeck = async () => {
    if (!result?.text || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      await exportPptxFromMarkdown(result.text, topic.trim() || result.title);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="figma-module-view figma-ppt-page" data-testid="ppt-module">
      <header className="figma-page-hero figma-ppt-hero">
        <p>06 / AUTO-DECK</p>
        <h1>一句主题，<em>一份好 PPT。</em></h1>
        <span>AiStudio 会研究主题、编排故事、选择视觉语言，并生成可下载的演示文稿。</span>
      </header>

      <form className="figma-ppt-creator" onSubmit={submit}>
        <section className="figma-ppt-input-panel">
          <div className="figma-ppt-step-label">
            <b>01</b>
            <strong>描述你的主题</strong>
          </div>
          <label className="figma-ppt-topic">
            <span className="figma-visually-hidden">演示主题</span>
            <textarea
              aria-label="演示主题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              rows={3}
              placeholder="告诉 AI 这份演示要讲什么..."
            />
          </label>
          <div className="figma-ppt-options" aria-label="演示选项">
            <StudioModelSelect
              models={models}
              selectedModel={selectedModel}
              onChange={chooseModel}
              ariaLabel="PPT 生成模型"
              className="figma-ppt-menu figma-ppt-model-menu"
              disabled={busy}
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="目标受众"
              value={audience}
              options={pptAudienceOptions}
              onChange={setAudience}
              ariaLabel="目标受众"
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="演示时长"
              value={duration}
              options={pptDurationOptions}
              onChange={setDuration}
              ariaLabel="演示时长"
            />
            <FigmaMenu
              className="figma-ppt-menu"
              label="视觉气质"
              value={visualTone}
              options={pptVisualToneOptions}
              onChange={setVisualTone}
              ariaLabel="视觉气质"
            />
          </div>
          {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
          {!models.length ? <p className="figma-module-notice" role="status">暂无可用演示模型。</p> : null}
          <div className="figma-ppt-action-row">
            <button type="submit" className="figma-primary-action figma-ppt-submit" disabled={busy || !topic.trim() || !selectedModel}>
              {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              {busy ? "正在创作" : "让 AI 开始创作"}
            </button>
            <p className="figma-ppt-support">预计 40 秒 · 约 8 页内容 · 支持导出 PPTX</p>
          </div>
        </section>

        <aside className="figma-ppt-stages" aria-labelledby="ppt-stages-title">
          <small id="ppt-stages-title">WHAT AI CREATES</small>
          <ol>
            {pptStages.map((stage, index) => (
              <li key={stage}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{stage}</strong>
              </li>
            ))}
          </ol>
          <p>不再从空白页面开始。只需表达你的目标，剩下的交给 AI。</p>
        </aside>
      </form>

      <section className="figma-ppt-ideas" aria-labelledby="ppt-ideas-title">
        <header><small id="ppt-ideas-title">PROMPT IDEAS</small></header>
        <div>
          {pptPromptIdeas.map((idea) => (
            <button type="button" key={idea} onClick={() => setTopic(idea)}>{idea}</button>
          ))}
        </div>
      </section>

      {result?.text ? (
        <section className="figma-ppt-result" aria-labelledby="ppt-result-title">
          <header>
            <div><small>PRESENTATION OUTLINE</small><h2 id="ppt-result-title">演示大纲</h2></div>
            <button type="button" onClick={() => void downloadDeck()} disabled={exporting}>
              {exporting ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
              {exporting ? "导出中" : "下载 PPT"}
            </button>
          </header>
          <div><FileText size={22} /><pre>{result.text}</pre></div>
        </section>
      ) : null}
    </section>
  );
}

function MindmapStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("构建 AI 驱动的产品增长体系");
  const [activeBranchId, setActiveBranchId] = useState("");
  const [branchOrderOffset, setBranchOrderOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(modelCatalog, "chat", userProvider, onUserProviderChange);
  const canvasSource = result?.text || defaultMindmapSource;
  const parsed = useMemo(() => parseMindmap(canvasSource, topic || "思维导图"), [canvasSource, topic]);
  const branchSource = useMemo(() => {
    const generated = parsed.children
      .filter((node) => node.label.trim())
      .slice(0, 4)
      .map((node) => ({
        id: node.id,
        label: node.label,
        count: node.children.length
      }));
    if (generated.length) return generated;
    return mindmapBranches.map((label, index) => ({
      id: `fallback-${index}`,
      label,
      count: 3
    }));
  }, [parsed]);
  const branchCards = useMemo(
    () => branchSource.map((_, index) => branchSource[(index + branchOrderOffset) % branchSource.length]),
    [branchOrderOffset, branchSource]
  );

  useEffect(() => {
    setBranchOrderOffset((value) => branchSource.length ? value % branchSource.length : 0);
    setActiveBranchId((current) => (
      current && branchSource.some((branch) => branch.id === current) ? current : ""
    ));
  }, [branchSource]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !topic.trim()) {
      setNotice("请输入需要整理的主题。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const nextResult = await api.generate("mindmap", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: topic.trim()
      });
      setResult(nextResult);
      onGenerationResult({
        ...nextResult,
        sourceModule: "mindmap",
        prompt: topic.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "思维导图生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="figma-module-view figma-mindmap-page" data-testid="mindmap-module">
      <header className="figma-page-hero figma-mindmap-hero">
        <p>07 / THINKING MAP</p>
        <h1>把模糊想法，<em>变成清晰路径。</em></h1>
        <span>输入一个问题或主题，AI 将为你提炼关键分支、逻辑关系和下一步行动。</span>
      </header>

      <form className="figma-map-command" onSubmit={submit}>
        <StudioModelSelect
          models={models}
          selectedModel={selectedModel}
          onChange={chooseModel}
          ariaLabel="思维导图生成模型"
          className="figma-compact-model-menu figma-map-model-menu"
          disabled={busy}
        />
        <label>
          <span className="figma-visually-hidden">导图主题</span>
          <input
            aria-label="导图主题"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="输入主题、资料摘要或会议纪要..."
          />
        </label>
        <button type="submit" className="figma-primary-action" disabled={busy || !topic.trim() || !selectedModel}>
          {busy ? <Loader2 className="spin" size={16} /> : <GitFork size={16} />}
          {busy ? "生成中" : "AI 生成导图"}
        </button>
      </form>
      {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
      {!models.length ? <p className="figma-module-notice" role="status">暂无可用导图模型。</p> : null}

      <section className="figma-map-canvas" aria-label="思维导图画布">
        <div className="figma-map-stage" style={{ transform: `scale(${zoom})` }}>
          <svg className="figma-map-connectors" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 430 198 L 165 112" />
            <path d="M 430 244 L 205 332" />
            <path d="M 570 198 L 844 92" />
            <path d="M 570 244 L 850 320" />
          </svg>
          <div className="figma-map-center-node">
            <Sparkles size={18} />
            <strong>{parsed.label || topic || "思维导图"}</strong>
          </div>
          {branchCards.map((branch, index) => (
            <button
              type="button"
              key={branch.id}
              className={`figma-map-branch branch-${index + 1}${activeBranchId === branch.id ? " active" : ""}`}
              aria-pressed={activeBranchId === branch.id}
              onClick={() => setActiveBranchId(branch.id)}
            >
              <strong>{branch.label}</strong>
              <small>AI 已扩展 {branch.count} 个节点</small>
            </button>
          ))}
        </div>
        <div className="figma-map-zoom" aria-label="画布缩放">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(1))))} aria-label="缩小">
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.2, Number((value + 0.1).toFixed(1))))} aria-label="放大">
            <Plus size={14} />
          </button>
        </div>
      </section>

      <section className="figma-map-capabilities" aria-label="思维导图能力">
        {mindmapCapabilities.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.title}
              onClick={() => {
                if (index === 0) {
                  const currentIndex = branchCards.findIndex((branch) => branch.id === activeBranchId);
                  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % branchCards.length;
                  setActiveBranchId(branchCards[nextIndex].id);
                  setNotice(`已展开“${branchCards[nextIndex].label}”分支。`);
                  return;
                }
                if (index === 1) {
                  setBranchOrderOffset((value) => (value + 1) % branchCards.length);
                  setNotice("已重新排列导图分支。");
                  return;
                }
                downloadText(mindmapToSvg(parsed), "mindmap.svg", "image/svg+xml;charset=utf-8");
              }}
            >
              <Icon size={17} aria-hidden="true" />
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </button>
          );
        })}
      </section>
    </section>
  );
}

function AssistantsStudio({ assistants, onModuleChange }: StudioModuleProps) {
  const availableAssistants = useMemo(
    () => assistants.filter((assistant) => assistant.enabled !== false),
    [assistants]
  );
  const categories = useMemo(() => assistantCategories(availableAssistants), [availableAssistants]);
  const [activeCategory, setActiveCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(availableAssistants[0]?.id || "");
  const [selectedStarterPrompt, setSelectedStarterPrompt] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAssistants = availableAssistants.filter((assistant) => {
    if (activeCategory !== "全部" && assistant.category !== activeCategory) return false;
    if (!normalizedQuery) return true;
    return [assistant.name, assistant.description, assistant.category, ...assistant.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const selected = availableAssistants.find((assistant) => assistant.id === selectedId) || availableAssistants[0];

  useEffect(() => {
    if (!categories.includes(activeCategory)) setActiveCategory("全部");
  }, [activeCategory, categories]);

  useEffect(() => {
    if (selectedId && availableAssistants.some((assistant) => assistant.id === selectedId)) return;
    setSelectedId(availableAssistants[0]?.id || "");
  }, [availableAssistants, selectedId]);

  const startConversation = () => {
    if (!selected) return;
    try {
      queueAssistantLaunch(selected.id, selectedStarterPrompt);
      setDetailOpen(false);
      setNotice("");
      onModuleChange("chat");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法启动助手，请检查浏览器存储权限。");
    }
  };

  return (
    <section className="figma-module-view figma-assistants-page" data-testid="assistants-module">
      <header className="figma-page-hero figma-assistants-hero">
        <div>
          <p>08 / AGENT LIBRARY</p>
          <h1>给任务找一位<br /><em>真正懂行的伙伴。</em></h1>
          <span className="figma-hero-copy">每位 AI 助手都有专属指令、知识结构与工作方式。选择一个，立即开始协作。</span>
        </div>
        <span>{String(availableAssistants.length).padStart(2, "0")} CURATED AGENTS</span>
      </header>

      <div className="figma-agent-toolbar">
        <nav className="figma-agent-filters" aria-label="助手分类">
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              className={activeCategory === category ? "active" : ""}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </nav>
        <label className="figma-agent-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索助手"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、分类或标签"
          />
        </label>
      </div>

      {filteredAssistants.length ? (
        <section className="figma-agent-grid" aria-label="助手列表">
          {filteredAssistants.map((assistant) => (
            <button
              key={assistant.id}
              type="button"
              className="figma-agent-card"
              onClick={() => {
                setSelectedId(assistant.id);
                setSelectedStarterPrompt("");
                setNotice("");
                setDetailOpen(true);
              }}
              aria-haspopup="dialog"
              aria-label={`查看助手 ${assistant.name}`}
            >
              <span className="figma-agent-symbol" style={{ background: assistant.color }}><Bot size={19} /></span>
              <small className="figma-agent-category">{assistant.category}</small>
              <strong>{assistant.name}</strong>
              <p>{assistant.description}</p>
              <span className="figma-agent-tags">
                {assistant.tags.map((tag) => <small key={tag}>{tag}</small>)}
              </span>
            </button>
          ))}
        </section>
      ) : (
        <div className="figma-empty-state" role="status">
          <Bot size={24} />
          <strong>没有找到匹配的助手</strong>
          <p>调整分类或搜索关键词。</p>
        </div>
      )}

      {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}

      <Dialog
        open={detailOpen && Boolean(selected)}
        labelledBy={titleId}
        describedBy={descriptionId}
        onClose={() => setDetailOpen(false)}
        className="figma-agent-dialog"
      >
        <div className="figma-agent-dialog-top">
          <span className="figma-agent-dialog-symbol" style={{ background: selected?.color }}>
            <Bot size={21} />
          </span>
          <button type="button" onClick={() => setDetailOpen(false)} aria-label="关闭助手详情" title="关闭">
            <X size={17} />
          </button>
        </div>
        <small>SPECIALIST AGENT</small>
        <h2 id={titleId}>{selected?.name || "助手详情"}</h2>
        {selected ? (
          <>
            <p id={descriptionId}>{selected.description}</p>
            <div className="figma-agent-dialog-tags" aria-label="助手标签">
              <span>{selected.category}</span>
              {selected.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            {selected.starterPrompts.length ? (
              <section className="figma-agent-starters" aria-label="开场问题">
                <strong>可以这样开始</strong>
                <div>
                  {selected.starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className={selectedStarterPrompt === prompt ? "active" : ""}
                      aria-pressed={selectedStarterPrompt === prompt}
                      onClick={() => setSelectedStarterPrompt((current) => current === prompt ? "" : prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <button type="button" className="figma-primary-action" onClick={startConversation}>
              <Sparkles size={16} />
              启动此助手
            </button>
          </>
        ) : null}
      </Dialog>
    </section>
  );
}

function TranslateStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [sourceLanguage, setSourceLanguage] = useState("中文（简体）");
  const [targetLanguage, setTargetLanguage] = useState("英语（美式）");
  const [tone, setTone] = useState<TranslationTone>("自然专业");
  const [source, setSource] = useState(defaultTranslationSource);
  const [result, setResult] = useState(defaultTranslationResult);
  const [copied, setCopied] = useState(false);
  const [activeCapability, setActiveCapability] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const sourceEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const { models, selectedModel, chooseModel } = useStudioModel(modelCatalog, "chat", userProvider, onUserProviderChange);

  useEffect(() => {
    setCopied(false);
  }, [result]);

  const swapLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage === "自动检测" ? "中文（简体）" : sourceLanguage);
    if (result) {
      setSource(result);
      setResult(source);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isUserProviderReady(userProvider)) {
      onRequestApiConfig();
      return;
    }
    if (!selectedModel || !source.trim()) {
      setNotice("请输入需要翻译的内容。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const prompt = `将以下内容从${sourceLanguage}翻译为${targetLanguage}。语气要求：${tone}。只输出自然、准确并符合目标语言习惯的译文：\n\n${source.trim()}`;
      const nextResult = await api.generate("translate" as GenerationModuleId, {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt
      });
      setResult(nextResult.text || "");
      onGenerationResult({
        ...nextResult,
        sourceModule: "translate" as ModuleId,
        prompt: source.trim(),
        modelId: selectedModel.id
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setBusy(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setNotice("无法复制译文，请手动选择文本。");
    }
  };

  const activateCapability = async (title: string) => {
    setActiveCapability(title);
    if (title === "文件翻译") {
      sourceEditorRef.current?.focus();
      setNotice("请粘贴文档或字幕内容，随后使用翻译文本。");
      return;
    }
    if (title === "术语库") {
      setTone("自然专业");
      setNotice("已启用术语一致性表达。");
      return;
    }
    if (!source && !result) return;
    try {
      await navigator.clipboard.writeText(`${source}\n\n${result}`.trim());
      setNotice("双语对照已复制。");
    } catch {
      setNotice("无法复制双语对照，请手动选择文本。");
    }
  };

  return (
    <section className="figma-module-view figma-translate-page" data-testid="translate-module">
      <header className="figma-page-hero figma-translate-hero">
        <p>09 / TRANSLATE</p>
        <h1>不只是翻译，<em>更像母语表达。</em></h1>
        <span>理解上下文、保留语气、选择恰当表达。让每一句话在另一种语言中自然发生。</span>
      </header>

      <form className="figma-translate-workspace" onSubmit={submit}>
        <div className="figma-translate-toolbar">
          <StudioModelSelect
            models={models}
            selectedModel={selectedModel}
            onChange={chooseModel}
            ariaLabel="翻译模型"
            className="figma-compact-model-menu figma-translate-model-menu"
            disabled={busy}
          />
          <div className="figma-language-row">
            <FigmaMenu
              className="figma-language-menu source"
              label="源语言"
              value={sourceLanguage}
              options={languageOptions.map((language) => ({ value: language, label: language }))}
              onChange={setSourceLanguage}
              ariaLabel="源语言"
            />
            <button type="button" onClick={swapLanguages} aria-label="交换语言" title="交换语言">
              <ArrowLeftRight size={17} />
            </button>
            <FigmaMenu
              className="figma-language-menu target"
              label="目标语言"
              value={targetLanguage}
              options={languageOptions.filter((language) => language !== "自动检测").map((language) => ({ value: language, label: language }))}
              onChange={setTargetLanguage}
              ariaLabel="目标语言"
            />
          </div>

          <div className="figma-tone-tabs" role="group" aria-label="翻译语气">
            {(["自然专业", "简洁", "营销感"] as TranslationTone[]).map((item) => (
              <button
                type="button"
                key={item}
                className={tone === item ? "active" : ""}
                aria-pressed={tone === item}
                onClick={() => setTone(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="figma-translate-editor">
          <section className="figma-translate-source">
            <header><strong>SOURCE</strong><span>{source.length} / 5,000</span></header>
            <textarea
              ref={sourceEditorRef}
              aria-label="待翻译内容"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="输入或粘贴需要翻译的内容..."
              maxLength={5000}
              rows={10}
            />
            <footer>
              <button
                type="button"
                className="figma-secondary-action"
                disabled={!source && !result}
                onClick={() => {
                  setSource("");
                  setResult("");
                  setNotice("");
                }}
              >
                清空
              </button>
              <button type="submit" className="figma-primary-action" disabled={busy || !source.trim() || !selectedModel}>
                {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                {busy ? "正在翻译" : "翻译文本"}
              </button>
            </footer>
          </section>

          <section className="figma-translate-result" aria-live="polite">
            <header>
              <strong>TRANSLATION · {tone}</strong>
              <button type="button" onClick={() => void copyResult()} disabled={!result} aria-label="复制译文">
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? "已复制" : "复制"}
              </button>
            </header>
            <div>
              {busy ? (
                <span className="figma-translate-loading"><Loader2 className="spin" size={22} />正在生成自然译文</span>
              ) : result ? (
                <p>{result}</p>
              ) : (
                <span className="figma-translate-empty"><Languages size={24} />译文会出现在这里</span>
              )}
            </div>
            <footer>
              <span><Check size={13} />语义保真</span>
              <span><Check size={13} />本地化表达</span>
            </footer>
          </section>
        </div>
        {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
        {!models.length ? <p className="figma-module-notice" role="status">暂无可用翻译模型。</p> : null}
      </form>

      <section className="figma-translate-capabilities" aria-label="翻译能力">
        {translationCapabilities.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.title}
              className={activeCapability === item.title ? "active" : ""}
              aria-pressed={activeCapability === item.title}
              onClick={() => void activateCapability(item.title)}
            >
              <Icon size={18} aria-hidden="true" />
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </button>
          );
        })}
      </section>
    </section>
  );
}

export default StudioModule;
