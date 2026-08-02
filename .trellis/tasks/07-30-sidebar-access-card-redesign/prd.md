# Sidebar Access Card Redesign

## Goal

Unify the lower-left service address, session Key, connection state, and utility actions into one compact and visually coherent access panel.

## Requirements

- Keep the existing service status, workspace-data action, theme action, service address, masked session Key, and Key replacement behavior.
- Present the address and Key as two rows in one connection-details group with aligned icons, labels, values, spacing, and corner radii.
- Make only the Key row interactive; the address row remains informational.
- Remove the repeated encrypted-access footer because the ready status already communicates connection state.
- Use the existing red/white flat visual language, small radii, restrained shadows, and current color tokens.
- Preserve full-Key privacy, sessionStorage-only persistence, accessible names, focus behavior, and the existing mobile replacement action.
- Keep the desktop card within the current 224px sidebar without overlap or text overflow.

## Acceptance Criteria

- [x] The desktop access card has one header and one two-row connection-details group.
- [x] Address and Key rows share the same icon column, label treatment, value alignment, and bounded width.
- [x] The Key row has clear hover/focus feedback and still opens the existing API connection dialog.
- [x] The full Key never appears in rendered shell text or localStorage.
- [x] The repeated encrypted-access footer is absent.
- [x] The card remains contained at 1280x720, 1280x800, and 1440x900 with no navigation overlap.
- [x] Mobile continues to expose the existing replace-Key action and hides the desktop card.
- [x] TypeScript, UI contracts, focused shell E2E, build, and git diff checks pass.

## Non-goals

- Changing provider configuration, API request routing, or credential persistence.
- Redesigning the entire sidebar navigation.
- Adding a second API configuration surface.
