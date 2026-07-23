import { FormEvent, useEffect, useMemo, useState } from "react";
import { Heart, Image as ImageIcon, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { api } from "../../api";
import AssetGallery from "../../components/workbench/AssetGallery";
import EmptyState from "../../components/workbench/EmptyState";
import { MasonryGrid } from "../../components/ui";
import {
  ConnectionStatus,
  GenerationOptions,
  ModelPicker,
  PromptComposer,
  WorkbenchLayout,
  compactModelLabel,
  modelsForCapability,
  preferredModelFor
} from "../../components/workbench";
import { consumeReplayDraft } from "../gallery/replayDraft";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import type {
  Assistant,
  GalleryItem,
  GenerationModuleId,
  GenerationResult,
  ModelCatalogEntry,
  PromptPreset,
  UserProviderConfig
} from "../../types";

type GenerationModuleProps = {
  moduleId: GenerationModuleId;
  title: string;
  description: string;
  assistants: Assistant[];
  galleryItems: GalleryItem[];
  modelCatalog: ModelCatalogEntry[];
  promptPresets: PromptPreset[];
  userProvider: UserProviderConfig;
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void;
  onGenerationResult: (item: GalleryItem) => void;
  onRemoveGalleryItem: (id: string) => void;
  onUpdateGalleryItem: (id: string, patch: Partial<GalleryItem>) => void;
  onRequestApiConfig: () => void;
};

type ImageDraft = {
  prompt: string;
  size: string;
  stylePreset: string;
  quality: string;
  negativePrompt: string;
};

const imagePresets = [
  "产品海报，干净高级，红白配色，留白充足，主体清晰",
  "小红书封面图，明亮质感，圆润卡片排版，适合种草分享",
  "生活方式摄影，柔和自然光，真实场景，高级但不夸张"
];

function hasImageAsset(item: GalleryItem) {
  return item.sourceModule === "image" && item.assets?.some((asset) => asset.type === "image");
}

function firstImageUrl(item: GalleryItem) {
  return item.assets?.find((asset) => asset.type === "image")?.url || "";
}

function GenerationModule({
  moduleId,
  title,
  description,
  galleryItems,
  modelCatalog,
  promptPresets,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRemoveGalleryItem,
  onUpdateGalleryItem,
  onRequestApiConfig
}: GenerationModuleProps) {
  const [draft, setDraft] = useState<ImageDraft>({
    prompt: "",
    size: "1024x1024",
    stylePreset: "自然高级",
    quality: "standard",
    negativePrompt: ""
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [mobileView, setMobileView] = useState<"input" | "preview" | "history">(() =>
    galleryItems.some(hasImageAsset) ? "preview" : "input"
  );

  const imageItems = useMemo(() => galleryItems.filter(hasImageAsset), [galleryItems]);
  const selectedImage = imageItems.find((item) => item.id === selectedImageId) || imageItems[0] || null;
  const modulePromptPresets = useMemo(
    () => promptPresets.filter((preset) => preset.enabled && preset.moduleId === moduleId),
    [moduleId, promptPresets]
  );
  const presetLabels = modulePromptPresets.length
    ? modulePromptPresets.map((preset) => preset.title)
    : imagePresets;
  const presetPromptByTitle = useMemo(
    () => new Map(modulePromptPresets.map((preset) => [preset.title, preset.prompt])),
    [modulePromptPresets]
  );

  const ready = isUserProviderReady(userProvider);
  const availableModels = useMemo(() => modelsForCapability(modelCatalog, "image"), [modelCatalog]);
  const selectedModel =
    availableModels.find((entry) => entry.id === selectedModelId) ||
    preferredModelFor(availableModels, "image", userProvider.lastModelId);
  const canSubmit = ready && Boolean(selectedModel) && Boolean(draft.prompt.trim()) && !busy;

  useEffect(() => {
    if (!availableModels.length) {
      setSelectedModelId("");
      return;
    }
    setSelectedModelId((current) => {
      if (availableModels.some((entry) => entry.id === current)) return current;
      return preferredModelFor(availableModels, "image", userProvider.lastModelId)?.id || "";
    });
  }, [availableModels, userProvider.lastModelId]);

  useEffect(() => {
    const replay = consumeReplayDraft(moduleId);
    if (replay?.prompt) {
      updateDraft({ prompt: replay.prompt });
      if (replay.modelId) setSelectedModelId(replay.modelId);
    }
  }, [moduleId]);

  useEffect(() => {
    if (selectedImageId && imageItems.some((item) => item.id === selectedImageId)) return;
    setSelectedImageId(imageItems[0]?.id || "");
  }, [imageItems, selectedImageId]);

  const updateDraft = (patch: Partial<ImageDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      if (!ready) {
        setError("请先填写 API URL 和 Key");
        onRequestApiConfig();
        return;
      }
      if (!selectedModel) {
        setError("请先在后台启用可用的绘画模型");
        return;
      }
      setError("请补充画面描述");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (!selectedModel) return;
      const nextResult = await api.generate("image", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt: draft.prompt.trim(),
        options: {
          size: draft.size,
          negativePrompt: draft.negativePrompt,
          stylePreset: draft.stylePreset,
          quality: draft.quality
        }
      });
      setResult(nextResult);
      setSelectedImageId(nextResult.id);
      setMobileView("preview");
      onGenerationResult({
        ...nextResult,
        sourceModule: "image",
        prompt: draft.prompt.trim(),
        modelId: selectedModel.id
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setBusy(false);
    }
  };

  const reusePrompt = (item: GalleryItem) => {
    updateDraft({ prompt: item.prompt || "" });
    if (item.modelId) setSelectedModelId(item.modelId);
    setSelectedImageId(item.id);
    setMobileView("input");
  };

  const sidebar = (
    <form id="drawing-input-panel" className="workbench-form" onSubmit={submit}>
      <ConnectionStatus ready={ready} modelLabel={compactModelLabel(selectedModel)} onOpenSettings={onRequestApiConfig} />

      <ModelPicker
        className="workbench-model-picker"
        models={modelCatalog}
        capability="image"
        value={selectedModel?.id || ""}
        onChange={(modelId) => {
          setSelectedModelId(modelId);
          onUserProviderChange({ lastModelId: modelId });
        }}
      />

      <PromptComposer
        label="画面描述"
        value={draft.prompt}
        placeholder="写下主体、场景、风格、光线、构图和需要突出的细节"
        rows={6}
        presets={presetLabels}
        submitLabel="生成图片"
        busy={busy}
        disabled={!canSubmit}
        notice={error}
        onChange={(prompt) => updateDraft({ prompt })}
        onPresetPick={(prompt) => updateDraft({ prompt: presetPromptByTitle.get(prompt) || prompt })}
      >
        <GenerationOptions>
          <label>
            尺寸
            <select value={draft.size} onChange={(event) => updateDraft({ size: event.target.value })}>
              <option value="1024x1024">1024 x 1024</option>
              <option value="1024x1792">1024 x 1792</option>
              <option value="1792x1024">1792 x 1024</option>
              <option value="1280x720">1280 x 720</option>
            </select>
          </label>
          <label>
            风格
            <select value={draft.stylePreset} onChange={(event) => updateDraft({ stylePreset: event.target.value })}>
              <option value="自然高级">自然高级</option>
              <option value="小红书封面">小红书封面</option>
              <option value="产品摄影">产品摄影</option>
              <option value="电影感">电影感</option>
            </select>
          </label>
          <label>
            质量
            <select value={draft.quality} onChange={(event) => updateDraft({ quality: event.target.value })}>
              <option value="standard">standard</option>
              <option value="hd">hd</option>
            </select>
          </label>
          <label className="wide-option">
            负面提示
            <input
              value={draft.negativePrompt}
              onChange={(event) => updateDraft({ negativePrompt: event.target.value })}
              placeholder="不希望出现的元素"
            />
          </label>
        </GenerationOptions>
      </PromptComposer>
    </form>
  );

  const mobileNavigation = (
    <div className="option-segmented drawing-mobile-tabs" role="tablist" aria-label="绘画工作区">
      {([
        ["input", "输入", "drawing-input-panel"],
        ["preview", "预览", "drawing-preview-panel"],
        ["history", "历史", "drawing-history-panel"]
      ] as const).map(([view, label, controls]) => (
        <button
          key={view}
          type="button"
          role="tab"
          className={mobileView === view ? "active" : ""}
          aria-selected={mobileView === view}
          aria-controls={controls}
          onClick={() => setMobileView(view)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <WorkbenchLayout
      title={title}
      description={description}
      icon={Wand2}
      badges={["历史作品", "继续绘画", "画廊保存"]}
      sidebar={sidebar}
      className={`drawing-workbench mobile-${mobileView}`}
      sidebarTitle="创作设置"
      mobileNavigation={mobileNavigation}
    >
      <section className="image-studio">
        <header className="image-studio-head">
          <div>
            <strong>图片预览</strong>
            <span>{busy ? "正在生成" : selectedImage ? "已选择最近作品" : "等待创作"}</span>
          </div>
          {selectedImage ? (
            <button type="button" className="secondary-action compact-action" onClick={() => reusePrompt(selectedImage)}>
              <RotateCcw size={15} />
              复用提示词
            </button>
          ) : null}
        </header>

        <div id="drawing-preview-panel" className="image-preview-region" role="tabpanel">
          {selectedImage ? (
            <article className="image-studio-preview">
              <header>
                <div>
                  <strong>{selectedImage.title}</strong>
                  <span>{new Date(selectedImage.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <div className="image-studio-actions">
                  <button
                    type="button"
                    className={selectedImage.favorite ? "icon-button active-soft" : "icon-button"}
                    onClick={() => onUpdateGalleryItem(selectedImage.id, { favorite: !selectedImage.favorite })}
                    aria-label={selectedImage.favorite ? "取消收藏" : "收藏"}
                    title={selectedImage.favorite ? "取消收藏" : "收藏"}
                  >
                    <Heart size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => {
                      if (window.confirm(`确定删除“${selectedImage.title}”吗？`)) {
                        onRemoveGalleryItem(selectedImage.id);
                      }
                    }}
                    aria-label="删除图片"
                    title="删除图片"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>
              <AssetGallery assets={selectedImage.assets || []} />
              <p>{selectedImage.prompt || "未记录提示词"}</p>
            </article>
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="还没有画过的图"
              description="输入画面描述，生成的图片会直接出现在这里。"
            />
          )}
        </div>

        <section id="drawing-history-panel" className="image-history-panel" role="tabpanel">
          <header>
            <strong>最近生成</strong>
            <span>{imageItems.length ? `${imageItems.length} 张` : "暂无记录"}</span>
          </header>
          {imageItems.length ? (
            <MasonryGrid className="image-history-grid" label="已生成图片">
              {imageItems.map((item) => {
                const imageUrl = firstImageUrl(item);
                return (
                  <div key={item.id} className="masonry-item" role="listitem">
                    <button
                      type="button"
                      className={item.id === selectedImage?.id ? "image-history-card active" : "image-history-card"}
                      aria-pressed={item.id === selectedImage?.id}
                      onClick={() => {
                        setSelectedImageId(item.id);
                        setMobileView("preview");
                      }}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt={item.title} />
                      ) : (
                        <span className="image-history-fallback">
                          <ImageIcon size={20} />
                        </span>
                      )}
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.prompt || "未记录提示词"}</small>
                      </span>
                    </button>
                  </div>
                );
              })}
            </MasonryGrid>
          ) : (
            <EmptyState icon={ImageIcon} title="暂无历史" description="生成后的图片会保留在这里。" />
          )}
        </section>
      </section>
    </WorkbenchLayout>
  );
}

export default GenerationModule;
