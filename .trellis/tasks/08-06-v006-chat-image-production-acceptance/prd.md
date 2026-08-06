# v0.0.6 核心对话与图片生成上线验收

## 背景

`v0.0.5` 已完成发布基线，下一阶段不再继续堆叠 UI，而是验证最核心的两个用户价值：AI 对话和图片生成是否能够在用户只携带 API Key 的情况下稳定完成真实请求、展示结果和恢复失败。

## 目标

在不改变现有产品边界的前提下，建立 Chat 与 Image 的上线验收矩阵，并只修复能够被本地合同测试、浏览器测试、构建检查或明确的真实联调证据证明的问题。

## 纳入范围

- 浏览器 BYOK Key 到服务端统一 `api.xi-ai.cn` 上游的请求链路。
- Chat 的 OpenAI Chat/Responses、Claude Messages、Gemini 官方端点路由和流式输出。
- Chat 的取消、超时、错误脱敏、分帧 SSE、缓冲和消息持久化。
- Image 的 OpenAI/Gemini 图片模型、文生图、图生图、模型能力校验、尺寸/质量/格式参数、单图默认结果、图片字节交付。
- 图片加载、失败、重试、复制、下载和图生图编辑入口。
- Docker/Compose 健康检查、`/api/health`、`/api/ready`、反向代理 SSE 配置和最小部署冒烟。
- 相应的 provider/server/frontend/E2E 回归测试和发布证据。

## 不纳入范围

- 不引入用户注册、公共账号、数据库或新的远端持久化。
- 不修改管理员入口、知识库、工作流、助手库、PPT、思维导图等非核心模块。
- 不允许外部请求携带 URL 选择上游，不新增 OpenAI-compatible 任意目标。
- 不在自动化测试中提交真实用户 API Key，不把真实联调结果伪装成合同测试通过。
- 不在没有失败证据时重构大型组件或重新设计整套 UI。

## 验收标准

- [ ] 新会话携带有效 Key 后可以完成一次 Chat 非流式请求。
- [ ] 新会话携带有效 Key 后可以完成一次 Chat 流式请求，增量稳定、结束标记明确、可取消且不会重复写入。
- [ ] Chat 失败时用户得到可读错误，服务端日志和响应不泄漏 Key。
- [ ] 文生图和图生图请求只向后台配置的允许端点发送，参数与模型能力匹配。
- [ ] 图片结果按真实图片字节或可访问数据交付，复制和下载不是仅复制 URL。
- [ ] 图片默认单张，生成中有明确状态，失败可重试，编辑图片可以进入图生图。
- [ ] Docker 健康检查、生产构建、反向代理 SSE 和最小冒烟检查通过。
- [ ] 发布证据区分本地合同测试、浏览器测试、真实 API 联调和线上检查。


## Goal

在 v0.0.5 基线上验证 AI 对话与图片生成的真实可上线链路，覆盖 BYOK、模型路由、流式输出、图片字节交付、错误恢复和 Docker 健康检查。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
