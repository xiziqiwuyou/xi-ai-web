# P1/P2 代码质量与可维护性加固

## 目标

在不改变现有产品功能、UI 视觉和 BYOK 使用方式的前提下，完成外部审查中 P1/P2 级别的剩余问题：降低服务端单文件复杂度、消除误导性兼容接口、加强单实例 JSON 元数据写入一致性、拆分巨型 React 组件，并逐步清理 CSS 多轮覆盖债务。

## 已确认事实

- 项目不需要用户数据库或公共账号系统；前台保持无登录、仅携带 API Key。
- 管理员元数据继续使用单实例 JSON 文件，知识库自己的 PostgreSQL/pgvector 不属于本任务。
- `server/index.mjs` 约 3300 行；`ChatModule`、`AdminConsole`、`StudioModule`、`AutomationModule` 均超过 1600 行。
- 全局样式同时加载 15 个 `legacy.*` 文件和 v2 文件，存在明显覆盖链。
- `/api/auth/*` 是无实际鉴权的遗留桩；`/api/bootstrap` 与 `/api/public/bootstrap` 重复。
- P0 上游边界、限流、超时、计算器动态执行移除和 Key 遮罩已经完成，不在本任务重复实现。

## P1 需求

1. 将默认菜单、助手、应用和提示词数据从 `server/index.mjs` 提取到独立数据模块，保持稳定 ID、版本迁移和时间戳语义。
2. 公共 Bootstrap 只保留 `/api/public/bootstrap`；删除无功能的 `/api/auth/status|login|logout` 和重复 `/api/bootstrap`，同步前端别名与契约测试。
3. 保留 JSON 持久化，但为主后台的 POST/PATCH/DELETE 元数据写操作增加单进程串行化，防止异步设置校验、导入和恢复互相覆盖；等待期间断开的请求不得继续修改数据。
4. 将 Chat 的会话块和 Admin 的主要二级页面拆为职责明确的组件/模块；保持请求、会话排序、弹窗、焦点和存储格式不变。

## P2 需求

5. 将 Studio 的图片、PPT、思维导图、助手库、翻译工作台拆为独立模块；共享模型选择和输入工具不得复制。
6. 将 Automation 的智能体与工作流工作区拆为独立模块；保持工作流运行、知识库、工具与审批数据流不变。
7. 建立 CSS 所有权清单，把可确认仍在使用的基础规则迁入语义化 base/shell/workbench/chat/admin 文件；逐批删除死规则和重复覆盖，禁止一次性无验证删除全部 legacy 层。
8. 为旧 `--xhs-red` 提供语义清晰的主色 token 迁移路径；本阶段不改变实际色值和可见视觉。

## 验收标准

- 公共客户端和服务端不再引用 `/api/bootstrap` 或 `/api/auth/*`；Admin 与知识库鉴权不受影响。
- 默认数据提取后，新数据文件和旧版本迁移输出与现有契约一致。
- 两个并发后台写请求严格按到达顺序执行；首个响应完成/关闭后释放队列，断开等待请求不会执行处理器。
- Chat、Admin、Studio、Automation 的行为契约和目标 E2E 全部通过，模块入口文件只负责协调状态和组合子组件。
- `styles.css` 不再直接维护多轮历史 pass；每批 CSS 删除都有 UI 契约和桌面/移动视觉回归证据。
- `npm run check`、Build、Release Check、Smoke、Provider/Search/Automation/Knowledge、安全与隐私契约通过。
- `git diff --check` 通过，未清理或覆盖任务范围外的历史工作树改动。

## 非目标

- 不迁移到 SQLite/PostgreSQL，不支持多实例共享写入。
- 不新增公共用户登录、注册、多人协作或服务端保存 API Key。
- 不改变模型厂商请求协议、模型目录语义或统一上游边界。
- 不引入新的路由框架、CSS 框架或状态管理依赖。
- 不进行视觉重设计、文案重写或功能菜单增删。
