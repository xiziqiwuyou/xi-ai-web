import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef
} from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  node?: unknown;
};

type MarkdownPreProps = ComponentPropsWithoutRef<"pre"> & {
  node?: unknown;
};

type CopyState = "idle" | "copied" | "failed";

const markdownCodeBlockContext = createContext(false);

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue with the HTTP-compatible fallback.
  }

  const textarea = document.createElement("textarea");
  const restoreTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
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
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const copyCode = async () => {
    const copied = await copyText(code);
    setCopyState(copied ? "copied" : "failed");
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      resetTimerRef.current = null;
    }, 1800);
  };

  const language = codeLanguage(className);
  return (
    <section className="figma-code-block" data-language={language}>
      <header>
        <span>{language}</span>
        <button
          type="button"
          onClick={() => void copyCode()}
          aria-label="复制代码"
          title="复制代码"
        >
          {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
          <span aria-live="polite">
            {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
          </span>
        </button>
      </header>
      <pre tabIndex={0} aria-label={`${language} 代码`}>
        <code {...props} className={className}>{code}</code>
      </pre>
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

const markdownComponents: Components = {
  code: MarkdownCode,
  pre: MarkdownPre
};

type ChatMessageContentProps = {
  content: string;
};

export default function ChatMessageContent({ content }: ChatMessageContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
