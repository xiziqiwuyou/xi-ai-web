# 技术设计

## 配置边界

`SiteSettings.upstreamBaseUrl` 是唯一公共上游来源。`normalizeConnection` 只读取请求中的 Key，并返回由站点设置规范化出的 URL。Provider 适配器继续接收标准化 runtime provider，因此不需要逐个修改厂商请求格式。

知识库 Cloud 的 Embedding 请求也遵守同一边界：浏览器提交 vendor 和 Key，服务端使用 `upstreamBaseUrl`，不接受连接中的 `baseUrl`。

## 安全策略

使用共享 `upstream-security.mjs`：解析 URL、规范端口、检测 IP 字面量和 DNS 解析结果。生产环境拒绝非 HTTPS 和危险地址；开发环境只在 `ALLOW_LOCAL_UPSTREAM=true` 时允许本地地址。启动、后台保存、元数据导入和备份恢复均执行同一校验；普通请求只能读取已校验并归一化的站点设置。

## 限流与并发

在 `server/request-guard.mjs` 放置基于 IP 的窗口限流和全局并发信号量。每类路由使用独立 bucket，环境变量提供有界默认值。守卫必须在 JSON 解析器之前占用额度，并在响应 `finish/close` 时只释放一次。请求终止和上游超时使用共享 `AbortController`；服务端超时映射为 504，客户端取消映射为 499。

## 兼容性

请求类型保留 `baseUrl` 字段一段时间以避免旧前端 TypeScript 断裂，但 sanitizer 和服务器都会忽略它。随后再单独移除类型字段。后台设置保留站点设置版本化归一化。
