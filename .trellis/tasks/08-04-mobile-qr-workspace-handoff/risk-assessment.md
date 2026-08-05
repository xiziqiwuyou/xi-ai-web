# Temporary-Code Progress Sync Assessment

## Feasibility Verdict

The proposal is feasible and fits the current account-free architecture better than continuous synchronization. Existing workspace export, sanitization, digest, merge/replace, IndexedDB write suspension, and internal revision tracking provide most of the durable-data foundation. New work is concentrated in stable snapshot capture, interactive key agreement, temporary session coordination, sender/receiver UI, and cross-device testing.

The recommended implementation is an interactive one-time snapshot transfer. The source page must stay open so it can approve the receiver and retain the ephemeral private key. This is a deliberate security trade-off that allows a short human-entered code without turning that low-entropy code into the decryption key.

## Options Evaluated

### Option A - Short code is both lookup and encryption secret

Not recommended. A human-friendly 6-8 digit/code secret has insufficient entropy against offline guessing if encrypted payload bytes leak. PBKDF2 can slow guessing but cannot create entropy.

### Option B - Server receives plaintext or the content key

Not recommended. It is simpler but violates the project's browser-owned BYOK/private-workspace boundary and increases breach impact.

### Option C - Long one-time recovery string

Feasible for asynchronous transfer but poor UX. A sufficiently strong manually entered secret would be 16+ unambiguous Base32 characters and still needs careful derivation and rate limits.

### Option D - Short rendezvous code plus browser ECDH and sender approval

Recommended. The code locates a live session; ECDH creates the actual high-entropy encryption key; matching fingerprints and sender approval authenticate the selected receiver. The server cannot decrypt data, and the user enters only eight characters.

## Risk Matrix

| Risk | Severity | Mitigation | Residual behavior |
|---|---:|---|---|
| Authorization code guessed | High | 40-bit unambiguous code, 10-minute TTL, IP/session attempt limits, one pending receiver, sender approval, fingerprint | Guesser can at most create a visible pending request before invalidation |
| Server substitutes public key / MITM | High | TLS, transcript-bound HKDF/AAD, same six-digit fingerprint on both devices, explicit sender comparison | User must actually compare before approval |
| Server/storage breach | High | ECDH client keys, AES-GCM ciphertext only, no API Key/plaintext logs, short retention | Metadata and payload sizes/times remain visible |
| Source/receiver refreshes or closes | Medium | Private key memory-only, clear warning, cancel/expiry cleanup | Current attempt fails and a new code is required |
| Server restart | Medium | Single-instance mode documents active-code loss; optional Redis metadata and persistent ciphertext adapter | Browser workspaces remain intact; transfer is retried |
| Redis eviction/flush | Medium | Redis stores coordination only; ciphertext uses temp volume or S3/COS; TTL and state reconciliation | Active session may expire but durable browser data is safe |
| Snapshot changes during capture | High | Read revision before/after export; retry/fail on mismatch | User may need to pause generation and retry |
| Receiver changes after preview | High | Record preview revision and recheck before apply | Preview is regenerated and confirmation repeated |
| Merge conflict | Medium | Reuse existing ID/updatedAt merge; show counts/time/revision; replace explicit | Current merge semantics remain the source of truth |
| Partial restore / Key written early | High | Suspend writes, atomic restore, write optional Key only after success | Failure leaves IndexedDB/sessionStorage unchanged |
| Ciphertext tampering | High | AES-GCM authentication, transcript AAD, workspace SHA-256/count/schema validation | Reject before preview/restore |
| Payload too large / mobile memory | Medium | 32 MB default encrypted cap, optional compression, preflight size, export/WebDAV fallback | Large galleries may require file/cloud backup |
| API Key accidentally transferred | High | Default off, second confirmation, inclusion summary, masked receiver preview, encrypted-only | User explicitly choosing inclusion grants the receiver access |
| Knowledge/Admin session expectation | Medium | Exclusion list in sender preview and success copy | User signs into those subsystems separately |
| Browser lacks secure Web Crypto | Medium | HTTPS readiness check and feature unavailability message | File export/import remains available |
| QR screenshot leakage | Low | QR contains only prefilled rendezvous code; still TTL/rate/approval protected | Attacker may create a pending join request, not decrypt data |

## Cache Recommendation

### MVP

- No Redis requirement.
- Process memory: session state and expiry.
- `DATA_DIR/progress-sync`: ciphertext only.
- Startup and periodic cleanup.
- Restart invalidates active codes.

### Production enhancement

- Redis: TTL session state, attempts, status/presence, and atomic short locks.
- Persistent volume or S3/COS: opaque ciphertext.
- Do not store large payloads exclusively in Redis.

This keeps deployment simple while allowing later multi-instance coordination without changing the browser protocol.

## Cost And Complexity

- Frontend: medium-high because two-party crypto state and recovery UI must be correct across mobile lifecycle events.
- Backend: medium because data is temporary and opaque, but atomic state transitions and abuse limits require careful tests.
- Operations: low for single instance, medium when Redis/object storage is enabled.
- Conflict complexity: low-medium because sync is manual and existing merge/replace is reused.
- Privacy improvement over server-trusted transfer: high.

## Recommended Release Boundary

Release only stable persisted workspace data, active route, and selected model in version 1. Keep transient drafts and in-flight work out until the base protocol is stable. Support optional API Key transfer under the resolved confirmation policy. Keep continuous/background sync explicitly out of scope.

## Reverse QR Risk Review - 2026-08-04

| Risk | Severity | Mitigation | Verification |
|---|---:|---|---|
| Creator/join token confused with sender/receiver authority | Critical | Persist `creatorRole`; derive semantic role for every protected operation; deny by semantic role before mutation | Server matrix covers both creation directions and every wrong-role operation |
| Reverse QR silently uploads phone data | High | Fragment only prefills send intent; require explicit phone confirmation before capture/join and explicit sender approval before upload | Playwright asserts no create/join/upload before click |
| Transcript order changes when phone joins second | Critical | Always serialize semantic `sender` then `receiver`, independent of creator order | Crypto and E2E fingerprints match in both directions |
| Malformed/downgrade fragment opens wrong role | High | Accept only exact `#sync=\d{6}` and `#sync-send=\d{6}`; clear fragment immediately; reject extras | Parser/UI tests cover malformed, legacy, new, and disabled cases |
| Guessed reverse code causes unwanted sender join | High | Existing IP/session attempt limits, one pending peer, TTL, visible fingerprint, explicit restore preview | Server attempt tests plus user-visible rejection/cancel path |
| Receiver gains upload authority or sender gains claim authority | Critical | Server-side semantic role authorization; client labels are not trusted | Direct API tests verify 403/409 and unchanged state |
| Old clients break | Medium | Omitted role defaults to sender-created; legacy fields and QR remain valid | Existing server and cross-device tests run unchanged alongside new tests |
| Close/refresh cancels the wrong side | Medium | Store token with semantic state owner; cleanup uses the actual mounted sender/receiver state | Browser close/cancel tests for each physical direction |

The invitation-broker alternative was rejected because it would add a second low-entropy code map, a second TTL/state machine, and a new binding between an invitation and a sender session. Generalizing the existing session has a larger authorization review surface but fewer moving parts, no extra stored plaintext linkage, and one source of truth for expiry, attempts, and cleanup.

## Stable Dialog Geometry Risk Review - 2026-08-04

| Risk | Severity | Mitigation | Verification |
|---|---:|---|---|
| Fixed desktop height clips long protocol states | Medium | Choose height from browser measurements; keep `minmax(0, 1fr)` body with internal overflow | QR, fingerprint, preview, error, and completion state containment tests |
| Mobile inherits an inflexible desktop height | High | Scope stable fixed shell to desktop; mobile uses `100dvh`/safe-area/visualViewport bounds | 390x844, 375x812, keyboard and rotation tests |
| Two nested vertical scrollbars appear | Medium | Outer dialog shell does not scroll; body remains the sole dialog scroll owner | Assert one visible vertical scroll owner and unchanged document scroll |
| Tab switch animation still moves geometry | Medium | Animate content opacity/translate only; never transition size, position, padding, or grid tracks | Reduced-motion and bounding-box delta tests |
| Equal-height placeholders create empty visual gaps | Low | Use matched semantic slots with real receiver method controls, not decorative spacers | Visual review of both idle directions in light/dark modes |
| Focus is lost when panel content is recomposed | Medium | Preserve tab semantics and focus the selected tab; retain shared Dialog trap/restore behavior | Keyboard tab/arrow/Escape regression |
