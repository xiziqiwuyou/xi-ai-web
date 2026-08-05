# Admin Console Design System

> Executable layout and interaction rules for the address-only `/xizi2333` application.

## Information Architecture

Admin navigation is ordered by operator workflow rather than implementation ownership:

1. `运行总览`: service health and operational status.
2. `AI 能力`: model catalog, tool permissions, and workflow publication.
3. `内容与展示`: assistants, applications, prompt presets, and public menu configuration.
4. `知识库`: overview, accounts, registration, limits, jobs, and audit.
5. `系统与安全`: site settings and the global audit log.

Every destination keeps its existing `AdminSectionId`, API contract, draft state, and destructive confirmation behavior. Reordering navigation must not change persistence or backend route ownership.

## Shell Geometry

- The shell fills `100dvh` and has one 58px utility header.
- Desktop uses a `288px minmax(0, 1fr)` layout with a 12px outer gutter. The sidebar and content canvas must never create document overflow.
- The sidebar is the navigation surface. The content track is a canvas, not another decorative card around every destination.
- `.admin-console` is the single desktop scroll owner. `.admin-console-inner` fills the available track up to 1680px.
- The page header is compact: group breadcrumb, title, and one useful description. Do not render English eyebrows or duplicate destination titles inside sections.
- Mobile hides the sidebar and exposes one sticky grouped destination picker. It remains the only page scroll owner when no dialog is open.

## Surface Hierarchy

Use no more than three levels:

1. Canvas: `--xhs-bg`.
2. Primary panel: `--xhs-surface` with one `--xhs-line` border.
3. Interactive row/control: transparent at rest, `--xhs-soft-2` on hover, and `--xhs-soft` when selected.

Do not place a generic bordered `.admin-section` inside a second generic bordered content card. Feature-owned repeated records may be cards; page shells and section bands are not decorative cards.

## Rhythm And Type

- Outer shell gutter: 12px desktop, 0px mobile.
- Content padding: 20-28px desktop, 12px mobile.
- Page/section gap: 14px; field gap: 8px; compact row gap: 4px.
- Desktop navigation and list rows: 42-44px minimum. Mobile controls: 44px minimum.
- Form controls: 40px desktop, 44px mobile.
- Page title: 22px/1.25. Section title: 15-17px. Body: 13px. Metadata: never below 10px.
- Use the shared UI font stack and weight for hierarchy. Do not create hierarchy with opacity on text.

## Navigation Contract

- First-level group buttons expose an icon, label, destination count, `aria-expanded`, and `aria-controls`.
- Only one group is expanded at a time. Opening a destination expands its owner group and collapses the previous group.
- An expanded group is one unified bordered surface. Its first-level button and second-level destination grid share the same horizontal boundary; never restore external child indentation.
- Second-level destinations use one compact tile per row at every desktop width. The grouped mobile select continues to replace the sidebar below `760px`.
- Destination tiles use a stable 48-50px target, one small rounded icon well, a 10px radius, a low-contrast border, and no shadow or underline. The active destination uses a low-contrast primary fill plus a solid primary icon well without changing geometry.
- Header commands remain `返回前台` and `退出`, with Lucide icons and stable accessible names.

## Workbench Pattern

The model catalog is the reference implementation for list-detail Admin destinations:

- Columns own a heading, one bounded scroller, and one footer action region.
- The inspector owns editing and saving; list columns own create, delete, selection, and ordering.
- Rows use compact metadata, stable drag/move controls, local error feedback, and no success toast after reorder.
- Scrollbars reserve geometry and reveal a low-contrast thumb only while scrolling.
- Capabilities use wrapping `aria-pressed` toggles; labels are never truncated.

Other list/detail destinations should reuse this ownership pattern before adding new one-off cards or nested forms.

## Bento Card Pattern

- Use asymmetric card spans only for repeated operational summaries where different information weights are real. Do not turn forms, page shells, or explanatory copy into decorative cards.
- A desktop operational row may use a 12-column Bento grid. Every card keeps the same 12px radius, 1px border, no shadow, and stable internal type scale.
- Preserve progressive disclosure: first-level groups communicate scope, expanded destination tiles expose the next action, and detailed forms appear only after navigation.
- Interaction feedback is limited to border/fill/icon color transitions. No glass, gradient, bounce, scale, or layout-changing hover behavior.
- Figma reference: `https://www.figma.com/design/9L4qtWR33FEwLMZUqC9slS?node-id=4-3`.

## Scenario: Model Invocation Statistics

### 1. Scope / Trigger

- Trigger: any model-backed public route tracked by the Admin operations overview.

### 2. Signatures

- Storage: `data/model-usage.jsonl`, one bounded JSON object per completed invocation.
- Admin response: `GET /api/admin/ops -> AdminOpsPayload.modelInvocations[]`.

### 3. Contracts

- Stored fields are limited to `modelId`, `displayName`, `requestModel`, `vendor`, `operation`, `status`, `durationMs`, and `createdAt`.
- Never store API keys, base URLs, prompts, attachments, response text, tool arguments, knowledge content, or user identifiers.
- The Admin response groups the latest 5,000 valid events by model and returns calls, success/error/cancelled counts, latest time, average duration, and total duration.
- The log compacts after crossing 8 MB and retains the newest 5,000 normalized records.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing model ID or request model | Reject the event without affecting the request |
| Invalid duration | Store `0` |
| Invalid status | Normalize to `error` |
| Malformed JSONL line | Ignore it during aggregation |
| Log write failure | Preserve the user request; omit only the telemetry event |
| Log read failure | Return an empty summary; never fail the Admin operations response |

### 5. Good/Base/Bad Cases

- Good: a streamed chat finishes, records one event, and appears in Admin with its real elapsed time.
- Base: an upstream request fails and increments the model's error count.
- Bad: storing request bodies, credentials, URLs, or generated content in the usage log.

### 6. Tests Required

- Server tests assert aggregation math, catalog label refresh, malformed-line tolerance, non-fatal read/write failures, and secret absence.
- Admin E2E asserts model rows, calls, timestamps, durations, one-column navigation, and mobile containment.

### 7. Wrong vs Correct

```js
// Wrong: telemetry captures the entire request.
store.record({ ...req.body, durationMs });

// Correct: the tracker constructs an allowlisted event.
store.record({ modelId, requestModel, vendor, operation, status, durationMs, createdAt });
```

## Responsive Rules

- `>1100px`: full sidebar and destination canvas; the model workbench remains viewport-bound with internal list/inspector scrolling.
- `761-1100px`: 228px sidebar, the same one-column destination list, reduced canvas padding, and responsive feature grids.
- `<=760px`: sidebar removed, sticky grouped select shown, one-column content, 44px targets, no horizontal overflow.
- Test at `1440x900`, `1280x800`, `390x844`, and `375x812`.

## Accessibility And Verification

- Mount exactly one destination section.
- Keep one visible page scroll owner; dialogs temporarily become the sole owner.
- All group buttons and destination buttons are keyboard reachable and retain visible focus rings.
- Selected navigation uses `aria-current="page"`; group expansion is truthful.
- Verify every `AdminSectionId` is reachable from desktop navigation and the grouped mobile picker.
- Verify document width and `.admin-console` width never exceed their viewport/container by more than 1px.

## Forbidden Patterns

- No destination-specific outer width override or `:has()` shell rule.
- No English eyebrow labels, duplicate page titles, nested generic cards, gradients, glass blur, or navigation shadows.
- No second navigation source for mobile.
- No visual refactor that moves Admin draft state out of `AdminConsole` or changes API payloads.
