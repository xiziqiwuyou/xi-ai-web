import { useEffect, useMemo, useState } from "react";
import { compactModelLabel, modelsForCapability, preferredModelFor, vendorLabels } from "../../components/workbench";
import { FigmaMenu, type FigmaMenuOption, type FigmaMenuPlacement } from "../../components/ui";
import type { Assistant, GalleryItem, ModelCatalogEntry, ModuleId, UserProviderConfig } from "../../types";

export type FigmaPublicModuleId = "image" | "ppt" | "mindmap" | "assistants" | "translate";

export type StudioModuleProps = {
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

export function useStudioModel(
  modelCatalog: ModelCatalogEntry[],
  capability: "chat" | "image",
  userProvider: UserProviderConfig,
  onUserProviderChange: (patch: Partial<UserProviderConfig>) => void,
  filterModels: (models: ModelCatalogEntry[]) => ModelCatalogEntry[] = (models) => models
) {
  const models = useMemo(
    () => filterModels(modelsForCapability(modelCatalog, capability)),
    [capability, filterModels, modelCatalog]
  );
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

export function StudioModelSelect({
  models,
  selectedModel,
  onChange,
  ariaLabel,
  className = "figma-studio-field figma-model-field",
  disabled = false,
  placement = "auto"
}: {
  models: ModelCatalogEntry[];
  selectedModel?: ModelCatalogEntry;
  onChange: (modelId: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  placement?: FigmaMenuPlacement;
}) {
  const options = models.map<FigmaMenuOption>((model) => ({
    value: model.id,
    label: compactModelLabel(model),
    detail: `${model.vendorLabel || vendorLabels[model.vendor] || model.vendor} · ${model.capabilities.includes("image")
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
      placement={placement}
    />
  );
}
