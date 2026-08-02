# 执行计划

## Phase 01 - 基线与契约

1. 记录四个巨型组件、服务端入口和 CSS 文件基线。
2. 增加遗留公共路由缺失、规范 Bootstrap、默认数据和元数据写队列的回归契约。
3. 运行当前 TypeScript、UI、Provider、Automation 与目标 E2E，确认基线。

## Phase 02 - 服务端表面清理

1. 提取默认菜单、助手、应用和提示词数据。
2. 合并公共 Bootstrap 投影，删除 `/api/bootstrap` 与 `/api/auth/*`。
3. 更新前端 API 别名、审计脚本和 Release/Smoke 契约。

## Phase 03 - JSON 写入串行化

1. 实现可测试的单进程元数据写队列。
2. 在主 Admin Router 鉴权后、写路由前挂载队列。
3. 覆盖顺序、释放、断开等待和异常响应测试。

## Phase 04 - Chat 与 Admin 拆分

1. 提取 ChatSessionBlock 及其直接依赖。
2. 提取 Chat 会话纯函数/状态工具。
3. 按 Admin section 拆分页面组件，保留入口状态协调。
4. 运行 Chat、Admin、公共导航 E2E。

## Phase 05 - Studio 拆分

1. 提取共享模型选择和图片输入工具。
2. 分离 Image/PPT/Mindmap/Assistants/Translate 工作台。
3. 运行图片、PPT、思维导图、助手与翻译契约。

## Phase 06 - Automation 拆分

1. 提取 AgentsWorkspace、WorkflowsWorkspace 与共享纯函数。
2. 保持工作流画布、审批、知识库和工具调用引用稳定。
3. 运行 Automation 与 Langflow 契约/E2E。

## Phase 07 - CSS 所有权与清理

1. 生成 legacy/v2 选择器重复和页面使用清单。
2. 逐域迁移基础规则，删除确认无用的历史 pass/import。
3. 引入 `--xhs-primary` 语义 token 并保留兼容别名。
4. 每批运行 UI 契约和桌面/移动截图回归。

## Phase 08 - 全量验证

1. 运行 `check`、Build、Release Check、Smoke、Privacy。
2. 运行 Provider、Search、Prompt Tool、Automation、Langflow、Knowledge、Security 契约。
3. 运行目标桌面/移动 E2E 和 `git diff --check`。
4. 更新 Trellis spec，记录剩余风险；不自动提交历史脏文件。

## 执行结果

- Phase 01-07 已完成，未改变 BYOK、无用户登录、JSON 元数据和现有 Provider 协议边界。
- 修复元数据写队列对已消费请求错误识别为断开的问题，并补充回归测试。
- 修复知识引用列表在跨知识库复用文档分块时的 React key 冲突。
- 修复公共路由首屏标题依赖 Bootstrap 完成的时序竞态。
- `npm run qa` 通过：类型、构建、隐私、UI/功能契约、Provider、工具、工作区、Automation、Search、Langflow、Knowledge、Security 和运行时检查均通过；PostgreSQL 集成因未配置测试数据库明确跳过。
- `npm run test:e2e` 通过：388 passed，40 skipped，0 failed；知识/Automation 定向回归 64/64 通过。
- `node scripts/release-check.mjs`、`npm run smoke`、`npm run test:server`、`node --check server/index.mjs` 和 `git diff --check` 通过。

## 剩余风险

- 构建仍提示 Chat/Automation 产物超过 500 KB；本任务只完成组件拆分和 CSS 清理，后续可单独做更细粒度懒加载。
- PostgreSQL + pgvector 集成测试需要外部测试数据库，当前环境未执行该项。
- Playwright WebServer 偶发输出浏览器 `ResizeObserver loop` 开发环境提示，但全量和定向用例均通过。
- 当前工作树保留历史未提交改动，本任务不自动提交或归档。
