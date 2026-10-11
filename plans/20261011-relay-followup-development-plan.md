# xi-ai-web 后续开发计划：Relay 兼容性与运营可靠性

更新日期：2026-10-11

当前本地基线为 `v0.0.16` 发布候选之后的 `master`，远端 `master` 仍停留在
`v0.0.15`。本计划按“先可发布、再协议正确、最后运营增强”的顺序执行。

## 已完成

- `native` / `openai-relay` 模型级请求协议选择。
- Relay Chat Completions、多模态、流式、函数工具轮次。
- Relay Images generations / edits、Base64 与 URL 资产解析、PNG 蒙版校验。
- Relay 图片模型的前端能力识别和 Admin 能力校验。
- PR 质量门禁、构建、协议、前端、服务端和实时 smoke 基础检查。

## 本轮已落地（2026-10-11）

- Relay Chat SSE 只在流结束时上报最后一份累计 usage；工具轮次仍按请求分别计量。
- OpenAI 兼容响应的 `content` 数组只提取文本/output-text 片段，图片片段不会污染可读文本；工具调用的 `content: null` 保持原样。
- 统一投影 OpenAI `error` envelope，过滤未知字段和上游密钥，HTML、未知 JSON 与超长文本均保持有界。
- `provider-contracts`、TypeScript、服务端、安全、前端、隐私、UI 契约与发布构建检查已通过。

## P0：发布与门禁

1. 将本地已验证提交同步到远端 `master`，再同步 `v0.0.16` 标签。
2. 检查 GitHub Actions 的完整 verify 任务，确认发布任务只在 `master` 或 `v*` 标签执行。
3. 保存 Actions 运行结果；失败时先修复门禁，不直接推送镜像。

验收：远端提交与本地 HEAD 一致，verify 全部通过，GHCR 发布只发生在受控引用。

## P1：Relay 协议正确性

1. 流式响应只提交一次最终 usage，避免中转站按块累计 usage 导致重复计费。
2. 将 `message.content` 的文本数组安全转换为纯文本，保留多模态响应的可读内容。
3. 统一解析 OpenAI `error` envelope，错误只暴露有限字段，HTML/超长/未知响应保持有界。
4. 增加多图 `image` / `image[]` 字段策略配置；默认保持当前首图 `image`、后续 `image[]` 兼容行为。
5. 补齐 Relay 契约：URL/`b64_json`、多图编辑、SSE tool-call 增量、错误 envelope、字段白名单和三种 `/v1` 基础地址。

验收：`npm run provider-contracts`、`npm run test:server`、`npm run check` 全部通过，原生适配器无回归。

## P1：真实 new-api 验收

1. 增加受控 mock new-api echo fixture，记录请求路径、Bearer、JSON 字段和 multipart 字段。
2. 用一次性 API Key 执行 Chat 非流式、流式、多模态、函数工具、图片生成和图片编辑。
3. `smoke:live` 要求显式模型 ID，并仅输出 case/status/耗时/模型元数据，不输出 Key、完整 prompt 或上游响应。

验收：真实部署和 mock fixture 的请求形状均符合 new-api 兼容契约。

## P2：后台运营与前端体验

1. Admin 增加临时 Provider/model health probe，不持久化临时 URL 或 Key。
2. 修复自定义 vendor label 的公开目录投影，模型行显示 Relay/native 与能力徽章。
3. Admin 表单增加 dirty-state、保存时间戳、备份和审计空状态。
4. 增加 Playwright Chromium CI 安装/缓存及 Relay 图片选择器回归。
5. 按需实现备份保留策略、审计分页和日期过滤。

## 发布原则

- `native` 永远保留为回滚路径。
- 未获得真实 new-api 地址和一次性 Key 前，不宣称线上 Relay 验收完成。
- 任何上游 Key 只存在于请求态，不进入前端响应、日志、审计、元数据或测试产物。
