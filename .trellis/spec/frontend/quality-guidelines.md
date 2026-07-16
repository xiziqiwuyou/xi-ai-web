# Quality Guidelines

> Required verification and review contracts for xi-ai-web frontend work.

## Required Commands

Run targeted checks while editing, then run the full gate before completion:

```powershell
npm run check
npm run qa
npm run test:e2e
npm run smoke
npm run release-check
git diff --check
```

`npm run smoke` expects a healthy server at `SMOKE_URL` or `http://localhost:8787`. `release-check` builds and starts its own isolated production server.

## Browser Test Contract

- Playwright uses deterministic route fixtures in `tests/e2e/support/app-fixture.ts`; never use real provider credentials.
- Required projects are `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Wait for `waitForPublicModule` before layout assertions. A correct shell title does not prove the lazy feature module has mounted.
- Mobile checks assert one visible vertical scroll owner, no document overflow, and `44px` navigation/sheet targets.
- BYOK tests assert `cherry-web-user-provider` is written only to `sessionStorage` and that the required modal cannot dismiss early.
- Public navigation tests assert canonical routes, Back/Forward behavior, server order, and no `/admin` link.

Vite must ignore `**/reports/**`. Playwright writes traces and screenshots there; watching that directory reloads concurrent test pages and produces `ERR_ABORTED` or destroyed execution contexts.

## Visual Review

At minimum inspect Chat, Mind Map, one shared workbench, the API modal, and Admin at desktop and mobile widths.

Computed-style checks should find:

```text
visible gradient backgrounds: 0
visible backdrop-filter blur: 0
document width <= viewport width + 1px
mobile visible scroll owners: 1
```

A screenshot update is not proof by itself. Confirm navigation placement, sticky actions, long text, dialogs, and empty states visually.

## Forbidden Patterns

- No `any`, suppressed TypeScript errors, debug logging, or ignored failed promises in changed code.
- No API URL/key persistence in backend files, `localStorage`, query strings, logs, or analytics.
- No public Admin entry. `/admin` is address-only and isolated from public bootstrap.
- No fake tabs, explanatory design copy, nested styling cards, glass effects, or gradients.
- No broad Vite watch over generated reports, `dist`, data, dependencies, or VCS metadata.

## Review Checklist

- Behavior and API/storage formats remain compatible.
- Visible/disabled menu state and order still come from bootstrap data.
- Direct load, refresh, invalid-route fallback, and Back/Forward work.
- Dialog focus, inert background, Escape policy, focus restoration, and sole scroll ownership work.
- Mobile grid rows and safe-area padding are explicit.
- All changed accessible names match tests and visible intent.
- `qa`, E2E, smoke, release check, and `git diff --check` pass with fresh output.
