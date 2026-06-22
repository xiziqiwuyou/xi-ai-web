# 统一用户 API 设置页改造计划

## 目标

在左侧菜单栏新增普通用户可见的“设置”入口，用一个设置页面统一配置 API URL、API Key、默认模型。聊天、画图、音频、视频、智能体、知识库等功能都读取同一份用户侧配置完成调用请求。后台管理员入口继续独立保留在 `/admin`，不出现在首页或用户设置页里。

## 当前判断

- 当前聊天模块有自己的 `userProvider` 状态和顶部模型接入弹窗。
- 当前生成模块有自己的 `provider` 状态和页面内“模型接入”表单。
- 后端已支持每次请求携带 `transientProvider`，无需把用户 API Key 存进服务端。
- 左侧菜单由 `server/index.mjs` 的 `defaultMenuItems()` 与前端 `moduleRegistry` 共同驱动，适合把“设置”作为普通模块接入。

## 推荐方案

使用前端全局状态管理用户 API 配置，默认存到 `sessionStorage`。这样刷新页面不丢失当前会话配置，但 API Key 不写入服务端数据文件。后续如果需要“记住本机”，再加显式勾选并改用 `localStorage`。

## 阶段

1. [Phase 01 - 公共设置菜单与设置模块](./phase-01-public-settings-module.md)
   - 新增 `settings` 模块类型、菜单项、模块注册信息、设置页面壳。

2. [Phase 02 - 统一用户 API 配置状态](./phase-02-shared-provider-state.md)
   - 在应用顶层集中维护 `UserProviderConfig`，提供读取、更新、持久化、就绪判断。

3. [Phase 03 - 改造聊天与生成调用流程](./phase-03-feature-request-flow.md)
   - 移除各功能页重复 API 设置表单，所有请求统一使用全局配置。

4. [Phase 04 - 验证、兼容与安全检查](./phase-04-validation.md)
   - 验证旧数据迁移、菜单开关、调用请求、密钥不落盘、公共页面无后台设置入口。

## 关键原则

- 用户设置不是管理员后台。
- API Key 只存在用户浏览器会话中，不进入 `data/app-data.json`。
- 功能模块只负责业务输入和结果展示，不再各自维护模型接入表单。
- 未配置 API 时，模块显示轻提示并引导去左侧“设置”。

## 预计影响

- 前端改动为主。
- 后端只需把 `settings` 加入默认菜单和数据归一化。
- API 请求协议基本不变，继续使用已有 `transientProvider`。

## 未决问题

- 默认模型是否固定为 `gpt-4.1-mini`，还是在设置页提供常用模型快捷选择。推荐先保留文本输入 + 常用模型建议，不额外做模型列表接口。
