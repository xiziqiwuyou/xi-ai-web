# Technical Design

## Information Architecture

```text
Model catalog workbench
  Vendor rail
    -> active vendor
    -> inline add vendor action
    -> guarded delete vendor action
  Model list
    -> configured model row | available preset row | blank draft
  Detail inspector
    -> model form and save/delete actions
```

The component owns only visual selection state (`activeVendorId`) and the temporary inline add-vendor form. `AdminConsole` remains the owner of bootstrap data, selected model ID, draft data, API save/delete commands, and confirmation flow.

## Data Contract

```ts
type ModelVendorEntry = {
  id: string;
  label: string;
  adapter: ProviderKind;
  enabled: boolean;
  order: number;
};

type ModelCatalogEntry = {
  vendorId: string;
  vendor: ProviderKind;
  // existing model fields remain unchanged
};
```

`vendorId` owns display grouping. `vendor` remains the normalized runtime adapter. The server resolves `vendor` from the referenced `ModelVendorEntry.adapter` on every Admin model create/update, so a client cannot create an unsupported adapter mapping.

Default vendor IDs equal the existing provider kinds. Versioned normalization creates these vendors for old metadata and assigns missing model `vendorId` values from the legacy `vendor`. Catalog deduplication includes `vendorId`, allowing two administrator-defined vendors using the same adapter to expose the same upstream model name without being merged.

## Interaction Rules

- Selecting a vendor selects its first configured model. For an empty vendor, it opens a blank draft scoped to that vendor without persisting anything.
- Creating a vendor requires a display name and one supported adapter. The returned vendor becomes active without creating a model.
- Deleting a vendor is available beside the add action. It is disabled while the vendor contains models; the server enforces the same invariant and also retains at least one vendor.
- Configured rows call `onSelect(id)` and render as active when their ID equals `selectedModelId`.
- Available preset rows call `onApplyPreset(id)`, set the active vendor, and render the form as an unsaved draft. They never call the create API directly.
- The model-column footer “new model” action calls `onCreate(vendorEntry)`. Parent state stores `vendorId`, derives `vendor` from `adapter`, and uses that adapter's default endpoint protocol.
- Changing the vendor inside details also updates `activeVendor`, so a saved model cannot disappear from the visible list unexpectedly.
- Model and vendor deletion remain parent-owned and confirmed through the existing Admin confirmation dialog; both triggers live in their list-column footers.
- The endpoint protocol selector is conditional on `chat`. Non-chat models retain the stored compatibility field but do not expose it as an active media routing choice; the inspector instead projects the vendor adapter's dedicated request channel.

## Layout

- Desktop (`>= 1180px`): the shared Admin content container fills the available content track up to 1680px. The model workbench uses a 176px vendor rail, 288px model list, and flexible detail inspector inside that common boundary.
- Mid width: vendor rail becomes a horizontal scrollable row; model list and details remain two columns.
- Mobile (`<= 760px`): one column, order vendor rail -> model list -> inspector; all actions retain 44px touch height.

## Visual Contract

- The workbench is divided with quiet borders instead of nested cards.
- Vendor/model rows are neutral by default, use a small red-tint selected background, and use consistent small radii.
- Capabilities/defaults are two quiet setting groups. Each group has a title and helper line, one contained list surface, compact check rows, subtle internal dividers, and a quiet checked fill. Typography follows the surrounding Admin form instead of introducing heavier isolated card labels.
- The detail action bar owns save only. Creation and deletion stay in the matching list-column footer so the three workbench columns use one consistent frame.
- Media-only endpoint copy is rendered as a quiet read-only channel summary, never as a selectable Chat/Responses control.
- Admin destination width is a shell contract, not a feature exception. `.admin-console-inner` owns the shared cap and responsive padding; feature sections own only their internal grids.

## Test Plan

- Extend Admin E2E to select Kimi from the vendor rail, open an available preset, assert no mutation before save, save it, reload, then verify it appears under Kimi.
- Assert the endpoint selector and name mapping still work from the right inspector.
- Add an empty custom vendor, select it, create a model draft under it, and verify the adapter/vendor ID payload boundary.
- Delete the empty custom vendor through confirmation, then verify an existing vendor with models cannot be deleted in either UI or API fixture.
- Cover old metadata migration, model-vendor round trip, and metadata import/export retention.
- Keep desktop/mobile overflow and one-scroll-owner assertions.

## Global Model Ordering

`ModelCatalogEntry.order` is a normalized non-negative integer. Registry normalization backfills missing values from source array position, sorts by `order` with source position as the stable tie-breaker, and compacts the result to consecutive values. New models append to the end so creation does not silently replace an operational default.

The Admin mutation is atomic:

```text
PATCH /api/admin/model-catalog/order
{ modelIds: string[] } -> ModelCatalogEntry[]
```

The request must contain every current model ID exactly once. Validation completes before mutation. The response is the complete normalized catalog, which becomes the only Admin/public ordering source.

The current vendor's configured model rows own ordering directly. Pointer users drag rows; keyboard and touch users use explicit move-up/move-down icon buttons. The client replaces only positions occupied by that vendor inside the ordered global catalog, then sends the complete model-ID list to the atomic endpoint. This preserves every other vendor's relative order while keeping capability-wide defaults deterministic. Successful moves are silent; save failures appear inline.

Frontend selection keeps explicit user intent first:

```text
valid lastModelId -> first enabled compatible model by order
```

Legacy `defaultFor` values remain round-trip metadata only. They are not shown in the inspector and do not override order, preventing two competing default mechanisms.

## Density refinement

The Admin destination header remains the single page identity. `AdminModelsSection` starts with the workbench and renders validation only when `modelIssues.length > 0`. The middle-column heading is informational; configured rows own ordering and the footer owns creation/deletion.

The middle column gains one `.admin-model-list-scroll` owner around configured models, unsaved draft, and presets. Its desktop maximum height equals approximately eight standard rows; `scrollbar-gutter: stable` prevents content-width movement. Vendor navigation and the detail inspector remain outside this scroller.

Model ownership is immutable from the detail inspector. `vendorId` and runtime `vendor` continue to live in the parent draft and request payload, but they are set by the active vendor route, preset application, or model selection rather than a duplicate select. The display/request name inputs remain editable; the read-only mapping preview is removed.

Capabilities use one labelled group with an eight-column wide-screen checkbox grid. The group removes helper copy and table-like separators. Responsive breakpoints use five columns at 1440-class widths, three at 1280-class widths, then three/two columns on mobile while preserving readable labels and 44px mobile targets.

## Vendor order and scroll refinement

`ModelVendorEntry.order` remains the source of display order. Add one atomic Admin mutation:

```text
PATCH /api/admin/model-vendors/order
{ vendorIds: string[] } -> ModelVendorEntry[]
```

The payload must contain every current vendor ID exactly once. Validation finishes before mutating metadata; successful writes compact `order` to consecutive integers and return the complete normalized vendor array.

The vendor rail renders a dedicated `.admin-model-vendor-list-scroll` around only the vendor rows. Desktop rows are native draggable targets with a visible grip handle; touch and keyboard users receive move-up/move-down icon controls. Reordering updates local component order for immediate feedback, then persists the complete ID list. A failed save restores the parent-provided order and exposes an inline error.

Vendor and model lists share one scroll-activity pattern: fixed scrollbar geometry and `scrollbar-gutter: stable`, transparent idle thumb, `.is-scrolling` low-opacity thumb, and a debounced 520ms fade after scroll. Width/display/overflow never toggle. Desktop vendor height fits six 42px rows; model height fits six standard 68px rows plus group labels. Mobile uses the same internal-scroll behavior rather than expanding either list indefinitely.

## Admin shell design-system extension

The model workbench becomes the reference interaction pattern, while the overall Admin shell removes redundant surface nesting. `AdminConsole` remains the state/API coordinator and still mounts one active section. `AdminNavigation` remains the desktop navigation renderer. `adminNavigationGroups` remains the shared desktop/mobile source.

The information architecture changes without changing section IDs:

```text
运行总览      -> overview
AI 能力       -> models, tools, workflows
内容与展示    -> assistants, apps, prompts, menus
知识库        -> knowledge-overview, knowledge-accounts, knowledge-registration,
                 knowledge-limits, knowledge-jobs, knowledge-audit
系统与安全    -> site, audit
```

Each group gains a Lucide icon. `AdminNavigation` renders the icon, label, item count, and chevron in the first-level button. Expansion becomes accordion-like: opening or toggling a group replaces the expanded ID array with zero or one ID. This reduces vertical noise while preserving the existing controlled state and ARIA contract.

The shell keeps a compact global utility header. The layout canvas uses the project background; the sidebar is one bordered navigation panel, while `.admin-console` becomes an unframed scroll track. `.admin-console-inner` owns the shared 1680px boundary. The active page header derives its breadcrumb from the owning navigation group and no longer renders the English `eyebrow` metadata.

Generic `.admin-section` remains the functional page panel. The removed `.admin-console` border prevents a generic card inside a generic card. Model-specific viewport ownership continues to use the existing `is-models-active` selectors and internal workbench scrollers.

Responsive behavior keeps the grouped mobile select generated from the same `adminNavigationGroups` source. The content header and section margins contract without changing the active section or form draft state.

## Admin navigation card-grid refinement

`AdminNavigation` remains the sole desktop renderer and keeps `adminNavigationGroups` as the shared source. Each group receives an explicit `is-expanded` class so the surface can be styled without `:has()`. The expanded group wrapper owns its border and fill; the group toggle and destination grid remain siblings with the same left boundary.

Destination buttons gain one icon-well wrapper and use one full-width row throughout the desktop sidebar. The existing mobile grouped select takes over at 760px.

The operations summary uses a 12-column Bento row with asymmetric spans based on information density. No data, event, storage, or API behavior changes. Visual states use only fill, border, and icon color transitions.

Figma frame: `https://www.figma.com/design/9L4qtWR33FEwLMZUqC9slS?node-id=4-3`.

## Model invocation statistics refinement

The Admin overview requires real call data rather than decorative values. `server/model-usage.mjs` owns a bounded append-only JSONL store under `DATA_DIR`. Response lifecycle tracking starts immediately before a provider invocation and records only allowlisted model metadata, status, elapsed milliseconds, and timestamp. Tracking failure never changes the model request result.

`buildAdminOpsPayload()` aggregates the latest 5,000 records by model. `AdminOverviewSection` renders model, calls, last invocation, average duration, and total duration. Desktop uses a dense table-like grid; mobile hides the header and projects each row into a two-column record card without document overflow.
