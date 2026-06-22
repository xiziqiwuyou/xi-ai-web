# Test Spec - Code Quality and UI Polish

Date: 2026-06-05

## Static Validation

- `npm run check`
- `npm run build`
- `npm run privacy`
- `node --check server\index.mjs`
- `node --check scripts\smoke.mjs`
- `node --check scripts\privacy-scan.mjs`

## Smoke Validation

Run against `http://localhost:8787`:

- `npm run smoke`
- Verify `/` returns the app shell.
- Verify `/admin` returns the admin shell.
- Verify `/api/health` returns `ok`.
- Verify `/api/public/bootstrap` does not leak:
  - `apiKey`
  - `baseUrl`
  - `adminEntryEnabled`
  - public `settings` menu
  - public conversation summaries

## Manual UI Validation

- Top search opens a result popover after typing.
- Search filters modules by visible Chinese labels and metadata.
- Clicking a result switches modules and clears the search.
- Pressing Enter with results switches to the first result.
- Left navigation remains narrow and does not overlap content.
- API configuration modal remains the only first-use API prompt.
- Public frontend has no admin menu item.

## Review Focus

- No user credential persistence on backend.
- No old public conversation client usage remains.
- No undefined CSS token remains.
- UI changes are CSS/React-only and do not alter admin metadata contracts.
