# 发布验证记录

## Phase 01 - 工作区与敏感信息

- 基线备份：`C:\Users\56252\AppData\Local\Temp\xi-ai-web-release-baseline-20260805-151902`。
- 分支：`master`；远程：`https://github.com/xiziqiwuyou/xi-ai-web.git`。
- `git fetch origin` 成功；远程没有本地缺失提交，本地发布前领先 2 个提交。
- 已盘点所有 tracked 修改和 untracked 源代码、测试、部署及 Trellis 任务文件。
- `.env`、`.env.local`、`node_modules`、`dist`、`reports`、`data`、`.omx` 和临时文件保持忽略。
- 针对此前提供的服务器密码、1Panel 令牌、代理凭据、长 `sk-*` 和私钥头的扫描无匹配。
- 测试/文档中的 API Key 文本均为占位符或契约哨兵，不是运行凭据。

## Phase 02 - 质量门禁

- `npm ci`：通过。首次尝试被残留开发服务器锁定 Rolldown 原生文件；停止本项目残留 Node 开发/测试进程后重新执行成功。
- `npm run check`：通过。
- `npm run build`：通过。
- `npm run privacy`：通过。
- `npm run ui-contract`：通过。
- `npm run feature-audit`：通过。
- `npm run provider-contracts`：通过。
- `npm run prompt-tool-contracts`：通过。
- `npm run chat-local-contracts`：通过。
- `npm run workspace-storage-contracts`：通过。
- `npm run automation-contracts`：通过。
- `npm run search-contracts`：通过。
- `npm run test:security`：11/11 通过。
- `npm run test:server`：67/67 通过。
- `npm run test:langflow`：17/17 通过。
- `npm run release-check`：通过，独立生产服务器检查地址为临时本地端口。
- `npm audit --omit=dev`：0 个生产依赖漏洞。
- 完整 Playwright：原运行 515 通过、96 跳过、1 个 strict-locator 失败。失败测试只因页面同时存在两个“可检索”文本；定位器已收紧到 `.knowledge-document-status.ready`，该用例随后定向通过。

## 已知环境缺口

- 当前 Windows 环境没有 `docker` 命令，因此无法本机执行 `docker compose config` 或镜像构建。
- `deploy/app/docker-compose.yml`、Dockerfile、环境示例、健康检查和 Nginx 配置已静态审阅；服务器部署时仍需运行 Compose 配置和健康检查。

## Phase 03 - 暂存审计

- 选择性暂存 tracked 修改以及 `.trellis/tasks`、`server`、`src`、`tests` 下确认可发布的新增文件。
- 暂存对象：173 个文件，约 19,626 行新增、1,877 行删除。
- 暂存后无 unstaged 或 untracked 项目文件。
- 根级 `node_modules`、`dist`、`reports`、`data`、`.omx`、真实 `.env` 与 `.env.local` 均未进入暂存。
- `server/data/assistant-catalog.mjs` 与 `server/data/defaults.mjs` 是版本化源码，不是根运行时数据目录。
- 暂存对象没有新二进制 blob；高熵 GitHub/AWS/Google/OpenAI/JWT 格式扫描无匹配。
- `git diff --cached --check` 和 Trellis 任务校验通过。
