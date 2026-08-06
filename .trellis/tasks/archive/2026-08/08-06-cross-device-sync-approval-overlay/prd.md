# Cross-device sync approval overlay

## Goal

Make the security approval step immediately visible after a phone joins a
desktop-generated "sync to phone" QR session. The approval content must occupy
the QR card's existing visual slot instead of being appended below it.

## Requirements

- In desktop QR send mode, replace the QR card content when
  `sender.phase === "approval"` with the device request, six-digit fingerprint,
  verification copy, Reject, and Confirm and Send actions.
- Keep the dialog and QR-stage geometry stable across waiting, approval, and
  uploading states. The user must not need to scroll to discover approval.
- Move keyboard focus to Confirm and Send when approval first appears without
  triggering any action automatically.
- Use a short opacity/translation transition and respect reduced-motion
  preferences.
- In mobile or manual-code flows where no QR card exists, render the same
  approval content as the first item in the session flow.
- Preserve synchronization API calls, encryption, optional API-Key confirmation,
  rejection, cancellation, expiry, upload, claim, and restore behavior.

## Acceptance Criteria

- [ ] Desktop QR approval replaces the QR content in the same card footprint.
- [ ] Confirm and Send is visible without scrolling and is inside the former QR
      card bounds.
- [ ] Dialog, header, tabs, body, and panel geometry do not shift by more than
      one pixel during the state transition.
- [ ] Focus moves to Confirm and Send once per approval transition; no request is
      approved or uploaded until the user activates it.
- [ ] Mobile/manual approval remains first in reading order and viewport-safe.
- [ ] Reject, cancel, confirm, API-Key confirmation, and receiver restore flows
      retain their current protocol behavior.
- [ ] Type checks, UI contracts, sync E2E, mobile layout, and server sync/security
      tests pass.

## Notes

- No server, protocol, storage, cryptography, or workspace schema changes.
- No additional dialog, popover, or persistent state.
