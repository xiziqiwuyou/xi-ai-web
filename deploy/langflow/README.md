# Optional Langflow Runtime

This stack is an optional backend for xi-ai-web's published workflow mode. It is intentionally separate from the public application:

- users do not see the Langflow editor;
- users do not provide a Flow ID or a Langflow API key;
- the xi-ai-web server stores the operator's Langflow API key only in its environment;
- public users still provide their own model URL and key in the browser for each workflow request.

## Start

Create the shared private Docker network once:

```bash
docker network create xi-ai 2>/dev/null || true
```

Copy and edit the environment file, then start Langflow:

```bash
cp .env.example .env
docker compose up -d
```

Open `http://127.0.0.1:7860` through a private tunnel or a protected reverse proxy. Pin `LANGFLOW_IMAGE` to a reviewed release before production use.

## Connect xi-ai-web

Set these values in the main app environment:

```bash
LANGFLOW_ENABLED=true
LANGFLOW_BASE_URL=http://langflow:7860
LANGFLOW_API_KEY=the-api-key-created-in-langflow
LANGFLOW_WORKFLOW_PATH=/api/v2/workflows
```

The main app Compose template already joins the `xi-ai` network. Restart xi-ai-web after changing its environment.

## Publish A Flow

1. Build and test a Flow in the private Langflow editor.
2. Create an API key in Langflow and put it in `LANGFLOW_API_KEY`.
3. Copy the Flow ID.
4. Open `http://your-xi-ai-web-host/admin`.
5. Open the **工作流发布** section and add the Flow ID, public name, description, welcome message, and input placeholder.
6. Enable the mapping and verify it appears under `/workflows`.

The gateway sends these request-scoped global variables to Langflow so a Flow can use the public user's model connection:

- `XI_API_URL`
- `XI_API_KEY`
- `XI_MODEL_ID`
- `XI_MODEL_NAME`
- `XI_VENDOR`

The exact Langflow component wiring depends on the Flow. Do not put public user keys into Langflow persistent component configuration or logs.

## Operations

- Keep Langflow's editor private. Only expose xi-ai-web publicly.
- Rotate the Langflow API key by changing `LANGFLOW_API_KEY` in xi-ai-web and restarting it.
- Back up the `langflow-data` volume together with the xi-ai-web Admin JSON metadata.
- Keep `LANGFLOW_ENABLED=false` in xi-ai-web until a published Flow has been tested.
