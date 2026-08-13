# xi-ai-web v0.0.14

## Release status

This maintenance release republishes the verified v0.0.13 remote MCP runtime
with the completed release and Trellis bookkeeping now present on `master`.
There are no additional product or protocol changes after v0.0.13.

## Included

- All v0.0.13 functionality: disabled-by-default remote MCP execution,
  explicit per-call approval, browser-local user MCP profiles, short-lived
  process-local grants, isolated browser verification, and bounded no-auth
  public HTTPS transport.
- Completed v0.0.13 release evidence and task archives are included in the
  source history so a fresh checkout has the same project state as `master`.
- Package metadata, README, and both Compose templates are pinned to
  `v0.0.14` for direct server upgrades.

## Operating classification

- Remote MCP execution and user-added MCP services remain disabled by default.
- Real MCP enablement still requires an operator-approved public HTTPS no-auth
  discovery and harmless `tools/call` smoke.
- Publishing this image does not claim that `chat.xi-api.cn` has already been
  upgraded; verify `/api/health` after the server pull and restart.

## Upgrade

```bash
docker compose pull
docker compose up -d
docker compose ps
```

## Rollback

Pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.13` and restart Compose. No data
migration is introduced by this maintenance release.

---

# xi-ai-web v0.0.13

## Release status

This release candidate extends the v0.0.12 MCP discovery foundation with
disabled-by-default remote tool execution, explicit per-call approval, and
browser-local user MCP profiles backed by short-lived server grants. It also
stabilizes the Windows test lifecycle used to validate these flows.

## Included

- Administrators can enable remote MCP execution independently from discovery,
  enable individual profiles, and allow exact discovered tool names. Every new
  execution permission remains off by default.
- Chat exposes only opaque allowed tool selectors and pauses each remote call
  for explicit inline approval. Confirm, reject, cancel, expiry, disconnect,
  policy disable, and replay retain deterministic zero/one-call behavior.
- Anonymous users may add public HTTPS no-auth MCP endpoints when the separate
  Admin policy is enabled. Labels and endpoints remain browser-local; the
  server retains only bounded, session-bound, 15-minute process-memory grants.
- OAuth, bearer tokens, custom headers, cookies, stdio, WebSocket, SSE-only
  transport, private-network targets, and multi-instance MCP session sharing
  remain out of scope.
- Runtime UI checks now use isolated ports/data by default. The E2E runner
  builds current source, starts an ephemeral production server, and reliably
  cleans up on Windows instead of reusing a configured local instance.
- User MCP storage sanitizers and limits have deterministic Node tests, and a
  Langflow timestamp race no longer makes the complete quality gate flaky.
- Compose templates and runtime metadata are prepared for `v0.0.13`.

## Operating classification

- Ready for local and operator evaluation: Admin MCP allowlists, inline Chat
  approval, browser-local personal profiles, and ephemeral user connections.
- Disabled by default: global MCP execution and user-added MCP services.
- Production enablement still requires a real public HTTPS MCP discovery/call
  smoke against an operator-approved harmless tool. This workstation run had
  no `MCP_LIVE_ENDPOINT`, so that check was explicitly skipped.

## Verification

- The complete `npm run qa` gate passed after the version candidate changes.
- 131 server tests, 153 knowledge tests, 14 security tests, 17 Langflow tests,
  two frontend storage tests, provider/privacy/UI contracts, production build,
  isolated UI runtime, and release-check passed locally.
- Admin MCP, inline approval, and user-connection Playwright coverage passed
  twice across `1440x900`, `1280x800`, `390x844`, and `375x812` (12 tests).
- No real MCP endpoint, Provider Key, GHCR image, local Docker build,
  production reverse proxy, PostgreSQL/COS, or physical device is claimed.

## Upgrade

After the immutable image has been published, pull and restart:

```bash
docker compose pull
docker compose up -d
```

Keep MCP execution disabled until the operator smoke in `README.md` succeeds.

## Rollback

For MCP-only rollback, disable user-added services and then global MCP
execution; no migration is required. For a full application rollback, pin
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.12` and restart Compose.

---

# xi-ai-web v0.0.12

## Release status

This release packages the verified local Chat productivity and secure MCP
foundation work completed after `v0.0.11`. It keeps the account-free BYOK
model, administrator-managed upstream boundary, and browser-local workspace
storage contracts unchanged.

## Included

- Chat now supports local message branching, branch actions, branch-family
  history navigation, and bounded conversation retrieval/search with archive
  and restore behavior.
- A browser-local artifact workspace can save bounded Chat code/text/Markdown/
  HTML artifacts, maintain explicit versions, preview them safely, and include
  them in the existing workspace export/import and temporary sync flows.
- Admin now has a secure remote MCP discovery foundation. Administrators can
  register bounded public HTTPS profiles and inspect untrusted tool metadata;
  remote tool execution, automatic model tool selection, OAuth, and arbitrary
  headers remain disabled by design.
- MCP discovery uses the existing SSRF boundary, redirect rejection, bounded
  transport limits, cancellation, rate/concurrency guards, redacted errors,
  and explicit future-execution gates.
- MCP client identity now reads the application version from the shared
  `APP_VERSION` source, preventing protocol metadata from lagging behind a
  release.
- Root Compose templates, deployment documentation, and the runtime version
  are pinned to `v0.0.12`.

## Operating classification

- Ready for local/self-hosted evaluation: Chat branching/retrieval/archive,
  browser-local artifacts, and Admin MCP discovery with deterministic tests.
- Operator-only or integration-dependent: real remote MCP endpoints, cloud
  Knowledge services, Langflow, cross-device sync, provider-hosted tools, and
  external search providers until configured and smoke-tested in the target
  deployment.
- No real provider Key, production reverse-proxy, GHCR image, PostgreSQL/COS,
  or physical-device test is claimed by this workstation release preparation.

## Verification

- The release gate runs type-check, production build, privacy and feature
  contracts, security/server tests, release-check, and diff hygiene before the
  tag is created.
- GitHub Actions workflow `Publish container image` builds multi-architecture
  `linux/amd64` and `linux/arm64` images and publishes the immutable tag and
  `latest` on the default branch.

## Upgrade

Pull the immutable image tag and restart the service:

```bash
docker compose pull
docker compose up -d
```

## Rollback

Keep `v0.0.11` available. For Compose, replace the image tag with
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.11`, then run
`docker compose pull && docker compose up -d`.

---

# xi-ai-web v0.0.11

## Release status

This patch release repairs Claude Messages streaming and replaces the implicit
4,096-token output fallback with administrator-managed, model-aware limits.

## Included

- The Chat `streamOutput` preference now reaches the server. Tool-free Claude
  requests use native Anthropic SSE when enabled and a deliberate complete
  response when disabled.
- Native Claude `text_delta` events are forwarded incrementally through the
  existing bounded xi-ai-web SSE buffer. Thinking deltas remain separate from
  visible assistant text.
- Tool-bearing requests retain their bounded complete-response loop and expose
  an explicit buffered state instead of appearing as a broken native stream.
- Model catalog entries now include `maxOutputTokens`, with Admin editing,
  presets, bootstrap, import/export, legacy normalization, and restart
  persistence covered by regression tests.
- Claude `max_tokens` uses the selected model's configured limit when the user
  has not selected a lower manual value. Invalid and oversized values fail
  before any Provider request.
- Context-history budgeting reserves the selected model's output limit when no
  lower manual limit is enabled.
- Root Compose templates and deployment documentation are pinned to
  `v0.0.11`.

## Verification

- Type-check, Provider/UI/feature/privacy/security contracts, 93 server tests,
  six focused desktop/mobile Playwright tests, production build,
  release-check, and an isolated UI runtime passed locally.
- Deterministic delayed Anthropic fixtures verified that text deltas are
  observed before upstream completion.
- No real Claude Provider Key, deployed reverse-proxy first-token check, local
  Docker build, or physical-device verification is claimed by this release.
  The multi-architecture image is built and verified by GitHub Actions.

## Upgrade

Pull the immutable image tag and restart the service:

```bash
docker compose pull
docker compose up -d
```

## Rollback

Keep `v0.0.10` available. For Compose, replace the image tag with
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.10`, then run
`docker compose pull && docker compose up -d`.

---

# xi-ai-web v0.0.10

## Release status

This patch release adds DeepSeek Responses API compatibility while preserving
the existing administrator-managed endpoint routing boundary.

## Included

- Fresh `deepseek-v4-flash` presets use the existing `openai-responses`
  protocol; `deepseek-v4-pro` remains on `openai-chat` by default.
- Existing administrator-edited model endpoint selections are preserved and
  are not rewritten during startup or upgrade.
- DeepSeek Responses tool rounds are stateless: the adapter omits
  `previous_response_id` and carries the complete input, output, and function
  transcript into each subsequent request.
- Independent GLM/Kimi web search remains separate from Provider-hosted tools;
  this release does not enable a DeepSeek-hosted search tool.
- Root Compose templates and deployment documentation are pinned to
  `v0.0.10`.

## Verification

- Type-check, production build, provider contracts, feature audit, privacy
  scan, server tests, automation contracts, Chat local contracts, UI contract,
  release check, and focused desktop/mobile Admin model E2E passed locally.
- No real DeepSeek Provider Key, local Docker build, deployed-online smoke, or
  physical-device verification is claimed by this release.

## Upgrade

Pull the immutable image tag and restart the service:

```bash
docker compose pull
docker compose up -d
```

## Rollback

Keep `v0.0.9` available. For Compose, replace the image tag with
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.9`, then run
`docker compose pull && docker compose up -d`.

---

# xi-ai-web v0.0.9

## Release status

This patch release hardens the Chat image/search boundary and adds repeatable
production-acceptance diagnostics for a self-hosted deployment.

## Included

- Chat image attachments now require the selected model's `vision` capability.
  Image generation and editing capabilities no longer enable Chat image input.
- Switching from a vision model with pending images to a non-vision model asks
  for confirmation. Catalog changes preserve incompatible previews and block
  send until the user removes the images or chooses a compatible model.
- GLM and Kimi independent search are explicitly armed per in-memory Chat
  session and run only when a textual message is sent. Search failures do not
  silently fall back to ordinary Chat.
- Independent search uses the primary session-only Chat API Key. Client-supplied
  alternate search keys and URLs are ignored by the Chat route.
- Health and Admin runtime versions are sourced from `package.json`.
  `/api/diagnostics/sse`, `npm run smoke`, and `npm run smoke:live` provide
  credential-free deployment diagnostics and opt-in live-provider checks.
- Root Compose templates are pinned to `v0.0.9`.

## Verification

- Type-check, production build, privacy scan, UI contract, feature audit,
  provider contracts, Chat/search contracts, security tests, server tests,
  runtime UI checks, and release check passed locally.
- Chat capability/search Playwright coverage passed across desktop and mobile
  projects.
- No real provider Key, deployed online smoke, local Docker build, or physical
  mobile browser test is claimed by this release.

## Upgrade

Pull the immutable image tag and restart the service:

```bash
docker compose pull
docker compose up -d
```

Run `npm run smoke` or the documented credential-free command against the
public application origin after deployment. Use a new disposable Key only when
opting into `npm run smoke:live`.

## Rollback

Keep `v0.0.8` available. For Compose, replace the image tag with
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.8`, then run
`docker compose pull && docker compose up -d`.

---

# xi-ai-web v0.0.8

## Release status

This patch release fixes Shell type-3 handoff URLs generated by external
systems that leave `{{x_s_token}}` in the configured template and append a
second `/#/jwt_auth?x_s_token=...` route.

## Included

- Uses only the final JWT route segment when the explicit two-segment handoff
  shape is received.
- Rejects ambiguous repeated segments, missing final tokens, and invalid JWT
  shapes before making an exchange request.
- Keeps Shell JWT, OneAPI settings, and manual BYOK flows isolated.
- Keeps URL scrubbing and session-only credential storage behavior unchanged.
- Pins the Docker Compose templates to `v0.0.8`.

## Verification

- Type-check, production build, privacy scan, UI contract, and feature audit.
- 11 security tests and 81 server tests.
- 36 desktop/mobile BYOK E2E tests.
- Production release check passed.

## Upgrade

Pull the immutable image tag and restart the service:

```bash
docker compose pull
docker compose up -d
```

Keep `v0.0.7` available for rollback.

---

# xi-ai-web v0.0.7

## Release status

This release is the first operational baseline after the v0.0.6 Chat/Image acceptance pass. It keeps the public product account-free and BYOK: browser API Keys remain session-only, while the server uses the administrator-managed `https://api.xi-ai.cn` gateway by default.

## Included

- Stable Chat streaming, provider routing, model catalog mapping, and session-only BYOK.
- OpenAI/Gemini image generation and editing contracts with compact result previews and provider-aware parameters.
- Assistant Library, browser-local Agents, visual Workflows, PPT, Mind Map, and text Translation flows.
- Mobile/desktop layout checks, shared dialog geometry, and approval content inside the progress-sync QR stage.
- SSRF protection, request rate/concurrency guards, redacted errors, scoped JSON body limits, and privacy checks.
- Optional Langflow and cloud Knowledge services remain operator-enabled integrations.
- GHCR deployment tags and simplified Compose deployment are pinned to `v0.0.7`.

## Operating classification

- GA candidate: Chat, Image, BYOK, Admin model catalog, Assistants, Agents, local Workflows, PPT, Mind Map, and text Translation.
- Beta/operator-only: Langflow, cloud Knowledge, cross-device sync, independent search providers, and provider-specific hosted tools until their external services are configured and smoke-tested.
- Disabled or hidden by default: OneAPI fragment Key handoff, Shell JWT handoff, retired Audio/Video public modules, and the standalone Knowledge route in the public menu.

## Verification boundary

All local checks and deterministic browser fixtures passed. The release does not claim that a real customer provider Key, PostgreSQL/COS, Langflow instance, GHCR image, or reverse proxy was live-tested from this workstation. Operators must complete the deployment smoke test in `README.md` before enabling optional services.

## Rollback

Keep `v0.0.6` available. For Compose, replace the image tag with `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.6`, then run `docker compose pull && docker compose up -d`.
