# API Modal and Admin Route Cleanup Plan

Date: 2026-05-30

## Goal

Move API URL/Key configuration out of persistent public chrome and into a demand-driven modal. Keep admin management accessible only by directly visiting `/admin`.

## Source Context

- User requirement: no always-visible top-right API menu/button.
- User requirement: when opening the app without API URL/Key, show a modal prompt.
- User requirement: admin has a dedicated address-bar entry; no frontend admin menu.
- Code notes: `reports/current-codebase-notes.md`

## Product Boundary

- Public frontend: no login/register.
- Public users bring their own API URL and API Key.
- API URL/Key remain browser-side only, using current `sessionStorage` pattern.
- Backend/admin manages metadata only: menus, models, assistants, apps, prompt presets.
- Admin entry: `/admin` route only.

## Phases

1. [Phase 01 - API Connection Modal Architecture](phase-01-api-connection-modal-architecture.md)  
   Status: Completed. Global API modal and reusable connection form are implemented.

2. [Phase 02 - Public Chrome and Menu Cleanup](phase-02-public-chrome-menu-cleanup.md)  
   Status: Completed. Top-right API button is removed and settings is filtered from public nav/menu flow.

3. [Phase 03 - Admin Entry Hardening](phase-03-admin-entry-hardening.md)  
   Status: Completed. `/admin` remains the only admin entry and stale `adminEntryEnabled`/settings menu defaults are removed.

4. [Phase 04 - Request Flow and QA](phase-04-request-flow-qa.md)  
   Status: Completed. Static checks, build, server syntax, public bootstrap, and `/admin` smoke tests passed.

## Recommended Path

Build the modal first, then remove entry points. This avoids breaking chat/generation modules that currently call `onNavigateSettings()`.

## Key Decisions

- Replace `onNavigateSettings()` with `onRequestApiConfig()` across feature modules.
- Keep `UserSettingsModule` logic, but extract the form into `ApiConnectionForm`.
- Remove persistent top-right API button entirely.
- Remove `settings` from public navigation. If a settings module remains temporarily, it should be internal/fallback only.
- Do not add a visible admin button/link to public UI.

## Success Criteria

- Fresh public page with no API Key opens an API config modal.
- After saving valid URL/Key, modal closes and user can use modules.
- If user clears sessionStorage or submits without credentials, modal opens again.
- Top-right API config button is gone.
- Public left/mobile navigation does not show admin entry.
- `/admin` works directly from address bar.
- Public bootstrap/admin data contain no user API URL/Key.
- `npm run check` and `npm run build` pass.
