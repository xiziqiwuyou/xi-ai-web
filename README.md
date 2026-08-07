# xi-ai-web

xi-ai-web is a self-hostable Web AI workspace. It is designed for browser-side BYOK usage: public users provide only an API Key in the web page, while the operator controls the single upstream gateway.

The public app does not require user registration. The address-only Admin console is used by the developer or operator to maintain public metadata such as menus, model catalog entries, assistants, app presets, prompt presets, tool settings, backups, and audit records.

## Current Capabilities

- Public modules: AI Chat, Image Generation, Agents, Workflows, AI PPT, Mind Map, Assistants, and Translation.
- Address-only Admin route: `/xizi2333`. It is not rendered in public navigation; legacy `/admin` opens the public app.
- Session-only BYOK: the API Key is stored in `sessionStorage` and sent only with user-initiated requests.
- Developer-managed model catalog: each entry can have a short display name and a separate real request model name.
- Provider adapters: OpenAI, Anthropic Claude, Google Gemini, Kimi, DeepSeek, Qwen, and generic OpenAI-compatible endpoints.
- Chat: streaming responses, attachments, model picker, assistant binding, Chat settings, local Skills via `$`, app prompts via `/`, independent web search configuration, local conversations, and workspace import/export.
- Image Generation: text-to-image and image editing, including OpenAI and Gemini image request paths with provider-aware options.
- PPT and Mind Map: model selection, generation request flow, editable results, and export.
- Agents and Workflows: browser-local automation workspace backed by IndexedDB. Workflows use a card-first catalog and a visual node canvas.
- Langflow Workflows: an optional separate Langflow runtime can be enabled by the operator. The Admin console publishes a Flow ID mapping, while public users only run the published workflow through a normal chat-style page.
- Optional cloud knowledge subsystem: disabled by default and isolated from the public BYOK workspace.

## Architecture Boundaries

- Main public workspace data lives in the browser through IndexedDB or `sessionStorage`.
- The server stores only operator-managed metadata in JSON files under `DATA_DIR`.
- Public API Keys are never written to server metadata, logs, exports, or Admin configuration. Caller-provided URLs never select an outbound target.
- The Admin console uses an HttpOnly signed cookie after username/password login.
- Cloud knowledge, when enabled, is a separate subsystem and the only part that needs PostgreSQL, pgvector, and Tencent COS.

## Requirements

- Node.js `>=24.7.0`
- npm
- Optional: Docker for container deployment
- Optional: PostgreSQL 17 + pgvector + Tencent COS only when `KNOWLEDGE_ENABLED=true`

## Local Development

```bash
npm ci
npm run dev
```

Open:

- Public app: `http://localhost:8787`
- Admin console: `http://localhost:8787/xizi2333`
- Health check: `http://localhost:8787/api/health`

Admin APIs remain locked until `ADMIN_PASSWORD` is configured. The default username is `xizi2333` and can be overridden with `ADMIN_USERNAME`.

## Production Deployment

1. Install dependencies.

```bash
npm ci
```

2. Configure environment variables. Start from `.env.example`.

```bash
PORT=8787
DATA_DIR=/opt/xi-ai-web/data
ADMIN_USERNAME=xizi2333
ADMIN_PASSWORD=replace-with-a-strong-password
UPSTREAM_BASE_URL=https://api.xi-ai.cn
KNOWLEDGE_ENABLED=false
```

3. Build and start.

```bash
npm run build
npm start
```

PowerShell example:

```powershell
$env:PORT="8787"
$env:DATA_DIR="C:\xi-ai-web\data"
$env:ADMIN_USERNAME="xizi2333"
$env:ADMIN_PASSWORD="replace-with-a-strong-password"
$env:UPSTREAM_BASE_URL="https://api.xi-ai.cn"
$env:KNOWLEDGE_ENABLED="false"
npm run build
npm start
```

For public deployment, put the app behind HTTPS with a reverse proxy such as Nginx or a server panel. Persist `DATA_DIR` so Admin metadata, backups, and audit records survive restarts.

For a step-by-step rollout checklist, see [`docs/deployment-checklist.md`](docs/deployment-checklist.md).

## Docker Deployment

```bash
docker build -t xi-ai-web .
docker run -d \
  --name xi-ai-web \
  -p 8787:8787 \
  -e ADMIN_USERNAME=xizi2333 \
  -e ADMIN_PASSWORD=replace-with-a-strong-password \
  -e UPSTREAM_BASE_URL=https://api.xi-ai.cn \
  -e KNOWLEDGE_ENABLED=false \
  -v xi-ai-web-data:/app/data \
  xi-ai-web
```

The unified deployment template is available at [`docker-compose.yml`](docker-compose.yml), with a complete environment sample in [`.env.example`](.env.example). It pulls the pinned prebuilt `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.10` image and keeps optional services behind Compose profiles. The server does not need a source checkout or a local image build:

```bash
mkdir -p /opt/xi-ai-web
cd /opt/xi-ai-web
curl -fsSL https://raw.githubusercontent.com/xiziqiwuyou/xi-ai-web/master/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/xiziqiwuyou/xi-ai-web/master/.env.example -o .env
# Edit .env and replace all change-me values before starting.
docker compose pull
docker compose up -d
docker compose ps
```

The repository publishes `linux/amd64` and `linux/arm64` images through [`.github/workflows/publish-container.yml`](.github/workflows/publish-container.yml). The workflow publishes `latest` from `master`, immutable `sha-<commit>` tags, and `v*` release tags. After the first successful workflow run, open the GitHub package settings for `xi-ai-web` and set its visibility to **Public** so 1Panel can pull it anonymously. If the package remains private, log in once with a GitHub PAT that has only `read:packages`:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u xiziqiwuyou --password-stdin
```

The default command starts only the public xi-ai-web service. Its data is stored in the `xi-ai-web-data` volume. By default the HTTP port binds to `127.0.0.1:8787`, which is suitable for a 1Panel/Nginx reverse proxy. Set `APP_BIND_ADDRESS=0.0.0.0` only when direct host-port access is intentional.

For a basic deployment that only needs AI chat and image generation, use the
minimal template [`docker-compose.simple.yml`](docker-compose.simple.yml) and
[`.env.simple.example`](.env.simple.example). It starts only the main service
and requires only `ADMIN_PASSWORD`:

```bash
curl -fsSL https://raw.githubusercontent.com/xiziqiwuyou/xi-ai-web/master/docker-compose.simple.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/xiziqiwuyou/xi-ai-web/master/.env.simple.example -o .env
# Edit .env and set ADMIN_PASSWORD.
docker compose pull
docker compose up -d
```

Use `APP_BIND_ADDRESS=0.0.0.0` in `.env` only when direct access through
`SERVER_IP:8787` is required. Keep `127.0.0.1` when the service is behind a
1Panel/Nginx reverse proxy.

To enable the optional PostgreSQL + pgvector + Tencent COS knowledge subsystem, set `KNOWLEDGE_ENABLED=true`, configure its database/COS values, and start the knowledge profile. The migration must complete before the web container is allowed to become ready:

```bash
docker compose --profile knowledge pull
docker compose --profile knowledge up -d
docker compose ps
docker compose logs --tail=100 migrate knowledge-worker xi-ai-web
```

The database has no published host port. The `postgres` service is reachable only as `postgres:5432` on the private Compose network. Keep `PUBLIC_ORIGIN` equal to the public HTTPS origin when knowledge is enabled.

To enable the optional Langflow runtime:

```bash
docker compose --profile langflow pull
docker compose --profile langflow up -d
```

Create a Langflow API key, put it in `LANGFLOW_API_KEY`, set `LANGFLOW_ENABLED=true`, then restart `xi-ai-web`. Langflow binds its editor to `127.0.0.1:7860` and is not publicly exposed by this Compose file. Put it behind a separate authenticated reverse-proxy rule only if the editor is needed remotely.

The previous split templates remain available in [`deploy/app`](deploy/app), [`deploy/knowledge`](deploy/knowledge), and [`deploy/langflow`](deploy/langflow) for operators who need independent stacks. See [`deploy/app/README.md`](deploy/app/README.md) for the standalone main-app usage:

- [`docker-compose.yml`](docker-compose.yml) for the unified profile-based deployment;
- [`docker-compose.yml`](deploy/app/docker-compose.yml) for the standalone main no-database app;
- [`.env.example`](deploy/app/.env.example) for container environment values;
- [`nginx.conf`](deploy/app/nginx.conf) for HTTPS reverse proxying and SSE streaming;
- [`xi-ai-web.service`](deploy/app/xi-ai-web.service) for non-Docker systemd deployment.

## Environment Variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `PORT` | `8787` | No | HTTP server port. |
| `DATA_DIR` | `./data` | Recommended | Persistent JSON metadata, backups, and Admin audit directory. |
| `TRUST_PROXY_HOPS` | `0` | No | Set to the exact trusted reverse-proxy hop count, normally `1` behind one Nginx/1Panel proxy. |
| `ADMIN_USERNAME` | `xizi2333` | No | Bootstrap Admin username. A rotated username in `DATA_DIR/admin-credentials.json` takes precedence. |
| `ADMIN_PASSWORD` | empty | Yes in production | Admin login password, 8-512 characters. Production Admin is locked when this is missing. |
| `ADMIN_SESSION_SECRET` | derived fallback | No | Optional advanced override. By default a domain-separated signing secret is derived from `ADMIN_PASSWORD`. |
| `UPSTREAM_BASE_URL` | `https://api.xi-ai.cn` | No | Administrator-managed provider gateway origin. Public requests ignore caller-provided URLs. |
| `LANGFLOW_ENABLED` | `false` | No | Enables the optional Langflow workflow gateway. |
| `LANGFLOW_BASE_URL` | `http://langflow:7860` | When enabled | Private Langflow service URL. |
| `LANGFLOW_API_KEY` | empty | When enabled | Server-side Langflow API key; never sent to public bootstrap. |
| `LANGFLOW_WORKFLOW_PATH` | `/api/v2/workflows` | No | Langflow workflow execution endpoint path. |
| `LANGFLOW_REQUEST_TIMEOUT_MS` | `120000` | No | Maximum upstream workflow request duration. |
| `LANGFLOW_RATE_LIMIT_WINDOW_MS` | `60000` | No | Per-IP/per-workflow gateway rate limit window. |
| `LANGFLOW_RATE_LIMIT_MAX_REQUESTS` | `12` | No | Maximum requests in one gateway window. |
| `KNOWLEDGE_ENABLED` | `false` | No | Keep disabled for the first production rollout unless the cloud knowledge stack is configured. |

See `.env.example` for the complete optional knowledge configuration.

## Admin Console

Open `/xizi2333` directly. The Admin console can manage:

- public menu enabled and visible states;
- model vendors, display names, real request model names, and capabilities;
- assistants and starter prompts;
- app presets and prompt presets;
- tool and search settings;
- metadata import/export;
- backups, restore, validation, operations, and audit logs;
- optional knowledge account operations when cloud knowledge is enabled.
- optional Langflow workflow publication mappings.

Admin configuration is operator metadata only. It is not a public user account system and does not store public BYOK credentials.
The Site Settings page can rotate the Admin username and password. Rotated credentials are stored only as a salted `scrypt` hash in `DATA_DIR/admin-credentials.json`; deleting that file and restarting restores the environment-provided credentials.

## First Production Smoke Test

After deployment:

1. Open `/api/health` and confirm `"ok": true`, then open `/api/ready` and confirm `"ready": true`.
2. Open `/xizi2333` and log in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
3. Confirm at least one enabled Chat-capable model exists in the Admin model catalog.
4. Open `/chat` in a fresh browser session.
5. Enter an API Key in the required BYOK dialog.
6. Send one short Chat message with a known working model.
7. Test one image model if image generation is part of the rollout.
8. Export Admin metadata from `/xizi2333` and verify it does not contain public BYOK credentials.

### Credential-free deployment check

`npm run smoke` checks the public application origin without a provider Key. It verifies the root and Admin shell, health/readiness, release version, public bootstrap privacy, core Chat/Image model availability, retired conversation routes, and the short diagnostic SSE stream. The diagnostic stream is fixed data and never contacts a model provider.

```bash
SMOKE_URL=https://chat.xi-api.cn npm run smoke
```

The command compares the deployed health version with the local `package.json` version. Use `SMOKE_EXPECTED_VERSION` only when intentionally checking a different release. Remote HTTP origins are rejected; local HTTP is allowed for a local server. Set `SMOKE_ALLOW_INSECURE_HTTP=true` only for an explicitly controlled non-production target.

### Opt-in live Chat/Image check

`npm run smoke:live` is credential-gated and is never part of CI or the default quality gate. It sends a fixed short prompt through the xi-ai-web application, not directly to a provider. The application still chooses the managed upstream and endpoint protocol. Results contain only status, timing, model metadata, token counts, and image MIME/byte counts; prompts, output text, image URLs, and the Key are not printed or written.

Provide model IDs explicitly so a costly image request cannot happen accidentally:

```bash
export LIVE_SMOKE_URL=https://chat.xi-api.cn
export LIVE_SMOKE_CHAT_MODEL_ID=<enabled-chat-model-id>
export LIVE_SMOKE_IMAGE_MODEL_ID=<enabled-image-model-id>
read -rsp "Disposable API Key: " LIVE_SMOKE_API_KEY; echo
npm run smoke:live
unset LIVE_SMOKE_API_KEY LIVE_SMOKE_CHAT_MODEL_ID LIVE_SMOKE_IMAGE_MODEL_ID
```

Set `LIVE_SMOKE_EDIT_IMAGE_PATH` only when a disposable local source image is available and the selected image model supports editing. Do not place these variables in `.env`, shell history, CI configuration, screenshots, or issue reports. When running from the image-only Compose deployment, use `docker compose exec -T -e LIVE_SMOKE_API_KEY -e LIVE_SMOKE_CHAT_MODEL_ID -e LIVE_SMOKE_IMAGE_MODEL_ID xi-ai-web npm run smoke:live` after exporting the variables in the operator shell.

The deployment check exposes `/api/diagnostics/sse`, a rate-limited fixed two-event stream used only to identify reverse-proxy buffering. It does not accept a URL, Key, prompt, or arbitrary payload.

## Optional Cloud Knowledge

Cloud knowledge is disabled by default. Leave `KNOWLEDGE_ENABLED=false` for the initial no-database deployment.

When enabled, it uses:

- PostgreSQL 17 or compatible managed PostgreSQL;
- pgvector;
- Tencent COS;
- a separate knowledge account system;
- browser-supplied embedding URL/key values that remain session-only.

Before enabling:

```bash
npm run knowledge:migrate
npm run knowledge:migrate:check
```

Run the worker separately:

```bash
npm run knowledge:worker
```

Full details are in [`docs/knowledge-runtime.md`](docs/knowledge-runtime.md). A compose example is available at [`deploy/knowledge/compose.yaml`](deploy/knowledge/compose.yaml).

## Quality Commands

```bash
npm run check
npm run build
npm run privacy
npm run ui-contract
npm run feature-audit
npm run provider-contracts
npm run chat-local-contracts
npm run workspace-storage-contracts
npm run automation-contracts
npm run search-contracts
npm run test:langflow
npm run smoke
npm run release-check
npm run test:e2e
```

The full gate is:

```bash
npm run qa
```

`npm run smoke` checks `SMOKE_URL` when set, otherwise `http://localhost:8787`.

## Deployment Caveats

- Provider contract tests do not contact live vendor APIs. The operator should run live BYOK smoke tests with target providers before public use.
- Image editing support depends on the selected provider and model capabilities.
- Knowledge is intentionally optional and should not be enabled until PostgreSQL, pgvector, COS, migrations, worker process, and backup strategy are ready.
- Large browser-local base64 image histories can hit browser storage limits. URL-backed assets and current-session rendering are safer for heavy image use.
