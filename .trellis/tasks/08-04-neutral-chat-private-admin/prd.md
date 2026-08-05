# Neutral chat and private admin credentials

## Goal

Make ordinary Chat conversations neutral by default and replace the discoverable Admin page path with a private username/password login that operators can safely rotate.

## Requirements

- A fresh or explicitly new Chat conversation has an empty assistant binding and sends no assistant system prompt.
- Launching an enabled Assistant from the Assistant library still creates a dedicated assistant-bound conversation and sends that Assistant ID.
- Existing assistant-bound local conversations remain bound; deleted/disabled Assistant bindings remain explicit errors rather than silently falling back.
- The only Admin page route is `/xizi2333`; `/admin` must not mount the Admin portal and no public navigation may expose either route.
- Admin login requires both username and password. The deployment defaults to username `xizi2333`, overridable through `ADMIN_USERNAME`; `ADMIN_PASSWORD` remains required in production.
- An authenticated operator can change the username and/or password from Site Settings after confirming the current password.
- Rotated credentials persist without a database as a salted password hash in a dedicated file under `DATA_DIR`; plaintext credentials never enter app metadata, exports, backups, logs, or browser storage.
- Credential rotation invalidates all existing Admin sessions and requires a new login.

## Acceptance Criteria

- [x] A clean browser workspace creates one conversation with `assistantId: ""`, displays no Assistant badge, and can complete a Chat request without `assistantId`.
- [x] Assistant-library launch and legacy valid bindings still send the exact selected Assistant ID.
- [x] `/xizi2333` renders the isolated Admin login; `/admin` does not render Admin UI.
- [x] Wrong username or password returns the same generic `401` response; a correct pair creates the HttpOnly Admin session.
- [x] Credential rotation requires the current password, validates username/password bounds, atomically stores only salt/hash metadata, and invalidates the current session.
- [x] Deployment templates and operator documentation expose `ADMIN_USERNAME=xizi2333` and the new entry path.
- [x] TypeScript, security/server contracts, UI contracts, build, and targeted desktop/mobile Playwright tests pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
