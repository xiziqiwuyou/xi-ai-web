import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Copy,
  Download,
  Expand,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Maximize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Dialog } from "../../components/ui";
import {
  copyImageResult,
  downloadImageResult,
  type ImageResultTransform
} from "./imageResultActions";
import type { GenerationResult, ImageAspectRatio } from "../../types";

export type ImageResultAsset = NonNullable<GenerationResult["assets"]>[number] & { type: "image" };

type ImageResultGalleryProps = {
  assets: ImageResultAsset[];
  aspectRatio: ImageAspectRatio;
  busy: boolean;
  canEdit: boolean;
  onRegenerate: () => void;
  onEdit: (asset: ImageResultAsset, transform: ImageResultTransform, index: number) => Promise<void>;
};

const initialTransform: ImageResultTransform = {
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false
};

function normalizedRotation(value: number) {
  return ((value % 360) + 360) % 360;
}

function IconAction({
  label,
  disabled = false,
  onClick,
  children
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export default function ImageResultGallery({
  assets,
  aspectRatio,
  busy,
  canEdit,
  onRegenerate,
  onEdit
}: ImageResultGalleryProps) {
  const titleId = useId();
  const editUnavailableId = useId();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [transform, setTransform] = useState(initialTransform);
  const [zoom, setZoom] = useState(1);
  const [workingAction, setWorkingAction] = useState<"copy" | "download" | "edit" | "">("");
  const [notice, setNotice] = useState("");
  const selectedAsset = selectedIndex === null ? null : assets[selectedIndex] || null;
  const swapsDimensions = transform.rotation === 90 || transform.rotation === 270;
  const orientation = aspectRatio === "2:3" || aspectRatio === "9:16"
    ? "portrait"
    : aspectRatio === "3:2" || aspectRatio === "16:9"
      ? "landscape"
      : "square";

  useEffect(() => {
    setTransform(initialTransform);
    setZoom(1);
    setNotice("");
    setWorkingAction("");
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex !== null && !assets[selectedIndex]) setSelectedIndex(null);
  }, [assets, selectedIndex]);

  const closePreview = () => setSelectedIndex(null);
  const updateTransform = (patch: Partial<ImageResultTransform>) => {
    setTransform((current) => ({ ...current, ...patch }));
    setNotice("");
  };

  const copy = async () => {
    if (!selectedAsset) return;
    setWorkingAction("copy");
    setNotice("");
    try {
      const copied = await copyImageResult(selectedAsset.url, transform);
      setNotice(copied === "image" ? "图片已复制" : "浏览器不支持复制图片，已复制图片地址");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "复制图片失败");
    } finally {
      setWorkingAction("");
    }
  };

  const download = async () => {
    if (!selectedAsset || selectedIndex === null) return;
    setWorkingAction("download");
    setNotice("");
    try {
      await downloadImageResult(selectedAsset.url, transform, `xi-ai-image-${selectedIndex + 1}.png`);
      setNotice("图片下载已开始");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "下载图片失败");
    } finally {
      setWorkingAction("");
    }
  };

  const edit = async () => {
    if (!selectedAsset || selectedIndex === null || !canEdit) return;
    setWorkingAction("edit");
    setNotice("");
    try {
      await onEdit(selectedAsset, transform, selectedIndex);
      closePreview();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法将图片加入编辑模式");
    } finally {
      setWorkingAction("");
    }
  };

  return (
    <section className="figma-image-results" data-orientation={orientation} aria-labelledby="image-results-title">
      <header>
        <h2 id="image-results-title">本次结果</h2>
        <span>{assets.length} 张</span>
      </header>
      <div role="list" aria-label="本次生成图片">
        {assets.map((asset, index) => (
          <figure key={`${asset.url}-${index}`} role="listitem">
            <button
              type="button"
              className="figma-image-result-thumbnail"
              onClick={() => setSelectedIndex(index)}
              aria-label={`预览生成结果 ${index + 1}`}
            >
              <img
                src={asset.url}
                alt={`生成结果 ${index + 1}`}
                style={{ aspectRatio: aspectRatio.replace(":", " / ") }}
              />
              <span aria-hidden="true"><Expand size={15} /></span>
            </button>
            <figcaption>
              <strong>第 {index + 1} 张</strong>
              <span>点击预览</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {selectedAsset && selectedIndex !== null ? (
        <Dialog
          open
          labelledBy={titleId}
          onClose={closePreview}
          className="figma-image-preview-dialog"
        >
          <header className="figma-image-preview-head">
            <div>
              <small>IMAGE PREVIEW</small>
              <h2 id={titleId}>图片预览</h2>
              <p>第 {selectedIndex + 1} 张，共 {assets.length} 张</p>
            </div>
            <button type="button" data-dialog-initial-focus onClick={closePreview} aria-label="关闭图片预览" title="关闭图片预览">
              <X size={18} />
            </button>
          </header>

          <div
            className="figma-image-preview-stage"
            data-rotation={transform.rotation}
            data-flip-horizontal={transform.flipHorizontal ? "true" : "false"}
            data-flip-vertical={transform.flipVertical ? "true" : "false"}
            data-zoom={zoom.toFixed(2)}
            data-swaps-dimensions={swapsDimensions ? "true" : "false"}
          >
            <img
              src={selectedAsset.url}
              alt={`生成结果 ${selectedIndex + 1} 预览`}
              style={{
                transform: `rotate(${transform.rotation}deg) scale(${zoom * (transform.flipHorizontal ? -1 : 1)}, ${zoom * (transform.flipVertical ? -1 : 1)})`
              }}
            />
          </div>

          <footer className="figma-image-preview-footer">
            <div className="figma-image-transform-tools" role="group" aria-label="图片变换">
              <IconAction label="向左旋转" disabled={Boolean(workingAction)} onClick={() => updateTransform({ rotation: normalizedRotation(transform.rotation - 90) })}><RotateCcw size={17} /></IconAction>
              <IconAction label="向右旋转" disabled={Boolean(workingAction)} onClick={() => updateTransform({ rotation: normalizedRotation(transform.rotation + 90) })}><RotateCw size={17} /></IconAction>
              <IconAction label="水平翻转" disabled={Boolean(workingAction)} onClick={() => updateTransform({ flipHorizontal: !transform.flipHorizontal })}><FlipHorizontal2 size={17} /></IconAction>
              <IconAction label="垂直翻转" disabled={Boolean(workingAction)} onClick={() => updateTransform({ flipVertical: !transform.flipVertical })}><FlipVertical2 size={17} /></IconAction>
              <IconAction label="缩小图片" disabled={Boolean(workingAction) || zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}><ZoomOut size={17} /></IconAction>
              <output aria-label="当前缩放比例">{Math.round(zoom * 100)}%</output>
              <IconAction label="放大图片" disabled={Boolean(workingAction) || zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><ZoomIn size={17} /></IconAction>
              <IconAction label="重置图片变换" disabled={Boolean(workingAction)} onClick={() => { setTransform(initialTransform); setZoom(1); setNotice(""); }}><Maximize2 size={17} /></IconAction>
            </div>
            <div className="figma-image-preview-actions">
              <button type="button" disabled={busy || Boolean(workingAction)} onClick={() => { closePreview(); onRegenerate(); }}><RefreshCw size={16} />重新生成</button>
              <button
                type="button"
                disabled={!canEdit || busy || Boolean(workingAction)}
                aria-describedby={!canEdit ? editUnavailableId : undefined}
                onClick={() => void edit()}
                title={canEdit ? "将当前图片加入图生图" : "暂无可用图生图模型"}
              >
                <ImagePlus size={16} />编辑图片
              </button>
              <button type="button" disabled={Boolean(workingAction)} onClick={() => void copy()}><Copy size={16} />复制图片</button>
              <button type="button" className="primary" disabled={Boolean(workingAction)} onClick={() => void download()}><Download size={16} />下载图片</button>
            </div>
            {!canEdit ? <span id={editUnavailableId} className="figma-visually-hidden">暂无支持本地图片输入的可用图生图模型</span> : null}
            {notice ? <p className="figma-image-preview-notice" role="status">{notice}</p> : null}
          </footer>
        </Dialog>
      ) : null}
    </section>
  );
}
