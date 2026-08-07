# Technical Design

## Evidence model

The acceptance tooling emits four independent evidence classes: `local-contract`, `browser-contract`, `live-api`, and `online-smoke`. A green class never implies another class is green. Skipped credential-gated cases remain visible in the final report.

## Version source

Server health output reads the release version from a small server-owned module backed by `package.json` or a build/runtime-injected value. Tests consume the same public projection. Do not duplicate a version string in route handlers, Docker files, and scripts.

## Deployment checker

A Node script accepts a public application origin, validates the URL, then checks health, readiness, public bootstrap privacy, and the streaming route's HTTP/SSE behavior. It never receives an upstream URL. It returns bounded JSON or human-readable output suitable for server deployment diagnostics.

The SSE probe may use an intentionally invalid test Key because the goal is to verify that the reverse proxy preserves the event-stream response path and does not return HTML or buffer the entire response. It must not claim provider success. Real incremental provider behavior belongs to the live smoke.

## Live-provider runner

An opt-in Node script reads the API Key and model IDs from environment variables. Requests are sent only to the deployed xi-ai-web application. The application continues to own provider routing and the managed upstream. The runner records timings and response shape without recording response text, prompts, generated images, URLs, or credentials.

Chat streaming validation tracks first-byte/first-event/final timing and confirms at least one incremental event before completion. Image validation decodes returned data URLs or downloads application-proxied media through the existing safe import path, bounds byte counts, and verifies a supported image media type. Image edit runs only when an explicit local source image path is supplied.

## Failure and privacy boundary

All script errors pass through a shared bounded redaction formatter. Request headers and request bodies are never printed. URL validation rejects credentials, fragments, non-HTTP schemes, and non-HTTPS remote origins. Local HTTP requires an explicit opt-in.

## Rollback

The tooling is additive. Version projection changes are isolated behind tests. If a production-path regression appears, revert the version projection and scripts without altering Chat/Image route behavior or external handoff protocols.
