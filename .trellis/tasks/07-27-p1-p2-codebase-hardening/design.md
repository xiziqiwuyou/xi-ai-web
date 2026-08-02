# 技术设计

## 服务端边界

默认数据移动到 `server/data/defaults.mjs`，以工厂函数接收时间戳，避免模块加载时冻结时间。`server/index.mjs` 继续拥有持久化迁移和运行时数据库引用，提取只改变代码所有权，不改变 JSON 格式。

公共 Bootstrap 使用一个投影函数和一个规范路由。旧 `/api/bootstrap` 与 `/api/auth/*` 直接删除；前端 `api.bootstrap` 若仍存在则改为调用规范路由，不保留第二条服务端路径。

主后台写队列放在独立 `server/metadata-write-queue.mjs`。GET/HEAD 不排队；POST/PATCH/PUT/DELETE 在进入处理器前获得槽位，在响应 `finish/close` 时幂等释放。等待中的客户端若已断开则直接释放并跳过处理器。队列只保证单 Node 进程内顺序，不宣称跨实例一致性。

## React 拆分原则

先移动可独立验证的叶子组件，再提取状态 hook；每次只拆一个功能域并运行其契约。共享类型和纯函数放在同功能目录，不创建通用大杂烩工具文件。

- Chat：会话卡片、模型菜单/附件/工具条边界与会话状态工具。
- Admin：导航外壳保留在入口；站点、模型、内容、工作流等页面按 section 拆分。
- Studio：入口按 `moduleId` 组合五个独立工作台，共享 `StudioModelSelect`。
- Automation：入口组合 `AgentsWorkspace` 与 `WorkflowsWorkspace`，共享运行结果和知识上下文工具。

拆分阶段不改变 DOM 结构、className、accessible name、状态存储键或 API payload。

## CSS 迁移

先生成选择器所有权/重复清单，再按 UI 域迁移。基础 reset、通用控件和旧页面仍依赖的规则进入语义化 base 文件；功能规则跟随 Chat/Admin/Workbench/Knowledge 所有权。每删除一个 legacy pass，必须运行 UI 契约和至少桌面、移动目标 E2E。`--xhs-primary` 作为新语义 token，`--xhs-red` 在迁移期只做兼容别名，最终是否删除由使用计数决定。

## 回滚策略

所有阶段保持单独可回滚：先新增目标模块并切换 import，再删除原块；CSS 先迁移规则再移除 import。若目标 E2E 失败，仅回滚当前阶段，不触碰已验证的 P0 边界或其他历史改动。
