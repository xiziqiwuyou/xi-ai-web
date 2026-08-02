# Technical Design

## Trust Boundary

The browser owns only session-scoped user intent and API Key material. The server owns the upstream origin, catalog entry, vendor adapter, endpoint protocol, request model name, capability checks, request limits, and provider payload projection.

```text
Chat/Image UI -> typed client payload -> public Express route -> catalog resolution
-> request guard -> provider adapter -> fixed upstream -> normalized SSE/JSON result
```

Caller-provided URLs are ignored. The active upstream is normalized and DNS-checked before use, with private, loopback, link-local, metadata, and local hostnames rejected in production.

## Chat Path

`ChatModule` owns conversation state and delegates one expanded session to `ChatSessionBlock`. Session settings are sanitized before projection. `streamChat` sends a typed payload, handles structured non-2xx errors, parses SSE events, and accepts an AbortSignal. The server resolves the model catalog entry before constructing a provider adapter.

## Image Path

`ImageStudio` derives controls from `imageCapabilities.ts`. The server remains authoritative and passes only supported generation/edit fields into the provider adapter. Reference images select edit behavior; generation without references uses the generation endpoint. Timing history is browser-local and failure-tolerant.

## Operations

The production container persists `/app/data`, requires an administrator password, disables optional cloud runtimes, fixes the upstream to `api.xi-ai.cn`, and binds to `127.0.0.1:8787` for a trusted reverse proxy. Public request guards remain process-local for the initial single-instance deployment.

## Rollback

Changes should remain additive or validation-focused. If a provider-specific projection regresses, revert that adapter and its focused contract together. The prior server metadata format and browser workspace format must remain readable.
