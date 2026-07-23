# xi-ai-web

一个可部署在服务器上的 Web AI 创作工作台。公开门户包含 AI 对话、图像生成、智能体、工作流、AI 一键 PPT、思维导图、助手库和翻译；管理员通过独立 `/admin` 后台维护菜单开关、模型目录、助手、应用预设、提示词预设和工具权限。

## 已实现

- 扁平化红白/蓝灰工作台 UI，包含可滚动桌面侧边栏和移动端纵向功能菜单。
- 前台无需注册登录，首次打开缺少 API URL 或 API Key 时会弹窗提示填写，之后即可使用。
- 用户 API URL 和 API Key 仅保存在浏览器 `sessionStorage`，不会写入后端数据文件。
- 联网搜索使用单独的浏览器会话配置：推荐智谱 GLM 独立搜索 API，也支持 Kimi `$web_search` 兼容模式；搜索不依赖当前对话模型的联网或工具调用能力。
- 后台只维护模型列表和功能元数据，不保存前台用户的模型密钥。
- 模型目录支持 OpenAI、Claude、Gemini 和 OpenAI-compatible 供应商标识，以及对话、视觉、画图、语音、视频、工具调用、向量等能力标签。
- 对话支持流式输出、助手选择、会话搜索、置顶、删除，以及图片/文本附件输入。
- 生成模块统一走用户携带的 API URL/Key；PPT 支持从生成大纲直接导出 `.pptx`；思维导图支持可视化渲染和 SVG/Markdown 导出。
- 智能体、Skill 和工作流保存在浏览器 IndexedDB。Skill 仅在 AI 对话内创建、选择并以解析后的指令随本次 BYOK 请求发送，不出现在公共菜单，也不执行上传的 JavaScript 或 Shell。
- 工作流使用 FastGPT 风格的本地节点画布：固定 Start/Reply、可添加 Agent、连线校验、节点/边运行状态和右侧配置器。执行按拓扑顺序单线程运行，闭环、断线和失效智能体会在模型调用前被阻止。
- 完整用户工作区可导出/导入带 SHA-256 校验的 JSON 归档，API URL、API Key 和管理员数据不会进入备份。
- 视频任务支持浏览器本地任务记录和状态刷新；音视频、图片资产支持下载。
- 作品画廊保存在浏览器本地，支持搜索、筛选、收藏、详情查看、批量删除和 Markdown 导出。
- 后台支持模型预设、模型目录校验、前台可见模型预览，以及元数据 JSON 导入导出。
- 服务端仅用 JSON 保存管理员维护的公共元数据；用户私人工作区保存在当前浏览器，不需要用户数据库。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:8787`。

管理员后台地址：`http://localhost:8787/admin`。

本地未设置 `ADMIN_PASSWORD` 时，后台接口会为开发方便保持解锁。生产模式未设置 `ADMIN_PASSWORD` 时，后台接口会锁定。

## 生产运行

```bash
npm run build
ADMIN_PASSWORD=change-me ADMIN_SESSION_SECRET=long-random-secret npm start
```

Windows PowerShell：

```powershell
$env:ADMIN_PASSWORD="change-me"
$env:ADMIN_SESSION_SECRET="long-random-secret"
npm start
```

## Docker 部署

```bash
docker build -t xi-ai-web .
docker run -d \
  --name xi-ai-web \
  -p 8787:8787 \
  -e ADMIN_PASSWORD=change-me \
  -e ADMIN_SESSION_SECRET=long-random-secret \
  -v cherry-web-data:/app/data \
  xi-ai-web
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP 服务端口 |
| `DATA_DIR` | `./data` | 管理员维护的菜单、模型目录、助手、预设和审计数据目录 |
| `TRUST_PROXY_HOPS` | `0` | 反向代理层数；使用单层 Nginx/1Panel 反代时设为 `1`，用于知识库认证限速获取真实客户端 IP |
| `ADMIN_PASSWORD` | 空 | 管理员后台密码，公网部署必须设置 |
| `ADMIN_SESSION_SECRET` | `ADMIN_PASSWORD` | 管理员 Cookie 签名密钥 |

## 云知识库运行基础

云知识库默认通过 `KNOWLEDGE_ENABLED=false` 关闭，不影响现有免登录 BYOK 功能。启用后仅知识库子系统使用 PostgreSQL + pgvector 保存账号、元数据、任务、分块和后续向量，腾讯云 COS 保存原文件；管理员 JSON 元数据仍保留原有存储方式。

```powershell
# 配好 DATABASE_URL 与 COS_* 环境变量后先执行迁移
npm run knowledge:migrate
npm run knowledge:migrate:check

# 独立 Worker 进程，领取并处理解析、清理与对账任务
npm run knowledge:worker
```

Web 启动不会自动修改数据库。配置、迁移或 `vector` 扩展不完整时，`/api/kb/*` 会失败关闭，但 `/api/health` 和其他模块保持可用。完整变量、依赖锁定和部署拓扑见 [云知识库运行文档](docs/knowledge-runtime.md) 与 [Compose 示例](deploy/knowledge/compose.yaml)。

## API 分区

- `GET /api/public/bootstrap`：公开端配置、菜单、启用模型目录、助手、应用预设和提示词预设，不包含聊天历史、API Key 或 Base URL。
- `POST /api/chat/stream`：公开对话流式输出，请求体需要携带用户的 `connection.baseUrl`、`connection.apiKey`、`modelId`，并可携带经过浏览器解析的临时 Skill 指令；请求 `web_search` 时才额外携带独立的 `searchService`。
- `POST /api/generate/:module`：图像、音频、视频、知识库、PPT、思维导图和翻译生成入口。
- `POST /api/agents/run`：运行服务端助手或请求体携带的浏览器本地智能体；工作流也复用此端点逐步执行。独立搜索会先完成检索，再把有来源、带不可信数据边界的资料交给主模型。
- `POST /api/retrieval/embed`：向量检索辅助接口，仍使用请求体携带的用户连接信息。
- `POST /api/admin/login`：管理员登录。
- `GET /api/admin/bootstrap`：后台配置数据。
- `PATCH /api/admin/settings`：系统设置。
- `PATCH /api/admin/menu-items`：菜单开关。
- `/api/admin/model-catalog/*`：模型目录管理。
- `/api/admin/assistants/*`：助手管理。
- `/api/admin/apps/*`：应用预设管理。
- `/api/admin/prompt-presets/*`：提示词预设管理。
- `/api/admin/metadata-export`、`/api/admin/metadata-import`：后台元数据导入导出，不包含用户 API URL 或 Key。
- `POST /api/media/video/status`：视频任务状态刷新，请求体仍使用用户携带的连接信息。

## 后续阶段

- 公开聊天历史已改为浏览器本地保存，服务端不再通过 public bootstrap 暴露会话摘要。
- 后台元数据导入会先预检，确认后自动写入 `data/backups` 备份和审计记录。
- 智能体和工作流已提供公共入口；Skill 在 AI 对话内管理和触发。它们均参与浏览器本地持久化与完整工作区备份。
- 音频模块支持 TTS / STT；聊天输入框支持麦克风录音转写。
- 现有本地知识文档继续使用 IndexedDB；云知识库已完成独立账号、后台运营、知识库 CRUD、COS 直传和持久化解析 Worker，后续阶段继续接入在线 BYOK 向量化与云检索 UI。
- 视频模型可在后台配置生成/状态端点和 JSON 字段路径，前台任务支持自动轮询。
- PPT 大纲和思维导图源码可编辑后再导出；画廊回放会带回提示词草稿。
- 后续可在现有工作区归档边界上接入 WebDAV、S3 兼容存储或 NAS 代理自动备份。

## QA 命令

```bash
npm run check
npm run build
npm run privacy
npm run ui-contract
npm run provider-contracts
npm run automation-contracts
npm run test:knowledge
npm run qa
npm run test:e2e
npm run smoke
npm run release-check
```

## 云知识库

云知识库入口为 `/knowledge`，它使用独立知识库账号，不会改变公开工作台免登录、用户自带 API URL/Key 的使用方式。知识库账号可拥有多个知识库；恢复码只在注册或恢复密码后显示一次，服务端只保存密码哈希、恢复码哈希和会话哈希。

启用知识库认证时必须配置：

- `KNOWLEDGE_ENABLED=true`
- `KNOWLEDGE_TOKEN_SECRET`：至少 32 个字符的随机服务端密钥
- `KNOWLEDGE_SESSION_TTL_SECONDS`：知识库会话有效期，默认 `1209600`
- `PUBLIC_ORIGIN`：公开站点根地址，用于 Origin / CSRF 校验
- `DATABASE_URL` 与 `COS_*`：知识库 PostgreSQL/pgvector 和腾讯云 COS 配置
- `KNOWLEDGE_COS_UPLOAD_GRANT_TTL_SECONDS`：精确到单个对象路径的临时上传凭据有效期，默认 `900`
- `KNOWLEDGE_EMBEDDING_LEASE_SECONDS`：在线向量批次租约，默认 `120`
- `KNOWLEDGE_EMBEDDING_REQUEST_TIMEOUT_MS`：OpenAI/Qwen 向量请求超时，默认 `60000`，必须短于租约

启用或升级后先执行 `npm run knowledge:migrate`。当前接口包括：

- `GET /api/kb/public-config`
- `POST /api/kb/auth/register`
- `POST /api/kb/auth/login`
- `GET /api/kb/auth/session`
- `POST /api/kb/auth/logout`
- `POST /api/kb/auth/recovery-code`
- `POST /api/kb/auth/recover`
- `GET|POST /api/kb/bases`
- `GET|PATCH|DELETE /api/kb/bases/:baseId`
- `GET /api/kb/bases/:baseId/documents`
- `POST /api/kb/bases/:baseId/documents/upload-grant`
- `POST /api/kb/documents/:documentId/finalize`
- `DELETE /api/kb/documents/:documentId`
- `POST /api/kb/documents/:documentId/embedding-batches/next`
- `POST /api/kb/bases/:baseId/reindex`
- `GET /api/admin/knowledge/jobs`
- `POST /api/admin/knowledge/jobs/:jobId/retry`
- `POST /api/admin/knowledge/jobs/:jobId/cancel`

知识库会话使用 `HttpOnly`、`SameSite=Lax`、`Path=/api` Cookie；状态变更请求同时校验同源 `Origin` 和 `X-Knowledge-CSRF`。上传文件由浏览器使用短时、精确路径的临时凭据直传 COS，服务端通过 HEAD 校验实际对象后再结算容量并排队解析。独立 Worker 使用 PostgreSQL 租约、心跳和受限解析线程处理 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV、JSON 与 HTML；标准化文本和 chunks 完成原子持久化后进入 `awaiting_embedding`，扫描 PDF 进入 `needs_ocr`。浏览器在线时使用请求级 OpenAI/Qwen URL/Key 领取可恢复向量批次；已提交批次不会重复写入，切换模型通过预留完整容量的影子索引原子切换。删除先进入持久化清理任务，确认对象与数据清理后才返还额度。用户主模型、联网搜索和知识库 Embedding 的 API URL/Key 仍只随用户发起的请求临时传递，不写入知识库数据库、COS、日志或后台元数据。
