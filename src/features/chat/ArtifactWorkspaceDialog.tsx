import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  Code2,
  Download,
  FilePlus2,
  FolderKanban,
  Save,
  X
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog } from "../../components/ui";
import type { ArtifactKind, ArtifactRecord, ArtifactVersion } from "../../types";
import {
  artifactDownloadDetails,
  artifactMaxContentLength,
  artifactMaxLanguageLength,
  artifactMaxTitleLength,
  artifactPreviewDocument,
  currentArtifactVersion,
  type ArtifactDraft
} from "./artifactWorkspace";

type ArtifactSaveInput = {
  artifactId?: string;
  draft: ArtifactDraft;
};

type ArtifactWorkspaceDialogProps = {
  open: boolean;
  artifacts: ArtifactRecord[];
  initialDraft: ArtifactDraft | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSave: (input: ArtifactSaveInput) => Promise<ArtifactRecord>;
};

const kindOptions: ReadonlyArray<{ value: ArtifactKind; label: string }> = [
  { value: "html", label: "HTML" },
  { value: "markdown", label: "Markdown" },
  { value: "text", label: "文本" },
  { value: "code", label: "代码" }
];

const artifactMarkdownComponents: Components = {
  a({ children }) {
    return <span className="figma-artifact-markdown-reference">{children}</span>;
  },
  img({ alt }) {
    return (
      <span className="figma-artifact-markdown-reference">
        {alt ? `[图片：${alt}]` : "[图片]"}
      </span>
    );
  }
};

function formatArtifactTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function artifactKindLabel(kind: ArtifactKind) {
  return kindOptions.find((option) => option.value === kind)?.label || "代码";
}

function ArtifactPreview({ version }: { version: ArtifactVersion }) {
  if (version.kind === "html") {
    return (
      <iframe
        className="figma-artifact-html-preview"
        title="作品 HTML 安全预览"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={artifactPreviewDocument(version.content)}
      />
    );
  }
  if (version.kind === "markdown") {
    return (
      <div className="figma-artifact-markdown-preview">
        <ReactMarkdown components={artifactMarkdownComponents} remarkPlugins={[remarkGfm]}>
          {version.content}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <pre className="figma-artifact-text-preview" tabIndex={0}>
      <code>{version.content}</code>
    </pre>
  );
}

function ArtifactWorkspaceDialog({
  open,
  artifacts,
  initialDraft,
  returnFocusRef,
  onClose,
  onSave
}: ArtifactWorkspaceDialogProps) {
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [previewVersion, setPreviewVersion] = useState(1);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ArtifactKind>("code");
  const [language, setLanguage] = useState("text");
  const [content, setContent] = useState("");
  const [sourceConversationId, setSourceConversationId] = useState("");
  const [sourceMessageId, setSourceMessageId] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const sortedArtifacts = [...artifacts].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId);

  const loadVersion = (artifact: ArtifactRecord, version: ArtifactVersion) => {
    setSelectedArtifactId(artifact.id);
    setPreviewVersion(version.version);
    setTitle(artifact.title);
    setKind(version.kind);
    setLanguage(version.language);
    setContent(version.content);
    setSourceConversationId(version.sourceConversationId || "");
    setSourceMessageId(version.sourceMessageId || "");
    setNotice("");
  };

  const newArtifact = (draft: ArtifactDraft | null = null) => {
    const nextKind = draft?.kind || "code";
    setSelectedArtifactId("");
    setPreviewVersion(1);
    setTitle(draft?.title || "");
    setKind(nextKind);
    setLanguage(draft?.language || (nextKind === "html" ? "html" : nextKind === "markdown" ? "markdown" : "text"));
    setContent(draft?.content || "");
    setSourceConversationId(draft?.sourceConversationId || "");
    setSourceMessageId(draft?.sourceMessageId || "");
    setNotice("");
  };

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) return;
    if (initialDraft) {
      newArtifact(initialDraft);
      return;
    }
    if (!justOpened) return;
    const first = sortedArtifacts[0];
    if (first) {
      loadVersion(first, currentArtifactVersion(first));
      return;
    }
    newArtifact();
  // The dialog resets only when opened or when a code block supplies a new draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDraft]);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const saved = await onSave({
        artifactId: selectedArtifactId || undefined,
        draft: {
          title,
          kind,
          language,
          content,
          sourceConversationId: sourceConversationId || undefined,
          sourceMessageId: sourceMessageId || undefined
        }
      });
      loadVersion(saved, currentArtifactVersion(saved));
      setNotice(selectedArtifactId ? `已保存版本 ${saved.currentVersion}` : "作品已保存到当前浏览器");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "作品保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const exportArtifact = () => {
    if (!selectedArtifact) return;
    const details = artifactDownloadDetails(selectedArtifact);
    const blob = new Blob([details.version.content], { type: details.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = details.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const previewArtifactVersion = selectedArtifact?.versions.find((version) => version.version === previewVersion)
    || selectedArtifact && currentArtifactVersion(selectedArtifact)
    || {
      id: "artifact-draft-preview",
      version: 1,
      kind,
      language,
      content,
      createdAt: new Date().toISOString()
    };

  return (
    <Dialog
      open={open}
      labelledBy={titleId}
      onClose={onClose}
      canClose={!saving}
      initialFocusRef={titleInputRef}
      returnFocusRef={returnFocusRef}
      className="figma-artifact-dialog"
    >
      <header className="figma-artifact-header">
        <span aria-hidden="true"><FolderKanban size={19} /></span>
        <div>
          <small>LOCAL ARTIFACTS</small>
          <h2 id={titleId}>作品空间</h2>
          <p>本地保存、版本管理与安全预览</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="关闭作品空间" title="关闭">
          <X size={17} />
        </button>
      </header>

      <div className="figma-artifact-layout" aria-busy={saving}>
        <aside className="figma-artifact-library" aria-label="本地作品">
          <div>
            <strong>本地作品</strong>
            <span>{artifacts.length}</span>
          </div>
          <button type="button" className="figma-artifact-new" onClick={() => newArtifact()} disabled={saving}>
            <FilePlus2 size={15} />
            新建作品
          </button>
          {sortedArtifacts.length ? (
            <ul>
              {sortedArtifacts.map((artifact) => {
                const current = currentArtifactVersion(artifact);
                return (
                  <li key={artifact.id}>
                    <button
                      type="button"
                      className={artifact.id === selectedArtifactId ? "active" : ""}
                      aria-pressed={artifact.id === selectedArtifactId}
                      disabled={saving}
                      onClick={() => loadVersion(artifact, current)}
                    >
                      <Code2 size={15} />
                      <span><strong>{artifact.title}</strong><small>{artifactKindLabel(current.kind)} · v{current.version}</small></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="figma-artifact-empty">
              <FolderKanban size={20} />
              <span>暂未保存作品</span>
            </div>
          )}
        </aside>

        <div className="figma-artifact-editor">
          <div className="figma-artifact-fields">
            <label>
              <span>作品名称</span>
              <input
                ref={titleInputRef}
                value={title}
                maxLength={artifactMaxTitleLength}
                placeholder="未命名作品"
                disabled={saving}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              <span>类型</span>
              <select value={kind} disabled={saving} onChange={(event) => setKind(event.target.value as ArtifactKind)}>
                {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>语言</span>
              <input
                value={language}
                maxLength={artifactMaxLanguageLength}
                disabled={saving}
                onChange={(event) => setLanguage(event.target.value)}
              />
            </label>
          </div>

          {selectedArtifact ? (
            <div className="figma-artifact-versions" role="group" aria-label="作品版本">
              <span>版本</span>
              {selectedArtifact.versions.map((version) => (
                <button
                  type="button"
                  key={version.id}
                  className={version.version === previewVersion ? "active" : ""}
                  aria-pressed={version.version === previewVersion}
                  disabled={saving}
                  title={formatArtifactTime(version.createdAt)}
                  onClick={() => loadVersion(selectedArtifact, version)}
                >
                  v{version.version}
                </button>
              ))}
            </div>
          ) : null}

          <label className="figma-artifact-content-field">
            <span>内容</span>
            <textarea
              value={content}
              maxLength={artifactMaxContentLength}
              disabled={saving}
              spellCheck={kind === "markdown" || kind === "text"}
              onChange={(event) => setContent(event.target.value)}
            />
            <small>{content.length.toLocaleString("zh-CN")} / {artifactMaxContentLength.toLocaleString("zh-CN")}</small>
          </label>

          <section className="figma-artifact-preview" aria-label="作品预览">
            <header><strong>安全预览</strong><span>{artifactKindLabel(previewArtifactVersion.kind)}</span></header>
            {previewArtifactVersion.content ? (
              <ArtifactPreview version={{ ...previewArtifactVersion, kind, language, content }} />
            ) : (
              <div className="figma-artifact-preview-empty">输入内容后在此预览</div>
            )}
          </section>

          <footer className="figma-artifact-actions">
            <span role="status" aria-live="polite">{notice}</span>
            <button type="button" onClick={exportArtifact} disabled={saving || !selectedArtifact}>
              <Download size={15} />
              导出当前版本
            </button>
            <button type="button" className="primary" onClick={() => void save()} disabled={!content.trim() || saving}>
              <Save size={15} />
              {saving ? "正在保存" : selectedArtifact ? "保存新版本" : "保存作品"}
            </button>
          </footer>
        </div>
      </div>
    </Dialog>
  );
}

export default ArtifactWorkspaceDialog;
