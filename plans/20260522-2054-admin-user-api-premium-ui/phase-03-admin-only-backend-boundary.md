# Phase 03: Admin-Only Backend Boundary

Priority: high
Status: planned

## Overview

Make backend settings truly admin-only. Public users may use their own transient API credentials, but they cannot edit site settings, menu visibility, providers, or assistants.

## Requirements

- Admin entry exists as a small icon in the app chrome.
- Admin drawer requires authenticated admin session.
- On server deployment, missing `ADMIN_PASSWORD` must not unlock admin APIs.
- Menu switches are admin-only.
- System settings are admin-only.
- Provider persistence is admin-only.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\.env.example`
- Modify: `C:\Users\56252\Documents\New project 2\README.md`

## Auth Policy

Recommended:

- Development:
  - If not production and `ADMIN_PASSWORD` is empty, allow local unlocked admin for convenience.
- Production:
  - If `ADMIN_PASSWORD` is empty, admin endpoints return `503` with setup message.
  - Do not authenticate anyone.

Pseudo logic:

```js
function isDevAdminUnlocked() {
  return !isProduction && !adminPassword;
}

function hasAdminAuth(req) {
  if (isDevAdminUnlocked()) return true;
  if (!adminPassword) return false;
  const cookies = parseCookies(req.headers.cookie || "");
  return isValidAdminSession(cookies.cw_admin_session);
}
```

For login:

- Empty password in production: `503`.
- Wrong password: `401`.
- Correct password: set signed `HttpOnly` cookie.

## Admin Entry UI

- Keep top-right icon button.
- Use `title="管理员入口"` and `aria-label="管理员入口"`.
- No loud red "进入后台（管理员）" public button.
- If `adminEntryEnabled` is false, hide icon.
- Consider fallback route/hash later, but not needed now.

## API Surface

Preferred:

- Keep only `/api/admin/*` for admin settings.
- Remove or deprecate duplicate `/api/providers` and `/api/assistants`.

If compatibility is needed:

- Keep them protected by the same strict `requireAdmin`.
- Add comments marking them legacy.

## Success Criteria

- Unauthenticated request to `/api/admin/bootstrap` returns `401` when password is configured.
- Production with no `ADMIN_PASSWORD` does not expose admin settings.
- Public bootstrap never includes API keys.
- Public users can still chat with transient credentials.

