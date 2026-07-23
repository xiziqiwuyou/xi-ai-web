# Research: 智能体 / 助手目录、分类与模板启动绑定模式

- Query: 研究 GitHub 官方仓库中的智能体/助手目录、分类、模板启动到对话绑定模式，优先 LobeChat、LibreChat、ChatGPT-Next-Web、Cherry Studio、Open WebUI；回答分类字段、启动绑定、目录与编辑器分层、starter prompts / 标签组织、失效/禁用模板处理，并映射到本项目的无登录、公共助手后台管理、私人智能体 IndexedDB、BYOK URL/Key 仅 sessionStorage 约束。
- Scope: mixed
- Date: 2026-07-21

## Findings

### 1. 直接结论

本项目不应把“公共助手模板”和“私人智能体”合并成同一种可编辑资源。建议保持两条明确的数据链：

```text
公共助手目录（服务端权威）
  -> 只读目录 / 详情
  -> 校验 enabled + 精确 assistantId
  -> 在 IndexedDB 原子创建 Conversation
  -> Conversation.assistantId 固定绑定
  -> 发送时服务端再次精确解析 assistantId

私人智能体（浏览器权威）
  -> /agents 列表 / 编辑器
  -> UserAgentDefinition 存 IndexedDB
  -> 运行时 inline agent 投影
  -> 不写入服务端，不接触 BYOK 持久化
```

推荐的公共助手目录最小字段：

```ts
type AssistantCategory = {
  id: string;          // 稳定 slug，例如 "writing"，不是展示文案
  label: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
};

type AssistantStarterPrompt = {
  id: string;          // 助手内稳定 ID
  title: string;       // 卡片短标题
  subtitle?: string;   // 可选补充，不参与实际发送
  prompt: string;      // 用户可见且由用户显式触发的文本
};

type Assistant = {
  id: string;
  name: string;
  description: string;
  color: string;
  systemPrompt: string;
  categoryId: string;  // 一个主分类
  tags: string[];      // 零到多个检索标签
  starterPrompts: AssistantStarterPrompt[];
  enabled: boolean;
  sortOrder: number;
  revision: number;    // 管理端编辑后的诊断/缓存版本
  createdAt: string;
  updatedAt: string;
};
```

`enabled` 与未来可能出现的发布状态只能保留一个权威源。当前项目已有 `AppPreset.enabled`、`PromptPreset.enabled` 和 bootstrap 过滤模式，第一阶段应采用 `enabled`；只有出现草稿审核、发布、弃用等真实流程时，才整体迁移为 `status: "draft" | "published" | "disabled" | "archived"`，不能让 `enabled` 与 `status` 并存并互相冲突。

### 2. 本项目现状与约束

#### Files found

| Path | 作用 |
| --- | --- |
| `.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md` | R1/R8 定义公共助手由服务端管理，私人智能体、Skill、工作流属于 IndexedDB 工作区；BYOK 不得进入归档。 |
| `.trellis/tasks/07-20-workspace-indexeddb-backup/design.md` | 定义浏览器工作区、inline agent、Chat 临时 Skill 和服务端 `assistantId` 兼容边界。 |
| `src/types.ts` | 当前 `Assistant`、`Conversation`、`UserAgentDefinition`、`AppPreset`、`PromptPreset` 契约。 |
| `server/index.mjs` | 公共助手默认数据、规范化、bootstrap、管理端 CRUD 与运行时解析。 |
| `src/features/chat/localConversationStore.ts` | IndexedDB 会话创建与 `assistantId` 绑定。 |
| `src/features/chat/ChatModule.tsx` | Chat hydration、新会话、跨模块助手启动、发送与每会话 UI 状态。 |
| `src/features/chat/maskWorkflow.ts` | 将助手、应用、提示词预设统一投影为展示卡片的现有适配层。 |
| `src/features/automation/automationRepository.ts` | 私人智能体、Skill、工作流的 IndexedDB 仓储。 |
| `src/features/automation/AutomationModule.tsx` | 私人智能体列表、编辑器与 inline agent 运行。 |
| `src/features/workspace/workspaceDb.ts` | `conversations`、`userAgents`、`agentSkills` 等 IndexedDB object store。 |
| `src/features/workspace/workspaceArchive.ts` | 私人智能体与 Skill 的归档清洗；公共助手不在工作区快照中。 |
| `src/features/settings/userProviderConfig.ts` | API URL/Key 与 last model 仅写入 `sessionStorage`。 |

#### Code patterns

- 当前公共 `Assistant` 只有 `id/name/description/color/systemPrompt/timestamps`，没有分类、标签、starter prompts 或可用状态（`src/types.ts:90`）。
- `Conversation` 已通过 `assistantId` 绑定助手（`src/types.ts:120`），`createLocalConversation` 在创建时写入助手 ID（`src/features/chat/localConversationStore.ts:52`）。这是应保留的核心关系。
- 私人 `UserAgentDefinition` 已包含模型、Skill、工具和知识引用（`src/types.ts:359`），并由 `userAgents` IndexedDB store 持久化（`src/features/workspace/workspaceDb.ts:23`、`src/features/automation/automationRepository.ts:35`）。公共目录字段不应直接塞进该类型。
- 当前新会话先解析默认助手，再创建绑定会话与独立 `SessionUiState`（`src/features/chat/ChatModule.tsx:241`）；新会话的 `skillIds`、`appId` 默认清空（`src/features/chat/ChatModule.tsx:152`），符合“模板启动不继承上一会话临时能力”的要求。
- 目前助手库跨路由启动使用 `sessionStorage["aistudio-selected-assistant"]`，Chat hydration 后再创建会话（`src/features/chat/ChatModule.tsx:312`）。这存在刷新、重复 effect 和无效 ID 后意图残留问题；新流程应改成“先持久化绑定会话，再导航/激活”。
- 发送时 Chat 会按 `conversation.assistantId` 查找，但找不到时退到 `assistants[0]`（`src/features/chat/ChatModule.tsx:479`）；服务端 `getAssistant` 同样静默退到第一个助手（`server/index.mjs:685`）。这是必须拒绝的失效处理。
- 管理端删除助手会把旧会话直接改绑第一个助手（`server/index.mjs:1487`）。这会改变历史会话身份与系统提示词语义，应改为禁用/保留历史，不能静默改绑。
- 公共 bootstrap 当前无条件返回全部助手，而应用和提示词会过滤 `enabled`（`server/index.mjs:1316`）。助手应复用后两者的过滤边界。
- 当前 `maskWorkflow` 给所有助手硬编码分类“助手”，应用使用 `AppPreset.category`，提示词使用“提示词”（`src/features/chat/maskWorkflow.ts:35`）；该适配层可继续用于展示，但目录分类必须来自助手数据而不是类型名。
- 私人智能体保存后明确提示“已保存到当前浏览器”，运行时发送 inline `agent` 和 Skill 指令（`src/features/automation/AutomationModule.tsx:246`、`:287`），与公共 `assistantId` 路径应继续分开。
- BYOK 的加载与保存仅访问 `window.sessionStorage`（`src/features/settings/userProviderConfig.ts:43`、`:54`）。任何目录、分类、starter prompt、会话绑定或 IndexedDB 归档类型都不得加入 `baseUrl`/`apiKey` 字段。

### 3. 上游证据与可复用模式

#### 3.1 LobeChat / LobeHub

- Repository: [lobehub/lobehub](https://github.com/lobehub/lobehub)（原 `lobehub/lobe-chat` URL 当前由 GitHub 重定向到该仓库）
- Evidence commit: [`e3565363d59c6b2602d22e619797625cbd4d4bf7`](https://github.com/lobehub/lobehub/commit/e3565363d59c6b2602d22e619797625cbd4d4bf7), 2026-07-21

相关模块：

- [discover assistant types](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/packages/types/src/discover/assistants.ts#L5-L113)：使用稳定枚举分类；目录项同时包含 `category`、`status`、版本、验证状态、使用/安装统计等。状态是 `published | unpublished | archived | deprecated`。
- [shared metadata](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/packages/types/src/meta.ts#L3-L23)：`tags` 是独立的多值字符串数组，不与主分类混用。
- [category presentation](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/routes/%28main%29/community/%28list%29/agent/features/Category/useCategory.tsx#L24-L118)：分类 key 与本地化 label/icon 分离。
- [opening questions editor](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/features/AgentSetting/AgentOpening/OpeningQuestions.tsx#L36-L95)：opening questions 是有序字符串列表，编辑器阻止空值和重复项，并支持排序。
- [opening questions runtime](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/routes/%28main%29/group/features/Conversation/AgentWelcome/OpeningQuestions.tsx#L45-L90)：欢迎区只展示有限数量，点击后作为明确的用户消息发送；无使用权限时保持可见但不可点击。
- [market detail fork-and-chat](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/routes/%28main%29/community/%28detail%29/agent/features/Sidebar/ActionButton/ForkAndChat.tsx#L106-L207)：目录模板先 fork/物化成用户 Agent，再导航到该 Agent 的聊天，而不是直接让目录记录承担用户可编辑实体职责。
- [invalid lifecycle status page](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/routes/%28main%29/community/%28detail%29/agent/features/StatusPage/index.tsx#L12-L113)：未发布、归档、弃用都有明确状态页和返回目录动作，不静默替换成其他 Agent。
- [legacy create-session action](https://github.com/lobehub/lobehub/blob/e3565363d59c6b2602d22e619797625cbd4d4bf7/src/store/session/slices/session/action.ts#L56-L95)：创建成功后刷新列表并切换到新 session；虽然该 action 已标记 deprecated，但事务顺序仍能说明“创建后再激活”。

采用：

- 一个主分类 + 多个标签；分类 key 与展示文案分离。
- starter prompts/opening questions 属于助手配置，并保持有序、去重、有限展示。
- 禁用/归档/弃用返回显式不可用状态，不回退其他助手。
- 目录、详情、个人 Agent 编辑器是不同页面/模块。

拒绝：

- LobeHub 的 fork 流程依赖身份、服务端用户 Agent 和市场账号；本项目无登录，不能复制该持久化方式。
- LobeHub 的完整发布审核/版本市场远超当前需求；本项目第一阶段只需要 `enabled + revision`，不应提前复制所有状态和统计字段。
- 固定复制其完整分类枚举会引入与本产品不匹配的分类；只采用稳定 slug 的结构。

#### 3.2 LibreChat

- Repository: [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat)
- Evidence commit: [`8e5ef1fb31e9d63b735c089b21cbc82c50acce46`](https://github.com/danny-avila/LibreChat/commit/8e5ef1fb31e9d63b735c089b21cbc82c50acce46), 2026-07-16

相关模块：

- [agent schema](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/packages/data-schemas/src/schema/agent.ts#L4-L105)：Agent 本体使用单一 `category`，默认 `general`；`conversation_starters` 是独立有序字符串数组。
- [category schema](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/packages/data-schemas/src/schema/agentCategory.ts#L4-L49)：分类资源有稳定 `value`、`label`、`description`、`order`、`isActive` 和 `custom`。
- [active category queries](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/packages/data-schemas/src/methods/agentCategory.ts#L29-L68)：公共分类只查询 `isActive: true`，按 `order`、`label` 排序，并能返回有效分类值做写入验证。
- [marketplace](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/Agents/Marketplace.tsx#L20-L138)：目录负责分类、搜索、URL 状态和详情选择；不是编辑器。
- [category tabs](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/Agents/CategoryTabs.tsx#L22-L53)：分类 label 来自数据库，并保留系统分类的本地化处理。
- [agent editor panel](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/SidePanel/Agents/AgentPanel.tsx#L55-L126)：编辑器通过独立表单与 create/update mutation 管理 Agent；分类只是编辑表单中的一个字段。
- [agent detail start-chat](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/Agents/AgentDetail.tsx#L51-L87)：启动时构造包含 `endpoint: agents`、`agent_id`、`conversationId: new` 的 conversation template，再交给统一 `newConversation`；绑定字段与导航在同一动作中完成。
- [conversation starters](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/Chat/Input/ConversationStarters.tsx#L35-L88)：starter 优先从当前 Agent/Assistant 读取，限制显示数量，点击即通过统一提交路径发送。
- [agent category selector](https://github.com/danny-avila/LibreChat/blob/8e5ef1fb31e9d63b735c089b21cbc82c50acce46/client/src/components/SidePanel/Agents/AgentCategorySelector.tsx#L33-L95)：新 Agent 默认 `general`，选择项来自分类 API，不把展示 label 存成关系键。

采用：

- 把分类定义作为独立服务端元数据；助手只存 `categoryId`。
- 启动动作构造一个包含精确助手 ID 的新会话模板，并由统一会话 action 完成创建/激活。
- starter prompts 走正常用户消息提交路径，不拼入 system prompt，也不伪装成隐藏消息。
- 目录 UI 与 Agent 编辑表单分离，复用 DTO/展示组件而不共享页面状态。

拒绝：

- `AgentDetail` 还写入 `localStorage` 作为选中 Agent 辅助状态；本项目不应新增此类持久化，尤其不能与 BYOK 的 session-only 边界混杂。
- LibreChat 的 Agent、会话和权限依赖登录与服务端数据库；本项目只借鉴事务形状和字段分层。
- LibreChat 的 Agent schema 没有 Agent 级软禁用状态，不能单独作为失效策略依据。

#### 3.3 ChatGPT-Next-Web / NextChat

- Repository: [ChatGPTNextWeb/NextChat](https://github.com/ChatGPTNextWeb/NextChat)
- Evidence commit: [`706a18b95b714ab29b2a4842d3b9ff4f887935d5`](https://github.com/ChatGPTNextWeb/NextChat/commit/706a18b95b714ab29b2a4842d3b9ff4f887935d5), 2026-07-06

相关模块：

- [mask type/store](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/store/mask.ts#L9-L47)：Mask 是模板快照，包含名称、头像、预置上下文、模型配置、语言、插件和 builtin 标记；用户 Mask 与 builtin Mask 分开汇总。
- [builtin loading](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/masks/index.ts#L6-L37)：内置模板有独立 ID 空间；加载失败时记录错误并退化为空模板集。
- [session embeds mask](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/store/chat.ts#L84-L119)：每个 ChatSession 直接保存 `mask` 快照。
- [newSession](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/store/chat.ts#L307-L328)：选择模板时创建新 session、复制模板与全局模型配置、将 topic 设为模板名，再把新会话置顶。
- [new-chat launch](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/components/new-chat.tsx#L77-L107)：先 `newSession(mask)` 再导航到 Chat。
- [mask catalog/editor](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/components/mask.tsx#L571-L678)：同一资源页提供列表动作和编辑 modal；builtin 只读，但可以 clone 成用户模板。
- [invalid mask command](https://github.com/ChatGPTNextWeb/NextChat/blob/706a18b95b714ab29b2a4842d3b9ff4f887935d5/app/components/new-chat.tsx#L91-L105)：命令 ID 找不到时会以 `undefined` 启动普通聊天，只打印错误。

采用：

- “先创建绑定实体，再导航”顺序。
- 公共/builtin 模板只读，若未来支持自定义，应通过显式“复制为私人智能体”产生 IndexedDB `UserAgentDefinition`，不能原地编辑公共模板。
- 对私人智能体，会话内保留受限快照可以提高导入/恢复后的可读性；但运行仍应解析本地稳定 ID 并通过 sanitizer。

拒绝：

- NextChat 没有主分类、标签、starter prompt 和软禁用模型，不能直接承担公共助手目录需求。
- 公共助手不能像 Mask 一样把权威 system prompt 快照复制进会话并长期执行，否则后台禁用/修订无法生效。
- 无效模板 ID 静默启动普通聊天会改变用户意图；本项目必须显示不可用错误。
- 目录与编辑 modal 混在同一页面适合小型本地模板库，但本项目公共目录与后台编辑器属于不同权限边界，不应照搬。

#### 3.4 Cherry Studio

- Repository: [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)
- Evidence commit: [`fe479e4a69548dc570e3404620a182e57170823f`](https://github.com/CherryHQ/cherry-studio/commit/fe479e4a69548dc570e3404620a182e57170823f), 2026-07-21

相关模块：

- [assistant type](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/shared/data/types/assistant.ts#L97-L145)：本地 Assistant 有独立实体 ID、prompt、description、modelId、单一 `groupId`、持久排序键和关联资源。
- [assistant DB schema](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/main/data/db/schemas/assistant.ts#L8-L38)：Assistant 是本地配置实体；group 外键删除后置空，不破坏 Assistant。
- [topic binding](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/main/data/db/schemas/topic.ts#L6-L35)：Topic 记录 `assistantId`；助手删除时 `ON DELETE SET NULL`，历史 Topic 保留。
- [catalog preset type and filtering](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/hooks/useAssistantCatalogPresets.ts#L17-L25)：目录预设与用户 Assistant 是不同类型；目录预设可有多个 `group` 分类词。
- [catalog validation/degradation](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/hooks/useAssistantCatalogPresets.ts#L64-L75)：目录加载至少验证 `id/name`；缺失或损坏的 bundled JSON 记录日志并返回空目录，而不是生成半有效实体（同文件 `L151-L170`）。
- [catalog-to-entity mapping](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/hooks/useAssistantCatalogPresets.ts#L128-L149)：选择目录预设后，显式转换为 `CreateAssistantDto`，只复制允许字段。
- [assistant library dialog](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/components/resourceCatalog/catalog/AssistantLibraryDialog.tsx#L47-L159)：目录负责分类、搜索、预览和“添加”；添加成功后才提供“去对话”。
- [catalog add then topic create](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/pages/home/HomePage.tsx#L436-L477)：若选择目录预设，先物化/复用本地 Assistant，再创建绑定 `assistantId` 的 Topic 并激活。
- [open assistant chat](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/pages/home/HomePage.tsx#L646-L653)：从目录“去对话”时创建/复用该 Assistant 的空 Topic。
- [assistant editor](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/src/renderer/components/resourceCatalog/dialogs/edit/AssistantEditDialog.tsx#L65-L121)：编辑表单独立于目录预设，管理 identity、group、prompt、模型参数和资源关系。
- [tags-to-groups migration note](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/v2-refactor-temp/docs/breaking-changes/2026-07-16-assistant-tags-become-groups.md#L9-L23)：最新版明确将 Assistant 的组织语义收敛为“一个 group”，不再用带颜色 tag 表示主分组。
- [library page removal note](https://github.com/CherryHQ/cherry-studio/blob/fe479e4a69548dc570e3404620a182e57170823f/v2-refactor-temp/docs/breaking-changes/2026-07-01-remove-assistant-library-page.md#L9-L35)：移除独立 library 页面后仍保留共享 catalog 组件，把浏览/管理嵌入聊天页；说明“组件复用”与“页面信息架构”可以解耦。

采用：

- 目录预设与可运行/可编辑实体使用不同类型，并通过白名单 DTO 转换。
- 主分组是单值关系；标签是另一种多值检索语义，不能用同一个字段兼任。
- 启动时先获得真实实体/精确 ID，再创建绑定会话；防重复可以复用仍为空的占位会话。
- 删除/失效不删除历史会话；旧会话保持可读。
- 目录、详情、编辑器复用底层组件和 DTO，但保持不同状态与动作集合。

拒绝：

- Cherry Studio 是本地 Electron/SQLite 架构，不能把其 API/数据库层搬进无登录 Web 应用；本项目私人实体仍是 IndexedDB。
- 它在普通“新 Topic”路径会回退 last-used/first assistant；本项目从某个目录助手显式启动时必须精确绑定，不能使用该回退策略。
- 目录 bundled JSON 损坏时整体空目录适合桌面资源包；本项目服务端 bootstrap 应逐条隔离无效助手并让管理端看到校验错误，而不是把所有有效助手一起隐藏。

#### 3.5 Open WebUI

- Repository: [open-webui/open-webui](https://github.com/open-webui/open-webui)
- Evidence commit: [`ecd48e2f718220a6400ecf49eafd4867a38feb10`](https://github.com/open-webui/open-webui/commit/ecd48e2f718220a6400ecf49eafd4867a38feb10), 2026-07-01 (`0.10.2` commit)

Open WebUI 的 Workspace Model 同时承担“基础模型包装 + 助手模板”职责，因此只借鉴其元数据和生命周期，不复制命名。

相关模块：

- [model metadata and lifecycle](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/backend/open_webui/models/models.py#L28-L104)：Workspace Model 有 description、capabilities、可扩展 meta、规范化后的 tags 和 `is_active` 软禁用字段。
- [invalid metadata normalization](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/backend/open_webui/models/models.py#L43-L72)：无效头像 URL 被清空并记录一次 warning；旧字符串 tag 迁移成 `{name}` 对象。
- [tag filtering](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/backend/open_webui/models/models.py#L232-L250)：tag 是多值检索维度，不承担唯一分类关系。
- [soft toggle API](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/backend/open_webui/routers/models.py#L628-L676)：启用/禁用是显式事件，资源本身不被删除。
- [model list route](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/routes/%28app%29/workspace/models/%2Bpage.svelte#L1-L23)、[create route](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/routes/%28app%29/workspace/models/create/%2Bpage.svelte#L1-L59)、[edit route](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/routes/%28app%29/workspace/models/edit/%2Bpage.svelte#L18-L55)：列表、创建、编辑是独立路由，编辑还验证写权限。
- [editor metadata](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/workspace/Models/ModelEditor.svelte#L77-L95)：模板 meta 把 `description`、`suggestion_prompts`、`tags` 与 system prompt 分开。
- [editor tags/prompts](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/workspace/Models/ModelEditor.svelte#L695-L808)：tags 独立编辑；system prompt 与 suggestion prompts 是不同区块。
- [prompt suggestion shape/editor](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/workspace/Models/PromptSuggestions.svelte#L109-L168)：suggestion 使用 `{content, title: [title, subtitle]}`，支持顺序、增删和 JSON 导入导出；导入 JSON 无效时明确报错（同文件 `L35-L74`）。
- [suggestions runtime](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/chat/Suggestions.svelte#L10-L119)：卡片展示 title/subtitle，点击传回 prompt content。
- [new chat availability resolution](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/chat/Chat.svelte#L1343-L1451)：新聊天会过滤不存在、隐藏或不可用的模型，但最后会回退到第一个可用模型。
- [chat persistence](https://github.com/open-webui/open-webui/blob/ecd48e2f718220a6400ecf49eafd4867a38feb10/src/lib/components/chat/Chat.svelte#L2911-L2934)：首次真实发送时创建 Chat，并把所选 model ID、system、params、history、tags 一并保存后替换 URL。

采用：

- `tags` 与 starter prompts/suggestions 分开；starter prompt 使用带稳定 ID、title、subtitle、prompt 的结构化对象。
- `enabled/is_active` 采用软禁用，后台列表仍能看到并恢复，公共目录和新启动路径过滤。
- 列表、创建、编辑分路由/分层；公共目录只呈现允许操作。
- 对可清洗的旧格式做规范化，对真正无效的结构给明确错误。

拒绝：

- Open WebUI 的 Workspace Model、访问授权和服务端用户资源依赖登录/数据库，本项目不能复制。
- “找不到指定模板时回退第一个可用模型”只适合通用模型选择，不适合人格/系统提示词绑定；助手必须 fail closed。
- Open WebUI 使用 `localStorage.token` 和服务端账号；本项目 BYOK URL/Key 必须继续只在 `sessionStorage`，且不进入助手元数据。

### 4. 重点问题的项目决策

#### 4.1 助手分类字段

采用：

1. `Assistant.categoryId: string`：单一主分类，稳定 slug/ID，不存本地化 label。
2. `Assistant.tags: string[]`：零到多个自由检索词；trim、去重、限制数量和长度。
3. `AssistantCategory` 独立服务端列表：`id/label/description/sortOrder/enabled`。
4. `Assistant.sortOrder`：同分类内管理排序；不能依赖数组当前插入位置。

理由：LobeHub 与 LibreChat 都把主分类建模为单值，LobeHub/Open WebUI 把 tags 建模为多值；Cherry Studio 最新重构也明确主组织关系应收敛为单 group。主分类用于稳定导航，tags 用于交叉检索，二者语义不同。

拒绝：

- 用 `tags[0]` 充当分类。
- 把中文 label（如“写作”）当外键；改文案/语言会破坏关系。
- 为每个助手复制完整分类 label/description/order。
- 同时维护 `category`、`categoryId` 两个权威字段。

#### 4.2 启动助手如何创建并绑定新会话

推荐单一领域动作：

```ts
startAssistantConversation({
  assistantId,
  starterPromptId?: string,
  starterBehavior: "fill" | "send"
}): Promise<{ conversationId: string }>
```

顺序：

1. 从最新 public bootstrap 映射中精确解析 `assistantId`；必须 `enabled === true`，分类是否启用也必须通过。
2. 若指定 starter，按该助手内 `starterPromptId` 精确解析；无效 ID 直接报错，不降级成任意 prompt。
3. 用 `createLocalConversation(assistant)` 生成带 `assistantId` 的新 `Conversation`。
4. 先把新会话写入 `xi-ai-web-workspace.conversations`；持久化失败则不导航、不宣称成功。
5. 成功后更新 Chat 内存列表、创建全新的 `SessionUiState`，折叠旧会话并激活新会话。
6. 再导航到 `/chat`；若跨懒加载模块需要定位，可使用非敏感的 `?conversation=<uuid>` 或 App 级一次性内存 intent。不要再用只存助手 ID、尚未创建会话的 sessionStorage 竞态。
7. starter 的默认行为建议为 `fill`：把可见文本填入新会话 composer，由用户确认发送；只有用户点击明确写着“直接发送”的动作时才 `send`。实际发送必须走现有 `sendMessage`/stream 路径。

必须保持：

- `Conversation.assistantId` 是历史绑定；不要在发送时改成当前默认助手。
- 服务端运行时对 `assistantId` 做 exact lookup；不存在/禁用返回 `410 assistant_unavailable`（或明确 404/409），不能 `|| firstAssistant`。
- `Assistant.revision` 可以写入可选的会话诊断快照，但客户端的 system prompt 快照不能成为公共助手运行权威；服务端仍解析当前公共助手。
- 每个新会话的 Skill/App/附件/草稿状态从空值开始；不得继承前一会话。
- BYOK 仅在真正发请求时通过 `userConnectionPayload` 从现有 sessionStorage 状态注入；创建会话动作不读、不写、不复制 API URL/Key。

#### 4.3 智能体目录与编辑器如何分层

建议四层：

```text
PublicAssistantCatalog (public bootstrap, read-only)
  - category tabs, tags, search, enabled items, sort

PublicAssistantDetail (read-only)
  - description, starter prompts, start action
  - optional: "复制为私人智能体"

AdminAssistantEditor (/admin only)
  - public Assistant + AssistantCategory CRUD/validation/enable/order
  - sees disabled/invalid records and validation diagnostics

PrivateAgentWorkspace (/agents, IndexedDB)
  - UserAgentDefinition list/editor/run
  - Skill/tool/knowledge/model fields
```

可以共享：卡片、头像、tag、starter prompt、空状态、字段 sanitizer、只读 preview 组件。

不能共享：repository、写权限、保存 action、删除语义、运行 payload、缓存权威源。公共助手来自服务端 bootstrap；私人智能体来自 IndexedDB。公共助手编辑器不能调用 `saveUserAgents`，私人智能体编辑器不能调用 `/api/admin/assistants`。

“复制为私人智能体”若实现，应走白名单转换：`name/description/systemPrompt` 可复制，公共 `categoryId/tags/starterPrompts/enabled/revision` 不自动进入 `UserAgentDefinition`；私人 `skillIds/allowedTools/knowledgeDocumentIds` 初始化为空；绝不复制 BYOK。

#### 4.4 starter prompts 与标签如何组织

采用助手内嵌的有序 starter prompt 对象，不复用全局 `PromptPreset`：

- starter prompt 的生命周期、权限和失效与助手一致。
- `id` 用于稳定 UI key/深链选择；`title/subtitle` 只做展示；`prompt` 是用户可见发送内容。
- 管理端校验：每个助手最多建议 6 个；`id` 唯一；title/prompt trim 后非空；prompt 有长度上限；禁止重复 prompt。
- 运行时桌面最多展示 4-6 个，移动端最多 2-3 个；点击默认填入 composer 或明确发送。
- starter prompt 不加入 system prompt，不进入隐藏 provider content，不和 Chat 的一次性 `AppPreset.prompt` 混用。
- tags 只用于目录筛选/搜索；标准化为 trim 后的唯一字符串，建议最多 12 个、单项最多 32-64 字符。
- category 是单值导航维度，tags 是多值交叉检索维度，starter prompts 是会话入口内容，三者不得共用字段。

现有 `PromptPreset` 继续服务各 module 的全局提示词预设；不要为了助手 starter prompts 新建跨资源 ID 引用，否则禁用/删除助手时更容易产生悬挂引用。

#### 4.5 失效/禁用模板如何处理

公共助手：

| 状态 | 目录 | 新建会话 | 既有会话 | 管理端 |
| --- | --- | --- | --- | --- |
| enabled + valid | 可见 | 允许 | 可读可继续 | 可编辑/禁用 |
| disabled | 不进入公共 bootstrap/目录 | 拒绝 | 历史可读；继续发送返回明确不可用 | 可见、可恢复 |
| invalid | 不进入公共 bootstrap；逐条隔离 | 拒绝 | 历史可读；发送失败 closed | 显示字段级校验错误 |
| hard deleted/missing | 不可见 | 拒绝 | 历史可读；显示“助手已下架/不存在” | 建议保留审计记录 |

具体规则：

1. 管理端 create/update 必须完整验证，不能让非法记录进入权威数组；bootstrap 再做防御性 sanitizer 并逐条过滤。
2. 默认使用软禁用。若助手已被任何本地会话引用，服务端无法看到这些 IndexedDB 引用，因此硬删除无法安全改绑；删除动作应优先转为 disabled/archived。
3. 既有 `Conversation` 永不自动改绑。用户若选择替代助手，应“基于当前历史新建/分叉会话”，而不是修改原会话 `assistantId`。
4. 服务端删除/运行解析必须移除 `fallbackAssistant = first` 逻辑。错误应有稳定 code，前端据此锁定发送并提供返回目录/新建其他助手动作。
5. disabled category 不应让其助手静默归入 `general`。管理端应阻止禁用仍有 enabled 助手的分类，或要求先批量迁移/禁用这些助手。
6. starter prompts 内嵌于助手，不单独软删除；编辑后随 `revision` 更新。客户端拿到旧 starter ID 时重新解析，找不到就提示已失效，不发送其他 prompt。
7. 私人 IndexedDB Agent 的损坏记录继续由 `sanitizeWorkspaceUserAgent` 严格拒绝；不应把损坏记录替换为默认 Agent。删除私人 Agent 后，相关工作流/会话显示缺失引用并要求显式修复。

### 5. Adopt / Reject 决策总表

| 设计点 | 决策 | 依据 |
| --- | --- | --- |
| 单一主分类 `categoryId` | Adopt | LobeHub、LibreChat、Cherry Studio 的主组织关系均为单值。 |
| 多值 `tags` | Adopt | LobeHub/Open WebUI 独立 tags；用于搜索，不代替分类。 |
| 独立分类元数据 `id/label/order/enabled` | Adopt | LibreChat 的数据库驱动 category schema 与 active 查询。 |
| starter prompts 隶属助手 | Adopt | LobeHub opening questions、LibreChat conversation starters、Open WebUI suggestion prompts。 |
| starter prompt 结构化 title/subtitle/prompt | Adopt, simplified | Open WebUI；本项目增加稳定 `id`，不需要导入导出子系统。 |
| 创建绑定会话后再导航 | Adopt | NextChat `newSession(mask)`、LibreChat conversation template、Cherry Topic create。 |
| 公共模板先复制进私人实体再聊天 | Reject as default; optional explicit clone | LobeHub/Cherry 适合登录/本地实体；本项目公共助手可直接由服务端 ID 运行。 |
| 公共 system prompt 快照成为会话运行权威 | Reject | 会绕过后台禁用/更新；仅私人 Agent 可考虑受限快照。 |
| 无效/禁用后回退第一个助手 | Reject | 会静默改变人格与系统指令；当前本地代码需要修正。 |
| 删除助手时改绑旧会话 | Reject | 破坏历史语义；Cherry Topic 的保留策略更适合。 |
| 软禁用并保留管理可见性 | Adopt | Open WebUI `is_active`、LobeHub lifecycle status。 |
| 公共目录与私人编辑器共用 repository | Reject | 违反服务端/IndexedDB 权威边界。 |
| URL/Key 进入助手、会话或归档 | Reject invariant | 本项目 PRD、state spec 与现有 sessionStorage 实现。 |

### 6. 建议的后续实现验收点

本研究不修改代码，但实现阶段至少应验证：

1. 公共 bootstrap 只返回 valid + enabled 助手和 enabled 分类；Admin bootstrap 返回全部并含状态。
2. 从助手目录启动一次只创建一个 IndexedDB Conversation，且 `assistantId` 精确匹配点击项。
3. 刷新后会话仍绑定同一助手；跨路由 intent 不重复创建。
4. 无效、禁用、删除的助手 ID 不会回退首个助手，也不会发起 provider 请求。
5. 禁用助手后既有消息仍可读取，composer 给出明确不可用状态。
6. starter prompt 点击不会改变 system prompt；默认填入或显式发送的可见用户文本与请求一致。
7. 新会话不继承上一会话的 Skill、App、附件或草稿。
8. 私人 Agent 仍只写 `userAgents` IndexedDB store；公共助手仍不进入 workspace export。
9. 导出的工作区无 `baseUrl`、`apiKey`、公共助手后台记录；BYOK 测试继续证明只在 sessionStorage。
10. 管理端分类停用、助手禁用、非法 starter prompt、重复 tag/ID 均有确定校验结果。

## External References

本研究仅使用 GitHub 官方上游仓库及其源码/仓库内迁移说明，没有使用二手博客。版本上下文固定为检索时默认分支的以下提交：

| Project | Repository | Commit | Commit date |
| --- | --- | --- | --- |
| LobeChat / LobeHub | https://github.com/lobehub/lobehub | `e3565363d59c6b2602d22e619797625cbd4d4bf7` | 2026-07-21 |
| LibreChat | https://github.com/danny-avila/LibreChat | `8e5ef1fb31e9d63b735c089b21cbc82c50acce46` | 2026-07-16 |
| NextChat | https://github.com/ChatGPTNextWeb/NextChat | `706a18b95b714ab29b2a4842d3b9ff4f887935d5` | 2026-07-06 |
| Cherry Studio | https://github.com/CherryHQ/cherry-studio | `fe479e4a69548dc570e3404620a182e57170823f` | 2026-07-21 |
| Open WebUI | https://github.com/open-webui/open-webui | `ecd48e2f718220a6400ecf49eafd4867a38feb10` | 2026-07-01 (`0.10.2`) |

## Related Specs

- `.trellis/spec/frontend/state-management.md`：公共 bootstrap 元数据由服务端拥有；私人工作区进入 IndexedDB；BYOK URL/Key/last model 仅 sessionStorage。
- `.trellis/spec/frontend/type-safety.md`：共享类型与运行时边界必须显式清洗，不允许用弱类型跨 public/admin/workspace 边界。
- `.trellis/spec/frontend/component-guidelines.md`：公共路由、管理端隔离、dialog、禁用态和移动端可访问性约束。
- `.trellis/spec/frontend/quality-guidelines.md`：公共导航、Chat 会话、IndexedDB 归档、BYOK 隔离与命令/工作流 E2E 契约。
- `.trellis/spec/backend/database-guidelines.md`：服务端元数据与私人浏览器工作区不能混成用户数据库。
- `.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md`：R1、R8、R10 是本研究设计边界的需求来源。
- `.trellis/tasks/07-20-workspace-indexeddb-backup/design.md`：公共助手 `assistantId` 与私人 inline agent 的双路径是现有技术设计。

## Caveats / Not Found

- GitHub Web 搜索接口在本次会话返回认证不可用；随后改用 GitHub 官方 REST API、`raw.githubusercontent.com` 和固定提交 permalink 直接读取源码。所有外部证据仍来自官方仓库。
- LobeChat 仓库 URL 已重定向到更大的 `lobehub/lobehub` monorepo；报告使用当前 canonical repository 和固定 SHA，旧文章/路径可能已失效。
- 五个上游项目中，只有 NextChat 与本项目一样更接近无登录、本地会话；其 Mask 模型缺少分类、标签和禁用生命周期，不能单独作为公共目录范本。
- LobeHub、LibreChat、Open WebUI 依赖登录和服务端用户数据；Cherry Studio 依赖 Electron/SQLite。报告只采纳字段、事务顺序和 UI 分层，不采纳其身份/存储架构。
- LibreChat 当前 Agent schema 未发现 Agent 级 `enabled/status`；它的 `isActive` 位于分类资源。禁用助手策略因此主要由 LobeHub 与 Open WebUI 交叉佐证。
- Cherry Studio 的 catalog preset `group?: string[]` 是 bundled 目录分类，而可编辑 Assistant 本体已收敛为单一 `groupId`；报告据此区分“目录 facets”与“实体主分组”，没有把两个字段视为同一层。
- Open WebUI 将可定制 Workspace Model 当作助手模板使用；名称不同，但其 `meta.tags`、`suggestion_prompts`、system prompt、`is_active` 和独立 editor 路由与本问题直接相关。
- 本研究没有建议把公共助手复制进工作区备份。只有用户明确执行“复制为私人智能体”后生成的 `UserAgentDefinition` 才应进入 IndexedDB 与 workspace export。
