import { useEffect, useRef, useState, type FormEvent, type UIEventHandler } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { api } from "../../api";
import { FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import type {
  GenerationResult,
  PptContentDensity,
  PptDeck,
  PptGenerationOptions,
  PptLanguage,
  PptNarrative,
  PptPresentationType,
  PptThemeId
} from "../../types";
import { pptDeckFromResult } from "../generation/pptDeck";
import { exportPptxFromDeck, exportPptxFromMarkdown } from "../generation/pptxExport";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
import PptDeckPreview from "./PptDeckPreview";
import { getPptPresentationPreset, pptPresentationPresets } from "./pptPresets";
import { StudioModelSelect, useStudioModel, type StudioModuleProps } from "./studioShared";

const audienceOptions: readonly FigmaMenuOption[] = [
  { value: "企业管理层", label: "企业管理层" },
  { value: "客户与合作伙伴", label: "客户与合作伙伴" },
  { value: "潜在投资人", label: "潜在投资人" },
  { value: "内部团队", label: "内部团队" },
  { value: "公开听众", label: "公开听众" },
  { value: "学生与学员", label: "学生与学员" }
];

const durationOptions: readonly FigmaMenuOption[] = [
  { value: "5 分钟", label: "5 分钟" },
  { value: "8-10 分钟", label: "8-10 分钟" },
  { value: "15 分钟", label: "15 分钟" },
  { value: "20 分钟", label: "20 分钟" },
  { value: "30 分钟", label: "30 分钟" }
];

const slideCountOptions: readonly FigmaMenuOption[] = [6, 8, 10, 12, 15].map((count) => ({
  value: String(count),
  label: `${count} 页`
}));

const presentationTypeOptions: readonly FigmaMenuOption[] = pptPresentationPresets.map((preset) => ({
  value: preset.id,
  label: preset.label,
  detail: preset.purpose
}));

const narrativeOptions: readonly FigmaMenuOption[] = [
  { value: "pyramid", label: "结论先行" },
  { value: "problem-solution", label: "问题与方案" },
  { value: "timeline", label: "时间线" },
  { value: "story", label: "故事叙事" },
  { value: "data-first", label: "数据驱动" }
];

const densityOptions: readonly FigmaMenuOption[] = [
  { value: "concise", label: "精简" },
  { value: "balanced", label: "均衡" },
  { value: "detailed", label: "详细" }
];

const languageOptions: readonly FigmaMenuOption[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
  { value: "bilingual", label: "中英双语" }
];

const visualToneOptions: readonly FigmaMenuOption[] = [
  { value: "专业简洁", label: "专业简洁" },
  { value: "极简科技", label: "极简科技" },
  { value: "稳重商务", label: "稳重商务" },
  { value: "明快创意", label: "明快创意" },
  { value: "教学清晰", label: "教学清晰" }
];

const themeOptions: readonly FigmaMenuOption[] = [
  { value: "red-note", label: "红白简报", detail: "清爽醒目" },
  { value: "business-blue", label: "商务蓝", detail: "稳重专业" },
  { value: "midnight", label: "深夜演示", detail: "深色聚焦" }
];

const initialPreset = getPptPresentationPreset("business-report");

function useScrollActivity() {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const onScroll: UIEventHandler<HTMLDivElement> = () => {
    setActive(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setActive(false), 520);
  };

  return { active, onScroll };
}

export function PptStudio({
  modelCatalog,
  userProvider,
  onUserProviderChange,
  onGenerationResult,
  onRequestApiConfig
}: StudioModuleProps) {
  const [topic, setTopic] = useState("生成式 AI 如何重塑企业创新");
  const [mustInclude, setMustInclude] = useState("");
  const [avoidContent, setAvoidContent] = useState("");
  const [presentationType, setPresentationType] = useState<PptPresentationType>(initialPreset.id);
  const [audience, setAudience] = useState(initialPreset.defaults.audience);
  const [duration, setDuration] = useState(initialPreset.defaults.duration);
  const [slideCount, setSlideCount] = useState(String(initialPreset.defaults.slideCount));
  const [narrative, setNarrative] = useState<PptNarrative>(initialPreset.defaults.narrative);
  const [contentDensity, setContentDensity] = useState<PptContentDensity>(initialPreset.defaults.contentDensity);
  const [language, setLanguage] = useState<PptLanguage>("zh-CN");
  const [visualTone, setVisualTone] = useState(initialPreset.defaults.visualTone);
  const [themeId, setThemeId] = useState<PptThemeId>(initialPreset.defaults.themeId);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [deck, setDeck] = useState<PptDeck | null>(null);
  const configScroll = useScrollActivity();
  const { models, selectedModel, chooseModel } = useStudioModel(
    modelCatalog,
    "chat",
    userProvider,
    onUserProviderChange
  );
  const activePreset = getPptPresentationPreset(presentationType);

  const applyPresentationPreset = (value: string) => {
    const preset = getPptPresentationPreset(value);
    setPresentationType(preset.id);
    setAudience(preset.defaults.audience);
    setDuration(preset.defaults.duration);
    setSlideCount(String(preset.defaults.slideCount));
    setNarrative(preset.defaults.narrative);
    setContentDensity(preset.defaults.contentDensity);
    setVisualTone(preset.defaults.visualTone);
    setThemeId(preset.defaults.themeId);
  };

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

    const pptOptions: PptGenerationOptions = {
      presentationType,
      audience,
      duration,
      slideCount: Number(slideCount),
      narrative,
      contentDensity,
      language,
      visualTone,
      themeId,
      mustInclude: mustInclude.trim() || undefined,
      avoidContent: avoidContent.trim() || undefined
    };

    setBusy(true);
    setNotice("");
    try {
      const prompt = topic.trim();
      const nextResult = await api.generate("ppt", {
        connection: userConnectionPayload(userProvider),
        modelId: selectedModel.id,
        prompt,
        options: { ppt: pptOptions }
      });
      const nextDeck = pptDeckFromResult(nextResult, prompt, themeId, Number(slideCount));
      const normalizedResult = { ...nextResult, deck: nextDeck };
      setResult(normalizedResult);
      setDeck(nextDeck);
      onGenerationResult({ ...normalizedResult, sourceModule: "ppt", prompt, modelId: selectedModel.id });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT 生成失败");
    } finally {
      setBusy(false);
    }
  };

  const downloadDeck = async () => {
    if ((!deck && !result?.text) || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      if (deck) {
        await exportPptxFromDeck(deck);
      } else if (result?.text) {
        await exportPptxFromMarkdown(result.text, topic.trim() || result.title);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PPT 导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="figma-module-view figma-ppt-page" data-testid="ppt-module">
      <header className="figma-page-hero figma-ppt-hero">
        <p>06 / AUTO-DECK</p>
        <h1>AI 一键 PPT</h1>
      </header>

      <div className="figma-ppt-workbench">
        <form className="figma-ppt-config-panel" onSubmit={submit}>
          <header>
            <small>CONTENT & STYLE</small>
            <h2>演示设置</h2>
          </header>

          <div
            className="figma-ppt-config-scroll"
            data-scroll-active={configScroll.active ? "true" : "false"}
            onScroll={configScroll.onScroll}
          >
            <section className="figma-ppt-config-section" aria-labelledby="ppt-content-settings">
              <h3 id="ppt-content-settings">内容</h3>
              <label className="figma-ppt-topic">
                <span>演示主题</span>
                <textarea
                  aria-label="演示主题"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  rows={4}
                  disabled={busy}
                  placeholder="输入这份演示需要讲清楚的主题"
                />
              </label>
              <div className="figma-ppt-prompt-ideas" aria-label="主题建议">
                {activePreset.promptIdeas.map((idea) => (
                  <button type="button" key={idea} disabled={busy} onClick={() => setTopic(idea)}>{idea}</button>
                ))}
              </div>
              <label className="figma-ppt-detail-field">
                <span>必须包含</span>
                <textarea
                  aria-label="必须包含的内容"
                  value={mustInclude}
                  onChange={(event) => setMustInclude(event.target.value)}
                  rows={2}
                  maxLength={1200}
                  disabled={busy}
                  placeholder="关键数据、结论或行动项"
                />
              </label>
              <label className="figma-ppt-detail-field">
                <span>避免内容</span>
                <textarea
                  aria-label="需要避免的内容"
                  value={avoidContent}
                  onChange={(event) => setAvoidContent(event.target.value)}
                  rows={2}
                  maxLength={800}
                  disabled={busy}
                  placeholder="不希望出现的表达或方向"
                />
              </label>
            </section>

            <section className="figma-ppt-config-section" aria-labelledby="ppt-structure-settings">
              <h3 id="ppt-structure-settings">结构</h3>
              <div className="figma-ppt-option-grid">
                <FigmaMenu className="figma-ppt-menu figma-ppt-wide-menu" label="演示类型" value={presentationType} options={presentationTypeOptions} onChange={applyPresentationPreset} ariaLabel="演示类型" disabled={busy} />
                <div className="figma-ppt-preset-summary" aria-live="polite">
                  <strong>{activePreset.label}</strong>
                  <p>{activePreset.purpose}</p>
                  <span>建议结构：{activePreset.sequence.join(" → ")}</span>
                </div>
                <FigmaMenu className="figma-ppt-menu" label="目标受众" value={audience} options={audienceOptions} onChange={setAudience} ariaLabel="目标受众" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="演示页数" value={slideCount} options={slideCountOptions} onChange={setSlideCount} ariaLabel="演示页数" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="演示时长" value={duration} options={durationOptions} onChange={setDuration} ariaLabel="演示时长" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="叙事方式" value={narrative} options={narrativeOptions} onChange={(value) => setNarrative(value as PptNarrative)} ariaLabel="叙事方式" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="内容密度" value={contentDensity} options={densityOptions} onChange={(value) => setContentDensity(value as PptContentDensity)} ariaLabel="内容密度" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="演示语言" value={language} options={languageOptions} onChange={(value) => setLanguage(value as PptLanguage)} ariaLabel="演示语言" disabled={busy} />
              </div>
            </section>

            <section className="figma-ppt-config-section" aria-labelledby="ppt-visual-settings">
              <h3 id="ppt-visual-settings">视觉与模型</h3>
              <div className="figma-ppt-option-grid">
                <StudioModelSelect models={models} selectedModel={selectedModel} onChange={chooseModel} ariaLabel="PPT 生成模型" className="figma-ppt-menu figma-ppt-wide-menu" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="视觉气质" value={visualTone} options={visualToneOptions} onChange={setVisualTone} ariaLabel="视觉气质" disabled={busy} />
                <FigmaMenu className="figma-ppt-menu" label="主题模板" value={themeId} options={themeOptions} onChange={(value) => setThemeId(value as PptThemeId)} ariaLabel="主题模板" disabled={busy} />
              </div>
            </section>

            {notice ? <p className="figma-module-notice" role="alert">{notice}</p> : null}
            {!models.length ? <p className="figma-module-notice" role="status">暂无可用演示模型。</p> : null}
          </div>

          <footer className="figma-ppt-config-actions">
            <button type="submit" className="figma-primary-action figma-ppt-submit" disabled={busy || !topic.trim() || !selectedModel}>
              {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              {busy ? "正在创作" : "生成演示稿"}
            </button>
            <span>{slideCount} 页 · {duration} · PPTX</span>
          </footer>
        </form>

        <PptDeckPreview deck={deck} busy={busy} exporting={exporting} onDownload={() => void downloadDeck()} />
      </div>
    </section>
  );
}
