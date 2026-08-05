# GitHub 发布与服务器部署执行计划

## Phase 01 - 工作区盘点与安全基线

- 保存当前 `git status`、分支、远程和 `origin/master` 基线。
- 盘点所有已修改、已删除和未跟踪文件，按代码、测试、部署、文档、Trellis 记录、运行时和敏感内容分类。
- 检查 `.gitignore`、`.dockerignore`、Docker build context 和 Compose volume，确保依赖、构建产物、报告、数据和 `.env` 不会进入发布对象。
- 运行针对真实 API Key、代理认证、服务器密码、1Panel 令牌、JWT、私钥和常见凭据格式的扫描；测试哨兵保留但不得使用真实凭据格式造成误判。

Gate: 发布清单完成，敏感内容为零，远程状态没有未处理分叉。

## Phase 02 - 质量门禁与部署配置校验

- 运行 `npm ci`、`npm run check`、`npm run build`。
- 运行 `npm run privacy`、`npm run ui-contract`、`npm run feature-audit`、`npm run provider-contracts`。
- 运行 `npm run test:security`、`npm run test:server`，在依赖可用时补充 `npm run test:e2e`。
- 用临时环境变量执行 `docker compose -f deploy/app/docker-compose.yml config`，不得把密码写入仓库；检查镜像构建上下文、运行用户、只读根文件系统、持久卷、健康检查和反代配置。
- 运行 `git diff --check`，审查构建产物和 staged 文件名列表。

Gate: 质量命令和 Compose 配置通过；任何失败记录原因，不绕过失败继续发布。

## Phase 03 - 选择性暂存与发布提交

- 只暂存 Phase 01 清单中确认可发布的路径，包含当前完整功能代码、资源、测试、部署模板和文档。
- 不暂存 `.env`、`data/`、`dist/`、`reports/`、`node_modules/`、`.omx/`、浏览器导出和任何真实凭据。
- 审查 `git diff --cached --stat`、`git diff --cached --name-status` 和敏感扫描结果。
- 创建一个可追溯发布提交，提交信息使用 `release: publish current xi-ai-web deployment baseline`。

Gate: 提交对象不含禁止内容，提交后工作区只剩明确保留的用户改动或为空。

## Phase 04 - GitHub 推送与部署交付

- 再次 `git fetch origin`，确认普通 fast-forward 条件。
- 执行 `git push origin master`，禁止强制推送。
- 核对 `git rev-parse HEAD` 与 `git ls-remote origin refs/heads/master` 一致。
- 返回仓库地址、提交哈希、是否包含完整功能代码、服务器部署命令和首发环境变量说明。
- 不直接连接服务器；交付可复制的命令：克隆仓库、复制 `deploy/app/.env.example`、填写 `ADMIN_PASSWORD`、`docker compose up -d --build`、检查 `/api/health` 与 `/api/ready`。

## 验证命令

```powershell
npm ci
npm run check
npm run build
npm run privacy
npm run ui-contract
npm run feature-audit
npm run provider-contracts
npm run test:security
npm run test:server
docker compose -f deploy/app/docker-compose.yml config
git diff --check
```

## 停止条件

- 发现真实凭据或无法确认的敏感文件。
- 工作区存在未说明的破坏性删除。
- 远程有新提交导致无法 fast-forward。
- 质量门禁失败且没有明确修复或记录。
- GitHub 认证、代理或网络失败。
