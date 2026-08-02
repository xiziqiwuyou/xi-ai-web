# xi-ai-web App Deployment

This directory contains deployment templates for the main no-database BYOK app. The optional cloud knowledge stack is disabled by default.

## Docker Compose

Run these commands on the server after cloning the repository:

```bash
cd deploy/app
cp .env.example .env
nano .env
docker compose -f docker-compose.yml up -d --build
docker compose ps
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/ready
```

Before starting, set the only required value in `.env`:

- `ADMIN_PASSWORD`: strong password for the private `/admin` entry.

The Compose file fixes the upstream gateway at `https://api.xi-ai.cn`, disables optional cloud knowledge and Langflow services, and binds the container to `127.0.0.1:8787` for a 1Panel or Nginx reverse proxy.

The public browser sends only each user's API Key. The server uses `UPSTREAM_BASE_URL` for provider requests. Do not put a public user's API Key, shell token, or provider URL in `.env`.

## 1Panel Reverse Proxy

Create a website or reverse proxy in 1Panel with:

- Upstream address: `http://127.0.0.1:8787`
- WebSocket: enabled
- Streaming responses: buffering disabled when the panel exposes this option

Point the DNS record to the server and enable HTTPS. The minimal Compose file does not require a public-origin variable.

## Nginx

Use `nginx.conf` as a starting point:

- replace `example.com`;
- replace the TLS certificate paths;
- keep `proxy_buffering off` for chat streaming;
- set `TRUST_PROXY_HOPS=1` when exactly one trusted reverse proxy sits in front of the app.

## Systemd

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
- `/api/ready` returns `"ready": true`;
- `/admin` requires the configured admin password;
- `/chat` opens the BYOK dialog in a fresh browser session;
- admin metadata export does not contain public BYOK API Keys.
