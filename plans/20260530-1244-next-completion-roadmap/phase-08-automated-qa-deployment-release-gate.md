# Phase 08 - Automated QA and Deployment Release Gate

## Context Links

- Package scripts: `C:\Users\56252\Documents\New project 2\package.json`
- README: `C:\Users\56252\Documents\New project 2\README.md`
- QA report: `C:\Users\56252\Documents\New project 2\reports\qa-20260530-phase-03-08.md`
- Server: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Styles: `C:\Users\56252\Documents\New project 2\src\styles.css`

## Overview

Date: 2026-05-30  
Priority: P0 before release  
Status: Completed

Create a repeatable release gate: static checks, privacy scans, route smoke tests, browser screenshots, docs verification, and deployment checklist.

## Key Insights

- `npm run check` and `npm run build` already pass.
- Browser screenshots were skipped previously due missing runtime.
- QA report currently can drift from active port/behavior.
- Public privacy boundary needs automated assertions after Phase 01.

## Requirements

- Add `npm run smoke`.
- Add privacy scan script.
- Add server route smoke script.
- Add optional Playwright browser screenshot test.
- Add deployment checklist report.
- Keep docs accurate after each release phase.

## Architecture

```text
scripts/
  smoke.mjs
  privacy-scan.mjs
  browser-qa.mjs

npm scripts:
  check
  build
  smoke
  qa
```

Smoke tests should start against an existing server URL or local default.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\package.json`
  - Add smoke/qa scripts.
- Create: `C:\Users\56252\Documents\New project 2\scripts\smoke.mjs`
- Create: `C:\Users\56252\Documents\New project 2\scripts\privacy-scan.mjs`
- Create optional: `C:\Users\56252\Documents\New project 2\scripts\browser-qa.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\README.md`
  - Update current feature list and QA commands.
- Create: `C:\Users\56252\Documents\New project 2\reports\release-checklist-template.md`

## Implementation Steps

1. Add smoke script:
   - Check `/`.
   - Check `/admin`.
   - Check `/api/health`.
   - Check `/api/public/bootstrap`.
2. Add privacy assertions:
   - No `apiKey`.
   - No `baseUrl`.
   - No `adminEntryEnabled`.
   - No public `settings` menu.
   - After Phase 01: no public conversation summaries/content.
3. Add admin route assertions:
   - With production/no password, admin APIs locked.
   - With password, login works.
4. Add browser QA:
   - Install Playwright only if acceptable.
   - Desktop and mobile screenshots.
   - Check API modal appears when session config missing.
5. Add docs checks:
   - README port matches server default.
   - QA report uses current port.
   - Known limitations list is current.
6. Add release checklist template:
   - commands.
   - screenshots.
   - deployment env vars.
   - rollback notes.

## Todo List

- [ ] Add smoke script.
- [ ] Add privacy scan script.
- [ ] Add QA package scripts.
- [ ] Add optional browser screenshot QA.
- [ ] Update README.
- [ ] Add release checklist template.

## Success Criteria

- `npm run qa` validates build, smoke, and privacy boundary.
- Browser screenshots are saved when runtime is installed.
- Public bootstrap contains no user secrets or chat history.
- Production admin lock is tested.
- README matches actual behavior.

## Risk Assessment

- Risk: Playwright dependency is heavy.
  - Mitigation: keep browser QA optional and script-detected.
- Risk: Smoke tests need a running server.
  - Mitigation: support `SMOKE_URL` env var and clear error output.

## Security Considerations

- Privacy scan must fail on accidental secret fields.
- Do not print real API Keys in logs.
- Test production admin lock before deploy.

## Next Steps

After this phase, choose deployment target and run release checklist.
