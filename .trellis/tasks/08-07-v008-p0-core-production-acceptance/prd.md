# v0.0.8 P0 Core Production Acceptance

## Goal

Turn the existing Chat and Image implementation into a repeatable production-acceptance path for the `v0.0.8` baseline. The task must prove local request contracts, deployed health and SSE behavior, and provide an opt-in live-provider smoke that never persists or prints credentials.

## Requirements

### R1. Frozen product boundary

- Preserve session-only BYOK, the administrator-managed upstream, the OneAPI settings handoff, and the Shell type-3 JWT exchange as independent protocols.
- Browser-provided URLs, including `settings.url`, must not select the outbound upstream.
- Do not expand into Mermaid, remote workspace backup, prompt marketplace, plugins, PWA installation UX, or other P1/P2 work.

### R2. Version and deployment identity

- Health and readiness output must expose a version derived from the release/package source of truth rather than an unrelated hard-coded product version.
- The production Compose image tag, package version, health output, and release documentation must be auditable as separate values.
- A deployed instance with a mismatched release identity must be reported, not silently treated as the repository baseline.

### R3. Repeatable Chat and Image live smoke

- Add an explicit operator-run smoke command for Chat non-streaming, Chat streaming, text-to-image, and image-edit validation.
- The smoke must use environment variables or process input only. It must not write the API Key to files, browser storage, test snapshots, logs, command output, URLs, or exception messages.
- Each case must report only bounded metadata: case, model, endpoint protocol, status, duration, response kind, and a redacted failure category.
- Cases without the required model or source image must be skipped explicitly instead of being reported as passed.
- The runner must reject non-HTTPS production targets unless an explicit local-test flag is supplied.

### R4. Online health and SSE verification

- Add a credential-free deployment check for `/api/health`, `/api/ready`, public bootstrap boundaries, and an SSE request path that can distinguish proxy buffering/HTML/error responses from an application stream.
- The check must support `https://chat.xi-api.cn` and arbitrary operator-provided deployment origins without accepting an upstream model URL.
- The result must distinguish local contract, browser contract, live provider, and online deployment evidence.

### R5. Regression protection

- Keep existing provider, security, privacy, Chat, Image, handoff, build, server, and desktop/mobile E2E contracts green.
- Add focused tests for every new smoke parser, redaction rule, version projection, or deployment assertion.
- No real API Key may be committed or used by default in CI.

## Acceptance Criteria

- [ ] Package/release identity has one code-owned source and is covered by a server test.
- [ ] An operator can run one command for credential-free online deployment checks.
- [ ] An operator can opt into real Chat/Image smoke through environment variables without the Key appearing in output or persisted artifacts.
- [ ] Streaming validation proves incremental data arrival or returns a specific proxy/application failure category.
- [ ] Image validation checks that the response contains usable image bytes/data rather than only an unverified URL.
- [ ] OneAPI, Shell type-3, and manual BYOK regressions remain green.
- [ ] Required local checks, build, server tests, and focused desktop/mobile E2E pass.
- [ ] Missing credentials, Docker, external services, or physical devices are recorded as validation gaps rather than success.

## Out of Scope

- Publishing a tag or image, changing production configuration, or pushing a release.
- Using previously exposed user credentials from chat history.
- Adding provider protocols, arbitrary upstream URLs, accounts, databases, or new UI modules.
- Refactoring large components or cleaning the legacy CSS stack.
