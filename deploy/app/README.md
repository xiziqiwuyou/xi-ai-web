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

Before starting, review these Admin credentials in `.env`:

- `ADMIN_USERNAME`: bootstrap username, default `xizi2333`.
- `ADMIN_PASSWORD`: strong password for the private `/xizi2333` entry.

The Compose file fixes the upstream gateway at `https://api.xi-ai.cn`, disables optional cloud knowledge and Langflow services, and binds the container to `127.0.0.1:8787` for a 1Panel or Nginx reverse proxy.

Cross-device temporary sync is also disabled on first production boot. After HTTPS is active, open `/xizi2333` and enable it under site settings. The default authorization-code lifetime is 10 minutes and the default encrypted payload limit is 32 MB. Opaque temporary files use the existing `/app/data/progress-sync` volume and are removed after claim, cancellation, rejection, or expiry. Restarting the service invalidates active codes.

The public browser sends only each user's API Key. The server uses `UPSTREAM_BASE_URL` for provider requests. Do not put a public user's API Key, shell token, or provider URL in `.env`.

Chat token smoothing is enabled by default with a 32ms flush cadence, an 80ms
maximum wait, a 512-character batch limit, and a 128 KiB pending queue limit.
The bounded server-only knobs are `SSE_TOKEN_FLUSH_MS`,
`SSE_TOKEN_MAX_WAIT_MS`, `SSE_TOKEN_MAX_CHARS`, `SSE_TOKEN_MAX_QUEUE_CHARS`, and
`SSE_BACKPRESSURE_TIMEOUT_MS`. Keep the exact-match `/api/chat/stream` proxy
location unbuffered; changing these values cannot compensate for a buffering
reverse proxy or for a model that is silent while it is thinking.

## 1Panel Reverse Proxy

Create a website or reverse proxy in 1Panel with:

- Upstream address: `http://127.0.0.1:8787`
- WebSocket: enabled
- Streaming responses: buffering disabled when the panel exposes this option
- Request body limit: at least 68 MB when the Admin encrypted-payload limit may reach 64 MB

For Chat streaming, add the exact-match `location = /api/chat/stream` block
from [`nginx.conf`](./nginx.conf) above the generic `location /` block. It turns
off proxy buffering, cache, and gzip only for the SSE route and gives long-lived
provider responses a one-hour timeout. Do not create a second catch-all
`location /` in a 1Panel-generated server block.

Point the DNS record to the server and enable HTTPS. The minimal Compose file does not require a public-origin variable.

## Nginx

Use `nginx.conf` as a starting point:

- replace `example.com`;
- replace the TLS certificate paths;
- keep the dedicated `/api/chat/stream` no-buffer/no-gzip location above the
  generic application proxy;
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
- `/xizi2333` requires the configured Admin username and password;
- `/chat` opens the BYOK dialog in a fresh browser session;
- admin metadata export does not contain public BYOK API Keys.
