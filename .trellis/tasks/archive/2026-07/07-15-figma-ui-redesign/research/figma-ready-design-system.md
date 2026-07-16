# Figma-Ready Design System

## 1. Design Intent

The redesign is a compact red-and-white AI workbench with flat surfaces, small radii, and iOS-like tactile feedback. It should feel like a serious creation tool rather than a marketing page or a stack of decorative cards.

Core rules:

1. Red is the action and selection color, not the page background.
2. White is the main working surface; pale neutral pink is reserved for subtle grouping.
3. One container per functional region. Use spacing and dividers inside it; do not nest cards.
4. Default radii are `6-10px`; `12px` is reserved for sheets and dialogs; pills are only for tags and segmented controls.
5. Icons are `16-20px` in controls and never used as oversized empty-state decoration.
6. Explanatory copy is brief and contextual. Visible UI should not describe the design or restate obvious controls.
7. Every interactive state is specified in Figma: default, hover, pressed, focus, disabled, loading, selected, error, and success where applicable.

## 2. Information Architecture

### Confirmed Public Destinations

| Route key | Chinese label | Desktop navigation | Mobile navigation | Responsibility |
| --- | --- | --- | --- | --- |
| `chat` | 对话 | Direct item | Direct tab | Conversations and assistant interaction. |
| `image` | 绘画 | Direct item | Direct tab | Image creation, preview, and local recent images. |
| `mindmap` | 思维导图 | Direct item | Direct tab labeled `导图` | Mind-map generation, canvas, source, export. |
| `agents` | 智能体 | Direct item | Direct tab | Role, permissions, trace, final output. |
| `apps` | 应用 | Direct item | More sheet row | Preset workflow discovery and execution. |
| `gallery` | 画廊 | Direct item | More sheet row | Cross-module local output library. |

Desktop presents all six destinations. Mobile uses four primary tabs plus `更多`, matching a native iOS navigation density:

`对话` / `绘画` / `导图` / `智能体` / `更多`

The More sheet contains `应用`, `画廊`, API connection status, and no admin link.

### Drawing and Gallery Reconciliation

- Drawing owns creation controls and a recent-images strip scoped to image outputs.
- Gallery owns the complete cross-module asset collection.
- Both use the same `Asset/Thumbnail`, `Asset/Card`, and `Asset/Detail` components.
- “Open in Gallery” links from Drawing to Gallery with the current asset selected.
- “Replay” from Gallery routes back to the source module with its prompt restored.

## 3. Figma File Structure

Create these pages in order:

1. `00 Cover & Decisions`
2. `01 Foundations`
3. `02 Components`
4. `03 Desktop Screens`
5. `04 Mobile Screens`
6. `05 Dialogs & Sheets`
7. `06 Prototype Flows`
8. `07 Redlines & Handoff`

Use sections within each page and name frames with slash-separated hierarchy:

- `Desktop/Chat/Empty`
- `Desktop/Chat/Conversation`
- `Mobile/Drawing/Input`
- `Component/Button/Primary/Default`
- `Component/Input/Text/Error`

## 4. Frames and Grids

### Reference Frames

| Frame | Size | Purpose |
| --- | ---: | --- |
| Desktop Large | `1440 x 900` | Primary design and implementation reference. |
| Desktop Compact | `1280 x 800` | Minimum full desktop workbench. |
| Tablet Portrait | `834 x 1194` | Stacked workbench and compact navigation. |
| Mobile Standard | `390 x 844` | Primary mobile reference. |
| Mobile Small | `375 x 812` | Small-width regression frame. |

### Desktop Grid

- Columns: `12`.
- Outer margin: `24px` at 1440, `20px` at 1280.
- Gutter: `16px`.
- App header: `56px` high.
- Header-to-content gap: `12px`.
- Content frame height: viewport minus header, outer margins, and gap.
- Workbench control rail: `304px`; may expand to `320px` for Drawing and Agents.
- Rail-to-main gap: `12px`.
- Minimum main area: `640px`.
- Maximum readable text result width: `760px`; result regions may be wider, but prose remains constrained.

### Tablet Grid

- Columns: `8`.
- Outer margin: `20px`.
- Gutter: `12px`.
- Header navigation may switch to compact icon + label items or a More menu.
- Workbench becomes a `280px` inspector plus flexible main area in landscape; portrait uses stacked sections.

### Mobile Grid

- Columns: `4`.
- Outer margin: `16px`.
- Gutter: `12px`.
- Top title bar: `52px`.
- Bottom tab bar: `56px` plus `env(safe-area-inset-bottom)`.
- Scrollable content bottom padding: `72px + safe-area`.
- Sticky primary action region: `60px` plus safe-area when present.
- No content frame uses `overflow: hidden` when its content can exceed the viewport.

## 5. Figma Variables

Create a collection named `XI Foundations` with Light mode.

### Color Variables

| Variable | Value | Usage |
| --- | --- | --- |
| `color/bg/canvas` | `#F7F5F6` | App background. |
| `color/bg/surface` | `#FFFFFF` | Main panels, sheets, dialogs. |
| `color/bg/subtle` | `#FCF7F8` | Grouped fields and selected-neutral regions. |
| `color/bg/pressed` | `#F3ECEE` | Neutral pressed state. |
| `color/border/default` | `#E7E1E3` | Default border and divider. |
| `color/border/strong` | `#CFC5C9` | Hover or emphasized border. |
| `color/text/primary` | `#1C191B` | Main text. |
| `color/text/secondary` | `#6E666A` | Supporting text. |
| `color/text/tertiary` | `#989095` | Placeholder and quiet metadata. |
| `color/accent/default` | `#FF2442` | Primary action and selected state. |
| `color/accent/hover` | `#F01837` | Hover. |
| `color/accent/pressed` | `#D91431` | Pressed. |
| `color/accent/subtle` | `#FFF0F3` | Selected background and badges. |
| `color/accent/border` | `#FFC2CC` | Accent outline. |
| `color/focus` | `#0A84FF` | Keyboard focus ring; intentionally distinct from selection. |
| `color/success/default` | `#168F5B` | Connected, completed. |
| `color/success/subtle` | `#EEF9F3` | Success background. |
| `color/warning/default` | `#A96800` | Warning text/icon. |
| `color/warning/subtle` | `#FFF7E8` | Warning background. |
| `color/danger/default` | `#D92D45` | Destructive actions and errors. |
| `color/danger/subtle` | `#FFF0F2` | Error background. |
| `color/overlay` | `rgba(18, 14, 16, 0.36)` | Modal scrim; no blur. |

Contrast targets:

- Body text: minimum `4.5:1`.
- Large text and icons: minimum `3:1`.
- Disabled content is exempt but must remain legible enough to identify the control.

### Typography Variables and Text Styles

Font family:

`SF Pro Text` / `PingFang SC` / `Microsoft YaHei` fallback.

No negative letter spacing. Use Optical sizing only if the selected Figma font supports it consistently.

| Style | Size / line | Weight | Usage |
| --- | --- | ---: | --- |
| `Display/Section` | `24 / 32` | 700 | Page or major workspace title only. |
| `Heading/1` | `20 / 28` | 700 | Panel and modal title. |
| `Heading/2` | `16 / 24` | 650 | Section title. |
| `Heading/3` | `14 / 20` | 650 | Compact card/list title. |
| `Body/Regular` | `14 / 22` | 400 | Standard content. |
| `Body/Medium` | `14 / 22` | 550 | Controls and emphasized body. |
| `Label/Regular` | `13 / 18` | 500 | Field labels. |
| `Label/Strong` | `13 / 18` | 650 | Buttons and selected labels. |
| `Caption/Regular` | `12 / 18` | 400 | Metadata and helper text. |
| `Caption/Strong` | `12 / 18` | 600 | Badges and statuses. |
| `Code/Regular` | `13 / 20` | 400 | Source and code output. |

### Spacing Variables

Collection prefix: `space/`.

`0`, `2`, `4`, `6`, `8`, `12`, `16`, `20`, `24`, `32`, `40`, `48`, `64`.

Rules:

- Inline icon gap: `6px`.
- Compact control gap: `8px`.
- Form field gap: `12px`.
- Section gap: `20px`.
- Major layout gap: `24px` maximum.
- Do not compensate for unclear hierarchy by adding more containers.

### Radius Variables

| Variable | Value | Usage |
| --- | ---: | --- |
| `radius/none` | `0` | Dividers and edge-to-edge sections. |
| `radius/xs` | `4px` | Small badges and inline states. |
| `radius/sm` | `6px` | Buttons, chips, compact controls. |
| `radius/md` | `8px` | Inputs, cards, list selections. |
| `radius/lg` | `10px` | Panels and popovers. |
| `radius/xl` | `12px` | Dialogs and sheets. |
| `radius/full` | `999px` | Tags, avatars, true pills only. |

### Elevation Variables

The system is flat by default.

| Variable | Value | Usage |
| --- | --- | --- |
| `elevation/none` | none | Panels, cards, inputs. |
| `elevation/raised` | `0 4px 14px rgba(28, 20, 23, 0.08)` | Menus, sticky controls. |
| `elevation/popover` | `0 10px 28px rgba(28, 20, 23, 0.14)` | Popovers and dialogs. |
| `elevation/pressed` | `inset 0 1px 2px rgba(28, 20, 23, 0.12)` | Pressed tactile state. |

No glass blur, translucent panel backgrounds, gradient borders, or decorative glow.

### Icon Variables

- Standard icon: `16px`.
- Prominent control icon: `18px`.
- Navigation icon: `18px` desktop, `20px` mobile.
- Empty-state icon: maximum `24px`.
- Stroke: library default, normally `2px`.
- Icon-only button target: `36px` desktop, `44px` touch.

## 6. Core Components

Build every component with Auto Layout and expose component properties in Figma.

### `Navigation/DesktopItem`

Properties:

- `state`: Default / Hover / Pressed / Active / Focus / Disabled.
- `icon`: instance swap.
- `label`: text.
- `showLabel`: boolean for compact tablet mode.

Specification:

- Height `36px`.
- Horizontal padding `12px`.
- Gap `6px`.
- Radius `8px`.
- Active: accent background, white text/icon.
- Default: transparent background, primary text.
- No equal-width expansion; items hug content.

### `Navigation/MobileTab`

- Width: fill one of five equal slots.
- Minimum height: `52px` before safe-area.
- Icon `20px`, label `10/14` medium.
- Active uses accent icon/text and a `2px` top indicator or subtle background, not a large filled pill.
- More tab opens `Sheet/MoreNavigation` containing Apps and Gallery.

### `Button`

Variants:

- Kind: Primary / Secondary / Quiet / Danger.
- Size: Compact `32px` / Default `36px` / Touch `44px`.
- State: Default / Hover / Pressed / Focus / Disabled / Loading.
- Icon: None / Leading / Trailing / IconOnly.

Rules:

- Primary is solid red with white text.
- Secondary is white with default border.
- Quiet has no border until hover/focus.
- Danger is red text on white by default; solid danger only inside confirmation dialogs.
- Loading preserves width and replaces the leading icon with a spinner.

### `Field/Text`, `Field/Search`, `Field/Select`, `Field/Textarea`

Structure:

1. Visible label.
2. Optional value/status at the right.
3. Control.
4. Helper or error text.

States: Empty / Filled / Hover / Focus / Disabled / Error / Success.

Specification:

- Default height `40px`; touch height `44px`.
- Textarea minimum `112px` desktop and `128px` mobile.
- Radius `8px`.
- Padding `12px` horizontal.
- Focus: `2px` focus ring with `2px` offset.
- Error does not rely on color alone; include icon and message.
- Figma annotation must include required `name`, label association, and autocomplete intent.

### `SegmentedControl`

Use only for mutually exclusive views in the same region.

- Container height `36px` desktop, `44px` mobile.
- Padding `3px`.
- Segment radius `6px`.
- Selected segment: white or accent depending on context.
- Full keyboard annotation: Left/Right arrows, Home/End, `aria-selected`.

Filters such as app categories use `FilterChip` with pressed state instead of tab semantics.

### `FilterChip`

- Height `32px` desktop, `40px` touch.
- Radius full.
- Default white/border; selected accent-subtle with accent text and border.
- Property: `selected` boolean.
- Accessibility annotation: `aria-pressed`.

### `Panel`

Variants: Plain / Bordered / Inspector.

- Background white.
- Border default.
- Radius `10px`.
- No shadow by default.
- Internal sections use dividers, not nested cards.
- Padding `16px` desktop, `14px` mobile.

### `ListRow`

- Minimum height `48px` desktop, `52px` touch.
- Optional leading icon/avatar, title, subtitle, metadata, trailing action.
- Selected uses accent-subtle background and accent left indicator.
- Long title truncates to one line; subtitle to two lines.

### `StatusBanner`

Kinds: Neutral / Info / Success / Warning / Error.

- Minimum height `40px`.
- Radius `8px`.
- Icon `16px`.
- One-line default; multiline allowed for errors only.
- Use for API connection, generation errors, and agent run status.

### `Modal` and `Sheet`

Modal widths:

- Small `400px`.
- Default `480px`.
- Large `640px`.

Dialog radius `12px`; no blur; scrim uses `color/overlay`.

Required prototype annotations:

- Focus moves to title or first field.
- Tab is trapped.
- Escape closes only when allowed.
- Closing returns focus to the trigger.
- Background is inert.
- Destructive confirmation names the object and consequence.

Mobile sheets:

- Full width.
- Top corners `12px`.
- Maximum height `90dvh`.
- Bottom padding includes safe-area.
- Drag handle is visual only unless actual dragging is implemented.

### `EmptyState/Compact`

- Left-aligned by default.
- Icon `24px` maximum.
- Title `16/24`.
- One sentence maximum.
- Optional single action.
- Maximum content width `420px`.
- No decorative card around the empty state when it already lives inside a panel.

### `Asset/Thumbnail`, `Asset/Card`, `Asset/Detail`

- Image ratios: Square `1:1`, Landscape `4:3`, Video `16:9`.
- Thumbnail background: subtle neutral.
- Card radius `8px`; image clips to the top corners.
- Asset card contains thumbnail, title, metadata, and one overflow action; no row of four persistent icon buttons.
- Selection mode exposes a checkbox and batch toolbar.
- Figma annotation: implementation uses intrinsic dimensions/aspect ratio and lazy loading below the fold.

## 7. Desktop App Shell

### Header

- Height `56px`.
- White background, bottom border only or `10px` bordered container depending on final shell choice; do not use a large floating pill.
- Brand region width `140px` maximum.
- Brand mark `28px`; product name `14/20` strong.
- Six navigation items follow and hug their content.
- Right side is reserved for connection status and contextual overflow, not global admin/settings.

At widths below `1100px`, show four current-priority items plus More; do not introduce horizontal navigation with a hidden scrollbar.

### Workspace Shell

- Outer padding `16px`.
- Height uses `100dvh` on desktop, with explicit inner scroll regions.
- Panel boundaries use one-pixel borders.
- Main output region receives the largest share of space.

## 8. Desktop Screens

### Chat

Frame: `Desktop/Chat/Conversation`.

- Conversation rail: `248px`.
- Main chat area: remaining width.
- Rail header: New conversation button `36px`; search field `36px`.
- Conversation rows: `56px`, selected left indicator.
- Chat top bar: title left; assistant, model, connection status right; all other actions in More.
- Message content max width `760px`.
- Composer max width `840px`, sticky to chat bottom.
- Empty state: one title, one sentence, three starter prompts.

States to design:

- Empty.
- Existing conversation.
- Streaming.
- Error.
- Attachment tray.
- Conversation delete confirmation and undo toast.

### Drawing

Frame: `Desktop/Drawing/Ready`.

- Inspector: `320px`.
- Main preview: flexible.
- Recent strip: `112px` high at bottom of preview.
- Inspector sections: Connection, Model, Prompt, Presets, Output options, Advanced disclosure, Generate.
- Sections are separated by `1px` dividers; no nested option cards.
- Preview toolbar: asset title, favorite, download, overflow.
- Empty state appears at top-left inside preview, not centered in the full canvas.

States:

- Empty.
- Generating.
- Result selected.
- Multiple recent images.
- Provider error.
- Delete confirmation.

### Mind Map

Frame: `Desktop/MindMap/Canvas`.

- Inspector: `304px`.
- Canvas fills remaining width and height.
- Canvas toolbar: Fit, Zoom out, Zoom in, `100%`, Export, Visual/Source segmented control.
- Source mode replaces canvas content in place.
- Optional node inspector: collapsible `280px` right rail only when a node is selected.
- Generation status appears as a compact banner at canvas top.

States:

- Empty canvas.
- Generating.
- Visual result.
- Source editing.
- Parse error.

### Agents

Frame: `Desktop/Agents/Run`.

- Inspector: `320px`.
- Main content: one vertical run timeline.
- Role and model are compact select fields.
- Tool permissions use toggle rows with name and one-line description.
- Run timeline rows: Started, Tool call, Tool result, Final answer, Failed.
- Final answer is the terminal timeline section, not a nested card inside another result card.
- Trace can be collapsed without hiding the final answer.

States:

- Ready.
- Running.
- Tool call expanded.
- Completed.
- Failed.

### Apps

Frame: `Desktop/Apps/Market`.

- Main market region: flexible.
- Runner/detail pane: `360px`.
- Market toolbar: title/count left, search right, filter chips below.
- App presentation uses dense rows or a `3-4` column grid with minimum `220px` cards, not five compressed cards.
- Selecting an app updates the runner pane; do not repeat the selected app in another nested summary card.
- After run, the pane switches between Setup and Result using a real segmented control.

States:

- Market default.
- Search/filter result.
- App selected.
- Running.
- Result.
- Empty search.

### Gallery

Frame: `Desktop/Gallery/Grid`.

- Full-width flat toolbar.
- Search width `280px`.
- Filter chips for source and favorites.
- Asset grid: `4-6` columns depending on width; `12px` gap.
- Desktop detail inspector: `360px` right rail when an asset is selected.
- Selection mode creates a sticky batch toolbar; Clear All remains inside overflow and requires confirmation.

States:

- Empty.
- Populated grid.
- Filtered.
- Multi-select.
- Detail inspector.
- Delete/clear confirmation.

## 9. Mobile Screens

### Shared Mobile Shell

- Top title bar `52px`, showing current module and one contextual More action.
- Bottom tab bar: Chat, Drawing, Map, Agents, More.
- Content scrolls between bars.
- Sticky buttons sit above bottom navigation and safe-area.
- More sheet contains Apps, Gallery, and API connection.

### Mobile Chat

- Conversation list opens as a full-height sheet from the title bar.
- Chat controls reduce to assistant/model summary and More.
- Composer is sticky and grows to a maximum of five lines.
- Attachment and voice controls remain `44px` targets.
- Software keyboard must not cover send/stop controls.

### Mobile Drawing

- Top segmented control: Input / Preview / History.
- Input is a single scrollable form without nested cards.
- Generate button is sticky.
- Preview is edge-to-edge within content margins.
- History uses a two-column square thumbnail grid.

### Mobile Mind Map

- Canvas is the default screen.
- Prompt/settings open in a bottom sheet.
- Floating canvas controls are grouped in one compact toolbar, not separate floating buttons.
- Visual/Source uses a top segmented control.

### Mobile Agents

- Setup is one scrollable form.
- Permissions use compact toggle rows.
- Running transitions to the timeline screen while preserving a Back to Setup action.
- Trace events are collapsible rows.

### Mobile Apps

- Apps opens from More as its own routed screen.
- Search field is sticky beneath the title bar.
- Filters scroll horizontally with visible edge fade, not a hidden navigation scrollbar.
- Apps use list rows or a two-column grid.
- App detail and runner open as a full-height sheet/screen.

### Mobile Gallery

- Gallery opens from More as its own routed screen.
- Two-column grid with `8px` gap.
- Long press or Select enters multi-select mode.
- Asset detail is a full-screen sheet with sticky action bar.
- Clear All is in overflow, never a primary header action.

## 10. Interaction Rules

### URL and Navigation State

- Each public destination has a stable URL, for example `/chat`, `/drawing`, `/mindmap`, `/agents`, `/apps`, `/gallery`, or an equivalent approved query scheme.
- Browser back/forward restores the destination and meaningful subview.
- Asset detail and app selection may use query state if direct linking is useful.
- Page title format: `<Module> · xi-ai-web`.

### Keyboard

- Tab order follows visual order.
- All focusable controls have a visible focus ring.
- Escape closes dismissible dialogs, sheets, menus, and popovers.
- Arrow keys control tablists and segmented controls.
- Enter/Space activate buttons.
- `Ctrl/Cmd + Enter` submits long-form prompts; Enter remains newline in textareas.

### Touch

- Minimum touch target `44 x 44px`.
- Adjacent destructive and primary actions have at least `8px` separation.
- No action depends on hover.
- Horizontal filter scrolling shows an edge fade or partial next item as affordance.

### Destructive Actions

- Single local item deletion: immediate only if an Undo toast is guaranteed.
- Batch delete, Clear All, admin entity delete, and destructive restore: confirmation dialog required.
- Confirmation copy names the object/count and persistence consequence.
- Default focus stays on Cancel; destructive action is not the default Enter target.

### Loading and Feedback

- Buttons preserve width during loading.
- Use skeletons only for known layouts; use a progress/status row for generation.
- Async success uses a status toast announced politely.
- Errors use `role=alert` behavior and remain until dismissed or corrected.
- Never replace a user-entered prompt on request failure.

### Motion

- Standard duration: `120ms` pressed, `180ms` hover/open, `240ms` sheet transition.
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- No decorative entrance animation.
- Reduced motion removes transforms and shortens fades to effectively immediate.

### Long Text

- Navigation and list titles: one-line ellipsis.
- Descriptions: two-line clamp where space is constrained.
- User prompts/results: wrap with `overflow-wrap:anywhere`.
- Code and raw source: horizontal scroll, never page overflow.
- Model labels may truncate visually but preserve full content in tooltip/accessibility name.

### Images and Media

- Figma frames specify aspect ratio for every media slot.
- Implementation annotation: use intrinsic dimensions or CSS `aspect-ratio` and `loading=lazy` below the fold.
- Do not crop generated assets in the primary preview; use `contain`.
- Thumbnails may use `cover` with a detail view available.

### Safe Areas and Software Keyboard

- Bottom bars and sheets include `env(safe-area-inset-bottom)`.
- Top bars include safe-area when edge-to-edge viewport is enabled.
- Sticky composer/action bars use dynamic viewport units and remain visible with the software keyboard.
- There is exactly one scrolling owner in each mobile screen.

## 11. Prototype Flows

Create linked prototype flows for:

1. First visit -> API connection modal -> Chat ready.
2. Chat empty -> starter prompt -> streaming -> complete -> export More menu.
3. Drawing input -> generating -> preview -> open in Gallery.
4. Mind map prompt sheet -> generating -> canvas -> source -> export.
5. Agent setup -> permission selection -> run timeline -> final result.
6. Apps market -> select app -> run -> result.
7. Gallery select -> detail -> replay in source module.
8. Delete one item -> Undo toast; Clear All -> confirmation.
9. Mobile More -> Apps/Gallery/API connection.

## 12. Handoff Annotations

Every screen frame must include a `Handoff Notes` component outside the frame containing:

- Route and URL state.
- Scroll owner and sticky regions.
- Empty/loading/error/success state references.
- Keyboard behavior.
- Focus destination after open/close/navigation.
- Destructive confirmation or undo behavior.
- Responsive changes at `1100px`, `834px`, and `760px`.
- Safe-area behavior.
- Content truncation rules.

## 13. Design Acceptance Checklist

- [ ] All six current public destinations are represented.
- [ ] Drawing and Gallery have distinct responsibilities and shared asset components.
- [ ] Desktop navigation does not use equal-width oversized pills.
- [ ] Mobile navigation does not use a hidden horizontally scrolling six-item header.
- [ ] No glass blur, gradient panel, glow, or translucent card surface remains.
- [ ] Default panel/card radius is `10px` or less; dialogs/sheets are `12px`.
- [ ] No card is placed inside another card solely for styling.
- [ ] Every screen has an explicit scrolling owner.
- [ ] All touch targets are at least `44 x 44px`.
- [ ] All controls have visible labels or accessible names.
- [ ] Dialog focus, Escape, restore, and background inert behavior are annotated.
- [ ] Destructive actions use confirm or undo according to scope.
- [ ] Reduced-motion and safe-area behavior are annotated.
- [ ] Empty states are compact and contain no oversized icon.
- [ ] Prototype covers desktop and mobile critical flows.

