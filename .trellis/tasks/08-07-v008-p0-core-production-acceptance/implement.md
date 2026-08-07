# Implementation Plan

## P0.1 Baseline and contracts

- [x] Inventory package, Docker, health/readiness, Chat/Image routes, provider adapters, SSE buffering, and handoff tests.
- [x] Confirm the managed-upstream boundary and locate all duplicated version strings.
- [x] Define the exact deployment and live-smoke result schema.

Gate: no unknown outbound target or unclassified version source remains.

## P0.2 Version and deployment verification

- [x] Replace unrelated hard-coded health version data with the release source of truth.
- [x] Add a credential-free deployment checker for health, readiness, bootstrap privacy, and SSE transport behavior.
- [x] Add tests for URL validation, HTML/proxy failures, bounded output, and version mismatch reporting.

Gate: the checker can diagnose a local or HTTPS deployment without a provider Key.

## P0.3 Opt-in live Chat/Image smoke

- [x] Add environment-gated Chat non-streaming and streaming cases.
- [x] Add environment-gated text-to-image and optional image-edit cases.
- [x] Validate incremental SSE timing and real image bytes while suppressing prompts, output content, URLs, and credentials.
- [x] Document exact variables and safe invocation examples.

Gate: missing optional inputs are explicit skips; no secret appears in output or generated files.

## P0.4 Focused regression

- [x] Run static, privacy, provider, Chat, security, server, UI contract, feature audit, and release checks.
- [x] Run focused desktop/mobile BYOK, Chat, Image, and handoff E2E.
- [x] Run the credential-free checker against the local service and `https://chat.xi-api.cn`.

Gate: all reproducible P0 paths pass or have a concrete, evidence-backed blocker.

## P0.5 Acceptance report

- [x] Record local-contract, browser-contract, live-api, and online-smoke results separately.
- [x] Record unavailable Docker, provider credential, external service, or physical-device evidence as gaps.
- [x] Stop before P1 work; the next release/deployment remains a separate operator-approved task.

## Required commands

- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run ui-contract`
- `npm run feature-audit`
- `npm run provider-contracts`
- `npm run chat-local-contracts`
- `npm run test:security`
- `npm run test:server`
- focused Playwright Chat/Image/BYOK/handoff tests
- the new credential-free online checker
- the new live smoke only when an explicit disposable Key is supplied

## Stop conditions

- Stop a live case before sending if the target is not the xi-ai-web application origin, required variables are malformed, or output redaction cannot be guaranteed.
- Do not publish, push, deploy, or use a previously exposed Key as part of this task.
