# Plan: Xiaohongshu-Style UI + Admin-Controlled Modules

Date: 2026-05-22
Status: planned
Scope: plan only. No implementation in this phase.

## Goal

Refactor the current Cherry Web Studio into a browser-first AI portal with:
- Xiaohongshu-inspired visual language, not a brand clone.
- Left menu: Chat, Image, Audio, Video, Agents, Knowledge Base, Assistant Library.
- No user registration.
- Admin login entry for backend control.
- Admin-managed menu switches and API/model settings.
- Existing chat functionality preserved.

## Current Baseline

- Frontend is mostly one large file: `C:\Users\56252\Documents\New project 2\src\App.tsx`.
- API client lives in `C:\Users\56252\Documents\New project 2\src\api.ts`.
- Types live in `C:\Users\56252\Documents\New project 2\src\types.ts`.
- Express server and JSON store live in `C:\Users\56252\Documents\New project 2\server\index.mjs`.
- Data store: `DATA_DIR/app-data.json`.
- Current auth: optional shared app password. Needs split into public guest access + admin access.

## Architecture Decision

Use current React + Express monolith. Do not add a database yet. Extend JSON schema with `settings`, `menuItems`, `admin`, `providers`, and feature configuration.

Reason: fastest safe path. Current app is single-server deployable. Admin/menu control does not require DB complexity yet.

## Phases

1. [Data, auth, and settings model](phase-01-data-auth-settings.md)
2. [App layout, navigation, and visual system](phase-02-layout-routing-ui-system.md)
3. [Feature module shells](phase-03-feature-modules-shells.md)
4. [Admin console](phase-04-admin-console.md)
5. [Validation and deployment hardening](phase-05-validation-deploy.md)

## Timeline

- Phase 1: 0.5 day
- Phase 2: 1 day
- Phase 3: 0.5-1 day
- Phase 4: 1 day
- Phase 5: 0.5 day

Total: 3-4 engineering days for a clean MVP refactor.

## Key Risks

- Current `App.tsx` is too large. Refactor must happen before adding more features.
- Admin auth must protect API keys and menu settings.
- "Image/audio/video" should start as configurable module shells unless exact providers are chosen.
- Xiaohongshu-style UI should be inspired, not copied: no logo, no exact layout replication, no trademark mimicry.

## Open Questions

- Should guest users be able to use chat immediately, or should there be an optional site access password?
- Which providers are required first for image/audio/video: OpenAI-compatible only, or specific services?
- Should disabled menu items be hidden or shown as locked/coming soon?
