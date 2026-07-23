# 实施清单

## Phase 1 - Storage Foundation

- [x] 增加工作区领域类型和未来备份提供器契约。
- [x] 实现 `workspaceDb` 数据库打开、typed store 操作和跨 store 原子事务。
- [x] 实现旧 localStorage、旧知识库 IndexedDB 和主题偏好的幂等迁移。
- [x] 增加工作区摘要与存储可用性探测。

## Phase 2 - Feature Migration

- [x] 将对话存储 facade 改为 IndexedDB，并为 Chat 增加 hydration gate。
- [x] 将画廊存储 facade 改为 IndexedDB，并为 App 增加 hydration gate。
- [x] 将知识库 facade 接入统一数据库，保留旧知识库迁移读取器。
- [x] 将媒体任务 facade 接入统一数据库。
- [x] 将主题写入工作区 preferences，同时保留首屏 localStorage 镜像。

## Phase 3 - Archive And Restore

- [x] 定义版本化 `WorkspaceSnapshot` 和导出 envelope。
- [x] 实现 SHA-256 完整性计算、导出 Blob 和文件名。
- [x] 实现严格导入解析、清洗、版本/摘要验证和预览。
- [x] 实现 merge/replace 原子恢复以及成功后的主题镜像同步。

## Phase 4 - User Interface

- [x] 新增 `WorkspaceDataDialog`，展示状态、计数、导出和导入预览。
- [x] 增加合并/替换模式及替换确认。
- [x] 在桌面访问卡和移动头部加入低干扰入口，不改变六项公共导航。
- [x] 在现有 active CSS 模块中补齐桌面、暗色和移动样式。

## Phase 5 - Contracts And Tests

- [x] 新增静态存储契约脚本并纳入 `npm run qa`。
- [x] 更新 E2E fixture，使旧 localStorage 会话测试验证自动迁移而不是直接持久化实现。
- [x] 新增工作区导出隐私、导入预览、替换恢复、损坏文件拒绝和移动端入口 E2E。
- [x] 更新 Trellis 前端状态管理、类型和质量规范。

## Phase 6 - Automation Destinations

- [x] Extend shared types and the IndexedDB/archive contracts with ordered workflow definitions.
- [x] Add the `agents`, `workflows`, and `skills` public menu/route contract while preserving admin-owned visibility and order.
- [x] Add browser-local automation repository helpers and seed only empty stores with safe declarative examples.
- [x] Add local agent editing/running, Skill editing, and sequential workflow execution with per-step status.
- [x] Extend `/api/agents/run` with bounded inline agent data and retain the legacy assistant path.
- [x] Add navigation, persistence, inline-agent, Skill safety, and workflow sequencing tests.

## Phase 7 - Chat Skills And Graph Workflows

- [x] Remove `skills` from public routes, bootstrap defaults, navigation metadata, and public-navigation tests while retaining IndexedDB records and archive support.
- [x] Add a Chat-local Skill manager and per-conversation Skill selector; carry selected instruction text through the existing streamed BYOK request path with server-side bounds.
- [x] Add workflow graph types, sanitization, legacy-step migration, graph validation, topology ordering, and workspace archive round-trip support.
- [x] Add the `@xyflow/react` canvas dependency and implement Start, Agent, and Reply node cards, node library, draggable layout, edge connection/removal, inspector, fit/reset controls, and accessible mobile fallback.
- [x] Replace linear runtime iteration with validated topological browser execution, node/edge activity states, output previews, and failure/cancel behavior.
- [x] Extend static contracts and Playwright coverage for navigation removal, Chat Skill injection, graph persistence, invalid-graph blocking, execution order, and desktop/mobile canvas behavior.

## Phase 8 - Command Launcher And Workflow Catalog

- [x] Record official GitHub workflow-node/catalog references and the safe subset adopted by this browser-local product.
- [x] Add `$` Skill and `/` application command parsing, filtering, keyboard/touch selection, removable tags, and transient request composition to Chat.
- [x] Replace the always-visible workflow list/editor split with a saved-workflow card catalog and a dedicated detail editor view.
- [x] Extend graph types, sanitization, validation, handles, canvas rendering, and inspector forms for Text Template and Local Knowledge Retrieval nodes.
- [x] Execute template and knowledge nodes locally in topological order, with bounded lexical retrieval from selected IndexedDB knowledge documents.
- [x] Update static contracts, workspace archive coverage, Playwright behavior tests, responsive styles, and Trellis frontend specifications.
- [x] Run `npm run qa`, full Playwright, `npm run smoke`, `npm run release-check`, and `git diff --check`.

## Phase 9 - Agent And Assistant Catalogs

- [x] Record official GitHub Agent/assistant-library references and the patterns adopted or rejected for this no-login BYOK product.
- [x] Add regression coverage for the Agent two-level catalog and exact assistant-to-Chat conversation/request binding before implementation changes.
- [x] Extend `Assistant`, `UserAgentDefinition`, server normalization/defaults/migration, fixtures, and Admin forms with category, tags, starter prompts, enabled state, and backward compatibility.
- [x] Replace decorative assistant-profile binding with a real searchable/category-filtered library and starter-prompt detail dialog.
- [x] Add a versioned one-shot assistant launch helper, legacy handoff compatibility, hydration-safe Chat consumption, visible session identity, and exact request-ID verification.
- [x] Replace the Agent list/editor split with a card catalog and dedicated detail workspace; add category/tag editing and functional local-knowledge request binding.
- [x] Update active CSS, static contracts, Trellis specs, desktop/mobile E2E, and admin coverage.
- [x] Run `npm run qa`, full Playwright, `npm run smoke`, `npm run release-check`, Trellis validation, and `git diff --check`.

## Phase 10 - Provider-Aware Tools And Skills

- [x] Research official OpenAI, Anthropic, Gemini, Kimi, DeepSeek, and Qwen tool contracts and record adopted/deferred capability boundaries.
- [x] Extend shared model/tool contracts, default catalog capabilities, and one-time metadata migration.
- [x] Add fail-closed server tool resolution that separates application execution from provider-hosted execution.
- [x] Implement documented hosted-tool mappings for OpenAI, Anthropic, Gemini, and Qwen Responses tools.
- [x] Enable compatible tool-bearing Skills in Chat and reuse the same compatibility logic in Agents and Workflows.
- [x] Update Admin tool/model presentation, provider contracts, automation contracts, E2E, and Trellis specifications.
- [x] Run `npm run qa`, full Playwright, `npm run smoke`, `npm run release-check`, Trellis validation, and `git diff --check`.

## Phase 11 - Admin Model Mapping And Navigation

- [x] Expand typed Admin destinations and navigation metadata into focused second-level pages.
- [x] Add controlled expandable group state, accessible group buttons, active-child behavior, and scroll reset.
- [x] Conditionally mount only the active Admin destination while preserving draft state and the mobile picker.
- [x] Rename model form labels to `前台显示名称` and `实际请求模型名`, add required validation, and render a compact mapping preview.
- [x] Keep public selectors label-first, request payloads ID-based, and server provider calls mapped through `entry.model`; add contract coverage where missing.
- [x] Add desktop/mobile Admin navigation E2E and long-request-name/short-display-name mapping regression coverage.
- [x] Run targeted checks, `npm run check`, `npm run qa`, full Playwright, `npm run smoke`, `npm run release-check`, Trellis validation, and `git diff --check`.

## Phase 12 - Independent Web Search Service

- [x] Add shared search config/request types, dedicated session storage helpers, root state, and request-only payload projection.
- [x] Add the accessible GLM/Kimi search configuration dialog without changing the required main API dialog.
- [x] Implement normalized GLM standalone search and Kimi `$web_search` compatibility adapters with bounds and key redaction.
- [x] Reclassify `web_search` as independent execution and update frontend/server compatibility resolution.
- [x] Execute search before the main provider and inject bounded untrusted source context into Chat and Agent/Workflow calls.
- [x] Pass independent search config through Chat, Skills, Agents, and Workflows only when requested.
- [x] Update Admin presentation, provider/search/automation/privacy contracts, deterministic fixtures, and desktop/mobile E2E.
- [x] Run targeted checks, `npm run qa`, full Playwright, `npm run smoke`, `npm run release-check`, Trellis validation, and `git diff --check`.

## Validation

```powershell
npm run check
npm run qa
npm run test:e2e
npm run smoke
npm run release-check
git diff --check
```

## Risk And Rollback Points

- Chat hydration 必须先于默认会话创建，否则会覆盖已迁移会话。
- App gallery 保存 effect 必须等待 hydration，否则空数组会清空迁移数据。
- Import 必须使用一个跨 store 事务；任何集合写入失败都需要 abort。
- API/BYOK 模块不得成为 workspace archive 的依赖。
- 不修改或回退当前工作树中与本任务无关的 UI/provider 改动。
