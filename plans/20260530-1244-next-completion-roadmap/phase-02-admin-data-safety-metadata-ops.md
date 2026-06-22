# Phase 02 - Admin Data Safety and Metadata Ops

## Context Links

- Admin console: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
- Admin API client: `C:\Users\56252\Documents\New project 2\src\api.ts`
- Server admin routes: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Registry normalization: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`
- Data file: `C:\Users\56252\Documents\New project 2\data\app-data.json`

## Overview

Date: 2026-05-30  
Priority: P0  
Status: Completed

Make admin metadata safe to operate on a deployed server: import dry-run, validation, backups, audit notes, and migration visibility.

## Key Insights

- Admin import/export exists and is guarded.
- Import applies directly after parsing.
- JSON store is acceptable for now, but needs safer operations before deployment.

## Requirements

- Add metadata import dry-run.
- Show validation issues before applying.
- Create automatic timestamped backup before import.
- Add admin data version/migration report.
- Add minimal audit trail for admin metadata changes.
- Keep export free of API URL/Key.

## Architecture

```text
PATCH /api/admin/metadata-import?dryRun=true
  parse -> normalize -> validate -> diff -> return report

PATCH /api/admin/metadata-import
  backup current data -> normalize -> validate -> save -> audit

GET /api/admin/audit-log
  returns recent metadata operations only
```

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Add backup creation and dry-run import.
  - Add audit log route.
  - Tighten import validation.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
  - Add dry-run preview modal/panel.
  - Show counts and validation warnings.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\adminValidation.ts`
  - Share validation logic for model catalog and prompt records.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Add dry-run and audit API helpers.
- Create: `C:\Users\56252\Documents\New project 2\server\admin\metadata-validation.mjs`
  - Normalize and validate imported metadata.
- Create: `C:\Users\56252\Documents\New project 2\server\admin\audit-log.mjs`
  - Append-only small JSONL audit log helper.

## Implementation Steps

1. Extract metadata validation from route body into a helper.
2. Add import report:
   - settings changed.
   - menu count.
   - model count.
   - assistant/app/prompt count.
   - validation warnings.
3. Add `dryRun=true` mode:
   - No file write.
   - No audit write.
4. Add backup before real import:
   - `data/backups/app-data-YYYYMMDD-HHmmss.json`.
   - Keep last 20 backups.
5. Add audit log:
   - action.
   - timestamp.
   - counts changed.
   - remote IP hash or generic source.
   - no request body secrets.
6. Update admin UI:
   - Upload JSON.
   - Dry-run first.
   - Confirm apply.
7. Add metadata reset option only if explicitly confirmed.

## Todo List

- [ ] Add metadata validation helper.
- [ ] Add dry-run import endpoint.
- [ ] Add automatic backups.
- [ ] Add audit log helper and endpoint.
- [ ] Add admin preview/apply UI.
- [ ] Update README.

## Success Criteria

- Bad import never corrupts current data.
- Admin sees import diff before applying.
- Import creates a backup.
- Export/import contains no user API URL/Key.
- Production without `ADMIN_PASSWORD` still locks admin routes.

## Risk Assessment

- Risk: Backup growth fills disk.
  - Mitigation: rotate last 20 backups.
- Risk: Audit log stores sensitive data.
  - Mitigation: store metadata counts only, never raw payload.

## Security Considerations

- All endpoints stay under `adminRouter.use(requireAdmin)`.
- Reject unknown root keys.
- Reject credential-like keys: `apiKey`, `baseUrl`, `secret`, `token`.

## Next Steps

After admin safety, build the dedicated agent workspace.
