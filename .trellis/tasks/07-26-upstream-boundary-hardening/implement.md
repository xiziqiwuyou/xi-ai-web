# 执行计划

1. 增加 `upstreamBaseUrl` 站点配置、默认值和后台表单。
2. 将公共 BYOK、搜索、知识库 Embedding 请求改为仅提交 Key；服务器统一构造 runtime provider URL。
3. 增加上游 URL 安全校验，覆盖 IP、私网、环回和 DNS 解析地址。
4. 增加共享限流、并发和超时守卫，接入所有公共生成与 Provider 路由。
5. 将计算器替换为无动态执行的小型表达式解析器，并隐藏页脚 Key 片段。
6. 补充契约测试和请求边界测试。
7. 运行 `npm run check`、Provider/Search/Knowledge 契约、`npm run build`、Smoke、目标 E2E 和 `git diff --check`。
