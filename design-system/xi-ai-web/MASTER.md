# xi-ai-web Design System

This file is the implementation-readable source of truth for the Figma Make design
[在线对话功能网页设计](https://www.figma.com/make/NqmyXu1t03HzZNssnm1dqL/在线对话功能网页设计).

## Product Direction

The public product reproduces the AiStudio user workspace from the Figma source. It is not a marketing page and must not mix in earlier xi-ai-web shells or discovery layouts.

- Brand: `AiStudio` with `CREATE WITH AI`.
- Initial theme: dark; the selected theme persists in `localStorage` under `aistudio-theme`.
- Typography: Plus Jakarta Sans for Latin UI copy and DM Mono for Latin system labels, with `PingFang SC` / `Microsoft YaHei UI` fallbacks so Chinese text never falls through to a generic monospace face.
- Shape: `16px` base radius for cards, controls, navigation items, and dialogs.
- Depth: quiet borders and restrained shadows; no glass blur or project-authored decoration.
- Compatibility logic stays behind the Figma frames. Do not expose compatibility controls or retired module names.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#f5f8ff` | `#080c14` |
| Surface | `#ffffff` | `#0f1623` |
| Foreground | `#10203d` | `#edf3ff` |
| Primary | `#2368e8` | `#4f8dff` |
| Primary fill | `#2368e8` | `#2368e8` |
| On primary | `#ffffff` | `#ffffff` |
| Secondary | `#edf2fc` | `#162032` |
| Muted | `#65738d` | `#93a3bf` |
| Border | `rgba(31,64,125,.12)` | `rgba(222,232,250,.13)` |
| Success | `#1d9a70` | `#10b981` |
| Danger | `#d9354c` | `#ef4444` |

The only approved gradient is the AiStudio `.figma-brand-mark` identity surface.

UI copy uses `"Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif`. Compact metadata uses `"DM Mono", "SFMono-Regular"` before the same Chinese fallbacks and never renders below `10px`. Dark muted copy must keep at least AA contrast against the dark surface. Filled primary surfaces use the darker primary-fill token with white text, while the brighter dark primary remains available for focus, links, range progress, and icon accents. Range controls use an explicit track border and progress segment instead of transparency alone.

## Public Shell

### Desktop

- `.figma-studio-shell`: full viewport, `224px minmax(0, 1fr)` at `1024px` and at the `1280x800` / `1440x900` acceptance viewports.
- `.figma-sidebar`: Brand, eight product destinations, access status, and theme control. The destination list scrolls independently when height is constrained.
- `.figma-workspace`: the sole public scroll owner, containing the active frame and Figma footer.
- Workspace content uses the Figma maximum width and `16px` cards; do not add a second product header.

### Responsive

- Below `1024px`, `.figma-mobile-header` replaces the rail.
- The menu button opens `.figma-sidebar.mobile-open` as a single vertical function menu across the full `<1024px` range.
- Each destination remains at least `44px` high.
- There is no public bottom navigation, API button, or Admin link.

## Navigation Contract

Public routes and visible order are exact:

1. `AI 对话` -> `/chat`
2. `图像生成` -> `/image`
3. `智能体` -> `/agents`
4. `工作流` -> `/workflows`
5. `AI 一键 PPT` -> `/ppt`
6. `思维导图` -> `/mindmap`
7. `助手库` -> `/assistants`
8. `翻译` -> `/translate`

`/` canonicalizes to `/chat`. `/admin` is address-only and never appears in the public shell.

## Chat Contract

- Heading: `01 / INTELLIGENCE` and `AI 对话工作台`.
- Sessions are stacked cards. A new session is inserted first and expanded; existing sessions fold.
- The full session header toggles folding. A folded session shows only its title and preview.
- The expanded frame keeps model selection, messages, network search, image input, context clearing, composer, send/stop, and session settings.
- The model-list scrollbar keeps a stable gutter, stays visually transparent at rest, appears only while the list is actively scrolling, and hides again shortly after scrolling stops.
- Skill management and selection live in the Chat workspace. Selected declarative instructions are sent only with the user-initiated request; no public `/skills` route exists.
- Real local conversations, model catalog, streaming provider requests, and assistant launch behavior remain operational behind this presentation.

## Other Destinations

Image, Agents, Workflows, PPT, Mind Map, Assistants, and Translation use the same Figma heading/card/control language. Image uses enabled image-capable models; automation and text workbenches use enabled Chat-capable models and send the visible selection as `modelId`. The Workflow workspace uses a node canvas with a fixed Start input, Agent cards, a fixed Reply output, port-aware links, a component library, a right-side inspector, and fit controls. Model selectors describe their current value to assistive technology and remain disabled while a request is in flight. Their outer frames must not reveal retired labels such as `绘画`, `应用`, or `画廊`.

## BYOK Dialog

The first-use dialog is the only public credential entry surface.

- Visible controls: API URL, API Key, key visibility, save.
- It uses the shared accessible `Dialog`, cannot dismiss before both fields are valid, and hides the unavailable close command.
- Credentials persist only in `sessionStorage` under `cherry-web-user-provider`.
- Do not add provider presets, connection summaries, readiness cards, reset actions, or a persistent shell shortcut.

## Verification

- Viewports: `1440x900`, `1280x800`, `390x844`, `375x812`.
- Required gates: `npm run qa`, `npm run test:e2e`, `npm run smoke`, `npm run release-check`, `git diff --check`.
- Browser assertions: exact eight-item navigation, canonical routes, Back/Forward, Chat-local Skill injection, graph workflow persistence and sequencing, stacked session behavior, one scroll owner, no horizontal overflow, theme persistence, BYOK session-only storage, and no public Admin entry.
