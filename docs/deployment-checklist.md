# Deployment Checklist

This checklist covers the no-account BYOK deployment path for xi-ai-web. It intentionally separates repository verification from live provider testing because live calls require an operator gateway and a user-supplied API Key.

## 1. Preflight

- Confirm the deployment target runs Node.js `>=24.7.0`.
- Confirm the deployment has a persistent directory for `DATA_DIR`.
- Confirm the service will be served behind HTTPS for public access.
- Keep `KNOWLEDGE_ENABLED=false` for the first rollout unless the cloud knowledge stack is already provisioned.
- Keep `LANGFLOW_ENABLED=false` until the separate Langflow runtime has been secured and a published Flow has been tested.
- Keep `PROGRESS_SYNC_ENABLED=false` until HTTPS, the persistent `DATA_DIR` volume,
  and a reverse-proxy request limit of at least 68 MB have been verified.
- Generate a unique `ADMIN_PASSWORD` of at least 16 characters. The bundled
  deployment derives a domain-separated session-signing secret from it; an
  explicit `ADMIN_SESSION_SECRET` remains an optional advanced override.
- Set `ADMIN_USERNAME` (default `xizi2333`) and keep the private page path `/xizi2333` out of public navigation.
- Decide the reverse-proxy trust boundary:
  - direct access: `TRUST_PROXY_HOPS=0`;
  - one trusted Nginx, 1Panel, or CDN-to-origin proxy: `TRUST_PROXY_HOPS=1`;
  - never set a value higher than the number of proxies you operate and trust.

## 2. Build Verification

Run these before packaging or deploying:

```bash
npm ci
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
npm run release-check
```

Optional but recommended before a public release:

```bash
npm run test:e2e
```

`provider-contracts` verifies request shapes and adapter boundaries without contacting live vendors.

## 3. Runtime Environment

Minimum production environment:

```bash
PORT=8787
DATA_DIR=/opt/xi-ai-web/data
TRUST_PROXY_HOPS=1
ADMIN_USERNAME=xizi2333
ADMIN_PASSWORD=replace-with-a-strong-password
UPSTREAM_BASE_URL=https://api.xi-ai.cn
KNOWLEDGE_ENABLED=false
LANGFLOW_ENABLED=false
LANGFLOW_BASE_URL=http://langflow:7860
LANGFLOW_API_KEY=
LANGFLOW_WORKFLOW_PATH=/api/v2/workflows
PROGRESS_SYNC_ENABLED=false
PROGRESS_SYNC_TTL_SECONDS=600
PROGRESS_SYNC_MAX_PAYLOAD_MB=32
```

Public users provide only an API Key through the BYOK modal. They cannot select
an upstream URL. Production requests use the operator-controlled
`UPSTREAM_BASE_URL`, which defaults to `https://api.xi-ai.cn` and is locked when
the environment variable is explicitly supplied.

Deployment templates:

- Unified Docker Compose: `docker-compose.yml`
- Unified Compose env sample: `.env.example`
- Standalone main-app Compose: `deploy/app/docker-compose.yml`
- Standalone main-app env sample: `deploy/app/.env.example`
- Nginx reverse proxy: `deploy/app/nginx.conf`
- systemd unit: `deploy/app/xi-ai-web.service`
- Optional Langflow runtime: `deploy/langflow/compose.yaml`

## 4. Start And Health Check

For the unified Docker deployment, download `docker-compose.yml` and
`.env.example` into an empty server directory, save the example as `.env`,
replace the operator secrets, and run:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Use `docker compose --profile knowledge pull` followed by
`docker compose --profile knowledge up -d` only after the
PostgreSQL, COS, and knowledge settings have been filled in. Use
`docker compose --profile langflow up -d` only after the Langflow credentials
and private reverse-proxy boundary have been prepared. Do not publish the
PostgreSQL port.

The GHCR package must be Public for anonymous 1Panel pulls. A private package
requires a one-time `docker login ghcr.io` using a PAT with `read:packages`
only. Never put that PAT in `docker-compose.yml` or `.env`.

Start the production server:

```bash
npm start
```

Then verify:

- `GET /api/health` returns `"ok": true` as a process liveness check.
- `GET /api/ready` returns HTTP 200 with `"ready": true` only when production
  configuration and writable metadata storage are ready.
- `/xizi2333` requires the configured Admin username and password.
- `/chat` opens the public workspace and shows the required BYOK dialog when the
  API Key is missing.

## 5. Admin Metadata Setup

In `/xizi2333`:

- Review menu visibility and enabled states.
- Confirm the public menu does not contain Admin, Knowledge, Skill, Audio, Video, Apps, or Gallery unless intentionally restored in code.
- Confirm at least one enabled Chat-capable model exists.
- For each model, verify:
  - vendor identity;
  - public display name;
  - actual request model name;
  - capabilities;
  - enabled state.
- Review assistants, app presets, prompt presets, and tool/search settings.
- Review cross-device temporary sync under site settings. Enable it only behind
  HTTPS; keep the code lifetime within 180-1800 seconds and ciphertext within
  5-64 MB. The default is 600 seconds and 32 MB.
- Export Admin metadata after setup and store the file outside the application container.

## 6. Public BYOK Flow

These checks do not require the server to store credentials:

- Open a fresh browser session.
- Open `/chat`.
- Confirm the BYOK dialog cannot be dismissed while the API Key is missing.
- Save a test API Key in the dialog.
- Confirm the Key exists only in `sessionStorage` and no user-editable API URL is
  present.
- Reload the page and confirm the session remains usable.
- Close the browser session and confirm a new session asks for the API Key again.

## 7. Operator-Owned Live Provider Tests

Skip this section when no real API credentials are available. Before opening the site to public users, the operator should test the intended provider routes:

- Chat streaming with one Chat-capable model.
- Image text-to-image with one image-capable model.
- Image edit with one image-edit-capable model, if offered.
- PPT generation with one Chat-capable model.
- Mind Map generation with one Chat-capable model.
- Translation with one Chat-capable model.
- Independent web search, if enabled in Admin and configured in the browser.

If a live provider test fails, first check the model catalog mapping: the public display name can be short, but the actual request model name must match the provider endpoint.

## 8. Optional Langflow Workflow Test

When the separate Langflow service is enabled:

- keep the Langflow editor behind a private network or protected reverse proxy;
- create a Langflow API key and set it only as `LANGFLOW_API_KEY` on xi-ai-web;
- publish a Flow ID in `/xizi2333` under `工作流发布`;
- open `/workflows` in a fresh browser session;
- confirm the published name is visible, the user can select a model, and a short prompt returns a streamed result;
- confirm the public bootstrap does not contain `flowId` or the Langflow API key;
- confirm a disabled mapping returns to the local workflow fallback and is not callable through the gateway.

## 9. Data And Secret Review

- Admin metadata export must not contain public BYOK API Keys.
- Workspace export must not contain public BYOK API Keys.
- Server logs must not contain API keys.
- `DATA_DIR` should contain only Admin metadata, backups, and audit records for the main no-account workspace.
- When temporary sync is enabled, `DATA_DIR/progress-sync` may briefly contain
  opaque AES-GCM ciphertext. It must never contain plaintext workspace data or
  API Keys; expired/claimed/cancelled sessions are cleaned automatically.
- Browser-private conversations, gallery items, agents, Skills, and workflows remain in IndexedDB.

## 10. Backup And Rollback

For the main no-account workspace:

- Back up `DATA_DIR`.
- Back up the deployment environment variables through your secret manager or server panel.
- Keep the previous application artifact or image available for rollback.
- Before restoring Admin metadata, export the current metadata as a safety backup.

Rollback shape:

1. Stop the current service.
2. Restore the previous artifact or Docker image.
3. Keep the same `DATA_DIR` unless the rollback target explicitly requires a backup restore.
4. Restart the service.
5. Verify `/api/health`, `/api/ready`, `/xizi2333`, and `/chat`.

Active temporary synchronization codes are intentionally invalidated by a
service restart. Users must create a new code after deploy or rollback.

## 11. Optional Cloud Knowledge Gate

Do not enable cloud knowledge until all of these are ready:

- PostgreSQL 17 or compatible managed PostgreSQL.
- pgvector extension.
- Tencent COS bucket and credentials.
- `KNOWLEDGE_TOKEN_SECRET` with at least 32 random characters.
- `PUBLIC_ORIGIN` matching the deployed HTTPS origin.
- `npm run knowledge:migrate`.
- `npm run knowledge:migrate:check`.
- A separately managed `npm run knowledge:worker` process.
- PostgreSQL and COS backup strategy.

See [`knowledge-runtime.md`](knowledge-runtime.md) for the full runtime contract.
