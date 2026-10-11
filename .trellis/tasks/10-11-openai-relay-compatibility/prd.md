# OpenAI relay compatibility for text and images

## Goal

Add an explicit OpenAI-compatible relay profile for the public Chat and Image
paths so xi-ai-web can use new-api-style gateways through the existing managed
upstream boundary. The profile must cover text, multimodal text, image
generation, and image editing without changing the browser-facing route
contracts.

## Product Boundary

- The browser submits only the session API Key, model selector, prompt,
  messages, and bounded image inputs. The server continues to own the upstream
  origin, catalog lookup, actual request model name, protocol selection,
  capability checks, timeouts, and public error projection.
- Existing native OpenAI, Anthropic, Gemini, Kimi, DeepSeek, Qwen, and BotCF
  behavior remains available. Existing catalog entries default to their current
  native behavior until an administrator explicitly selects the relay profile.
- Relay mode is a generic OpenAI-compatible profile; it must not depend on a
  model-name prefix or a vendor-name heuristic.
- Audio, video, embeddings, knowledge, MCP, and deployment publishing are out
  of scope except for preserving their existing behavior and tests.

## Requirements

### R1. Explicit model transport profile

- Add a backward-compatible model catalog field for `native` versus
  `openai-relay` transport.
- Normalize old metadata and backups to `native` without changing existing
  endpoint protocols.
- Make the runtime provider carry the normalized profile so adapter selection
  is deterministic and server-owned.

### R2. Standard relay text requests

- Relay chat uses `POST /v1/chat/completions` with Bearer authentication.
- Send standard `model`, `messages`, `stream`, sampling, output-limit, and
  function-tool fields only when they are defined and supported.
- Map text and image message parts to OpenAI-compatible content parts.
- Preserve streaming, non-streaming, local function-tool rounds, usage
  extraction, cancellation, and existing public SSE behavior.
- Reject unsupported provider-hosted tools clearly instead of silently dropping
  them or sending vendor-specific fields.

### R3. Standard relay image requests

- Relay image generation uses `POST /v1/images/generations` with the standard
  image body and a default `response_format` that is safe for server-side
  normalization.
- Relay image editing uses `POST /v1/images/edits` with multipart image and
  optional mask files.
- Preserve server-side count, input-size, reference-image, PNG mask, timeout,
  supplemental-request, and image timing limits.
- Normalize both `data[].url` and `data[].b64_json` responses into the existing
  public asset shape.
- Do not send native-only fields such as `output_format`, compression, or
  background unless a future explicit capability declares them.

### R4. Managed upstream and security invariants

- Normalize `https://host`, `https://host/v1`, and trailing-slash variants to
  exactly one relay API version segment.
- Ignore caller-supplied alternate origins and keep the API Key out of public
  bootstrap, logs, audit records, metadata, and error messages.
- Parse and redact OpenAI-compatible error envelopes while preserving stable
  status behavior for the public route.

### R5. Administration and migration

- Add a model-level relay profile selector and show the effective text/image
  request channels in the Admin model editor.
- Preserve the new field through metadata export/import and backup restore.
- Keep native model defaults and existing model IDs stable.

## Acceptance Criteria

- [ ] A relay-profile chat model sends an exact `/v1/chat/completions` request
      with the configured actual model name and Bearer header.
- [ ] Relay text works for plain text, vision content, streaming, non-streaming,
      and local function-tool rounds.
- [ ] A relay-profile image model sends exact generation requests to
      `/v1/images/generations` and returns usable `url` or `b64_json` assets.
- [ ] Relay image editing sends multipart `/v1/images/edits` requests with
      references and masks and preserves current validation failures.
- [ ] Base URL normalization has no duplicate `/v1` and caller overrides remain
      ineffective.
- [ ] Existing native provider contract, server, security, privacy, frontend,
      build, and release checks remain green.
- [ ] Metadata import, export, backup, restore, and legacy model records remain
      backward-compatible.
- [ ] Relay failures, unsupported features, malformed envelopes, HTML upstream
      responses, and incomplete image batches return bounded redacted errors.

## Non-goals

- Replacing every native provider adapter with one implementation.
- Adding a direct browser-to-new-api connection.
- Automatically discovering or rewriting model IDs from a relay service.
- Publishing, tagging, or pushing a release as part of this task.
