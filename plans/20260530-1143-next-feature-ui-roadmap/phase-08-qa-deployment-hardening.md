# Phase 08 - QA and Deployment Hardening

## Context Links

- README: `C:\Users\56252\Documents\New project 2\README.md`
- Server: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Package scripts: `C:\Users\56252\Documents\New project 2\package.json`
- Latest screenshots folder: `C:\Users\56252\Documents\New project 2\reports\screenshots`

## Overview

Date: 2026-05-30  
Priority: P0 before release  
Status: Completed

Validate the app as a deployable server-hosted AI workbench: static checks, browser checks, privacy scans, route isolation, docs, and rollback notes.

## Key Insights

- This project is intended for server deployment.
- BYOK boundary is a core requirement.
- UI regressions are likely after feature/UI expansion.

## Requirements

- TypeScript check passes.
- Production build passes.
- Server syntax check passes.
- Public bootstrap contains no API URL/Key.
- Public UI has no admin entry.
- `/admin` requires configured password in production.
- Desktop and mobile UI screenshots pass visual review.
- README documents current behavior accurately.

## Validation Commands

Run from `C:\Users\56252\Documents\New project 2`:

```powershell
npm run check
npm run build
node --check server\index.mjs
```

Privacy scans:

```powershell
rg -n "apiKey|API Key|baseUrl|ADMIN_PASSWORD|sessionStorage|localStorage" src server data README.md
```

Bootstrap smoke:

```powershell
$payload = Invoke-RestMethod http://localhost:8787/api/public/bootstrap
$payload | ConvertTo-Json -Depth 8
```

Expected:

- no `apiKey`
- no user `baseUrl`
- no `adminEntryEnabled`
- no public `settings` menu item

## Browser QA Matrix

- Public desktop: `http://localhost:8787/`
- Public mobile viewport: 390 x 844
- Admin desktop: `http://localhost:8787/admin`
- Admin mobile viewport: 390 x 844
- Missing API session:
  - clear session storage.
  - reload public page.
  - modal appears.
- BYOK flow:
  - enter API URL/Key.
  - modal closes.
  - chat/generation can submit.
- Knowledge:
  - upload small file.
  - retrieve.
  - refresh.
  - document persists locally.
- Chat:
  - text-only stream.
  - attachment-capability guard.
- Gallery:
  - generated item saved.
  - search/filter/detail/export.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\README.md`
  - Update feature list and current limitations.
- Modify: `C:\Users\56252\Documents\New project 2\package.json`
  - Optional: add `smoke` script only if it stays simple.
- Create: `C:\Users\56252\Documents\New project 2\reports\screenshots`
  - Store desktop/mobile screenshots.
- Create optional: `C:\Users\56252\Documents\New project 2\reports\qa-20260530.md`
  - Record validation output and decisions.

## Implementation Steps

1. Run type/build/server checks.
2. Run public/admin bootstrap smoke tests.
3. Run BYOK leak scan.
4. Run browser visual QA on desktop/mobile.
5. Validate feature workflows by phase.
6. Update README:
   - no public login.
   - API modal behavior.
   - `/admin`.
   - knowledge upload locality.
   - model catalog metadata boundary.
7. Record known limitations:
   - provider-specific video status paths.
   - unsupported media modes.
   - local browser storage limits.
8. Produce final QA report.

## Todo List

- [x] Run static checks.
- [x] Run production build.
- [x] Run server syntax check.
- [x] Run bootstrap privacy smoke.
- [ ] Capture desktop/mobile screenshots.
- [x] Update README.
- [x] Create QA report.

## Success Criteria

- All checks pass or blockers are documented.
- Public app has no admin/settings entry.
- API URL/Key are never persisted in backend data.
- Admin route works only through `/admin`.
- UI has no obvious overlap on desktop/mobile.
- README matches implemented behavior.

## Risk Assessment

- Risk: QA finds stale settings/admin code after Phase 01.
  - Mitigation: block release until removed or safely unreachable.
- Risk: Browser storage limits vary.
  - Mitigation: document local storage limits and show graceful fallback.

## Security Considerations

- Ensure production requires `ADMIN_PASSWORD`.
- Ensure admin import/export is auth-protected.
- Ensure uploaded files and gallery data stay local unless an explicit admin-global feature is added.

## Next Steps

After QA passes, choose whether to:

1. Deploy current single-server JSON version.
2. Plan database migration to SQLite/Postgres.
3. Add admin-managed global knowledge base as a separate authenticated admin feature.
