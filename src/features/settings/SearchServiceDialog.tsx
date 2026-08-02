import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound, Search, X } from "lucide-react";
import { Dialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import type {
  SearchEngine,
  SearchProviderKind,
  SearchServiceConfig
} from "../../types";
import {
  isSearchServiceReady,
  sanitizeSearchServiceConfig,
  searchServicePresets
} from "./searchServiceConfig";

type SearchServiceDialogProps = {
  open: boolean;
  config: SearchServiceConfig;
  onSave: (config: SearchServiceConfig) => void;
  onClose: () => void;
};

const searchEngineOptions = [
  { value: "search_std", label: "标准搜索" },
  { value: "search_pro", label: "高级搜索" },
  { value: "search_pro_sogou", label: "高级搜索 · 搜狗" },
  { value: "search_pro_quark", label: "高级搜索 · 夸克" }
] as const satisfies readonly FigmaMenuOption[];

function SearchServiceDialog({ open, config, onSave, onClose }: SearchServiceDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [draft, setDraft] = useState<SearchServiceConfig>(() => sanitizeSearchServiceConfig(config));
  const [showKey, setShowKey] = useState(false);
  const normalized = useMemo(() => sanitizeSearchServiceConfig(draft), [draft]);
  const ready = isSearchServiceReady(normalized);

  useEffect(() => {
    if (!open) return;
    setDraft(sanitizeSearchServiceConfig(config));
    setShowKey(false);
  }, [config, open]);

  const selectProvider = (provider: SearchProviderKind) => {
    if (provider === draft.provider) return;
    setDraft({ ...searchServicePresets[provider], apiKey: "" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSave(normalized);
    onClose();
  };

  return (
    <Dialog
      open={open}
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      className="search-service-dialog"
    >
      <header className="search-service-head">
        <span className="search-service-mark" aria-hidden="true"><Search size={18} /></span>
        <div>
          <small>INDEPENDENT SEARCH</small>
          <h2 id={titleId}>联网搜索服务</h2>
          <p id={descriptionId}>搜索连接独立于当前对话模型，仅保存在本次浏览器会话。</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭联网搜索设置">
          <X size={17} />
        </button>
      </header>

      <form className="search-service-form" onSubmit={submit}>
        <fieldset className="search-service-provider">
          <legend>搜索厂商</legend>
          <div>
            <button
              type="button"
              className={draft.provider === "glm" ? "active" : ""}
              aria-pressed={draft.provider === "glm"}
              onClick={() => selectProvider("glm")}
            >
              智谱 GLM
            </button>
            <button
              type="button"
              className={draft.provider === "kimi" ? "active" : ""}
              aria-pressed={draft.provider === "kimi"}
              onClick={() => selectProvider("kimi")}
            >
              Kimi
            </button>
          </div>
        </fieldset>

        <label className="search-service-field">
          <span>API Key</span>
          <div className="search-service-input-wrap">
            <KeyRound size={16} />
            <input
              type={showKey ? "text" : "password"}
              autoComplete="off"
              aria-label="联网搜索 API Key"
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder="请输入搜索服务 API Key"
            />
            <button
              type="button"
              className="search-service-icon-action"
              onClick={() => setShowKey((value) => !value)}
              aria-label={showKey ? "隐藏联网搜索 API Key" : "显示联网搜索 API Key"}
              title={showKey ? "隐藏 API Key" : "显示 API Key"}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        {draft.provider === "glm" ? (
          <div className="search-service-options">
            <FigmaMenu
              className="search-service-field search-service-menu"
              label="搜索引擎"
              ariaLabel="GLM 搜索引擎"
              value={draft.searchEngine}
              options={searchEngineOptions}
              onChange={(searchEngine) => setDraft({ ...draft, searchEngine: searchEngine as SearchEngine })}
            />
            <label className="search-service-field">
              <span>结果数量</span>
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                aria-label="联网搜索结果数量"
                value={draft.count}
                onChange={(event) => setDraft({ ...draft, count: Number(event.target.value) })}
              />
            </label>
            <fieldset className="search-service-content-size">
              <legend>内容长度</legend>
              <div>
                <button type="button" className={draft.contentSize === "medium" ? "active" : ""} aria-pressed={draft.contentSize === "medium"} onClick={() => setDraft({ ...draft, contentSize: "medium" })}>标准</button>
                <button type="button" className={draft.contentSize === "high" ? "active" : ""} aria-pressed={draft.contentSize === "high"} onClick={() => setDraft({ ...draft, contentSize: "high" })}>详细</button>
              </div>
            </fieldset>
          </div>
        ) : (
          <>
            <label className="search-service-field">
              <span>搜索模型</span>
              <div className="search-service-input-wrap">
                <Search size={16} />
                <input
                  aria-label="Kimi 搜索模型"
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  placeholder="例如：kimi-k3"
                />
              </div>
            </label>
            <p className="search-service-warning" role="note">
              Kimi 使用官方 <code>$web_search</code> 兼容流程；该能力仍在升级，建议优先使用 GLM 独立搜索。
            </p>
          </>
        )}

        <footer className="search-service-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-action" disabled={!ready}>
            <Check size={16} />保存搜索服务
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export default SearchServiceDialog;
