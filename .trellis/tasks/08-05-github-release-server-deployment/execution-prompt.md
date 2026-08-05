# 可直接执行的发布提示词

```text
你正在 C:\Users\56252\Documents\New project 2 中维护 xi-ai-web。请使用 Trellis 工作流，将当前完整工作区审计、整理为可部署发布版本，并推送到已配置的 GitHub 远程 https://github.com/xiziqiwuyou/xi-ai-web.git。

任务目标：以当前工作区为发布基线，完整纳入已经落地的前端、后端、资源、测试、部署模板、README、运维文档和必要 Trellis 记录，生成一个可追溯发布提交并推送到 origin/master，之后用户可以在服务器通过 Docker Compose 拉取部署。

必须先做：
1. 读取 AGENTS.md、.trellis/workflow.md、本任务 prd.md/design.md/implement.md 和适用的 backend/frontend 规范。
2. 记录 git status、当前分支、origin URL、HEAD、origin/master 和工作区基线；保留所有用户改动，不使用 reset/checkout 回滚。
3. 盘点已修改、已删除和未跟踪文件。当前工作区的有效功能代码、测试、部署和文档不能遗漏；运行时数据、构建产物和个人状态不能上传。
4. 对 API Key、Bearer Token、JWT、私钥、代理认证、服务器密码、1Panel 令牌、真实 ADMIN_PASSWORD 和 .env 文件做发布前扫描。测试中的假密钥、契约哨兵和文档占位符只有在确认非真实后才可保留。

发布边界：
- 纳入 src、server、public、tests、scripts、Dockerfile、package.json/package-lock.json、deploy/app、必要 docs、README、design-system 和已确认的 .trellis/spec/task 资料。
- 排除 node_modules、dist、reports、data、.env、.env.local、.omx、临时文件、浏览器工作区、日志、密钥和服务器运行数据。
- 主应用默认无数据库；deploy/app/docker-compose.yml 是首发部署入口。
- UPSTREAM_BASE_URL 固定使用 https://api.xi-ai.cn；公共用户只通过浏览器携带 API Key，禁止上传用户 API URL、Key、Shell JWT 或管理员密码。
- ADMIN_USERNAME 默认 xizi2333，ADMIN_PASSWORD 只在服务器 .env 配置；知识库、Langflow、跨设备同步保持默认关闭。

质量门禁：
- npm ci
- npm run check
- npm run build
- npm run privacy
- npm run ui-contract
- npm run feature-audit
- npm run provider-contracts
- npm run test:security
- npm run test:server
- 在 Docker 可用时使用临时环境变量执行 docker compose -f deploy/app/docker-compose.yml config，不把密码写入文件或提交。
- git diff --check

Git 操作：
1. 只对通过审计的文件选择性暂存，禁止未经检查的 git add .。
2. 审查 git diff --cached --stat、git diff --cached --name-status 和 staged 内容中的敏感信息。
3. 创建提交：release: publish current xi-ai-web deployment baseline。
4. 再次 git fetch origin，只有远程没有新分叉且可以 fast-forward 时才执行 git push origin master。
5. 禁止 --force、历史重写、删除远程分支和覆盖远程未合并提交。认证/代理失败或远程分叉时停止并报告。
6. 推送成功后核对本地 HEAD 与 git ls-remote origin refs/heads/master 一致。

最终输出：
- 审计结论和排除清单；
- 质量门禁结果和未完成的真实联调缺口；
- GitHub 仓库地址、发布提交哈希、远程分支；
- 服务器部署命令：git clone、cd deploy/app、复制 .env.example、填写强 ADMIN_PASSWORD、docker compose up -d --build、curl /api/health、curl /api/ready；
- 明确说明没有上传任何运行时密钥或用户数据。

停止条件：发现真实敏感信息、无法确认的发布文件、远程分叉、质量门禁失败、GitHub 权限/网络失败或任何需要强制覆盖远程的情况。遇到停止条件不要绕过，保留本地状态并报告。
```
