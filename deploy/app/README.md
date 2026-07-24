# xi-ai-web App Deployment

This directory contains deployment templates for the main no-database BYOK app. It does not enable the optional cloud knowledge stack.

## Docker Compose

1. Copy the environment file.

```bash
cp .env.example .env
```

2. Edit `.env`.

Required changes:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `PUBLIC_ORIGIN`
- `TRUST_PROXY_HOPS`
- Keep `LANGFLOW_ENABLED=false` unless the separate Langflow service is ready.

Keep `KNOWLEDGE_ENABLED=false` for the first rollout.

3. Build and start.

```bash
docker compose up -d --build
```

4. Check health.

```bash
docker compose ps
curl http://127.0.0.1:8787/api/health
```

The Compose file binds the container to `127.0.0.1:${PORT}` so it is ready to sit behind Nginx or a server panel reverse proxy.
It also joins the stable Docker network `xi-ai`; the optional Langflow template uses the same network.

## Optional Langflow Workflows

Langflow is intentionally a separate service. The main application does not expose the Langflow editor or store its API key in public browser data.

1. Start the main app once so the `xi-ai` Docker network exists, or create it manually:

```bash
docker network create xi-ai 2>/dev/null || true
```

2. Start the separate service from `deploy/langflow`:

```bash
cp .env.example .env
docker compose up -d
```

3. Open the private Langflow editor, create/import flows, and create a Langflow API key.
4. Put that key in the main app environment as `LANGFLOW_API_KEY` and set `LANGFLOW_ENABLED=true`.
5. Restart xi-ai-web, then open `/admin` and add each Flow ID under **工作流发布**.

The default gateway endpoint is `/api/v2/workflows`. For a Langflow-compatible deployment with another path, set `LANGFLOW_WORKFLOW_PATH`; the path is sent to the configured Langflow service, while the public user only sees the published workflow name.

## Nginx

Use `nginx.conf` as a starting point:

- replace `example.com`;
- replace the TLS certificate paths;
- keep `proxy_buffering off` for Chat streaming;
- set `TRUST_PROXY_HOPS=1` when exactly one trusted reverse proxy sits in front of the app.

## systemd

Use `xi-ai-web.service` for a non-Docker deployment. Expected layout:

```text
/opt/xi-ai-web
  package.json
  package-lock.json
  dist/
  server/
  data/
/etc/xi-ai-web/xi-ai-web.env
```

The service runs as user/group `xi-ai-web` and writes only to `/opt/xi-ai-web/data`. Adjust `WorkingDirectory`, `User`, `Group`, and `ReadWritePaths` when your server layout differs.

## Production Checks

After start:

- `/api/health` returns `"ok": true`;
- `/api/health` returns `"adminConfigured": true`;
- `/admin` requires the configured Admin password;
- `/chat` opens the BYOK dialog in a fresh browser session;
- Admin metadata export does not contain public BYOK API URLs or keys.
