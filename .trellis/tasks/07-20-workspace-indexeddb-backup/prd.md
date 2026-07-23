# 完整用户工作区本地存储与备份

## Goal

在不引入用户登录和服务端数据库的前提下，将访客的完整私人工作区统一持久化到当前浏览器的 IndexedDB，并提供可验证、可迁移的整包导入导出能力。该边界需要为后续 WebDAV、S3 兼容存储和 NAS 自动备份保留扩展点，同时继续保证 API URL、API Key 与管理员数据不会进入本地工作区备份。

## Background

- 当前 API URL、API Key 和最近模型配置通过 `src/features/settings/userProviderConfig.ts` 仅保存在 `sessionStorage`，这是必须保持的安全边界。
- 对话、画廊和媒体任务仍分别写入 `localStorage`，受到约 4 MB 的序列化上限约束。
- 知识库已使用独立的 `cherry-web-knowledge-db` IndexedDB，但未纳入统一工作区、备份和恢复流程。
- 当前已有单独的会话导入导出格式，但没有跨模块的完整工作区归档。
- 无用户身份时，服务器无法可靠隔离访客私人数据；第一阶段因此只保证当前浏览器内的私人持久化和手动迁移。

## Requirements

### R8. Browser-local automation workspace

- Expose two first-class public destinations: `agents` and `workflows`. `skills` is not a public route or navigation item.
- Keep agent definitions and declarative Skill definitions in the browser workspace; they must remain included in export/import and must never require a server database or user account.
- Make Skills selectable and manageable from AI Chat. Selected Skill instructions are carried only with that user-initiated chat request and are never persisted on the server or placed in provider credentials.
- Add graph-based workflow definitions whose nodes reference local agents and Skills by stable ID. Workflow execution is single-threaded, browser-orchestrated, and stops with a visible failed node.
- Skills may contain instructions, JSON-like input/output schemas, capability requirements, and allowed tool names only. The product must not execute uploaded JavaScript, shell, or other arbitrary code.
- Preserve the existing admin boundary: the server manages public menu visibility, model catalog, assistants, and tool availability; private user agents, workflows, and Skills stay in IndexedDB.
- Allow a local agent definition to be sent inline with an agent request so the server can execute it without persisting it. The legacy server-managed `assistantId` request remains compatible.

### R9. Restricted visual workflow editor

- Rework the workflow editor into a FastGPT-inspired node canvas with a fixed Start node, Agent nodes, Reply nodes, directional ports, draggable positions, selectable edges, and a right-side inspector.
- Persist a versioned graph projection (`nodes`, `edges`, and `viewport`) alongside the legacy ordered steps. Existing workflows hydrate into a deterministic left-to-right graph without data loss.
- Validate exactly one Start node, no self-edges, no duplicate edges, no cycles, valid ports, and reachability from Start before save or run. Invalid graphs must not make API calls.
- V1 execution is topological and single-threaded. It supports Agent and Reply nodes only; HTTP, code, arbitrary scripts, loops, parallel branches, MCP, and server-side workflow persistence remain out of scope.
- Preserve BYOK: API URL, Key, request output, and transient run state never enter graph definitions, IndexedDB archive data, or server persistence.

### R10. Chat command launcher

- Treat declarative Skills as Chat-invoked capabilities rather than a standalone destination: typing `$` in the active composer opens a searchable Skill command list.
- Typing `/` opens the enabled developer-managed application presets. Choosing an application applies its prompt to one outbound request while the visible user message remains unchanged.
- Command lists support keyboard navigation, Enter selection, Escape dismissal, pointer selection, and mobile touch targets. Selecting a command removes the command token from the visible draft.
- Selected Skills belong to the current conversation UI state and render as removable composer tags. A selected application is a removable one-shot tag and clears after a successful send.
- Tool-bearing or model-incompatible Skills remain unavailable in normal Chat and must never silently execute capabilities that the Chat request path does not support.

### R11. Two-level workflow catalog and safe preset nodes

- The first workflow level is a card catalog of saved browser-local workflows plus a create card. A workflow canvas, parameters, steps, and run trace render only after opening one card.
- The detail level provides a clear return-to-catalog command and uses the released width for the node catalog, graph canvas, inspector, and run panel.
- Expand the safe node catalog with Text Template and Local Knowledge Retrieval alongside Start, Agent, and Reply. These nodes are declarative and execute in the browser without arbitrary JavaScript, shell, HTTP, MCP, loops, or parallel execution.
- Text Template supports only documented text placeholders. Local Knowledge Retrieval reads selected IndexedDB knowledge documents and returns bounded, deterministic local matches; it does not expose API credentials or add server persistence.
- Persist node-specific settings and optional edge handles in the existing versioned graph projection. Existing version-1 graphs and legacy ordered steps remain readable.

### R12. Agent catalog and assistant-to-chat activation

- Rework the browser-local Agent destination into two levels: a searchable/category-filtered card catalog, then one dedicated configuration and test-run workspace. The catalog must show each agent's model, linked Skills, tools, local knowledge, and update time without mounting every editor at once.
- Extend local Agent definitions with sanitized category and tag metadata. Existing records without those fields remain valid and appear under a fallback category. Local knowledge selections must be editable and must be carried as bounded context chunks when that saved agent is run.
- Keep browser-local Agents, Skills, and workflows in IndexedDB. Public assistant templates remain developer-managed server metadata and never enter the private workspace archive.
- Extend public assistant templates with category, tags, starter prompts, and enabled state. The public library must render the actual enabled assistant records rather than mapping decorative hard-coded profiles onto unrelated assistant IDs.
- Ship a curated default assistant set across general productivity, content creation, software development, learning and research, business work, and life/creative use. Existing version-6 metadata receives the missing curated defaults once without replacing administrator-created assistants.
- Starting an assistant writes a versioned one-shot launch intent to `sessionStorage`, navigates to Chat, creates one new expanded conversation bound to the exact enabled assistant ID, optionally prefills one selected starter prompt without auto-sending it, and consumes the intent exactly once.
- Chat must visibly identify the assistant bound to each conversation and send that same assistant ID on the next request. Invalid, removed, disabled, malformed, or stale launch intents are cleared and reported; they must not silently bind a different requested assistant.
- Administrator assistant forms must edit the same category, tags, starter prompts, enabled state, color, description, and system prompt consumed by the public library and Chat request path.

### R13. Provider-aware tools and Chat Skills

- Distinguish application-executed function tools from provider-hosted tools. A generic OpenAI-compatible endpoint must not inherit OpenAI hosted-tool support.
- Extend model capabilities with hosted web search, URL context, and hosted code execution. Tool availability is the intersection of administrator enablement, the selected model's capability list, the provider adapter allowlist, and the current request context.
- Add normalized hosted-tool mappings for documented OpenAI, Anthropic, and Gemini request shapes. Qwen may expose only hosted capabilities implemented against its documented Chat or Responses contract; Kimi and DeepSeek must not advertise unstable or undeclared hosted tools.
- Keep browser-local knowledge retrieval as bounded request context. Provider file-search/vector-store tools remain unavailable until the product has an explicit per-user remote resource lifecycle.
- Tool-bearing Skills must be selectable from Chat when compatible. Chat sends the selected Skill instructions and exact deduplicated `allowedTools` list in the same user-initiated BYOK request.
- Chat, Agent, Workflow, and Admin interfaces must explain tool execution ownership and model/vendor compatibility without storing credentials or tool outputs.
- Unsupported, disabled, context-missing, or vendor-incompatible tools must fail before the provider request. Provider-hosted tools must never reach the local execution dispatcher.

### R1. 统一工作区存储

- 使用一个版本化 IndexedDB 数据库统一保存工作区数据。
- 第一版数据集合包含：完整对话、画廊结果、知识库文档与分块、媒体任务、用户智能体定义、Skill 定义、智能体记忆和用户界面偏好。
- 公共模型目录、管理员维护的助手模板、菜单配置和其他服务端元数据不复制进私人工作区。
- API URL、API Key、管理员口令、Cookie、临时重放草稿和运行中请求状态不得写入工作区数据库。

### R2. 旧数据迁移

- 首次初始化时自动发现并迁移现有对话、画廊、媒体任务、主题偏好、知识库 localStorage 数据和旧知识库 IndexedDB 数据。
- 迁移必须可重复执行且不会产生重复记录。
- 只有在新数据库事务成功后才清理旧持久化数据；失败时保留旧数据并允许现有降级路径继续读取。

### R3. 完整工作区导出

- 导出一个带 schema、版本、导出时间、数据计数和完整性校验值的 JSON 工作区文件。
- 导出内容覆盖 R1 中的私人工作区集合。
- 导出前后都不得读取或序列化 API URL、API Key 和管理员数据。
- 大型 data URL、知识文本和未来向量数据必须通过 Blob 下载，不再受 localStorage 字符串容量限制。

### R4. 导入、预览与恢复

- 用户选择备份文件后，先验证 schema、版本、数据结构和完整性校验，再展示各类数据计数。
- 支持“合并”和“替换”两种恢复模式。
- 替换恢复必须在一个 IndexedDB 事务中更新全部工作区集合，避免部分成功。
- 合并模式按稳定 ID 去重；有更新时间的数据使用较新的记录，其他记录使用导入版本覆盖同 ID 项。
- 导入成功后刷新工作区内存状态，确保当前页面与数据库一致。
- 无效、损坏或未来不支持版本的备份必须给出清晰错误，并保持现有工作区不变。

### R5. 用户界面

- 在公共外壳中提供一个低干扰、可访问的“工作区数据”入口，但不得增加新的公共功能菜单或后台入口。
- 使用现有 `Dialog` 组件实现数据管理对话框，包含存储状态、数据计数、导出、文件选择、导入模式和恢复确认。
- 桌面和移动端都能访问入口；图标按钮具备可访问名称、标题和符合现有触控尺寸的命中区域。
- 首次强制 BYOK 对话框仍只展示 API URL、API Key、显隐和保存操作，不混入备份功能。

### R6. 远端备份扩展边界

- 定义与具体厂商无关的备份提供器接口，覆盖上传、下载、列出、删除和能力声明。
- 定义自动备份策略数据结构，至少包含启用状态、提供器 ID、触发间隔、保留数量和最后执行状态。
- 第一阶段不连接真实 WebDAV、S3 或 NAS，也不在浏览器中尝试直接访问 SMB/NFS。
- 后续 NAS 通过 WebDAV、S3 兼容 API 或服务端代理接入，不改变工作区归档格式。

### R7. 兼容与质量

- 不新增运行时依赖，优先使用原生 IndexedDB、Web Crypto、Blob 和 File API。
- 保留现有单会话导入导出能力。
- BYOK 隐私测试必须继续证明凭据只存在于 `sessionStorage`。
- 存储不可用或操作失败时，UI 必须报告错误，不能静默声明备份成功。

## Acceptance Criteria

- [ ] 旧 localStorage 对话、画廊、媒体任务和旧知识库数据在首次加载后可从统一 IndexedDB 读取，迁移不会重复。
- [ ] 新增或修改的对话、画廊和知识库数据刷新页面后仍存在，并且不再依赖 localStorage 容量裁剪。
- [ ] 工作区导出文件包含版本化清单、全部私人数据集合、计数和可验证完整性校验值。
- [ ] 导出文件不包含当前 API URL、API Key、管理员配置或其他凭据。
- [ ] 合并导入保留非冲突本地记录并正确解决同 ID 冲突；替换导入原子性地恢复整套工作区。
- [ ] 损坏校验、错误 schema 和未来版本导入均被拒绝，拒绝后原数据不变。
- [ ] 桌面和移动端都可打开工作区数据对话框，完成导出、预览和导入恢复。
- [ ] 工作区类型和备份提供器契约已覆盖用户智能体、Skill、智能体记忆与未来自动备份策略。
- [ ] `agents` and `workflows` are the only automation public menu destinations; `/skills` is unavailable and Skill management/selection works inside Chat.
- [ ] Chat sends selected declarative Skill instructions through the existing BYOK stream path without storing them on the server or exposing credentials in the workspace archive.
- [ ] Legacy ordered workflows hydrate into a graph, and graph positions/edges survive reload plus workspace export/import.
- [ ] Canvas validation blocks cycles, disconnected nodes, invalid ports, and missing agents before provider calls; valid agent graphs run in topological order with visible node and edge state.
- [x] `$` and `/` command launchers filter Skills and enabled applications, support keyboard/touch selection, preserve visible user text, and enforce per-conversation/one-shot state boundaries.
- [x] Workflows open as a card catalog first; opening a card reveals the complete editor and returning to the catalog preserves saved data.
- [x] Text Template and Local Knowledge Retrieval nodes survive reload/export/import, validate their settings, and execute in topological order without arbitrary code or credential persistence.
- [x] Browser-local Agents open from a searchable card catalog into one detail workspace; category/tags and knowledge bindings survive IndexedDB reload plus workspace export/import.
- [x] The public assistant library is driven by enabled server records, exposes real categories/tags/starter prompts, and contains a curated multi-category default set without duplicate visual aliases.
- [x] Starting an assistant creates exactly one new Chat conversation with the selected `assistantId`, shows the bound assistant, prefills but does not send the selected starter prompt, and uses that ID in the streamed request while preserving other conversations.
- [x] Admin assistant create/update supports category, tags, starter prompts, enabled state, and backward-compatible normalization of older metadata.
- [x] `npm run check`、`npm run qa`、相关 Playwright E2E、`npm run smoke`、`npm run release-check` 和 `git diff --check` 通过。
- [x] Model and tool metadata distinguish local function tools from hosted web search, URL context, and code execution with provider/model compatibility.
- [x] OpenAI, Anthropic, Gemini, and implemented Qwen hosted tools use their documented request shapes; Kimi/DeepSeek do not receive undeclared hosted-tool payloads.
- [x] A compatible tool-bearing Skill can be selected and executed from Chat, while an incompatible Skill is disabled with a model-specific reason.
- [x] Agent and Workflow runs reject disabled, missing-context, or incompatible tools before provider access and keep hosted tools out of the local dispatcher.
- [x] Admin tool controls show execution ownership and supported vendors; metadata version migration adds shipped capabilities once without overriding later administrator edits.
- [x] Provider contracts, automation contracts, E2E, `npm run qa`, smoke, release check, Trellis validation, and `git diff --check` pass.

## Phase 11 - Admin Model Mapping And Navigation

### Requirements

- Preserve the existing model identity contract: `id` is the stable frontend/request reference, `label` is the frontend display name, and `model` is the actual provider request model name.
- Admin must edit and validate the frontend display name and actual request model name independently without renaming or duplicating the shared `ModelCatalogEntry` fields.
- Public model selectors must display `label` and submit the catalog `id`; provider adapters must continue receiving the resolved catalog `model` value.
- Admin must present a compact mapping preview that makes `label -> vendor / model` visible before save.
- Admin navigation must use keyboard-operable expandable first-level groups with focused second-level destinations. Selecting one destination must mount only its associated page instead of leaving unrelated forms in the document.
- Split the existing long sections into focused destinations for operations, tools, site settings, public menus, model catalog, assistants, applications, prompt presets, and audit records.
- Preserve the isolated `/admin` boundary, mobile section picker, single scroll owner, responsive layout, existing confirmation behavior, and all public BYOK/storage boundaries.

### Acceptance Criteria

- [x] A long provider model name can be saved with a short frontend display name, and Admin shows both sides of the mapping clearly.
- [x] Frontend model pickers show the configured display name and do not expose the actual provider model name when a display name is present.
- [x] Requests continue sending the stable model catalog ID, and provider execution uses the mapped actual request model name rather than the display label.
- [x] Empty display names and empty actual request model names are rejected independently with field-specific feedback.
- [x] Desktop Admin first-level groups expose `aria-expanded`, collapse/expand without layout jitter, and retain an active second-level destination.
- [x] Switching Admin destinations mounts only the selected page; unrelated editor forms are absent from the document.
- [x] Mobile Admin keeps the grouped section picker, one visible scroll owner, no document overflow, and touch-friendly controls.
- [x] Targeted Admin/model mapping E2E plus the full project quality gates pass.

## Phase 12 - Independent Web Search Service

### Requirements

- Decouple `web_search` from the selected chat model's vendor, hosted-tool syntax, `webSearch` capability, and tool-calling capability.
- Add a separate browser-session search configuration with provider, API URL, API Key, and provider-specific options. It must never enter backend metadata, IndexedDB, workspace archives, logs, query strings, or public bootstrap data.
- Support Zhipu GLM standalone Web Search API as the recommended provider and Kimi `$web_search` as a separately credentialed compatibility provider.
- Search must run before the main model call and provide bounded, source-bearing, prompt-injection-resistant context to Chat, Skills, Agents, and Workflows.
- A missing or invalid search configuration must fail before the main model provider is called, with credential values redacted from user-facing errors.
- Preserve administrator enable/disable control for the `web_search` tool while changing its execution ownership from selected-model hosting to independent search service.
- Keep the first-use main API dialog unchanged. Search configuration opens only from the network-search control and remains optional.

### Acceptance Criteria

- [x] Network search works with a selected main model that has no `webSearch` capability.
- [x] GLM requests use `POST /api/paas/v4/web_search`, Bearer auth, bounded query/count, and structured result mapping.
- [x] Kimi compatibility requests use an independent Kimi URL/key/model and complete the documented `$web_search` tool loop without using the main model connection.
- [x] The main model receives bounded external search context and no search-service credential or provider-specific tool payload.
- [x] Chat toggle, Skill selection, Agent run, and Workflow run share the same independent search readiness rules.
- [x] Search credentials persist only in their dedicated `sessionStorage` record and are absent from workspace export/import.
- [x] Admin identifies `web_search` as independently executed and no longer presents it as selected-model hosted search.
- [x] Provider/search contracts, E2E, privacy checks, full QA, smoke, release check, Trellis validation, and `git diff --check` pass.

## Out Of Scope

- 用户注册、登录、团队空间和服务端私人数据隔离。
- 第一阶段真实连接 WebDAV、S3、MinIO、阿里云 OSS、群晖或其他 NAS。
- 浏览器直接访问 SMB/NFS。
- 备份文件密码加密、端到端同步冲突 UI 和多设备实时同步。
- 将私人智能体、助手启动意图或 BYOK 凭据持久化到服务端。
- Direct provider vector-store lifecycle, remote MCP credentials, arbitrary shell/code execution, and Computer Use browser/VM automation.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
