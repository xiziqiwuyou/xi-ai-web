# Plan: Premium UI + Admin/User API Separation

Date: 2026-05-22
Status: planned
Scope: plan only. No code implementation in this pass.

## Goal

Make the actual app match the reference UI more closely while fixing permission boundaries:

- More premium Xiaohongshu-inspired feel: softer shell, richer glass, better radius hierarchy, stronger icon tiles.
- Left menu narrower, icon-first, tactile, and less sidebar-like.
- Admin settings are only configurable by an authenticated administrator.
- Normal users do not register. They use the app by carrying their own API URL/key/model directly.
- Add/keep a small administrator backend entry without making public UI feel like a config panel.

## Recommended Architecture

Use server-proxied transient API credentials.

- Public user enters `baseUrl + apiKey + model`.
- Frontend keeps it in React state for current browser session.
- `/api/chat/stream` accepts either admin `providerId` or `transientProvider`.
- Server uses transient key for that one request only.
- Server never persists transient keys.
- Admin provider settings stay behind `/api/admin/*`.

Avoid direct browser-to-provider calls because CORS and key exposure are worse.

## Phases

1. [Premium Visual System](phase-01-premium-visual-system.md)
2. [Transient User API Connection](phase-02-transient-user-api-connection.md)
3. [Admin-Only Backend Boundary](phase-03-admin-only-backend-boundary.md)
4. [Chat UX Recomposition](phase-04-chat-ux-recomposition.md)
5. [Responsive QA and Validation](phase-05-responsive-qa-validation.md)

## Key Files

- `C:\Users\56252\Documents\New project 2\src\styles.css`
- `C:\Users\56252\Documents\New project 2\src\types.ts`
- `C:\Users\56252\Documents\New project 2\src\api.ts`
- `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Success Criteria

- Desktop UI visually resembles the reference: slim rail, large icons, soft white/red glass, premium input.
- Card and panel corners feel intentional, not default.
- Public user can chat with only their own API URL/key/model.
- Public UI does not expose admin-only settings.
- Server deployment does not unlock admin when `ADMIN_PASSWORD` is missing.
- Transient user API keys are never written to `data/app-data.json`.

## Validation

Run:

```bash
npm run check
npm run build
npm run start
```

Then verify:

- `GET /api/public/bootstrap`
- `POST /api/chat/stream` with `transientProvider`
- Admin login with valid `ADMIN_PASSWORD`
- Admin endpoints reject unauthenticated requests
- Desktop, 1024px, and 390px browser screenshots

## Open Questions

- Should user API credentials survive refresh in `sessionStorage`, or stay memory-only?
- Should admin-created providers be exposed as optional public presets, or should public chat require only user-carried credentials?

