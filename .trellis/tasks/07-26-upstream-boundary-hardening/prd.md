# 上游域名统一与 P0 安全加固

## 目标

将公共前台从“用户携带 URL + Key”调整为“用户仅携带 Key”，所有模型、搜索、媒体和 Embedding 请求统一发往管理员配置的上游 API 域名。默认上游为 `https://api.xi-ai.cn`，管理员可以在后台修改为自定义 HTTPS 域名。

同时完成外部审查指出的 P0 安全加固：SSRF 防护、主链路限流、请求超时和并发保护。

## 需求

1. `UserProviderConfig`、搜索配置和知识库 Embedding 连接不再使用外部 URL 作为运行时来源；前端只保存和提交 Key。
2. 后端从受保护的站点设置读取 `upstreamBaseUrl`，默认值为 `https://api.xi-ai.cn`，并把所有运行时 Provider 的 `baseUrl` 强制替换为该值。
3. 旧客户端继续携带 `baseUrl` 时必须忽略，不得让其影响任何出站请求。
4. 管理后台增加上游域名设置，只允许 `http/https` URL；生产环境默认要求 HTTPS，开发环境允许本地 HTTP 以支持测试。
5. 连接校验必须拒绝环回、私网、链路本地、组播、未指定和云元数据地址；公网域名默认可用，部署者可通过环境变量显式允许本地上游。
6. Chat、Agent、Workflow、Generate、Embed、Transcribe、Video Status、Prompt Optimize、Title Summary 等请求使用共享限流器、并发上限和 Abort/timeout。
7. 按接口收紧 JSON body 限制，保留媒体接口所需的大请求能力，聊天和管理接口使用小限制。
8. API Key 不进入日志、错误、Bootstrap、URL 或持久化服务端数据；前台展示只显示“已配置”。

## 验收标准

- 使用旧 payload `{ connection: { baseUrl: "http://127.0.0.1:...", apiKey: "..." } }` 时，出站请求仍只访问管理员配置的上游域名。
- 在生产配置下，`http://127.0.0.1`、私网 IP、`169.254.169.254` 和解析到危险地址的域名被拒绝。
- 主链路超过配置额度返回 429 和 `Retry-After`，并发超过上限返回 429/503，不触发上游请求。
- 上游超时被中止并返回可读的 504/502，不遗留活动请求。
- 后台可以读取、修改和持久化 `upstreamBaseUrl`；公共 Bootstrap 只返回非敏感设置。
- 旧前端测试、Provider 契约、Search/Knowledge 契约、TypeScript、Build 和 Smoke 通过。

## 非目标

- 本阶段不迁移 JSON 数据到 PostgreSQL。
- 本阶段不拆分巨型前端组件、不清理 legacy CSS。
- 不改变模型目录的 `vendor`、展示名与实际模型名映射。
