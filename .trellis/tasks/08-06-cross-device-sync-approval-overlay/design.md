# Cross-device Sync Approval Design

## State presentation

`ProgressSyncPanel` keeps one sender session container. A shared approval block
is rendered in one of two placements:

- Desktop QR flow: inside the existing `.progress-sync-qr` stage, replacing the
  QR image and fallback-code content.
- Mobile/manual flow: as the first content block in `.progress-sync-session`.

The approval component receives the existing callbacks and state values only.
It does not own protocol state or perform side effects.

## Geometry and motion

The QR stage gets a stable minimum block size derived from the existing 184px QR
plus padding. Waiting and approval content both fill that stage. Approval uses a
short entry animation on its inner content; the dialog shell and session grid do
not animate dimensions. Reduced-motion disables practical movement.

## Focus and accessibility

A button ref targets Confirm and Send. An effect runs only when the sender enters
approval, schedules focus for the mounted button, and cancels the scheduled frame
on cleanup. The approval block uses an accessible status announcement and keeps
Reject before the primary action in DOM order.

## Compatibility

The same `approveSender`, `rejectSender`, and `cancelSender` handlers remain the
only action paths. QR generation and rendezvous polling are unchanged. The
receiver flow and optional API-Key confirmation remain untouched.

## Validation

Playwright will complete a real two-context join, assert that the approval card
occupies the QR stage, verify that its primary action is visible without body
scroll, compare stable dialog geometry, and then run the existing approve/restore
path. Mobile geometry and protocol tests remain regression coverage.
