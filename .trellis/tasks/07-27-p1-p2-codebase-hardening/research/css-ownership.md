# CSS ownership inventory

## Active ownership

- `rednote-flat-v2.tokens.css`: semantic tokens, typography, reset-compatible active form defaults.
- `rednote-flat-v2.shell.css`: `.figma-studio-shell`, sidebar, public navigation, workspace and footer.
- `rednote-flat-v2.chat.css`: active stacked Chat sessions, messages, composer and Chat dialogs.
- `rednote-flat-v2.workbench.css`: Image, PPT, Mind Map, Assistants, Translation and Automation workspaces.
- `rednote-flat-v2.admin.css`: isolated Admin portal, navigation and active Admin sections.
- `rednote-flat-v2.modal.css`: shared BYOK/settings/dialog surfaces.
- `rednote-flat-v2.knowledge-*.css`: cloud knowledge, local workspace and integration surfaces.
- `rednote-flat-v2.responsive.css`: active mobile/tablet shell and workspace behavior.

## First retired pass batch

- `legacy.09-flat-shell-pass.css`: old `.rednote-*`, `.left-nav`, `.module-nav` and `.top-bar` shell pass; active shell uses `.figma-*` ownership.
- `legacy.10-flat-workbench.css`: late generic workbench override duplicated by the active workbench/admin layers.
- `legacy.11-flat-chat-api.css`: late Chat/API override duplicated by the active Chat and modal layers.
- `legacy.06-rednote-shell-pass.css`: old Rednote shell pass with no active `.figma-*` owner.
- `legacy.08-apps-gallery.css`: retired Apps/Gallery shell styles with no public route.
- `legacy.14-responsive-late.css`: responsive rules for the retired shell and old workbench class family.

The six imports are removed as two bounded batches and are deleted only after UI contracts plus desktop/mobile browser coverage pass.

## Deferred legacy files

- `legacy.00-foundation.css` still owns the global reset, root sizing and unique agent/knowledge helpers.
- `legacy.01-shell.css` through `legacy.04-admin.css` still contain broad base selectors used by older shared class names.
- `legacy.05-responsive-early.css`, `legacy.06-rednote-shell-pass.css`, `legacy.07-workbench.css`, `legacy.08-apps-gallery.css`, and `legacy.12-gallery.css` through `legacy.14-responsive-late.css` require separate rendered-DOM and viewport batches.

Do not remove the remaining legacy files as one change. Each batch must preserve computed geometry and pass the affected desktop/mobile E2E suites.

## Token migration

`--xhs-primary` is the canonical semantic accent token. `--xhs-red` remains a compatibility alias with identical resolved light/dark values. `--xhs-primary-fill` stays separate because dark filled controls intentionally use a darker contrast-safe blue.
