# Code Quality and UI Polish Plan

Date: 2026-06-05

## Goal

Run one focused review-and-polish pass on the current Cherry Web Studio codebase: improve code clarity, remove stale API surface, make the public UI feel more interactive and refined, and document the next development roadmap.

## Current Findings

1. The public API client still exposes deprecated conversation CRUD methods even though public conversation endpoints now return `410`.
2. `src/styles.css` references `var(--text)` while the active design token is `--ink`.
3. The top global search looks interactive but does not currently search or navigate.
4. UI polish is mostly CSS-only; left navigation, search, and API modal can be improved without touching backend data.
5. Existing privacy boundary is correct: user API URL/key are stored only in browser session storage and sent request-time.

## Implementation Scope

### Phase 01 - Code Quality Cleanup

- Remove stale public conversation CRUD methods from `src/api.ts`.
- Remove no-longer-used `Conversation` import from the API client.
- Fix undefined CSS token usage by replacing `var(--text)` with `var(--ink)` or defining a compatible alias.

### Phase 02 - Top Search Interaction

- Turn `TopBar` global search into a module switcher.
- Filter visible menu items by label, title, description, and highlights.
- Support click selection and Enter-to-select behavior.
- Keep the search strictly frontend-only; no backend search endpoint.

### Phase 03 - Refined UI Polish

- Add a glass search result popover with compact module cards.
- Improve left navigation active, hover, and icon states.
- Improve API configuration modal and form surfaces through CSS-only polish.
- Preserve `/admin` as the only admin entrance and avoid adding public settings/admin buttons.

### Phase 04 - Review, QA, and Roadmap

- Add a code review report with findings and resolved items.
- Add a next development roadmap covering provider integration hardening, knowledge vector cache, browser QA, admin security, and deployment readiness.
- Run `npm run check`, `npm run build`, `npm run privacy`, and smoke tests.

## Non-Goals

- No database migration.
- No public login/register.
- No storage of user API URL/key on the backend.
- No new external package unless required by validation.
- No large feature rewrite in this pass.

## Acceptance Criteria

- TypeScript check passes.
- Production build passes.
- Privacy scan passes.
- Smoke test passes against `http://localhost:8787`.
- Public bootstrap still contains no `apiKey`, `baseUrl`, `adminEntryEnabled`, or public `settings` menu.
- Top search can navigate between enabled modules.
- Public frontend still has no admin entry menu.
- UI polish stays light, Rednote-inspired, glassy, and not overly decorative.

## Next Development Roadmap

1. Provider request conformance matrix:
   - Add per-provider smoke fixtures for OpenAI, Claude, Gemini, and OpenAI-compatible adapters.
   - Normalize model capability validation errors.
   - Add safer status polling template examples for video providers.
2. Knowledge base pro:
   - Cache embeddings per document chunk in IndexedDB.
   - Add re-index button and embedding model migration warning.
   - Add OCR or server-side optional parser for scanned PDFs.
3. Agent workspace:
   - Add tool permission presets.
   - Add trace export and replay.
   - Add clearer failed tool-call rendering.
4. Admin hardening:
   - Add production boot checklist for `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.
   - Add admin import diff preview by entity id, not only counts.
   - Add audit log filters.
5. UI QA:
   - Add Playwright or browser screenshot script when browser runtime is approved.
   - Check desktop and mobile layout for chat, gallery, admin, API modal, and generation modules.
6. Deployment:
   - Add Docker healthcheck.
   - Add reverse proxy notes for HTTPS and secure cookies.
   - Add sample `.env.production`.
