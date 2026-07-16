# Component Guidelines

> Executable component and accessibility conventions for xi-ai-web.

## Component Structure

- Use typed React function components. Keep feature-local state and helpers in the owning feature module unless a behavior is reused by at least two modules.
- `src/App.tsx` owns public bootstrap state, the active public module, BYOK state, the API modal, and shared gallery items.
- Shared public shell components live in `src/app/`; shared workbench composition lives in `src/components/workbench/`; reusable interaction primitives live in `src/components/ui/`.
- Preserve lazy module boundaries. Tests must wait for the module body, not only the shell title.

```tsx
type EmptyStateProps = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description?: string;
};

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  // Render one compact state, not a nested decorative card.
}
```

## Overlay Contract

Use `src/components/ui/Dialog.tsx` for modals, sheets, and side inspectors. Use `ConfirmationDialog` for destructive confirmation.

Every shared dialog must provide:

- `role="dialog"` for ordinary overlays or `role="alertdialog"` for destructive confirmation, plus `aria-modal="true"` and a stable `labelledBy` target.
- Initial focus, Tab trapping, allowed Escape/scrim behavior, and trigger focus restoration.
- `#root` inertness and body scroll locking while open.
- `data-scroll-owner="dialog"` on the dialog itself. Background scroll-owner attributes are suspended for the overlay lifetime, including owners mounted later by lazy content.
- A maximum `12px` radius and no backdrop blur.

The required first-use API dialog passes `canClose={false}` until the existing provider readiness rule is satisfied. Do not add a second close path.

## Props And Composition

- Define component props with named `type` declarations and use domain types from `src/types.ts` for shared contracts.
- Pass commands as callbacks; do not make presentation components import root state or persistence helpers.
- Prefer one functional panel with internal dividers. Do not place cards inside cards solely to create depth.
- Use Lucide icons already installed in the project. Icon-only controls require an accessible name and `title`.

## Styling

- Global CSS is imported through `src/styles.css`; import order is a compatibility contract.
- The `rednote-flat-v2.*.css` files are the authoritative active layer. Extend the module-owned file instead of adding a trailing override sheet.
- Public UI uses flat white/neutral surfaces, red selection/actions, `6-10px` component radii, and `12px` dialogs.
- Do not add glass blur, gradients, glow, oversized icons, negative letter spacing, or viewport-scaled font sizes.
- Mobile shell rows are explicit: top bar row 1, workspace row 2, bottom navigation row 3. Do not rely on CSS Grid auto-placement for fragment children.

## Accessibility

- Mobile targets are at least `44x44px`; desktop icon controls are at least `36x36px`.
- Use the full accessible name even when the visible mobile label is shortened. Example: visible `导图`, `aria-label="思维导图"`.
- Filters use `aria-pressed`; segmented views use tab semantics only when they switch real views.
- Destructive batch/admin actions require confirmation. A single local delete may use immediate deletion only when Undo is guaranteed.
- Every mobile screen exposes exactly one visible `[data-scroll-owner]`; an open overlay becomes the sole owner.

## Common Mistakes

- Hand-rolling another focus trap instead of using `Dialog`.
- Mutating a parent scroll-owner from a lazy child effect. The shell route state must declare the owner synchronously.
- Testing shortened visible labels instead of accessible names.
- Assuming an element locator searches itself; descendant locators do not include the dialog root.
- Adding a new global CSS file to win the cascade rather than repairing the owning v2 module.
