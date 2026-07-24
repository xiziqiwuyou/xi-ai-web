# Deployment Checklist

This checklist covers the no-account BYOK deployment path for xi-ai-web. It intentionally separates repository verification from live provider testing because live calls require operator-owned API URLs and keys.

## 1. Preflight

- Confirm the deployment target runs Node.js `>=24.7.0`.
- Confirm the deployment has a persistent directory for `DATA_DIR`.
- Confirm the service will be served behind HTTPS for public access.
- Keep `KNOWLEDGE_ENABLED=false` for the first rollout unless the cloud knowledge stack is already provisioned.
- Keep `LANGFLOW_ENABLED=false` until the separate Langflow runtime has been secured and a published Flow has been tested.
- Generate a strong `ADMIN_PASSWORD`.
- Generate a long random `ADMIN_SESSION_SECRET`.
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
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
KNOWLEDGE_ENABLED=false
LANGFLOW_ENABLED=false
LANGFLOW_BASE_URL=http://langflow:7860
LANGFLOW_API_KEY=
LANGFLOW_WORKFLOW_PATH=/api/v2/workflows
```

Do not put public user API URLs or API keys into server environment variables. Public users provide those values through the BYOK modal in their browser session.

Deployment templates:

- Docker Compose: `deploy/app/compose.yaml`
- Compose env sample: `deploy/app/.env.example`
- Nginx reverse proxy: `deploy/app/nginx.conf`
- systemd unit: `deploy/app/xi-ai-web.service`
- Optional Langflow runtime: `deploy/langflow/compose.yaml`

## 4. Start And Health Check

Start the production server:

```bash
npm start
```

Then verify:

- `GET /api/health` returns `"ok": true`.
- `GET /api/health` reports `"adminConfigured": true`.
- `GET /api/health` reports knowledge as disabled when `KNOWLEDGE_ENABLED=false`.
- `/admin` requires the configured Admin password.
- `/chat` opens the public workspace and shows the required BYOK dialog when URL/key are missing.

## 5. Admin Metadata Setup

In `/admin`:

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
- Export Admin metadata after setup and store the file outside the application container.

## 6. Public BYOK Flow

These checks do not require the server to store credentials:

- Open a fresh browser session.
- Open `/chat`.
- Confirm the BYOK dialog cannot be dismissed while URL/key are missing.
- Save a test API URL/key in the dialog.
- Confirm the values exist only in `sessionStorage`.
- Reload the page and confirm the session remains usable.
- Close the browser session and confirm a new session asks for URL/key again.

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
- publish a Flow ID in `/admin` under `工作流发布`;
- open `/workflows` in a fresh browser session;
- confirm the published name is visible, the user can select a model, and a short prompt returns a streamed result;
- confirm the public bootstrap does not contain `flowId` or the Langflow API key;
- confirm a disabled mapping returns to the local workflow fallback and is not callable through the gateway.

## 9. Data And Secret Review

- Admin metadata export must not contain public BYOK API URLs or keys.
- Workspace export must not contain public BYOK API URLs or keys.
- Server logs must not contain API keys.
- `DATA_DIR` should contain only Admin metadata, backups, and audit records for the main no-account workspace.
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
5. Verify `/api/health`, `/admin`, and `/chat`.

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
