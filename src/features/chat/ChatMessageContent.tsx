import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef
} from "react";
import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FolderPlus } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { ChatCodeTheme } from "./chatSessionSettings";
import {
  artifactFromCodeLanguage,
  artifactPreviewDocument,
  type ArtifactDraft
} from "./artifactWorkspace";

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & { node?: unknown };
type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };
type CopyState = "idle" | "copied" | "failed";

type CodeRenderSettings = {
  codeTheme: ChatCodeTheme;
  styledCodeBlocks: boolean;
  showCodeLineNumbers: boolean;
  collapseCodeBlocks: boolean;
  wrapCode: boolean;
  enableCodePreview: boolean;
  onSaveArtifact?: (draft: ArtifactDraft) => void;
  sourceConversationId?: string;
  sourceMessageId?: string;
};

export type ChatMessageContentProps = CodeRenderSettings & {
  content: string;
  plainText: boolean;
  collapseThinking: boolean;
  renderMath: boolean;
  enableSingleDollarMath: boolean;
};

const defaultCodeSettings: CodeRenderSettings = {
  codeTheme: "auto",
  styledCodeBlocks: true,
  showCodeLineNumbers: true,
  collapseCodeBlocks: false,
  wrapCode: false,
  enableCodePreview: true
};

const markdownCodeBlockContext = createContext(false);
const codeRenderSettingsContext = createContext<CodeRenderSettings>(defaultCodeSettings);

export async function copyTextToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue with the HTTP-compatible fallback.
  }

  const textarea = document.createElement("textarea");
  const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = value;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  try {
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
  }
}

function codeLanguage(className?: string) {
  return /(?:^|\s)language-([\w-]+)/u.exec(className || "")?.[1] || "text";
}

function ChatCodeBlock({ className, children, node: _node, ...props }: MarkdownCodeProps) {
  const code = String(children).replace(/\n$/u, "");
  const settings = useContext(codeRenderSettingsContext);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [collapsed, setCollapsed] = useState(settings.collapseCodeBlocks && code.split("\n").length > 8);
  const [previewOpen, setPreviewOpen] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const language = codeLanguage(className);
  const canPreview = settings.enableCodePreview && ["html", "htm"].includes(language.toLowerCase());

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const copyCode = async () => {
    const copied = await copyTextToClipboard(code);
    setCopyState(copied ? "copied" : "failed");
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      resetTimerRef.current = null;
    }, 1800);
  };

  const codeLines = code.split("\n");
  if (!settings.styledCodeBlocks) {
    return (
      <pre className={`figma-code-plain${settings.wrapCode ? " wrap" : ""}`} tabIndex={0} aria-label={`${language} 代码`}>
        <code {...props} className={className}>{code}</code>
      </pre>
    );
  }

  return (
    <section
      className={`figma-code-block${settings.wrapCode ? " wrap" : ""}${collapsed ? " collapsed" : ""}`}
      data-language={language}
      data-theme={settings.codeTheme}
    >
      <header>
        <span>{language}</span>
        <div>
          <button type="button" className="figma-code-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "展开代码" : "折叠代码"} aria-expanded={!collapsed}>
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          {canPreview ? (
            <button type="button" onClick={() => setPreviewOpen((value) => !value)} aria-label={previewOpen ? "关闭代码预览" : "预览代码"} aria-pressed={previewOpen}>
              {previewOpen ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{previewOpen ? "关闭预览" : "预览"}</span>
            </button>
          ) : null}
          {settings.onSaveArtifact ? (
            <button
              type="button"
              onClick={() => settings.onSaveArtifact?.({
                kind: artifactFromCodeLanguage(language),
                language,
                content: code,
                sourceConversationId: settings.sourceConversationId,
                sourceMessageId: settings.sourceMessageId
              })}
              aria-label="保存为作品"
              title="保存为作品"
            >
              <FolderPlus size={13} />
              <span>保存为作品</span>
            </button>
          ) : null}
          <button type="button" onClick={() => void copyCode()} aria-label="复制代码" title="复制代码">
            {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
            <span aria-live="polite">{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}</span>
          </button>
        </div>
      </header>
      {!collapsed ? (
        <pre tabIndex={0} aria-label={`${language} 代码`}>
          <code {...props} className={className}>
            {codeLines.map((line, index) => (
              <span className="figma-code-line" key={`${index}-${line.slice(0, 16)}`}>
                {settings.showCodeLineNumbers ? <i aria-hidden="true">{index + 1}</i> : null}
                <b>{line || "\n"}</b>
                {index < codeLines.length - 1 ? "\n" : null}
              </span>
            ))}
          </code>
        </pre>
      ) : null}
      {previewOpen && canPreview ? (
        <iframe
          className="figma-code-preview"
          title="HTML 代码预览"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={artifactPreviewDocument(code)}
        />
      ) : null}
    </section>
  );
}

function MarkdownCode({ className, children, node, ...props }: MarkdownCodeProps) {
  const raw = String(children);
  const isBlockCode = useContext(markdownCodeBlockContext);
  if (isBlockCode || className?.includes("language-") || raw.endsWith("\n")) {
    return <ChatCodeBlock {...props} className={className} node={node}>{children}</ChatCodeBlock>;
  }
  return <code {...props} className="figma-inline-code">{children}</code>;
}

function MarkdownPre({ children }: MarkdownPreProps) {
  return <markdownCodeBlockContext.Provider value>{children}</markdownCodeBlockContext.Provider>;
}

const markdownComponents: Components = { code: MarkdownCode, pre: MarkdownPre };

function splitThinking(content: string) {
  const thoughts: string[] = [];
  const visible = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, thought: string) => {
    const normalized = thought.trim();
    if (normalized) thoughts.push(normalized);
    return "";
  }).trim();
  return { visible, thoughts };
}

export default function ChatMessageContent({
  content,
  plainText = false,
  collapseThinking = true,
  renderMath = true,
  enableSingleDollarMath = true,
  codeTheme = "auto",
  styledCodeBlocks = true,
  showCodeLineNumbers = true,
  collapseCodeBlocks = false,
  wrapCode = false,
  enableCodePreview = true,
  onSaveArtifact,
  sourceConversationId,
  sourceMessageId
}: Partial<ChatMessageContentProps> & Pick<ChatMessageContentProps, "content">) {
  const separated = useMemo(() => splitThinking(content), [content]);
  const codeSettings = useMemo<CodeRenderSettings>(() => ({
    codeTheme,
    styledCodeBlocks,
    showCodeLineNumbers,
    collapseCodeBlocks,
    wrapCode,
    enableCodePreview,
    onSaveArtifact,
    sourceConversationId,
    sourceMessageId
  }), [
    codeTheme,
    styledCodeBlocks,
    showCodeLineNumbers,
    collapseCodeBlocks,
    wrapCode,
    enableCodePreview,
    onSaveArtifact,
    sourceConversationId,
    sourceMessageId
  ]);
  const remarkPlugins = useMemo(() => renderMath
    ? [remarkGfm, [remarkMath, { singleDollarTextMath: enableSingleDollarMath }]]
    : [remarkGfm], [enableSingleDollarMath, renderMath]);
  const rehypePlugins = useMemo(() => renderMath ? [rehypeKatex] : [], [renderMath]);

  return (
    <codeRenderSettingsContext.Provider value={codeSettings}>
      {separated.thoughts.map((thought, index) => (
        <details className="figma-thinking-block" key={`${index}-${thought.slice(0, 24)}`} open={!collapseThinking}>
          <summary>思考过程</summary>
          <p>{thought}</p>
        </details>
      ))}
      {plainText ? (
        <p className="figma-message-plain-text">{separated.visible}</p>
      ) : (
        <ReactMarkdown
          remarkPlugins={remarkPlugins as never}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {separated.visible}
        </ReactMarkdown>
      )}
    </codeRenderSettingsContext.Provider>
  );
}
