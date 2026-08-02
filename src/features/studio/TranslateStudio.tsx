import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

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
import { FigmaMenu } from "../../components/ui";
import { isUserProviderReady, userConnectionPayload } from "../settings/userProviderConfig";
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


type TranslationTone = "自然专业" | "简洁" | "营销感";

const defaultTranslationMaxInputCharacters = 100_000;
const languageOptions = ["自动检测", "中文（简体）", "英语（美式）", "日本語", "한국어", "Français", "Deutsch", "Español"];

const translationCapabilities = [
  { icon: FileUp, title: "文件翻译", detail: "上传 DOCX、PDF 或字幕文件" },
  { icon: BookOpen, title: "术语库", detail: "锁定品牌、产品和行业术语" },
  { icon: Columns2, title: "双语对照", detail: "保留段落级对照与审校痕迹" }
] as const;

const defaultTranslationSource = "今天，我们正式发布全新的 AI 创作工作台。它将复杂的思考过程转化为清晰、有影响力的内容，让每个团队都能更快地把想法变成成果。";
const defaultTranslationResult = "Today, we are officially launching our new AI creation workspace. It turns complex thinking into clear, impactful content—helping every team transform ideas into outcomes with greater speed.";

export function TranslateStudio({
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
  const sourceCharacterLimit = selectedModel?.maxInputCharacters || defaultTranslationMaxInputCharacters;
  const sourceOverLimit = source.length > sourceCharacterLimit;
  const formattedSourceLimit = sourceCharacterLimit.toLocaleString("en-US");

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
    if (sourceOverLimit) {
      setNotice(`当前模型最多允许约 ${formattedSourceLimit} 个输入字符，请缩短内容或切换更大上下文模型。`);
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
            <header>
              <strong>SOURCE</strong>
              <span
                className={sourceOverLimit ? "over-limit" : ""}
                title={`由后台为 ${selectedModel?.label || "当前模型"} 配置的最大输入字符数`}
              >
                {source.length.toLocaleString("en-US")} / {formattedSourceLimit} 字符
              </span>
            </header>
            <textarea
              ref={sourceEditorRef}
              aria-label="待翻译内容"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="输入或粘贴需要翻译的内容..."
              maxLength={sourceCharacterLimit}
              aria-invalid={sourceOverLimit}
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
              <button type="submit" className="figma-primary-action" disabled={busy || !source.trim() || !selectedModel || sourceOverLimit}>
                {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                {busy ? "正在翻译" : "翻译文本"}
              </button>
            </footer>
          </section>

          <section className="figma-translate-result" aria-live="polite">
            <header>
              <strong>TRANSLATION · {tone}</strong>
            </header>
            <div className="figma-translate-output">
              {busy ? (
                <span className="figma-translate-loading"><Loader2 className="spin" size={22} />正在生成自然译文</span>
              ) : result ? (
                <p>{result}</p>
              ) : (
                <span className="figma-translate-empty"><Languages size={24} />译文会出现在这里</span>
              )}
            </div>
            <footer>
              <button type="button" onClick={() => void copyResult()} disabled={!result} aria-label="复制译文">
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? "已复制" : "复制译文"}
              </button>
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
