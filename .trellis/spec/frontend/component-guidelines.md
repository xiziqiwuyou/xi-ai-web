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
- A maximum `16px` radius. Backdrop blur is allowed only on the scrim while `.figma-session-settings` or `.figma-agent-dialog` is open, matching the authoritative Figma overlays.

The required first-use API dialog passes `canClose={false}` until the existing provider readiness rule is satisfied. Do not add a second close path.

The public workspace-data dialog is separate from the required BYOK dialog. Its desktop/mobile trigger is an icon action outside the eight destination buttons. During destructive replace confirmation, hide the workspace-data dialog so exactly one visible dialog and one `data-scroll-owner="dialog"` remain.

Browser-local automation pages live under `src/features/automation/`. Agents and workflows are public pages; Skills remain browser-local records managed from Chat. Keep executable code out of Skill definitions, send resolved Skill text only through the user-initiated Chat request, and use the restricted Start/Agent/Text Template/Local Knowledge Retrieval/Reply graph canvas for workflows. Workflows open from a saved-card catalog into a single full-width detail editor; do not restore a permanently mounted workflow list beside the canvas.

Agents use the same two-level information architecture: a searchable/category-filtered card catalog first, then one dedicated editor and test runner. Cards summarize model, Skill, tool, local-knowledge, and update metadata. The editor may bind IndexedDB knowledge documents, but request text/chunks are resolved only at run time and never copied into the saved Agent definition.

The public Assistant library renders the actual enabled bootstrap records. Category, tags, and starter prompts come from the `Assistant` contract; do not restore hard-coded decorative profiles or index-based mapping to unrelated assistant IDs. Starter prompts are selectable visible drafts and never auto-send. Chat shows the assistant bound to each conversation on desktop and mobile.

Admin uses a controlled two-level information architecture. First-level sidebar groups are real buttons with `aria-expanded` and `aria-controls`; second-level destinations share one typed `AdminSectionId` source with the grouped mobile select. Mount only the active destination section so operations, model, assistant, application, prompt, and audit forms are not all present in the document. Keep form drafts in `AdminConsole` so destination switches do not discard unsaved input.

Knowledge operations are one Admin navigation group with exactly six destinations: overview, accounts, registration/invites, limits, jobs/storage, and knowledge audit. `KnowledgeAdminSection` mounts only the selected destination, uses the shared Admin confirmation flow for destructive account actions, and never renders secrets from list/read payloads. Newly issued invite/reset plaintext is a live, one-time callout; navigating away intentionally destroys that value rather than moving it into `AdminConsole`, browser storage, or a toast history.

The jobs/storage destination keeps one transient operation-reason field. Failed/cancelled jobs expose Retry; queued/running/retry jobs expose Cancel through the shared destructive confirmation dialog. Replace the matching `KnowledgeAdminJob` projection in memory after success, and never surface lease-owner or raw error-detail fields. Job rows must remain single-column on mobile and must not create document overflow when action buttons appear.

The Chat composer uses `$` for Skill commands and `/` for enabled application commands. Keep keyboard focus in the textarea while the listbox is visible, use Arrow keys/Enter/Escape plus touchable option buttons, and render selected items as removable composer tags rather than visible command syntax.

Tool-bearing Skills are available in Chat when the selected model and server catalog are compatible. Disabled command/settings rows show the specific model, vendor, admin, search-config, or context reason. The network-search control requests `web_search`, checks administrator enablement plus the independent search-session config, and never depends on the selected main model's `webSearch` or `toolCalling` capability. Clicking an unconfigured search control opens the shared GLM/Kimi search dialog; prompt copy must not simulate search. Skill and Agent tool pickers distinguish local execution, independent search, and provider-hosted execution; Admin presents the same ownership boundary.

Controlled React Flow nodes must declare stable card dimensions so edge routing, fit bounds, and MiniMap nodes share the same geometry. Keep the default viewport readable, expose a compact colored MiniMap plus an explicit fit control, and do not automatically shrink a multi-node graph until labels become unreadable. Browser tests must assert both the MiniMap node count and the fit-control result.

## Props And Composition

- Define component props with named `type` declarations and use domain types from `src/types.ts` for shared contracts.
- Pass commands as callbacks; do not make presentation components import root state or persistence helpers.
- Prefer one functional panel with internal dividers. Do not place cards inside cards solely to create depth.
- Use Lucide icons already installed in the project. Icon-only controls require an accessible name and `title`.

## Styling

- Global CSS is imported through `src/styles.css`; import order is a compatibility contract.
- The `rednote-flat-v2.*.css` files are the authoritative active layer. Extend the module-owned file instead of adding a trailing override sheet.
- Public workspaces use the exact Figma Make tokens: light `#f5f8ff / #10203d / #2368e8`, dark `#080c14 / #0f1623 / #4f8dff`, `16px` radii, and quiet blue-gray borders.
- Active UI metadata never renders below `10px`. Use the shared `--font-ui` / `--font-mono` stacks so Chinese text reaches `PingFang SC` or `Microsoft YaHei UI` before a generic sans-serif or monospace fallback.
- Text-bearing filled primary surfaces use `--xhs-primary-fill` with `--xhs-on-primary`; reserve the brighter dark `--xhs-red` token for links, focus, progress, and icon accents where the contrast contract differs.
- Styled range controls must explicitly reset the legacy global input border, padding, minimum height, background, and box shadow. Keep the visual track/progress separate from the mobile hit area so desktop remains compact and mobile still provides a `44px` target.
- At the acceptance desktop viewports, `.figma-studio-shell` reserves a fixed `224px` `.figma-sidebar`; the workspace owns the remaining `minmax(0, 1fr)` track.
- Below `1024px`, `.figma-mobile-header` replaces the desktop rail and `.figma-sidebar.mobile-open` becomes a single vertical function menu. There is no top module strip or bottom navigation.
- At `1024px` and above, keep the authored `224px` rail and `32px` shell gap; do not reintroduce the retired tablet compression rule.
- Shared authored parameter menus use `FigmaMenu` with a `16px` trigger/popover radius, visible selected state, outside-pointer dismissal, Escape dismissal, and trigger focus restoration.
- Studio generation pages use the shared `StudioModelSelect` projection over the developer-managed catalog. PPT, Mind Map, and Translation filter enabled `chat`-capable models, expose page-specific accessible names plus current-value descriptions, lock selection during in-flight generation, and pass the selected model ID through the existing request rather than introducing module-specific model capabilities.
- Scrollable model lists reserve a stable scrollbar gutter. When the product calls for an auto-hiding scrollbar, keep the scrollbar width constant and change only its visual color during a debounced scroll state; toggling `overflow`, scrollbar width, or `display` causes row-width jitter.
- Chat's vendor tablist and model list own independent debounced scroll-active states. Both reserve `scrollbar-gutter: stable`, keep a fixed `4px` WebKit width, and reveal only a semi-transparent tokenized thumb (`0.42` light / `0.46` dark); scrolling one column must not reveal or resize the other.
- The selected Chat model vendor uses a borderless `10px` pill with a `16%` red-to-surface background mix and at least `700` font weight. Inactive vendors remain transparent and hover uses only a `5%` tint so selection is always the strongest state without changing tab dimensions.
- Chat's custom vendor/model list groups options with `4px` grid gaps and local `10px` row radii. Model rows have no divider border and rest on a transparent background; hover/focus and selected fills provide separation without a table-like surface. Preserve the `46px` row height and verify computed `border-bottom-width: 0px`, radius, gap, popover geometry, and scrollbar widths in browser tests.
- The public shell switches to mobile navigation below `1024px`; controls introduced into that shell range must keep at least `44px` touch height even when their full stacked mobile composition begins at a narrower breakpoint.
- Hero emphasis phrases stay as inline text with `white-space: nowrap`; using `display: inline-block` inserts a separator in the accessibility tree and changes exact heading names.
- Approved gradients are limited to `.figma-brand-mark`, the authored `.figma-ppt-stages` creation panel, and the dotted `.figma-map-canvas` pattern. Do not add other page gradients, persistent glass blur, decorative glow, negative letter spacing, or viewport-scaled font sizes.
- The first-use BYOK dialog contains only the Figma-style heading, API URL, API Key, key visibility control, and save command. Do not restore provider presets, summaries, readiness cards, reset actions, or a persistent public API button.

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
- Reintroducing the retired `.studio-*`, horizontal, or bottom navigation after the exact shell moved to `.figma-*` rail/header/menu primitives.
- Adding compatibility controls to a Figma destination instead of keeping compatibility behind the visible destination frame.
- Mapping multiple visual Assistant cards to the same backend assistant by keyword or array position.
- Mounting the Agent catalog, editor, and runner side by side so every configuration form is visible before a card is opened.
