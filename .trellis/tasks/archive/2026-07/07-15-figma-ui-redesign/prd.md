# Figma UI Redesign and Implementation

## Goal

Refactor the six public modules, API connection modal, and `/admin` console into the compact, flat workbench defined by the task research while preserving existing product behavior, data formats, privacy boundaries, and server contracts.

## Design Authority

- Primary handoff: `research/figma-ready-design-system.md`.
- Current behavior and usability evidence: `research/current-ui-audit.md`.
- Implementation boundaries and regression risks: `research/frontend-architecture-map.md`.
- Existing baseline screenshots are reference evidence. Blank Agents, Apps, and Gallery captures do not override the written design system or current code behavior.
- No Figma connector is available or required for this task.

## In Scope

- Public shell and navigation for `chat`, `image`, `mindmap`, `agents`, `apps`, and `gallery`.
- URL-addressable public modules using `/chat`, `/image`, `/mindmap`, `/agents`, `/apps`, and `/gallery`.
- Chat, Drawing, Mind Map, Agents, Apps, and Gallery layout and interaction hierarchy.
- Shared workbench, result, asset, empty, status, dialog, confirmation, and mobile-sheet patterns.
- API connection modal layout, required-first-use gating, and complete keyboard/focus behavior.
- `/admin` login shell and authenticated console shell, navigation, and content hierarchy.
- Desktop, mobile, accessibility, screenshot, and real browser behavior verification.

## Required Behavior

### Compatibility Invariants

- Preserve the six public menu IDs, server-provided labels, visibility/enabled state, and server-provided order.
- Preserve `/admin` as the only admin entry; do not add an admin link to the public shell or mobile More sheet.
- Preserve all existing API request/response contracts and admin API calls.
- Preserve BYOK storage in browser `sessionStorage` only, including key `cherry-web-user-provider` and its current JSON shape. API URL/key must not be persisted or configured by the backend.
- Preserve existing local/session storage keys and formats, including conversations, gallery items, and gallery replay handoff.
- Preserve feature behavior: chat streaming and conversation operations; image generation/history; mind-map visual/source/export; agent tools/trace/result; app search/select/run/result; gallery filter/favorite/select/export/replay/delete; admin import/export/backup/restore/edit flows.
- Do not reactivate dormant knowledge, media, PPT, audio, video, or assistant-library public modules.

### Navigation and Shell

- Direct public URLs select the corresponding visible/enabled module after bootstrap.
- `/` and invalid/unavailable public paths resolve to the configured default or first available module and replace the URL with its canonical path.
- Module navigation updates browser history; Back/Forward restores the destination without changing existing feature-local persistence semantics.
- Page titles use `<Module> - xi-ai-web`; admin uses `Admin - xi-ai-web`.
- Desktop shows compact content-width navigation. Mobile shows Chat, Drawing, Map, Agents, and More; More contains Apps, Gallery, and API status in existing menu order.

### Visual and Interaction System

- Use the research token values and a flat red/white/neutral palette.
- No glass blur, gradients, decorative glow, oversized floating shell, or card nesting used only for styling.
- Default controls/panels use small radii; dialogs and sheets do not exceed `12px` radius.
- Replace oversized centered empty states with compact, top-aligned empty states containing at most one sentence and one primary action.
- Remove the static `Result / Task / Details` affordance unless a module supplies real selectable views.
- Keep desktop toolbars compact; lower-frequency commands move into accessible overflow menus without removing behavior.

### Responsive and Accessibility

- Validate all scoped screens at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Every mobile screen has exactly one vertical scroll owner; overlays own scrolling only while open and make the background inert.
- Mobile interactive targets are at least `44x44px`; desktop icon targets are at least `36x36px`.
- Respect safe-area insets and keep sticky composers/actions visible with dynamic viewport changes and the software keyboard.
- All fields have persistent labels or accessible names; icon-only controls have accessible names and tooltips where needed.
- Dialogs/sheets provide initial focus, focus trapping, allowed Escape behavior, inert background, and trigger focus restoration.
- The required first-use API modal cannot close through Escape, scrim, or close button until the existing readiness rule passes.
- Batch delete, Clear All, backup restore, and admin entity deletion require confirmation. Single-item deletion requires confirmation or a guaranteed Undo path. Cancel receives default focus.

## Acceptance Criteria

- [x] All six public destinations retain their IDs, labels/order source, enabled/visible behavior, and existing feature workflows.
- [x] `/chat`, `/image`, `/mindmap`, `/agents`, `/apps`, and `/gallery` support direct load, refresh, navigation, and Back/Forward; titles update correctly.
- [x] `/admin` remains separate and no public admin entry is introduced.
- [x] BYOK credentials remain session-only and existing storage payloads round-trip unchanged.
- [x] Public and admin API contracts are unchanged.
- [x] All scoped screens pass browser tests and approved screenshots at the four required viewports.
- [x] Mobile tests prove one vertical scroll owner, no horizontal page overflow, safe-area spacing, visible sticky actions, and `44x44px` targets.
- [x] API and detail dialogs pass focus, Escape, inert-background, and focus-restoration tests.
- [x] Destructive flows do not mutate data before confirmation or expose the documented guaranteed Undo.
- [x] Empty states are compact and top-aligned; fake workbench tabs are absent.
- [x] Rendered scoped surfaces contain no glass, gradients, decorative glow, or styling-only nested cards.
- [x] Existing `npm run qa`, `npm run smoke`, and `npm run release-check` pass after the redesign.

## Out of Scope

- Server/API schema changes, provider behavior changes, authentication changes, or new public modules.
- Persisting feature-local drafts across module changes beyond existing behavior.
- A new runtime UI framework or router dependency.
- Figma 1:1 reconstruction beyond the written handoff and baseline evidence.
- Broad deletion of legacy CSS. A selector may be removed only after source search and rendered regression evidence prove it unused.
