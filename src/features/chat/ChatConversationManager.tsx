import {
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  Archive,
  ArchiveRestore,
  Clock3,
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

type ConversationManagerView = "active" | "archived";

type ChatConversationManagerProps = {
  open: boolean;
  conversations: Conversation[];
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

function ChatConversationManager({
  open,
  conversations,
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
  const [view, setView] = useState<ConversationManagerView>("active");
  const [query, setQuery] = useState("");
  const [listScrolling, setListScrolling] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const active = activeConversations(conversations);
  const archived = archivedConversations(conversations);
  const source = view === "active" ? active : archived;
  const results = searchConversations(source, deferredQuery);

  useEffect(() => {
    if (!open) return;
    setView("active");
    setQuery("");
    setListScrolling(false);
  }, [open]);

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
        </div>
      </div>

      <div
        className={`figma-conversation-manager-list${listScrolling ? " scrolling" : ""}`}
        onScroll={handleListScroll}
      >
        {results.length ? (
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
            <strong>{query.trim() ? "没有匹配的会话" : view === "active" ? "暂无活跃会话" : "暂无已归档会话"}</strong>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default ChatConversationManager;
