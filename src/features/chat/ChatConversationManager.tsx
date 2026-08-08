import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Clock3,
  GitBranch,
  Pin,
  Search,
  X
} from "lucide-react";
import { Dialog } from "../../components/ui";
import type { Conversation } from "../../types";
import {
  activeConversations,
  archivedConversations,
  searchConversations
} from "./conversationRetrieval";
import {
  buildConversationBranchHistory,
  conversationBranchFamilyContains,
  filterConversationBranchHistory,
  type ConversationBranchHistoryNode
} from "./conversationBranchHistory";

type ConversationManagerView = "active" | "archived" | "branches";

type ChatConversationManagerProps = {
  open: boolean;
  conversations: Conversation[];
  currentConversationId: string;
  mutationsDisabled: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  onArchiveConversation: (conversationId: string) => void;
  onRestoreConversation: (conversationId: string) => void;
};

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function branchModeLabel(node: ConversationBranchHistoryNode) {
  if (!node.mode) return "原始对话";
  if (node.mode === "edit") return "编辑分支";
  if (node.mode === "retry") return "重试分支";
  return "继续分支";
}

function branchStatusLabel(node: ConversationBranchHistoryNode) {
  if (node.status === "orphan") return "上级缺失";
  if (node.status === "invalid") return "关系异常";
  if (node.truncated) return "后续已截断";
  return "";
}

type BranchNodeListProps = {
  nodes: ConversationBranchHistoryNode[];
  currentConversationId: string;
  mutationsDisabled: boolean;
  onOpenConversation: (conversationId: string) => void;
  onRestoreConversation: (conversationId: string) => void;
};

function BranchNodeList({
  nodes,
  currentConversationId,
  mutationsDisabled,
  onOpenConversation,
  onRestoreConversation
}: BranchNodeListProps) {
  return (
    <ul className="figma-branch-node-list">
      {nodes.map((node) => {
        const conversation = node.conversation;
        const archived = Boolean(conversation.archivedAt);
        const current = !archived && conversation.id === currentConversationId;
        const status = branchStatusLabel(node);
        return (
          <li
            key={conversation.id}
            className={`figma-branch-node${current ? " current" : ""}${archived ? " archived" : ""}`}
            data-branch-history-id={conversation.id}
            style={{ "--figma-branch-depth": Math.min(node.depth, 4) } as CSSProperties}
          >
            <div className="figma-branch-node-row">
              {archived ? (
                <div className="figma-conversation-manager-main archived">
                  <strong>{conversation.title || "新对话"}</strong>
                  <span>{conversation.preview || "暂无消息"}</span>
                  <small>
                    <GitBranch size={11} aria-hidden="true" />
                    <b>{branchModeLabel(node)}</b>
                    <Clock3 size={11} aria-hidden="true" />
                    <time dateTime={conversation.archivedAt || conversation.updatedAt}>
                      {formatConversationTime(conversation.archivedAt || conversation.updatedAt)}
                    </time>
                    <i>已归档</i>
                    {status ? <i>{status}</i> : null}
                  </small>
                </div>
              ) : (
                <button
                  type="button"
                  className="figma-conversation-manager-main"
                  disabled={mutationsDisabled}
                  aria-current={current ? "page" : undefined}
                  aria-label={`打开分支 ${conversation.title || "新对话"}`}
                  title={mutationsDisabled ? "请等待当前回复结束" : "打开分支"}
                  onClick={() => onOpenConversation(conversation.id)}
                >
                  <strong>{conversation.title || "新对话"}</strong>
                  <span>{conversation.preview || "暂无消息"}</span>
                  <small>
                    <GitBranch size={11} aria-hidden="true" />
                    <b>{branchModeLabel(node)}</b>
                    <Clock3 size={11} aria-hidden="true" />
                    <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt)}</time>
                    {current ? <i className="figma-branch-current-label">当前对话</i> : null}
                    {status ? <i>{status}</i> : null}
                  </small>
                </button>
              )}
              {archived ? (
                <button
                  type="button"
                  className="figma-conversation-manager-command restore"
                  disabled={mutationsDisabled}
                  aria-label={`恢复分支 ${conversation.title || "新对话"}`}
                  title={mutationsDisabled ? "请等待当前回复结束" : "恢复分支"}
                  onClick={() => onRestoreConversation(conversation.id)}
                >
                  <ArchiveRestore size={16} />
                </button>
              ) : null}
            </div>
            {node.children.length ? (
              <BranchNodeList
                nodes={node.children}
                currentConversationId={currentConversationId}
                mutationsDisabled={mutationsDisabled}
                onOpenConversation={onOpenConversation}
                onRestoreConversation={onRestoreConversation}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ChatConversationManager({
  open,
  conversations,
  currentConversationId,
  mutationsDisabled,
  returnFocusRef,
  onClose,
  onOpenConversation,
  onArchiveConversation,
  onRestoreConversation
}: ChatConversationManagerProps) {
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const branchViewInitializedRef = useRef(false);
  const [view, setView] = useState<ConversationManagerView>("active");
  const [query, setQuery] = useState("");
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<Set<string>>(new Set());
  const [listScrolling, setListScrolling] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const active = activeConversations(conversations);
  const archived = archivedConversations(conversations);
  const source = view === "active" ? active : archived;
  const results = view === "branches" ? [] : searchConversations(source, deferredQuery);
  const branchProjection = useMemo(
    () => buildConversationBranchHistory(conversations),
    [conversations]
  );
  const visibleBranchProjection = useMemo(
    () => filterConversationBranchHistory(branchProjection, deferredQuery),
    [branchProjection, deferredQuery]
  );
  const branchSearchActive = Boolean(deferredQuery.trim());

  useEffect(() => {
    if (!open) return;
    setView("active");
    setQuery("");
    setExpandedFamilyIds(new Set());
    branchViewInitializedRef.current = false;
    setListScrolling(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      branchViewInitializedRef.current = false;
      return;
    }
    if (view !== "branches") {
      branchViewInitializedRef.current = false;
      return;
    }
    if (branchViewInitializedRef.current) return;
    branchViewInitializedRef.current = true;
    const currentFamily = branchProjection.families.find((family) =>
      conversationBranchFamilyContains(family, currentConversationId)
    );
    const initialFamily = currentFamily || branchProjection.families[0];
    if (initialFamily) setExpandedFamilyIds(new Set([initialFamily.id]));
  }, [branchProjection, currentConversationId, open, view]);

  useEffect(() => () => {
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
  }, []);

  const handleListScroll = () => {
    setListScrolling(true);
    if (scrollTimerRef.current !== null) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      setListScrolling(false);
      scrollTimerRef.current = null;
    }, 650);
  };

  return (
    <Dialog
      open={open}
      labelledBy={titleId}
      onClose={onClose}
      initialFocusRef={searchInputRef}
      returnFocusRef={returnFocusRef}
      className="figma-conversation-manager"
    >
      <header className="figma-conversation-manager-header">
        <div>
          <p>CHAT HISTORY</p>
          <h2 id={titleId}>管理会话</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭会话管理" title="关闭">
          <X size={17} />
        </button>
      </header>

      <div className="figma-conversation-manager-tools">
        <label className="figma-conversation-search">
          <Search size={16} aria-hidden="true" />
          <span className="figma-visually-hidden">搜索会话</span>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            maxLength={240}
            placeholder="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="figma-conversation-view-tabs" role="tablist" aria-label="会话范围">
          <button
            type="button"
            role="tab"
            aria-selected={view === "active"}
            onClick={() => setView("active")}
          >
            活跃 <span>{active.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "archived"}
            onClick={() => setView("archived")}
          >
            已归档 <span>{archived.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "branches"}
            onClick={() => setView("branches")}
          >
            分支 <span>{branchProjection.families.length}</span>
          </button>
        </div>
      </div>

      <div
        className={`figma-conversation-manager-list${listScrolling ? " scrolling" : ""}`}
        onScroll={handleListScroll}
      >
        {view === "branches" && visibleBranchProjection.families.length ? (
          <ul className="figma-branch-family-list" aria-label="对话分支历史">
            {visibleBranchProjection.families.map((family) => {
              const expanded = branchSearchActive || expandedFamilyIds.has(family.id);
              return (
                <li key={family.id} className="figma-branch-family" data-branch-family-id={family.id}>
                  <button
                    type="button"
                    className="figma-branch-family-toggle"
                    aria-expanded={expanded}
                    disabled={branchSearchActive}
                    onClick={() => setExpandedFamilyIds((current) => {
                      const next = new Set(current);
                      if (next.has(family.id)) next.delete(family.id);
                      else next.add(family.id);
                      return next;
                    })}
                  >
                    <span>
                      <GitBranch size={16} aria-hidden="true" />
                      <strong>{family.root.conversation.title || "新对话"}</strong>
                      <small>{family.nodeCount} 个对话{family.hasArchived ? " · 含归档" : ""}</small>
                    </span>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {expanded ? (
                    <BranchNodeList
                      nodes={[family.root]}
                      currentConversationId={currentConversationId}
                      mutationsDisabled={mutationsDisabled}
                      onOpenConversation={onOpenConversation}
                      onRestoreConversation={onRestoreConversation}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : view !== "branches" && results.length ? (
          <ul aria-label={view === "active" ? "活跃会话" : "已归档会话"}>
            {results.map((conversation) => (
              <li key={conversation.id} data-conversation-manager-id={conversation.id}>
                {view === "active" ? (
                  <button
                    type="button"
                    className="figma-conversation-manager-main"
                    disabled={mutationsDisabled}
                    aria-label={`打开会话 ${conversation.title || "新对话"}`}
                    title={mutationsDisabled ? "请等待当前回复结束" : "打开会话"}
                    onClick={() => onOpenConversation(conversation.id)}
                  >
                    <strong>{conversation.title || "新对话"}</strong>
                    <span>{conversation.preview || "暂无消息"}</span>
                    <small>
                      {conversation.pinned ? <Pin size={11} aria-label="已置顶" /> : null}
                      <Clock3 size={11} aria-hidden="true" />
                      <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt)}</time>
                      <i>{conversation.messageCount} 条</i>
                    </small>
                  </button>
                ) : (
                  <div className="figma-conversation-manager-main archived">
                    <strong>{conversation.title || "新对话"}</strong>
                    <span>{conversation.preview || "暂无消息"}</span>
                    <small>
                      <Clock3 size={11} aria-hidden="true" />
                      <time dateTime={conversation.archivedAt || conversation.updatedAt}>
                        {formatConversationTime(conversation.archivedAt || conversation.updatedAt)}
                      </time>
                      <i>{conversation.messageCount} 条</i>
                    </small>
                  </div>
                )}
                {view === "active" ? (
                  <button
                    type="button"
                    className="figma-conversation-manager-command"
                    disabled={mutationsDisabled}
                    aria-label={`归档会话 ${conversation.title || "新对话"}`}
                    title={mutationsDisabled ? "请等待当前回复结束" : "归档"}
                    onClick={() => onArchiveConversation(conversation.id)}
                  >
                    <Archive size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="figma-conversation-manager-command restore"
                    disabled={mutationsDisabled}
                    aria-label={`恢复会话 ${conversation.title || "新对话"}`}
                    title={mutationsDisabled ? "请等待当前回复结束" : "恢复"}
                    onClick={() => onRestoreConversation(conversation.id)}
                  >
                    <ArchiveRestore size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="figma-conversation-manager-empty" role="status">
            <Archive size={22} aria-hidden="true" />
            <strong>{
              query.trim()
                ? view === "branches" ? "没有匹配的分支" : "没有匹配的会话"
                : view === "active" ? "暂无活跃会话" : view === "archived" ? "暂无已归档会话" : "暂无分支记录"
            }</strong>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default ChatConversationManager;
