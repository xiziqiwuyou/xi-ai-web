# Phase 04: Validation

Priority: high
Status: planned

## Checks

Run:

```bash
npm run check
npm run build
```

Restart local server:

```bash
npm run dev
```

## Route Tests

1. Public home:

```bash
curl http://localhost:8787/
curl http://localhost:8787/api/public/bootstrap
```

Expected:

- Public app loads.
- No providers exposed.
- No admin/system controls in public top bar.

2. Admin page:

```bash
curl http://localhost:8787/admin
curl http://localhost:8787/api/admin/status
```

Expected:

- Admin SPA route loads.
- Admin auth state remains correct.

3. Production auth:

- With `ADMIN_PASSWORD`: unauthenticated `/api/admin/bootstrap` returns `401`.
- Without `ADMIN_PASSWORD`: production `/api/admin/bootstrap` returns `503`.

## Text Audit

Run:

```bash
rg -n "系统设置|后台管理|菜单开关|管理员入口|API 连接" src/app src/features/chat src/features/generation
```

Expected:

- No matches.

Admin-only matches are allowed under:

```bash
src/features/admin
```

## Visual QA

Inspect:

- `/` desktop.
- `/` mobile.
- `/admin` login.
- `/admin` console after login.
- Chat model connection popover.
- Generation module model connection fields.

