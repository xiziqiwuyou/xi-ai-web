# Phase 02 - Visual System and App Shell

## Overview

Status: Completed  
Priority: P0

Rebuild the outer shell to match the reference system's portal feel: compact navigation, polished cards, strong workbench layout, good mobile behavior.

## Visual Direction

- Inspired by reference portal, not a clone.
- Light premium SaaS surface.
- Soft glass only where useful.
- Rounded cards 12-18px for feature panels.
- Compact icon navigation with larger icons.
- Clear hover/active states.
- Avoid oversized marketing hero sections.
- Avoid copying logos, images, sample names.

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\app\AppShell.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
- Create: `C:\Users\56252\Documents\New project 2\src\app\MobileNav.tsx`

## Architecture

```txt
AppShell
  LeftNav / MobileNav
  WorkspaceFrame
    TopBar
    WorkspaceCanvas
      ModuleRouter
```

## Implementation Steps

1. Define CSS tokens:
   - color
   - surface
   - radius
   - shadow
   - spacing
   - motion
2. Replace current left nav with:
   - slim icon rail
   - brand mark
   - module buttons
   - settings pinned at bottom
3. Rework topbar:
   - current module title
   - search/quick action slot
   - BYOK connection status
   - admin entrance only if configured and subtle
4. Rework workspace canvas:
   - fixed height layout
   - scroll inside module areas
   - no card-inside-card clutter
5. Add mobile behavior:
   - bottom tab nav
   - collapsed topbar
   - full-width module panels

## Success Criteria

- Left nav no longer overlaps settings.
- Nav feels narrower and more premium.
- Text does not overflow at 360px mobile width.
- Desktop first viewport shows full active workbench.
- Visual style is consistent across modules.
