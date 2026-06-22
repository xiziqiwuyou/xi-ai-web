# xi-ai-web

一个可部署在服务器上的 Web AI 创作工作台。项目采用左侧菜单式门户，支持对话、绘画、音频、视频、智能体、知识库、PPT、思维导图、应用预设、助手库和本地画廊；管理员通过独立 `/admin` 后台维护菜单、模型目录、助手、应用预设和提示词预设。

## 已实现

- 小红书风格的轻玻璃拟态 UI，包含桌面侧边栏和移动端底部导航。
- 前台无需注册登录，首次打开缺少 API URL 或 API Key 时会弹窗提示填写，之后即可使用。
- 用户 API URL 和 API Key 仅保存在浏览器 `sessionStorage`，不会写入后端数据文件。
- 后台只维护模型列表和功能元数据，不保存前台用户的模型密钥。
- 模型目录支持 OpenAI、Claude、Gemini 和 OpenAI-compatible 供应商标识，以及对话、视觉、画图、语音、视频、工具调用、向量等能力标签。
- 对话支持流式输出、助手选择、会话搜索、置顶、删除，以及图片/文本附件输入。
- 生成模块统一走用户携带的 API URL/Key；知识库支持 TXT、Markdown、CSV、JSON 文件上传、本地切片持久化和粘贴文本检索问答；PPT 支持从生成大纲直接导出 `.pptx`；思维导图支持可视化渲染和 SVG/Markdown 导出。
- 视频任务支持浏览器本地任务记录和状态刷新；音视频、图片资产支持下载。
- 作品画廊保存在浏览器本地，支持搜索、筛选、收藏、详情查看、批量删除和 Markdown 导出。
- 后台支持模型预设、模型目录校验、前台可见模型预览，以及元数据 JSON 导入导出。
- JSON 本地持久化，适合单机部署和后续迁移数据库。

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
| `DATA_DIR` | `./data` | 会话、助手、菜单、模型目录、预设等数据保存目录 |
| `ADMIN_PASSWORD` | 空 | 管理员后台密码，公网部署必须设置 |
| `ADMIN_SESSION_SECRET` | `ADMIN_PASSWORD` | 管理员 Cookie 签名密钥 |

## API 分区

- `GET /api/public/bootstrap`：公开端配置、菜单、启用模型目录、助手、应用预设、提示词预设和会话摘要，不包含 API Key 或 Base URL。
- `POST /api/chat/stream`：公开对话流式输出，请求体需要携带用户的 `connection.baseUrl`、`connection.apiKey` 和 `modelId`。
- `POST /api/generate/:module`：绘画、音频、视频、智能体、知识库、PPT、思维导图统一生成入口。
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
- 智能体已提供独立工作台、工具权限和工具调用轨迹。
- 音频模块支持 TTS / STT；聊天输入框支持麦克风录音转写。
- 知识库优先使用 IndexedDB，并支持 TXT、Markdown、CSV、JSON、可提取文本的 PDF。
- 视频模型可在后台配置生成/状态端点和 JSON 字段路径，前台任务支持自动轮询。
- PPT 大纲和思维导图源码可编辑后再导出；画廊回放会带回提示词草稿。
- 下一步可将 JSON 持久化迁移到 SQLite 或 Postgres。

## QA 命令

```bash
npm run check
npm run build
npm run privacy
npm run ui-contract
npm run provider-contracts
npm run qa
npm run smoke
```
