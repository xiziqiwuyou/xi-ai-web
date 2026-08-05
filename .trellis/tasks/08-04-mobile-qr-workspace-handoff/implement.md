# Temporary-Code Progress Sync Implementation Plan

## Phase 01 - Mobile Baseline

- Add 360, 375, 390, 412, and tablet viewport coverage plus landscape transitions.
- Test virtual keyboard/`visualViewport`, safe areas, long Chinese labels, 200% text zoom, dark/light, and reduced motion.
- Audit every public module and shared overlay, fixing only evidence-backed defects.

Gate: automated mobile matrix passes and real-device smoke checklist is ready.

## Phase 02 - Stable Snapshot And Versioned Contracts

- Add `readWorkspaceRevision()` and stable snapshot capture that checks revision before/after export.
- Define `ProgressSyncPayload`, inclusion metadata, route/model resume data, and strict bounds.
- Add stale receiver-preview detection before merge/replace.
- Keep ordinary workspace exports credential-free.

Tests: revision changes during capture/preview, exact counts/digest, future version, oversized payload, no partial restore.

## Phase 03 - Browser Handshake And Crypto

- Implement P-256 ECDH key generation/derive, transcript canonicalization, HKDF-SHA-256, six-digit fingerprint, AES-256-GCM, base64/binary encoding, and optional compression fallback.
- Keep private keys non-exported and in memory.
- Add deterministic crypto tests for two-party agreement, fingerprint equality, public-key substitution mismatch, round trip, wrong key, tamper, AAD mismatch, malformed public keys, and missing Web Crypto.

Gate: security review confirms the temporary code is not an encryption key and server-visible values cannot decrypt the payload.

## Phase 04 - Temporary Session Server

- Extract a shared rate-limiter helper from the existing server pattern.
- Implement `progress-sync` session state machine, token hashing, code generation, attempt limits, approval/rejection, bounded raw ciphertext upload, atomic claim, cancellation, expiry, and cleanup.
- Default to in-memory metadata plus opaque files under `DATA_DIR/progress-sync`.
- Add optional Redis metadata/locking and persistent-volume or S3/COS ciphertext adapter boundaries without requiring those services for local deployment.
- Add env/Admin controls: enable, TTL, max bytes, attempt limits, optional Redis/object-store mode.

Tests: code guessing, duplicate join, wrong token role, approval transcript binding, reject, expiry, cancel, interrupted upload, concurrent claim, restart cleanup, path traversal, rate/body limits, log/error redaction, plaintext sentinel absence.

## Phase 05 - Sender Experience

- Superseded by Phase 10 and the shell-toolbar refinement: the initial implementation placed `跨设备同步` in `WorkspaceDataDialog`; the final entry is an icon-only shell action opening a dedicated dialog.
- Sender selects optional Key, performs required second confirmation, captures stable snapshot, creates session, and shows formatted code/countdown/copy/optional QR.
- Show pending receiver device hint and matching fingerprint, then explicit approve/reject.
- Encrypt/upload only after approval; expose progress, completion, cancel, expiry, and refresh-invalidates-code behavior.

## Phase 06 - Receiver Experience

- Add code input/paste formatting and join flow inside the same workspace dialog or a dedicated mobile-first standalone route.
- Derive and show matching fingerprint, wait for approval, claim/decrypt/validate, and present exact preview.
- Default to merge; replace uses `ConfirmationDialog`.
- Recheck receiver revision immediately before apply; restore optional Key only after workspace commit; open captured module.
- Ensure the identical flow works desktop-to-phone and phone-to-desktop.

## Phase 07 - Cross-Device And Security QA

- Use two isolated Playwright contexts to exercise both directions.
- Seed all workspace stores, selected route/model, and optional Key; verify exact receiver records and excluded state.
- Cover sender/receiver refresh, source offline, mismatched fingerprint, stale source revision, stale receiver preview, wrong code, attempt exhaustion, rejected join, expiry, cancellation, duplicate claim, tamper, network interruption, and oversize fallback.
- Verify ciphertext/server files/logs do not contain test plaintext or API Key.
- Verify optional QR only prefills the authorization code and contains no workspace/key material.

## Phase 08 - Deployment And Release

- Document HTTPS, reverse-proxy body limits, `DATA_DIR` volume, cleanup, restart invalidation, optional Redis role, optional S3/COS payload storage, and incident cleanup.
- Add readiness/metrics for active/created/completed/expired/rejected sessions, attempts, byte sizes, and durations without logging codes, tokens, public keys, ciphertext, or user data.
- Run real iOS Safari and Android Chrome smoke checks for mobile modules and both sync directions.
- Keep feature disabled by default in production until real-device evidence is recorded.

## Validation Commands

- `npm run check`
- `npm run build`
- `npm run workspace-storage-contracts`
- `npm run test:security`
- `npm run test:server`
- targeted progress-sync contracts
- mobile and public-navigation Playwright suites
- cross-device progress-sync Playwright suite
- `npm run ui-contract`
- `npm run feature-audit`
- `npm run privacy`
- `git diff --check`

## Review Gates

- Gate A: mobile matrix and UI scope.
- Gate B: payload/revision and resolved API Key policy.
- Gate C: ECDH/fingerprint threat review.
- Gate D: server state machine, rate limits, and opaque storage review.
- Gate E: bidirectional UX and conflict preview review.
- Gate F: real-device and production readiness review.

## Implementation Status - 2026-08-04

- [x] Phase 01 automated mobile matrix: 360/375/390/412/tablet, landscape, text scaling, reduced motion, dark/light, visualViewport and touch containment.
- [x] Phase 02 stable capture, public revision reader, stale-preview guard and strict versioned payload parser.
- [x] Phase 03 browser ECDH P-256, HKDF-SHA-256, AES-256-GCM, transcript fingerprint, compression fallback and tamper/AAD tests.
- [x] Phase 04 in-memory state machine, HMAC token/code lookup, attempt limits, atomic opaque file storage, cleanup, runtime Admin limits and request guards.
- [x] Phase 05 sender code, countdown, optional-Key second confirmation, receiver fingerprint approval, encryption, upload, rejection and cancellation.
- [x] Phase 06 receiver code entry, fingerprint, claim/decrypt/preview, merge/replace, stale revision rejection, Key restore rollback and captured-route resume.
- [x] Phase 07 isolated desktop/mobile browser contexts in both directions plus server, crypto, workspace, privacy and mobile automated regressions.
- [x] Phase 08 environment, Compose, Nginx and deployment-checklist updates; production remains disabled by default until HTTPS validation.
- [ ] Release-only evidence: real iOS Safari and Android Chrome, including physical virtual keyboard and browser text zoom.
- [ ] Optional multi-instance extension: Redis metadata/locks and S3/COS ciphertext adapters. The current release is intentionally single-instance with an injectable ciphertext-store boundary.

## Homepage QR Refinement - 2026-08-04

### Phase 09 - Six-Digit Rendezvous Contract

- Replace the eight-character Crockford code with an unbiased six-digit numeric code in server generation, validation, formatting, UI validation, and tests.
- Preserve high-entropy creator/join tokens, sender approval, transcript fingerprint comparison, TTL, single pending receiver, and attempt limits.

Gate: server and frontend contract tests reject non-six-digit input and preserve one-time/attempt-limit behavior.

Status: completed. Server generation uses rejection sampling, frontend/server validation accepts exactly six decimal digits, and focused/full server suites pass.

### Phase 10 - Shell Utility And Dedicated Dialog

- Add one icon-only cross-device sync action beside workspace data and theme controls when Admin enables the feature. Use `aria-label` and `title` for its explanation; do not consume public workspace canvas height.
- Clicking the icon opens send mode. Desktop direction tabs are `同步到手机` and `从手机同步`; mobile direction tabs are `同步到电脑` and `接收电脑进度`.
- Move the sync protocol UI out of `WorkspaceDataDialog`; keep file import/export unchanged.
- Keep restore-mode, replace confirmation, and API-Key second confirmation inside the dedicated sync dialog.

Gate: disabled Admin config hides the launcher and direct fragment handoff cannot open the flow.

Status: completed and refined. `AppShell`/`TopBar` owns the icon-only global action and `ProgressSyncDialog`; `WorkspaceDataDialog` contains file backup/restore only.

### Phase 11 - QR And Fragment Handoff

- Add a maintained local QR dependency; do not call a third-party QR service.
- Render `${origin}/chat#sync=<six-digits>` for desktop-to-phone sessions.
- Parse only exact six-digit `#sync` fragments, remove the fragment immediately, then open the receiver flow with the code prefilled and an explicit confirmation action.
- Ensure the decoded QR contains no workspace data, API Key, public/private keys, role tokens, ciphertext, or derived keys.

Gate: QR decode/URL contract tests and Playwright fragment-handoff tests pass.

Status: completed. QR generation is local and lazy-loaded; the E2E contract asserts same-origin `/chat#sync=<code>`, immediate fragment removal, prefilled receive mode, and no automatic join.

### Phase 12 - Bidirectional UX And Regression

- Verify desktop QR to phone receive and phone code to desktop receive using isolated Playwright contexts.
- Verify matching fingerprints, sender approval, optional-Key second confirmation, exact preview, merge/replace, responsive touch targets, dark/light, and reduced motion.
- Run the full task validation list and retain the real-device release gap explicitly.

Status: completed for automated validation. Remaining release-only evidence is physical iOS Safari and Android Chrome smoke testing.

### Phase 09-12 Verification Evidence

- `npm run check`: passed.
- `npm run build`: passed; QR library is loaded through a dynamic import.
- `npm run test:server`: 65 passed.
- `npm run test:security`: 11 passed.
- `npm run workspace-storage-contracts`: passed.
- Progress-sync server/Admin focused tests: 12 passed.
- Progress-sync cross-device Playwright: 1 passed, exercising both directions.
- Progress-sync crypto/revision Playwright: 2 passed.
- Workspace data/Admin-disabled Playwright: 4 passed.
- Mobile/layout regression batch: passed for the executed desktop-owned matrix; project-level mobile cases remain covered by the existing suite.
- `npm run ui-contract`, `npm run feature-audit`, `npm run privacy`, and `git diff --check`: passed.
- Desktop shell toolbar, icon hover tooltip, desktop QR dialog, and 390px mobile shell were visually inspected from fresh local runtime screenshots. The workspace launcher card is absent and the lower-left status plus three tools remain on one row.

## Reverse QR Transfer Plan - 2026-08-04

### Phase 13 - Semantic Role Protocol

- Extend server sessions with backward-compatible `creatorRole: sender | receiver` and complementary join validation.
- Resolve creator/join tokens to semantic sender/receiver before status, approval, rejection, upload, claim, and cancellation.
- Extend request/response types and client methods without changing cryptographic transcript order.
- Add server tests for legacy default behavior, reverse role behavior, role confusion, wrong-role side effects, expiry, duplicate join/upload/claim, and route validation.

Gate: server tests prove only semantic sender can approve/upload and only semantic receiver can claim in both creation directions.

### Phase 14 - Reverse QR Handoff

- Add exact `#sync-send=<six-digits>` parsing and immediate fragment removal while preserving `#sync=<six-digits>`.
- Desktop `从手机同步` defaults to creating a receiver session and rendering a local QR plus fallback code.
- Phone scan opens send mode with the reverse code in memory; explicit confirmation performs stable capture and joins as sender.
- Preserve the manual phone-created code input on desktop as a fallback path.

Gate: malformed fragments do nothing; Admin-disabled state removes either fragment without opening; no QR contains secrets.

### Phase 15 - UX And Failure Recovery

- Show clear waiting, fingerprint, cancel, expiry, join-conflict, capture-failure, and local-origin guidance for both directions.
- Keep optional API Key unchecked and second-confirmed on the actual phone sender.
- Keep desktop restore preview and merge/replace confirmation unchanged.
- Ensure dialog close cancels the token owned by that physical device and never leaves a hidden polling loop.

Gate: desktop/mobile visual checks pass with no clipping, duplicate scroll owners, or automatic data mutation.

### Phase 16 - Bidirectional Regression

- Extend isolated-context Playwright to exercise both QR directions and both manual fallbacks.
- Assert matching fingerprints, route/model resume, exact IndexedDB restore, optional Key policy, immediate fragment removal, and no automatic join/upload.
- Run typecheck, build, server/security/workspace/privacy/UI/feature contracts and `git diff --check`.

Gate: all automated evidence passes; physical iOS Safari and Android Chrome remain explicit release-only evidence.

## Stable Dialog Geometry Plan - 2026-08-04

### Phase 17 - Geometry Baseline And Shell Contract

- Use Playwright at `1280x800`, `1440x900`, `390x844`, and `375x812` to record the dialog, header, close action, direction tabs, body viewport, and primary action bounding boxes for both idle directions.
- Measure the tallest accepted desktop state before choosing the stable shell height; retain the existing width contract and cap the result with `calc(100dvh - 32px)`.
- Convert the desktop dialog shell to fixed header plus `minmax(0, 1fr)` content rows. Make the dialog body the only overflow owner and keep the shared Dialog focus/scroll contract intact.

Gate: the selected desktop height is evidence-backed, fits both accepted desktop viewports, and does not introduce document overflow or a second scrollbar.

### Phase 18 - Matched Direction Composition

- Recompose both idle directions into matching instruction, secondary-option, and primary-action slots with identical spacing and stable minimum geometry.
- Keep the sender API Key option in the secondary slot. Replace the receiver's loose method-switch text with a compact receive-method control in the matching slot; keep code entry within the same content viewport.
- Keep loading, QR, waiting, fingerprint, preview, error, and completion states inside the stable body viewport. Allow internal scrolling when state content exceeds the viewport.
- Add only a short content opacity/translate transition; do not animate dialog dimensions, header, tabs, or page geometry. Disable practical motion under reduced motion.

Gate: switching direction or receive method never changes desktop shell geometry, focus remains correct, and all existing sync operations retain their current behavior.

### Phase 19 - Geometry And Responsive Regression

- Add a Playwright geometry contract that switches directions at least ten times and asserts dialog/header/tab bounding-box deltas are at most `1px`.
- Cover sender idle, receiver QR idle, receiver code idle, loading, waiting QR, fingerprint, preview, error, and completion states for fixed-shell containment and internal scrolling.
- Re-run mobile viewport, `visualViewport`/keyboard, safe-area, dark/light, long Chinese copy, 200% text, and reduced-motion checks.
- Run `npm run check`, `npm run build`, targeted sync E2E, mobile layout E2E, `npm run ui-contract`, and `git diff --check`.

Gate: desktop switching has no visible resizing or position jump; mobile remains viewport-safe with one visible scroll owner and no horizontal overflow.

Status: completed.

### Phase 17-19 Verification Evidence

- Browser baseline at `1280x720` measured the prior idle shell heights as approximately `438px` for send, `395px` for receive QR, and `299px` for receive code. The stable desktop shell now preserves the existing send baseline at exactly `480x440px` rather than enlarging the initial dialog.
- Fresh browser measurements show identical dialog, header, direction-tab, body, and panel geometry for send, receive QR, and receive code; the outer dialog uses `overflow-y: hidden` and the body owns `overflow-y: auto`.
- Desktop geometry Playwright switches direction and receive method ten times at `1440x900` and `1280x800`, with every recorded x/y/width/height delta bounded to `1px`: 2 passed.
- Mobile viewport Playwright passes at `390x844` and `375x812`, asserting viewport containment, no horizontal document overflow, and one visible scroll owner: 2 passed.
- Full encrypted sync Playwright passes both QR directions and the manual phone fallback after the layout refactor.
- Existing mobile layout suite: 13 passed, 5 skipped across the two mobile projects, including visualViewport/keyboard, text scaling, dark/light, reduced motion, touch targets, public modules, and shared overlays.
- `npm run check`, `npm run build`, `npm run ui-contract`, Trellis task validation, and `git diff --check` passed. Existing repository LF/CRLF warnings remain informational.
