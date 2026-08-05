# Mobile adaptation and temporary-code progress sync

## Goal

Validate the mobile web experience and add a no-account, manual cross-device progress sync. A user explicitly captures the stable workspace at one moment, receives a short-lived authorization code, enters that code on another device, approves the pairing, and transfers one encrypted snapshot. The feature does not continuously synchronize later edits.

## Confirmed Facts

- Durable browser data already lives in IndexedDB database `xi-ai-web-workspace` version 3 and covers conversations, gallery items, image timing history, local knowledge documents, media jobs, agents, Skills, workflows, memories, preferences, and backup runs.
- Workspace export version 1 already sanitizes every record, records counts, adds SHA-256 integrity, and restores with atomic merge/replace semantics. Import supports up to 256 MB.
- IndexedDB already maintains an internal `workspaceRevision` whenever data changes, but no public revision reader exists yet.
- The main BYOK API Key and last model ID live in `sessionStorage`; normal workspace exports intentionally exclude all credentials.
- Active module state comes from the URL. Unsent drafts, pending attachments, expanded/collapsed Chat cards, and in-flight requests are transient React state and are not part of the stable snapshot.
- Mobile Playwright coverage at 375x812 and 390x844 currently passes the mobile-relevant layout/interaction suite. Real Safari/Android, landscape, virtual keyboard, and larger text still need explicit release evidence.

## Product Definition

### Manual snapshot sync

- Name the feature `临时同步` or `跨设备同步`, not real-time sync.
- Any device may be the sender. It opens the global sync icon, selects the direction inside the dedicated dialog, chooses whether to include the API Key, captures a stable snapshot, and receives an exact six-digit numeric authorization code such as `381726`.
- Desktop-to-phone: desktop selects `同步到手机`, displays a same-origin QR plus the six-digit fallback code, and the phone scans the QR, opens the public homepage with the code prefilled, then explicitly confirms receiving.
- Phone-to-desktop: phone selects `同步到电脑` and displays the six-digit code; desktop opens the global sync icon, selects `从手机同步`, and enters that code.
- Both devices display the same six-digit security fingerprint. The sender must explicitly approve the requesting device before encrypted data can be uploaded or claimed.
- The receiver decrypts and validates the snapshot, previews source time/counts/current module/credential inclusion, then chooses `合并` or explicitly confirmed `替换`.
- After success the receiver opens the captured public module. Later edits on either device do not propagate automatically; repeating sync requires a new code.
- QR is the primary desktop-to-phone convenience and contains only the same-origin public page URL plus `#sync=<six-digits>`. The fragment is removed immediately after parsing. The QR never contains workspace data, API Keys, role tokens, public/private keys, ciphertext, or derived keys.

### Included progress

- Include all stable `WorkspaceExportEnvelope` collections, captured module/path, capture timestamp, source workspace revision, and selected model ID.
- API Key transfer is supported but unchecked by default and requires a second confirmation. It remains inside end-to-end encrypted bytes and is written only to receiver `sessionStorage` after workspace restore succeeds.
- Clearly state that active streams, unfinished generation requests, Admin/knowledge sessions, cookies, and unsent transient form state are not included in MVP.
- Add a later optional versioned resume payload only after each transient field has an owner, sanitizer, bound, and restore behavior.

## Security Requirements

- The short authorization code is only a rendezvous identifier. It must never be the encryption key or the sole proof required to download data.
- Sender and receiver generate ephemeral Web Crypto ECDH P-256 key pairs. They derive a shared secret with ECDH, derive the payload key with HKDF-SHA-256, and encrypt with AES-256-GCM using a fresh 96-bit IV.
- Calculate the displayed six-digit fingerprint from the complete handshake transcript: protocol version, session ID, sender public key, receiver public key, and both nonces.
- The server sees authorization code, public keys, token hashes, bounded metadata, status, and ciphertext only. It cannot derive the shared key or inspect workspace/API Key plaintext.
- Authorization codes are exactly six decimal digits, expire after 10 minutes, allow one receiver join at a time, are one-transfer-only, and are protected by strict per-IP and per-session attempt limits. Six digits are a rendezvous convenience only; high-entropy role tokens, sender approval, transcript fingerprint comparison, and expiry remain mandatory.
- Source approval, matching fingerprint, TLS, high-entropy creator/join tokens, constant-time comparisons, `Cache-Control: no-store`, redacted errors, and request-body limits are mandatory.
- Source and receiver ephemeral private keys remain in browser memory only. Refreshing or closing either page before completion invalidates the attempt and requires a new code.

## Server And Cache Boundary

- No database is required for temporary sync.
- Single-instance default: bounded session metadata may live in process memory and ciphertext in `DATA_DIR/progress-sync`, with startup/interval cleanup and explicit expiry.
- Optional production/multi-instance mode: Redis stores TTL session state, attempts, public keys, presence/status, and short locks. Redis must not store plaintext or be the only copy of large ciphertext.
- Store encrypted payload bytes in a persistent temporary volume or S3/COS-compatible object storage when multi-instance/restart tolerance is required.
- Recommended encrypted payload ceiling is 32 MB after optional compression, Admin-configurable from 5-64 MB. Larger workspaces fall back to existing file export or later WebDAV/S3 backup.

## Consistency Requirements

- Read `workspaceRevision` before and after snapshot creation. Retry or stop if it changes during capture, so the transmitted snapshot represents one stable point in time.
- Record the receiver revision when preview begins. If local data changes before restore confirmation, regenerate the preview and require confirmation again.
- Default to merge. Reuse existing per-record ID/`updatedAt` merge behavior; never implement a second conflict algorithm inside temporary sync.
- Replace mode remains destructive and uses the shared confirmation dialog.
- A failed decrypt, parse, digest check, merge, replace, or optional Key write leaves the receiver workspace and connection state unchanged.

## Mobile Readiness Requirements

- Extend automated coverage to 360x800, 375x812, 390x844, 412x915, and 768x1024, including landscape, virtual keyboard/`visualViewport`, 200% text zoom, long Chinese labels, safe areas, dark/light modes, and reduced motion.
- Verify all public modules plus API Key, workspace data, Chat settings/model picker, image preview, Assistant details, workflow editor, and temporary-sync dialogs.
- Release evidence must include real iOS Safari and Android Chrome smoke checks; Chromium emulation alone is insufficient.

## Failure States

- Invalid/expired code, attempt limit, sender offline, join already pending, approval rejected, fingerprint mismatch, page refresh, payload too large, upload interrupted, already claimed, ciphertext tampered, decrypt failed, unsupported version, workspace changed during capture/preview, and restore failed each receive distinct actionable copy.
- No failure may partially modify IndexedDB or write the optional API Key.
- Sender cancellation, rejection, expiry, and successful claim remove session metadata and ciphertext promptly.

## Acceptance Criteria

- [ ] Device A can send a stable workspace snapshot to Device B by temporary code, with the same flow working in either phone-to-desktop or desktop-to-phone direction.
- [ ] The public shell exposes one icon-only cross-device-sync action beside workspace data and theme controls whenever Admin enables it; disabling the feature hides the action and prevents fragment-driven opening.
- [ ] Desktop `同步到手机` renders a locally generated QR whose decoded value is same-origin `/chat#sync=<six-digits>` and contains no other data.
- [ ] Before QR creation, desktop `同步到手机` visibly explains the scan flow and names the action `生成手机同步二维码`; after creation, the QR replaces that expectation with the actual scannable image and fallback code.
- [ ] Opening a QR URL removes the fragment immediately, opens the receive dialog with the six-digit code prefilled, and waits for explicit receiver confirmation before joining.
- [ ] Phone `同步到电脑` renders the six-digit code and desktop `从手机同步` accepts exactly six digits.
- [ ] Desktop `从手机同步` defaults to a receiver-created QR invitation. Its decoded value is same-origin `/chat#sync-send=<six-digits>`; scanning opens phone send mode with the code prefilled but never captures or uploads until the phone explicitly confirms.
- [ ] The reverse QR flow preserves manual fallback: phone-created sender codes can still be entered on desktop, and all legacy `#sync=<six-digits>` receiver handoffs remain valid.
- [ ] Both devices show the same handshake fingerprint and transfer cannot continue until the sender approves.
- [ ] The server cannot decrypt a test plaintext/API Key and stored files/logs contain no plaintext sentinel.
- [ ] Receiver preview reports exact validated counts, source revision/time, target module, and masked optional Key state.
- [ ] Merge/replace remains atomic; local revision changes invalidate stale capture/preview; every failure preserves receiver data.
- [ ] Code expiry, guessing limits, rejection, cancellation, duplicate join, duplicate claim, interrupted upload, wrong key, and tamper behavior are deterministic and tested.
- [ ] API Key remains unchecked by default, requires second confirmation, and restores only after workspace success.
- [ ] Mobile automated matrix and real iOS Safari/Android Chrome smoke checks pass.
- [ ] Typecheck, build, workspace/security/server contracts, privacy scan, UI contracts, and desktop/mobile Playwright pass.
- [x] Desktop switching between `同步到手机` and `从手机同步` preserves the sync dialog, header, close action, and direction-tab bounding boxes within `1px`; no dialog resize or recenter jump is visible.
- [x] Sender idle, receiver QR, and receiver authorization-code views use matching instruction/secondary/action structure, while long runtime states scroll only inside the dialog body.
- [x] Mobile sync views remain bounded by the visual viewport and safe area, expose one visible vertical scroll owner, and keep close/input/actions reachable while the software keyboard is open.

## Out Of Scope

- Continuous, background, or real-time synchronization.
- Permanent device pairing or user accounts for temporary sync.
- Server-side recovery of end-to-end encrypted content.
- Automatic transfer of API Keys, cookies, Admin sessions, knowledge-account sessions, or in-flight provider work.
- Treating Redis/cache as durable user-workspace storage.

## Resolved Decisions

- Sync is user-triggered and transfers one stable point-in-time snapshot only.
- The global shell owns one icon-only sync action in the lower-left access toolbar and mobile header; hover/title text names the action, while the dedicated dialog owns direction selection. The workspace data dialog remains dedicated to file backup and restore.
- Both directions use locally generated same-origin QR by default. Desktop-to-phone keeps `#sync=<code>`; phone-to-desktop uses receiver-created `#sync-send=<code>`. Exact six-digit manual rendezvous remains the fallback in both directions.
- A six-digit code and QR fragment are never credentials or encryption material. Sender approval plus matching fingerprint remains required.
- API Key is optional, unchecked by default, and requires a second confirmation.
- Sender approval plus matching fingerprint is required; the short code alone never grants data access.
