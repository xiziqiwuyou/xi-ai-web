import { Download } from "lucide-react";
import type { GenerationResult } from "../../types";

type AssetGalleryProps = {
  assets: NonNullable<GenerationResult["assets"]>;
};

function AssetGallery({ assets }: AssetGalleryProps) {
  if (!assets.length) return null;

  return (
    <div className="asset-gallery">
      {assets.map((asset, index) => {
        const key = `${asset.url}-${index}`;
        const download = (
          <a className="asset-download" href={asset.url} download target="_blank" rel="noreferrer">
            <Download size={14} />
            下载
          </a>
        );

        if (asset.type === "image") {
          return (
            <figure key={key} className="asset-item">
              <img src={asset.url} alt={asset.label || "生成图片"} />
              {download}
            </figure>
          );
        }

        if (asset.type === "audio") {
          return (
            <figure key={key} className="asset-item">
              <audio controls src={asset.url}>
                <a href={asset.url}>{asset.label || "播放音频"}</a>
              </audio>
              {download}
            </figure>
          );
        }

        if (asset.type === "video") {
          return (
            <figure key={key} className="asset-item">
              <video controls src={asset.url}>
                <a href={asset.url}>{asset.label || "查看视频"}</a>
              </video>
              {download}
            </figure>
          );
        }

        return (
          <a key={key} href={asset.url} target="_blank" rel="noreferrer">
            {asset.label || asset.url}
          </a>
        );
      })}
    </div>
  );
}

export default AssetGallery;
