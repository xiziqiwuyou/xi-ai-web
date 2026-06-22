# GoAmzAI-Inspired Full Refactor Plan

Date: 2026-05-29

## Goal

Refactor the whole project into an AI portal/workbench inspired by the referenced system, while preserving this product's BYOK and admin-only metadata boundary.

## Source References

- Reference frontend screenshots: https://d.goamzai.com/screenshot/user.html
- Reference admin screenshots: https://d.goamzai.com/screenshot/manage.html
- Research report: `research/reference-ui-and-function-report.md`
- Current code notes: `reports/current-codebase-notes.md`

## Non-Negotiable Boundary

- No public user registration.
- No public user account center beyond local API settings.
- No payment/package/balance/promotion system.
- No backend persistence of public API URL or API key.
- Admin controls menus, model catalog, assistants/apps, feature visibility.

## Phases

1. [Phase 01 - Product Boundary and IA](phase-01-product-boundary-and-ia.md)  
   Status: Completed. Module IA expanded and default menu migrated.

2. [Phase 02 - Visual System and App Shell](phase-02-visual-system-and-shell.md)  
   Status: Completed. Rebuilt shell, nav, topbar, responsive/mobile navigation.

3. [Phase 03 - Shared Workbench Components](phase-03-shared-workbench-components.md)  
   Status: Completed. Shared workbench frame, model selector, prompt panel, options area, result panel, and asset gallery are in use by chat/generation pages.

4. [Phase 04 - Core Feature Modules](phase-04-core-feature-modules.md)  
   Status: Completed. Real PPT/mindmap/apps/gallery modules, local session gallery flow, and public generation request paths are implemented.

5. [Phase 05 - Admin and Data Model](phase-05-admin-and-data-model.md)  
   Status: Completed. Admin now manages menus, models, assistants, app presets, and prompt presets while preserving the no-credential public boundary.

6. [Phase 06 - Migration, Responsive QA, Validation](phase-06-migration-responsive-qa.md)  
   Status: Completed. Migration, BYOK boundary checks, production smoke test, build validation, and desktop/mobile browser QA passed.

7. [Phase 07 - Local Gallery Persistence](phase-07-local-gallery-persistence.md)  
   Status: Completed. Gallery results now persist in browser local storage with raw responses stripped, per-item delete, and Markdown export.

8. [Phase 08 - PPTX Export](phase-08-pptx-export.md)  
   Status: Completed. PPT generation results can now be parsed in the browser and exported as editable `.pptx` files without backend credential storage.

## Recommended Path

Use a phased rewrite, not a single huge replacement.

Reason:

- Existing backend/provider work is valuable.
- BYOK security boundary is already implemented.
- The largest risk is UI consistency and feature sprawl, not adapter logic.

## Success Criteria

- App visually reads as a polished AI portal/workbench.
- Left menu and feature pages match the reference system's information density and polish without cloning assets.
- All public flows work with request-time user URL/key.
- Admin has no credential fields.
- `npm run check` and `npm run build` pass.
- Desktop and mobile screenshots pass visual QA.
