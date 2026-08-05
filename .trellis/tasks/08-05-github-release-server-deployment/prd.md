# GitHub 发布与服务器部署前置审计

## 目标

审计当前 xi-ai-web 工作区，将当前已经落地的完整项目代码、测试、部署模板和必要文档整理为一个可复现的发布提交，并安全推送到现有 GitHub 远程，方便服务器通过 Docker Compose 拉取部署。

2026-08-05 部署交付范围调整为镜像优先：服务器不克隆源码、不执行本地镜像构建，只下载根目录 `docker-compose.yml` 与 `.env.example`，从 GHCR 拉取预构建镜像后启动。GitHub 仓库负责通过 Actions 持续构建并发布多架构镜像。

本任务的发布基线是当前工作区，而不是仅最近一次提交。当前工作区包含大量已修改文件和未跟踪的功能代码，发布前必须逐项纳入或明确排除，不能用 `git add .` 代替审计。

## 已确认事实

- Git 远程：`origin -> https://github.com/xiziqiwuyou/xi-ai-web.git`。
- 当前分支：`master`；本地相对远程已领先 2 个提交，但仍有约 129 项工作区改动。
- 项目是无数据库主应用，生产部署入口为 `deploy/app/docker-compose.yml`。
- 公共用户只携带 API Key；生产上游由 `UPSTREAM_BASE_URL` 控制，默认 `https://api.xi-ai.cn`。
- 管理后台入口为 `/xizi2333`，Compose 要求通过 `.env` 提供 `ADMIN_PASSWORD`。
- `node_modules`、`dist`、`reports`、运行时 `data`、`.env`、`.env.local` 和 OMX 临时目录已在忽略规则中排除。
- 已发现的 `sk-*`、`apiKey` 和密码文本主要来自测试哨兵、文档占位符或示例配置；仍需在发布前逐项确认没有真实凭据。

## 发布要求

1. 保留当前所有有效源代码、前端资源、服务端适配器、测试、部署文件、README、运维文档和必要的 Trellis 任务记录。
2. 排除真实密钥、令牌、代理凭据、服务器密码、浏览器数据、构建产物、依赖目录、运行时数据和测试报告。
3. 不执行 `git reset --hard`、`git checkout --`、强制推送、历史重写或删除用户现有改动。
4. 对测试假密钥和文档占位符进行分类保留；任何无法确认是非敏感哨兵的内容都不得进入提交。
5. 发布前运行类型检查、构建、隐私扫描、UI/功能契约、服务器测试和部署配置校验。
6. 生成一个描述清晰的发布提交，然后以普通 `git push origin master` 推送；若远程发生分叉或认证失败，停止推送并报告，不覆盖远程历史。
7. 推送成功后返回 GitHub 仓库地址、发布提交哈希、部署所需环境变量和最短 Docker Compose 部署步骤。
8. 新增 GitHub Actions 镜像发布流水线，至少覆盖 `linux/amd64` 与 `linux/arm64`，使用仓库 `GITHUB_TOKEN` 写入 GHCR，不在仓库保存 Registry 密码。
9. 根 Compose 不包含源码 `build`，主应用、知识库迁移和知识库 Worker 必须引用同一版本化 GHCR 镜像；服务器部署路径只需要 Compose 与 `.env`。

## 部署边界

- 默认只部署主应用；知识库和 Langflow 保持关闭，除非后续单独验收。
- 使用持久卷保存 `/app/data`，通过 1Panel/Nginx 将 HTTPS 请求反代到 `127.0.0.1:8787`。
- `PROGRESS_SYNC_ENABLED` 默认关闭，必须完成 HTTPS、持久卷和反代请求体限制检查后再开启。
- 不把公共用户 API Key、管理员密码、Shell JWT 或上游地址写入仓库；管理员密码只在服务器 `.env` 中配置。
- GHCR 镜像必须设置为 Public 才能匿名拉取；如果保持 Private，服务器必须先使用只带 `read:packages` 权限的 GitHub PAT 登录 GHCR。

## 验收标准

- [x] 发布清单覆盖当前工作区的所有有效项目文件，且每个排除项有明确理由。
- [x] 密钥扫描通过；真实 API Key、代理地址凭据、1Panel 令牌、服务器密码和 `.env` 文件不在提交对象中。
- [x] `npm ci`、`npm run check`、`npm run build`、`npm run privacy`、`npm run ui-contract`、`npm run feature-audit`、`npm run provider-contracts`、`npm run test:security`、`npm run test:server` 通过，或将环境依赖导致的缺口明确记录。
- [ ] `docker compose -f deploy/app/docker-compose.yml config` 通过，且 Compose 使用强管理员密码、固定 `https://api.xi-ai.cn`、持久数据卷和健康检查。
- [ ] 发布提交创建成功，工作区在提交后干净，提交哈希可追溯。
- [ ] `origin/master` 与本地发布提交一致，未使用强制推送。
- [ ] 新服务器可按部署文档拉取仓库、配置管理员密码、启动容器并通过 `/api/health` 与 `/api/ready` 检查。
- [ ] 新服务器无需克隆源码，只下载 `docker-compose.yml` 和 `.env.example`，执行 `docker compose pull && docker compose up -d` 即可启动。
- [ ] GitHub Actions 能发布 `ghcr.io/xiziqiwuyou/xi-ai-web:latest`、提交 SHA 标签和版本标签的多架构镜像。

## 非目标

- 本任务不在真实服务器上执行部署，不上传任何运行时数据，不替用户生成或保存管理员密码。
- 本任务不重新设计 UI、不修改业务逻辑、不迁移数据库、不启用知识库/Langflow/临时同步。
- 本任务不将测试假密钥误删为“安全修复”；只排除真实凭据和不应发布的运行数据。
