# 嵌入令牌桥接兼容性与可靠性

## Goal

修复外部系统跳转到 xi-ai-web 后无法自动取得 API Key、提示“令牌无效或已过期”并回退到手动填写的问题。目标是明确外部嵌入协议，可靠完成一次性令牌兑换，同时保留 BYOK 的安全边界：浏览器只保存当前会话的 API Key，服务端不持久化外部令牌或 API Key。

## Confirmed Facts

- 外部协议边界已确认：`type: 2` 只用于跳转 ShellNext；xi-ai-web 这类其他外部系统必须使用 `type: 3`。
- 当前截图中的配置是 `type: 2` 且链接只有 `https://chat.xi-ai.cn`，这条配置本身不能用于 xi-ai-web 的令牌桥接。
- 当前项目实现的是外部系统 `type: 3` 风格入口：`/#/jwt_auth?x_s_token=<token>`。
- 前端入口位于 `src/features/settings/userProviderConfig.ts` 与 `src/App.tsx`，只识别 `/jwt_auth` 和 `x_s_token`，并在初始化时清理地址栏。
- 前端通过同源 `POST /api/public/shell-token/exchange` 兑换 Key；服务端固定使用管理员配置的 `UPSTREAM_BASE_URL`，不接受调用方携带的上游地址。
- 服务端兑换流程是 `/api/user/login/refresh` 后 `/api/token/default`，401/403 当前被合并为“外部登录令牌无效或已过期”。
- 2026-08-06 线上证据：`https://api.xi-ai.cn/api/user/login/refresh` 对脱敏测试令牌返回 HTTP 200、`success:false`，消息为 `JWT cross-domain login is not enabled by the administrator.`；因此当前“令牌无效或已过期”是错误归类，首要阻塞是上游未开启跨域 JWT 登录。
- 兑换成功后的 Key 只进入当前浏览器会话的 `sessionStorage`；既有任务明确不支持 type 2 链接，且不允许把长期 API Key 放入 URL 或服务端存储。
- 既有验证曾发现旧 Node 进程或旧镜像会使兑换路由返回 404，因此部署版本不一致也是现实风险。

## Requirements

### R1. 协议确认与兼容边界

- 保留现有规范入口 `#/jwt_auth?x_s_token=...`，不降低令牌长度、字符和安全校验。
- 不在 xi-ai-web 中实现或猜测 `type: 2`；它属于 ShellNext。
- 只接收外部系统以 `type: 3` 方式传入的、已确认格式的短期令牌；直接 API Key、任意 query 参数或未知路径不能被当作登录令牌。

### R2. 可诊断的失败分类

区分并向用户提供不泄露秘密的稳定错误状态：未携带令牌、格式不支持、令牌格式无效、上游鉴权失败/已过期、上游兑换端点不存在、上游地址配置错误、上游超时、默认 API Key 不可用、当前服务版本未包含桥接路由。日志和错误响应只能包含脱敏的 request id、状态分类、上游状态码和端点类别，不得包含令牌、API Key、完整 URL query 或上游响应原文。

### R3. 初始化与回退可靠性

- 兑换只执行一次，刷新、React Strict Mode、重复 hashchange 和并发初始化不能重复兑换同一令牌。
- 清理地址栏后仍能完成兑换；临时网络失败应允许当前页面内安全重试，但不把令牌写入 localStorage、URL 以外的持久化存储或服务端元数据。
- 成功后自动关闭 API Key 提示；失败时保留现有手动填写入口和可读原因，不影响用户手动输入 Key。
- 处理移动端、直接打开、页面刷新、过期令牌、取消导航和服务端旧版本等场景。

### R4. 安全边界

- 不接受外部请求携带的上游 URL，不绕过既有 SSRF/生产上游策略。
- 外部令牌和 API Key 仅在必要的内存/当前会话边界内流转，响应使用 `no-store`，不进入日志、审计、导出、分析或错误文本。
- 保持兑换路由的限流、超时、禁止重定向和小请求体限制。

### R5. 文档与运维提示

- 明确记录 `type: 2`、`type: 3` 和 `#/jwt_auth?x_s_token=...` 的支持矩阵及示例。
- 提供无秘密的排查方式：应用版本、路由健康状态、请求状态分类、上游端点类别、时间和 request id。
- 部署文档明确要求更新前端静态资源与后端进程/镜像为同一版本，避免旧服务返回 404。

## Acceptance Criteria

- [ ] 能证明 xi-ai-web 的 `type: 3` 配置最终打开的 URL 携带令牌、令牌参数名称和 hash/query 编码方式；不得使用 `type: 2` 配置 xi-ai-web。
- [ ] 规范 type 3 入口成功兑换一次，地址栏无令牌，Key 只存在当前会话，页面不弹出手动 Key 对话框。
- [ ] 未携带令牌、未知格式、格式非法、上游 401/403、跨域 JWT 未启用、上游 404、超时和默认 Key 缺失分别得到稳定、脱敏的错误分类。
- [ ] 同一入口在重复初始化、hashchange、页面内重试和移动端下不会重复兑换或泄露令牌。
- [ ] 失败后仍可手动填写 API Key；临时失败可在当前页面重试，永久过期则明确提示重新从外部系统生成令牌。
- [ ] 保留限流、超时、`redirect: "error"`、`Cache-Control: no-store`、固定管理员上游地址和既有 BYOK 流程。
- [ ] 服务端单元测试、前端解析测试、E2E 和构建/隐私检查覆盖上述行为。

## Open Question

- 仍需要外部系统以 `type: 3` 实际生成的一条完整跳转地址；令牌本身可以脱敏，只需保留 scheme、host、path、参数名、是否位于 hash，以及参数是否存在/长度。线上上游配置阻塞已经确认，不再需要用猜测方式判断“跨域 JWT 未启用”与“令牌真实过期”。

## Out Of Scope

- 把长期 API Key 放入跳转 URL。
- 在服务端持久化外部登录状态、Shell Cookie、用户账号或 API Key。
- 接受调用方自定义上游地址。
- 为 ShellNext 的 `type: 2` 增加兼容逻辑。
- 在没有协议证据时兼容任意 `token`、`key` 或未知 query 参数。
- 本任务不修改当前同步弹窗布局任务的未提交代码。
