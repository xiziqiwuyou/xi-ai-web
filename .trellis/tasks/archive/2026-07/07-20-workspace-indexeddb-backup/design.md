# 技术设计

## Architecture

新增 `src/features/workspace/` 作为私人工作区的唯一持久化边界：

```text
React feature state
  -> feature storage facade
    -> workspaceDb (IndexedDB)
      -> versioned object stores

WorkspaceDataDialog
  -> workspaceArchive
    -> workspaceDb transaction
    -> JSON envelope + SHA-256

Future scheduler
  -> WorkspaceBackupProvider
    -> WebDAV / S3 / NAS adapter
```

功能模块仍拥有自己的 React 状态和领域清洗逻辑；共享工作区层只负责事务、版本、迁移、归档和跨集合操作，不引入全局状态库。

## Automation And Public Routes

The public automation surface exposes `/agents` and `/workflows` only. The
server still owns ordering and visibility, while the browser owns private
definitions. Declarative Skills stay in IndexedDB but are managed and selected
from the Chat workspace; there is no `/skills` navigation destination.

Chat carries a bounded `skillInstructions` array with its existing BYOK request
only. The server sanitizes it and appends it to the request system context. It
does not persist it, evaluate source code, or gain access to the browser's
workspace database.

Each Chat session owns its selected Skill IDs in transient `SessionUiState`.
The settings dialog edits one target conversation at a time, and a newly
created conversation never inherits Skills from the previously active session.

Workflows use a restricted FastGPT-inspired graph projection:

```text
Start -> Agent -> Agent -> Reply
          |        |
          +-- typed text output through graph edges
```

`AgentWorkflowDefinition.steps` remains the legacy compatibility projection.
The versioned `graph` field stores node IDs, node positions, edge endpoints,
and viewport. A normalization utility derives a graph from old steps and can
derive the single-threaded execution order from a valid graph. It validates one
Start node, one or more reachable Agent nodes, zero or more Reply nodes, valid
ports, no duplicate/self edges, and no cycles.

The browser executor remains intentionally bounded:

```text
topological node -> resolve local agent + Skills -> api.runAgent -> output map
                                                        -> dependent nodes
```

It runs one Agent node at a time, passes upstream text as explicit context, and
stops on the first failure. Node/edge run state is transient and never saved.
V1 does not add arbitrary HTTP, code execution, loops, parallel branches, MCP,
or a server workflow database. The server accepts an optional sanitized inline
`agent` projection and falls back to `assistantId` for existing callers.

The canvas keeps fixed node dimensions, a readable default zoom, a colored
MiniMap, and an explicit fit control. This avoids shrinking four or more nodes
until their labels are unreadable while still exposing the complete topology.

## Chat Command Contract

The Chat composer recognizes the active trailing command token:

```text
$query -> browser-local declarative Skills
/query -> enabled public application presets
```

Selecting a result removes that token from the draft. Skill IDs are added to the
current `SessionUiState.skillIds`; application selection is stored as a single
`SessionUiState.appId`. Resolved Skill instruction text and the selected app prompt
are composed only when the user sends. `displayContent` remains the user's visible
text, while the app prompt is included in transient provider content. Successful
send clears `appId`; a failed request restores it for retry. No command state enters
the workspace archive or provider credentials.

## Agent And Assistant Catalog Contract

Browser-local Agents and developer-managed public assistants remain separate domains:

```text
IndexedDB userAgents -> Agent card catalog -> Agent editor/test runner -> inline agent request
Server assistants     -> Assistant library  -> session launch intent  -> bound Chat conversation
```

`UserAgentDefinition` gains optional `category` and `tags`. The workspace sanitizer supplies
`通用` and an empty tag list for older records. The Agent destination mirrors the workflow
interaction model: `catalog` renders searchable/filterable cards plus creation; `editor`
renders exactly one configuration form and runner. The runner resolves selected local
knowledge documents at request time, passes their bounded chunks through the existing
`contextChunks` field, and adds `knowledge_search` only for that request. Document text,
run output, and credentials never enter the saved Agent definition.

The public `Assistant` contract adds required `category`, `tags`, `starterPrompts`, and
`enabled` fields. Server normalization owns backward compatibility and bounds list lengths.
Public bootstrap exposes enabled templates only; Admin bootstrap retains both enabled and
disabled records. A version-7 metadata migration merges missing curated defaults by stable
ID/name while preserving all existing administrator records and later deletions.

Assistant activation uses a versioned one-shot envelope:

```ts
type PendingAssistantLaunch = {
  version: 1;
  assistantId: string;
  starterPrompt?: string;
  requestedAt: string;
};
```

The envelope is stored only in `sessionStorage` and announced with a same-window custom
event. Chat also reads the persisted envelope after conversation hydration, so navigation
and lazy mounting cannot lose it. Consumption validates version, age, assistant existence,
and enabled state, removes the envelope before creating state, creates one expanded local
conversation with the exact assistant ID, collapses older sessions, and optionally places
the starter prompt in the new conversation draft without sending a request. The legacy
`aistudio-selected-assistant` string is read once for compatibility and then removed.

Every Chat session resolves and renders its bound assistant. The outbound stream payload
uses the conversation's `assistantId`; a missing assistant is reported instead of treating
the launch intent as successful. Existing unrelated conversations are not rewritten.

## Workflow Catalog And Safe Node Runtime

The workflows destination has two explicit views. `catalog` renders saved workflow
cards and creation; `editor` renders exactly one selected workflow's graph and run
surface. This removes the permanently mounted list/editor split and gives the graph
the full workspace width.

The graph remains version 1 and extends nodes declaratively:

```ts
type AgentWorkflowNodeKind = "start" | "agent" | "template" | "knowledge" | "reply";
```

- `template` stores a bounded text template and replaces only `{{task}}` and
  `{{input}}` placeholders.
- `knowledge` stores selected local document IDs and a bounded `topK`. Runtime
  performs deterministic lexical scoring over IndexedDB chunks and emits source
  labels plus excerpts.
- Optional `sourceHandle` / `targetHandle` values are sanitized and default to
  `output` / `input` for old edges.

The topological executor keeps an output map for every node. Template and knowledge
nodes execute locally; Agent nodes retain the existing BYOK call; Reply aggregates
its inbound output. Validation checks node-specific configuration before any model
call. Unknown document IDs, empty templates, invalid ports, cycles, and unreachable
nodes fail visibly.

## IndexedDB Contract

- Database: `xi-ai-web-workspace`
- Version: `2` (adds the `workflows` object store; existing databases upgrade in place)
- Object stores:
  - `meta`，keyPath `key`
  - `conversations`，keyPath `id`
  - `galleryItems`，keyPath `id`
  - `knowledgeDocuments`，keyPath `id`
  - `mediaJobs`，keyPath `id`
  - `userAgents`，keyPath `id`
  - `agentSkills`，keyPath `id`
  - `workflows`，keyPath `id`
  - `agentMemories`，keyPath `id`
  - `preferences`，keyPath `key`
  - `backupRuns`，keyPath `id`

`workspaceDb` 提供 typed `getAll`、`replaceAll`、`putAll`、`clear`、`getRecord`、`putRecord` 和跨 store 事务。数据库打开和初始化使用共享 Promise，避免多个懒加载模块并发触发升级。

## Domain Types

在 `src/types.ts` 增加：

- `UserAgentDefinition`：用户创建的智能体提示词、模型能力要求、Skill ID、工具权限、知识库关联和时间戳。
- `AgentSkillDefinition`：声明式 Skill 指令、输入输出 schema、允许工具和所需模型能力；不包含可执行 JS 或 Shell。
- `AgentMemoryRecord`：智能体长期记忆条目和作用域。
- `WorkspacePreferenceRecord`：主题及未来可持久化界面偏好。
- `WorkspaceBackupPolicy` / `WorkspaceBackupRun`：未来自动备份配置和状态。

## Migration

`initializeWorkspace()` 读取 `meta.legacyMigrationV1`：

1. 如果已完成，直接返回。
2. 并行读取旧 localStorage 集合、旧 `cherry-web-knowledge-db` 和主题镜像。
3. 在统一数据库的单个 readwrite 事务中，以稳定 ID `put` 数据并写入迁移标记。
4. 事务成功后清理已迁移的旧集合；主题 localStorage 镜像保留用于首屏防闪烁。
5. 任一步失败都不写完成标记，也不删除旧数据。

迁移目标已经存在数据时采用合并写入，保证重复运行幂等。

## Feature Facades

- `localConversationStore.ts` 保留清洗、标题、排序和摘要职责，读取/保存改为异步工作区调用；Chat 增加 hydration gate，防止数据库加载前创建空会话。
- `galleryStorage.ts` 保留 GalleryItem 清洗，改为异步工作区调用；`App` 完成 hydration 后才启动保存 effect。
- `knowledgeDb.ts` 改为统一数据库 facade；旧独立数据库只由迁移读取器访问。
- `mediaJobStorage.ts` 改为异步工作区 facade，即使当前公共路由未挂载也纳入归档。
- 主题继续使用 localStorage 作为启动镜像，同时异步写入 `preferences`，从而可进入工作区备份。

## Archive Format

```ts
type WorkspaceExportEnvelope = {
  schema: "xi-ai-web.workspace-export";
  version: 1;
  exportedAt: string;
  app: { name: "xi-ai-web"; version: string };
  integrity: {
    algorithm: "SHA-256";
    digest: string;
  };
  counts: WorkspaceDataCounts;
  workspace: WorkspaceSnapshot;
};
```

摘要值通过 `JSON.stringify(workspace)` 的 UTF-8 字节计算。导入先进行大小和 JSON 解析保护，再验证 schema、版本、结构、计数和摘要。归档构造函数没有访问 provider 配置的依赖，从类型和模块边界上排除凭据。

## Import Semantics

- `previewWorkspaceImport`：只解析、清洗、验证和统计，不写数据库。
- `replace`：一个事务清空并写入所有工作区 store。
- `merge`：先读取当前快照，在内存中按 ID 合并，再用一个事务替换全部集合。
- 有 `updatedAt` 的记录比较 ISO 时间；没有更新时间时导入项覆盖同 ID 本地项。
- preferences 按 key 合并；导入主题同步更新首屏 localStorage 镜像。
- 导入成功后页面 reload，使所有懒加载模块重新从 IndexedDB hydration。

## UI Placement

在 `TopBar` 的桌面访问状态卡和移动头部动作区增加一个 `DatabaseBackup` 图标按钮，仅用于打开 `WorkspaceDataDialog`。它不属于九个公共功能菜单，也不链接 `/admin`，并保持 `onRequestApiConfig` 不进入公共外壳。

对话框使用现有 `Dialog`：

- 顶部显示“工作区数据”和 IndexedDB 状态。
- 紧凑计数网格显示会话、画廊、知识库和智能体数据。
- 导出按钮直接下载 `.xiworkspace.json`。
- 导入先选择文件和显示预览，再选择合并/替换。
- 替换模式使用 `ConfirmationDialog` 二次确认。
- 错误使用 `role=alert`，忙碌时锁定相关操作。

首次 BYOK 对话框保持不变。

## Backup Provider Boundary

`WorkspaceBackupProvider` 只接收已经生成的归档 Blob，不接触 API Key：

```ts
interface WorkspaceBackupProvider {
  id: string;
  kind: "webdav" | "s3" | "nas-proxy";
  capabilities: { list: boolean; delete: boolean; retention: boolean };
  upload(input: WorkspaceBackupUpload): Promise<WorkspaceRemoteBackup>;
  download(id: string): Promise<Blob>;
  list(): Promise<WorkspaceRemoteBackup[]>;
  remove?(id: string): Promise<void>;
}
```

第一阶段只提交接口、策略类型和验证，不提供虚假的远端成功状态。浏览器自动下载不可作为自动备份实现；自动备份仅在未来配置远端提供器后启用。

## Failure And Rollback

- IndexedDB 不可用：显示明确错误；旧读取 fallback 保留，不能报告已完成迁移或备份。
- `QuotaExceededError`：保留原数据，提示用户导出或清理大型画廊资源。
- 导入失败：事务 abort，内存状态不刷新。
- 新代码出现回归时，可回退模块 facade；旧数据在迁移成功前不会被删除。
- 不删除旧知识库数据库本体，只清理已复制记录，便于版本回退时诊断。

## Phase 10 Provider Tool Architecture

The shared `ToolSetting` contract describes execution ownership, required model capability, supported vendors, and whether request-local context is required. These immutable catalog fields come from the server registry; Admin may change labels, descriptions, risk, and enabled state only.

Request resolution is fail-closed:

1. Deduplicate and bound requested tool names.
2. Resolve each name against the normalized server catalog and administrator enablement.
3. Check provider allowlist, selected model capability, and context requirements.
4. Split the result into application tools and provider-hosted tools.
5. Pass application tools to adapter function declarations plus the local dispatcher; pass hosted tools only to provider-specific request mapping.

Adapters receive `hostedTools` as normalized names. OpenAI maps them to Responses tools, Anthropic maps them to versioned server tools, Gemini maps them to GenerateContent tool objects, and Qwen maps shipped search/code capabilities through its documented Responses-compatible contract. Kimi, DeepSeek, and generic OpenAI-compatible adapters reject hosted names.

Chat uses the same `allowedTools` payload as Agent runs. `$` Skills remain declarative IndexedDB records; selecting a compatible tool-bearing Skill sends only its instruction text and deduplicated tool names. Search UI requests the normalized hosted search tool instead of adding a prompt-only claim. Unsupported tools never become provider prompt text.

Metadata version 8 merges newly shipped fine-grained capabilities into matching default model entries once. It preserves model IDs, enabled/default state, administrator labels, and later capability removals after migration.

## Phase 11 Admin Model Mapping And Navigation

### Model Identity And Data Flow

No migration or parallel type is introduced. The existing shared entry remains authoritative:

```ts
type ModelCatalogEntry = {
  id: string;    // stable selection and request reference
  vendor: ProviderKind;
  label: string; // frontend display name
  model: string; // actual provider request model name
};
```

The cross-layer flow remains:

```text
Admin label/model fields
  -> normalized ModelCatalogEntry
  -> public selector renders label and stores/sends id
  -> server resolves id against modelCatalog
  -> provider adapter receives entry.model
```

Admin adds explicit field names, required attributes, focused validation messages, and a mapping preview. Frontend selectors keep the current label-first projection; server request handlers keep resolving the stable ID before provider access. This prevents a display-label edit from changing provider routing.

### Admin Information Architecture

`AdminSectionId` expands from five broad pages to nine focused child destinations:

- Operations: runtime overview, tool permissions.
- System configuration: site settings, public menu.
- Model management: model catalog.
- Content management: assistant library, application presets, prompt presets.
- Audit: operation records.

The sidebar renders each first-level group as a real button with `aria-expanded` and `aria-controls`. A controlled expanded-group set owns visibility of child links. Activating a child guarantees its parent is expanded, resets the single content scroll owner to the top, and conditionally mounts only that child section.

Mobile retains a grouped native select because it is compact, keyboard-native, and avoids introducing a second scroll surface. Both desktop and mobile use the same `AdminSectionId` source of truth and section detail metadata.

### Compatibility And Rollback

- Existing catalog records and API payloads remain byte-compatible because no shared field is renamed.
- Existing deep `/admin` access, cookie auth, bootstrap APIs, and destructive confirmations are unchanged.
- The navigation refactor is reversible inside `AdminConsole` and its owned CSS; backend metadata does not depend on UI section IDs.
- If conditional rendering reveals state-loss defects, drafts remain component-owned and therefore survive section switches while the console stays mounted.

## Phase 12 Independent Web Search Architecture

### Configuration Boundary

`SearchServiceConfig` is separate from `UserProviderConfig` and uses a dedicated session key. The root `App` owns both in-memory values, but only the main provider is required for first use.

```ts
type SearchServiceConfig = {
  provider: "glm" | "kimi";
  baseUrl: string;
  apiKey: string;
  model: string;
  searchEngine: "search_std" | "search_pro" | "search_pro_sogou" | "search_pro_quark";
  count: number;
  contentSize: "medium" | "high";
};
```

Chat and Agent request payloads add optional `searchService`. The field is included only when the exact request asks for `web_search` and the browser config is ready.

### Execution Flow

```text
Chat toggle / Skill / Agent / Workflow requests web_search
  -> frontend checks Admin enablement + independent search readiness
  -> request sends main connection + modelId + separate searchService
  -> server resolves tools without checking the main model for webSearch
  -> independent search adapter executes GLM Web Search or Kimi compatibility loop
  -> bounded external context is marked untrusted and injected into main-model messages
  -> selected main model answers normally
```

`resolveRequestedTools` gains an independent-search result lane. Local functions and other provider-hosted tools keep their existing behavior. `web_search` never enters the selected model adapter's hosted-tool list.

### Provider Adapters

- GLM: direct structured search request to `/paas/v4/web_search`, Bearer auth, 70-character query, bounded result count, and normalized source items.
- Kimi: bounded `/chat/completions` loop using `type=builtin_function` and `function.name=$web_search`; tool-call arguments are echoed back exactly as a tool result until a final answer is returned.
- Both adapters return one normalized internal result contract consumed only by the server context formatter.

### Security And Failure Boundaries

- Search context is introduced as untrusted external data and cannot override system, Assistant, Agent, or Skill instructions.
- Search output, query, result count, per-item text, and loop count are bounded before reaching the main model.
- Search runs before the main provider request. Any missing config, unsupported search provider, malformed response, or upstream failure prevents the main provider call.
- Public error projection redacts both main and search API keys.
- No fallback silently uses the main model provider's hosted web search.
