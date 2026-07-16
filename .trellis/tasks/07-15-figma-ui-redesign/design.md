# Technical Design

## 1. Approach

Implement the redesign as a behavior-preserving React/CSS refactor. Keep the current Vite entry, root state ownership, prop flow, API client, persistence helpers, and CSS import order. Add only small shared UI primitives where repeated interaction contracts justify them.

The written design system is the target. Baseline screenshots establish current content and behavior, not a requirement to retain the current oversized card treatment.

## 2. Fixed Boundaries

- `App` continues to own bootstrap data, active public destination, BYOK state, API modal state, and gallery items.
- Feature modules continue to own their current drafts, selections, busy/error state, and results.
- The server remains the source of public menu labels, visibility, enabled state, and order.
- `sessionStorage`/`localStorage` helpers remain the only persistence owners; no component writes alternate formats.
- `/admin` continues to lazy-load outside the public shell.
- `src/styles.css` import order remains unchanged. Existing `rednote-flat-v2.*.css` files become the authoritative active layer; do not add a new trailing global override file.

## 3. Public Routing

Create one typed public route map adjacent to the app shell:

| Module ID | Path |
| --- | --- |
| `chat` | `/chat` |
| `image` | `/image` |
| `mindmap` | `/mindmap` |
| `agents` | `/agents` |
| `apps` | `/apps` |
| `gallery` | `/gallery` |

Use the browser History API rather than adding a router dependency:

1. Parse the initial path.
2. After bootstrap, activate it only when the matching menu item is visible and enabled.
3. Otherwise resolve the existing configured default/first available item and `replaceState` its canonical path.
4. User navigation uses `pushState`; `popstate` updates the active module.
5. Navigation does not introduce new persistence for feature-local state.
6. Update `document.title` from the resolved module label. `/admin` remains an independent exact route.

The production and development servers already return the SPA document for GET deep links, so no server contract change is planned.

## 4. Shell and Navigation

### Desktop

- `56px` header, compact brand, content-width module buttons, connection status, and contextual overflow.
- All six visible destinations remain in server order at `1280px` and `1440px`.
- Workspace receives the dominant viewport area; shell chrome is not a floating pill.

### Mobile

- `52px` title bar and five-slot bottom navigation: Chat, Drawing, Map, Agents, More.
- More derives Apps/Gallery rows from the same server menu array and preserves disabled/hidden behavior and order.
- More also exposes API connection status; it never exposes admin.
- Apps and Gallery remain routed screens, not modal-only destinations.

## 5. Scroll Model

- Desktop may use explicit independent work areas where the current feature requires them.
- Mobile declares exactly one visible vertical `[data-scroll-owner]` per screen.
- Chat uses the message viewport as owner; other public modules use their module content region.
- Inspectors/forms stack into that owner instead of creating nested vertical scroll containers.
- Dialogs and sheets become the sole scroll owner while open; the underlying shell is inert and non-scrollable.
- Bottom navigation, composers, and primary actions account for `env(safe-area-inset-bottom)` and dynamic viewport changes.
- Horizontal chip/code scrolling is allowed and must not create horizontal document overflow.

## 6. Shared UI Primitives

Add minimal reusable primitives only when used by multiple scoped surfaces:

- Modal/sheet frame with labelled dialog semantics, initial focus, focus trap, Escape policy, inert background, scroll lock, and focus restoration.
- Confirmation dialog with named consequence, Cancel default focus, and explicit destructive action.
- Compact empty state, status banner, overflow menu, and asset thumbnail/card/detail patterns.

Panels use one functional container with internal spacing and dividers. Do not place panel/card components inside one another solely to create visual depth.

## 7. Module Hierarchy

### Chat

- Retain desktop conversation rail; use a full-height sheet on mobile.
- Keep assistant/model/API status visible; group import/export/share/summarize under More.
- Keep streaming, message actions, attachments, voice, retry/edit/fork, and conversation persistence unchanged.
- Use a sticky composer and compact starter prompts. Conversation deletion follows confirmation/Undo policy.

### Drawing

- Desktop: `320px` inspector, flexible preview, `112px` recent strip.
- Mobile: Input/Preview/History views with a sticky Generate action.
- Keep all generation options and gallery insertion behavior. Share asset presentation with Gallery.

### Mind Map

- Canvas-first main region with Fit/Zoom/Export and the real Visual/Source control.
- Source replaces the canvas in place; remove the generic fake workbench tabs.
- Mobile prompt/settings open in a sheet; parsing and export behavior remain unchanged.

### Agents

- Inspector contains role, model, prompt, and compact permission rows.
- Main area is one timeline for run status, tool calls/results, and final answer.
- Preserve request payload, selected tools, trace detail, and result behavior.

### Apps

- Desktop uses market plus a `360px` runner/detail pane; mobile uses routed list then full-height detail/runner.
- Search and category controls remain filters, not tab semantics.
- Setup/Result is a real segmented view only when both states exist.

### Gallery

- Flat toolbar, responsive grid, selection mode, and desktop inspector/mobile full-screen detail sheet.
- Preserve favorites, filtering, export, replay session handoff, and storage cap/format.
- Clear All and batch delete require confirmation; detail focus behavior uses the shared overlay contract.

## 8. API Connection Modal

- Preserve the existing readiness rule and `cherry-web-user-provider` payload.
- Initial required modal cannot dismiss until ready; later user-opened modal is dismissible.
- Initial focus goes to the first incomplete field; close restores focus to the API trigger.
- Scrim has no blur. Privacy copy remains concise and explicitly session-only.

## 9. Admin Information Architecture

Keep `AdminPortal` login separate from the authenticated console. The authenticated shell uses:

- Header: product/admin identity, Return to Public, Logout.
- Navigation groups: Overview/Operations, Site/Menu, Models, Content, Audit.
- Content sections: operations and backups; tool permissions; system settings; menu management; model catalog; assistants; app presets; prompt presets; audit log.
- Desktop left navigation and one main content column; mobile navigation becomes a compact drawer/select surface.

Existing forms and API methods remain intact. Extracting the large console into adjacent section components is allowed only as a mechanical composition change. Model/content deletes and backup restore use the shared confirmation contract.

## 10. CSS Strategy

- Map the research color, spacing, radius, focus, elevation, and typography values into `rednote-flat-v2.tokens.css` first.
- Modify the authoritative shell/chat/workbench/admin/modal/responsive v2 files in place.
- Preserve legacy imports and order during the redesign.
- Before removing any legacy selector, require: `rg` proof of no TSX/runtime owner, no dynamic class construction match, and passing browser screenshots for every affected module.
- Prefer low-specificity component selectors and avoid `!important` except existing compatibility cases that are separately justified.

## 11. Test Design

Add Playwright browser coverage with deterministic API fixtures and no real provider credentials. Projects cover `1440x900`, `1280x800`, `390x844`, and `375x812`.

Browser tests cover:

- Public deep links, refresh, invalid-path fallback, navigation, Back/Forward, and titles.
- All six modules' empty, populated/result, loading, and error paths using existing request contracts.
- BYOK session-only persistence and required modal close gating.
- Dialog/sheet focus trap, Escape policy, inert background, and focus restoration.
- Destructive confirmation/Undo behavior.
- Mobile scroll owner, target sizes, safe-area/sticky controls, and no page overflow.
- Admin login shell, section navigation, representative saves, import/export, restore confirmation, and entity delete confirmation.
- Screenshot snapshots for every scoped screen at all four required viewports.

Existing source/runtime/release scripts remain required. Screenshot baselines may be updated only after intentional visual review; a snapshot update is not evidence by itself.

## 12. Rollback and Risk Control

- Deliver sequential review stages; each stage must pass targeted browser tests and existing contracts before the next shared surface changes.
- Routing can be rolled back independently because it does not alter server routes or stored data.
- Token changes have the widest blast radius and require all-module screenshots before acceptance.
- Shared workbench changes require Image, Mind Map, Agents, and Apps regression together.
- Chat and Admin remain isolated stages due to component size.
- No storage migration, server migration, or irreversible data operation is part of this task.
