# P2A Conversation Retrieval And Archive Proposal

## Status

Proposed planning artifact. Do not activate or implement this work until the
completed P1 message-branching changes are committed and its task is closed.

## Context Summary

The clean-room LobeChat capability roadmap has one completed implementation
slice:

- P1 message actions and local conversation branches: copy, continue, edit,
  retry, immutable parent history, provenance, and browser coverage.

The next roadmap candidate was conversation retrieval and organization. The
current product already stores complete conversations locally in IndexedDB,
hydrates them into `ChatModule`, and renders active conversations as an
expandable session stack. It has pinning and local import/export, but no
conversation query, archive lifecycle, or manager surface.

## Recommended Delivery Boundary

Split the roadmap item into two independently releasable tasks.

### P2A: Local Conversation Retrieval And Archive

Implement now after P1 is committed:

- Local full-text search over title, preview, and persisted message text.
- One accessible conversation-manager surface with Active and Archived views.
- Explicit archive and restore operations.
- Existing pinning, branches, import/export, and local-first BYOK behavior
  remain intact.

### P2B: Lightweight Conversation Groups

Defer until P2A usage is validated:

- One-level user-created groups with a dedicated local collection record.
- Group ordering, assignment, and deletion semantics.
- No nested folders, sharing, server sync, or automatic AI classification.

This split prevents a new group schema, migration, and drag ordering from
obscuring the simpler retrieval/archive behavior.

## Product Decisions For P2A

- Search stays entirely browser-local. It never calls the provider, server,
  embedding model, or independent search provider.
- The initial query covers title, preview, and message `content` only. Do not
  index attachment text, image data, knowledge excerpts, URLs, API Keys, or
  transient composer state.
- Search is bounded: trim and cap the query, rank title matches above preview
  and body matches, and cap displayed results. It must not block a streaming
  Chat render.
- Archive is reversible and local. It marks a conversation with optional
  `archivedAt`, clears its pin, removes it from the active session stack, and
  preserves its messages and optional branch provenance.
- Restore is explicit, clears `archivedAt`, leaves the conversation unpinned,
  and opens the restored session at the top. It may update `updatedAt` because
  restoration is a user interaction.
- There is no permanent deletion in P2A. It avoids dangling branch provenance
  and gives users a reversible first lifecycle action.
- Archiving/restoring is unavailable while any Chat request streams. Search
  itself remains read-only and available.
- If the last active conversation is archived, the existing default-new-chat
  behavior must use the active subset rather than incorrectly treating the
  archived collection as an open session.

## Data And Compatibility Boundary

```ts
type Conversation = ConversationSummary & {
  archivedAt?: string;
  branch?: ConversationBranch;
  messages: Message[];
};
```

- `archivedAt` is an optional ISO timestamp. Legacy records without it remain
  active.
- Workspace and single-conversation archives sanitize the field independently.
  Malformed or oversized values are dropped without dropping the conversation.
- Branch provenance stays unchanged. Archiving a parent never cascades to a
  child branch and restoring one record never mutates another.
- Search query, current filter, manager visibility, and scroll/focus state are
  transient UI state. They do not enter IndexedDB, export files, server
  bootstrap, logs, or analytics.

## UX Boundary

- Add one compact `管理会话` control in the Chat header. Reuse the project dialog
  and scroll-owner rules instead of adding a second persistent sidebar or
  nested chat scroller.
- The manager opens with a search field, Active/Archived segmented filter, and
  compact result rows containing title, preview, last-used time, pin state, and
  archive/restore command.
- Opening an active result collapses other sessions and expands it at the top.
  Opening an archived result first requires the explicit restore command.
- Use existing Lucide icons, dialog focus handling, tokens, dark theme, and
  mobile `44px` control targets. Do not copy another product's layout or copy.

## Full Execution Prompt

```text
以 clean-room 方式为 xi-ai-web 实现 P2A“本地会话检索与归档”。仅借鉴公开产品行为；不得复制 LobeChat 或其他项目的源码、组件结构、样式、文案、资产、依赖、数据模型或应用架构。

前置条件：P1 消息分支任务已提交并关闭。保持当前 React/Vite/Express/IndexedDB/BYOK 架构，不引入新依赖、不改 Provider 端点、不新增服务端会话存储、不新增账号、分享、同步、向量检索或远程搜索。

功能范围：
1. 为 Conversation 增加可选 archivedAt ISO 时间戳；旧数据缺失该字段时仍是活跃会话。
2. 仅在浏览器本地实现会话搜索。搜索内容仅包括标题、预览和持久化消息 content；不得扫描附件文本、图片数据、知识库片段、URL、API Key、草稿、Skill/app、联网搜索状态或任何 transient UI 状态。
3. 搜索输入需 trim、长度受限、大小写无关，支持中文连续文本与拉丁文本；标题匹配权重高于预览，预览高于正文；结果数受限。搜索、切换筛选和打开管理器不得发起 Chat、Provider、搜索、知识库或服务端请求。
4. 增加一个可访问的“管理会话”入口，复用当前 Dialog、焦点、Esc、背景 inert、单一 scroll owner、移动端安全视口与深浅色 token。不要添加常驻第二侧边栏、嵌套聊天滚动容器或大面积营销卡片。
5. 管理器提供“活跃 / 已归档”筛选、搜索输入、紧凑会话行、打开活跃会话、归档、恢复。行中展示标题、预览、最近使用时间、置顶状态及对应命令。
6. 归档操作必须显式执行：写入 archivedAt、取消 pinned、从活跃会话堆栈移除，但保留全部消息、分支 provenance 和导入导出兼容性。归档不可级联到父/子分支。
7. 恢复操作必须显式执行：移除 archivedAt、保持未置顶、使会话在活跃堆栈顶部展开，其余会话自动折叠。归档记录不能通过“打开”隐式恢复。
8. 任意 Chat 流式请求期间禁用归档、恢复和会话切换的写操作；搜索保持只读。若所有活跃会话都被归档，默认新对话逻辑必须基于活跃集合创建新会话，而不是把归档会话当作已打开会话。
9. archivedAt 必须经过 workspace archive、conversation archive、IndexedDB 保存/加载和导入/导出的 allowlist 清洗。非法、过长、非 ISO 值仅丢弃 archivedAt，不得丢弃整个会话。不得通过 archive 写入任何 Key、URL 或 transient 状态。
10. 不实现会话分组、嵌套文件夹、永久删除、批量操作、跨设备同步、云端会话、AI 自动分类、会话摘要搜索、语义/向量搜索、分支树或 Remote MCP。

测试要求：
1. 纯函数覆盖搜索规范化、排序、结果上限、中文/拉丁匹配、附件内容排除及 archivedAt sanitization。
2. IndexedDB/workspace/conversation archive 覆盖旧数据、非法 archivedAt、导入导出、分支独立性和 API Key/URL 不泄露。
3. Playwright 覆盖桌面与移动端：零请求搜索、筛选、归档、恢复、顶部展开、最后活跃会话归档、新对话回退、流式锁、键盘/焦点、暗黑模式、44px 触控和无额外滚动条。
4. 运行 npm run check、chat-local-contracts、workspace-storage-contracts、ui-contract、privacy、focused Playwright、test:server、build、git diff --check 与 Trellis task validation；失败必须修复后重跑。
```

## Execution Plan

### P0: Contract And Regression Lock

- Map active versus archived conversation selectors without changing current
  P1 branch ordering.
- Add pure archive and search helpers with explicit query/result bounds.
- Lock legacy records, branch independence, empty active-set behavior, and
  no-request search behavior in tests.

### P1: Persistence And Migration-Free Compatibility

- Add `archivedAt` to types and sanitizers.
- Preserve optional archival metadata through local workspace records and both
  export formats.
- Keep malformed metadata non-fatal and verify privacy boundaries.

### P2: Chat State And Interaction

- Make Chat hydration, active-stack sorting, new-conversation fallback, and
  summary projection archive-aware.
- Add archive/restore state transitions with synchronous streaming guards.
- Keep parent and branch records isolated.

### P3: Conversation Manager UI

- Build the manager from existing dialog primitives and project design tokens.
- Add bounded local search, active/archive filtering, result opening, archive,
  and explicit restore.
- Validate desktop/mobile containment, focus, dark mode, and scrollbar rules.

### P4: Browser And Cross-Module Verification

- Add focused desktop/mobile Playwright tests and archive/import contract tests.
- Verify no search/provider/network request is made by local retrieval actions.
- Run privacy, UI, server, build, and full changed-file review gates.

### P5: Decision Gate For P2B

- Evaluate real P2A use before introducing group records.
- If approved, create a separate P2B task for one-level local groups; do not
  expand P2A in place.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Search makes Chat rendering slow | Use bounded local fields/results and deferred/memoized filtering; do not inspect attachments |
| Archive breaks the default new-chat flow | Derive the empty state from active records only and cover it in E2E |
| Archive creates orphan branch confusion | Preserve provenance without cascading; defer permanent deletion and tree navigation |
| Extra dialogs create scrollbars or page shift | Reuse the existing dialog/scroll-owner contract and test fixed viewport geometry |
| Metadata leaks into exports or requests | Allowlist only `archivedAt`; run workspace, privacy, and request-zero tests |

## Activation Gate

Before implementation, create a dedicated child task under
`08-08-lobechat-integration-roadmap`, copy this prompt into its planning
artifacts, curate its context manifests, and obtain explicit implementation
approval. Do not overlap it with the uncommitted P1 task.
