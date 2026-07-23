# Figma Menu And Submenu Audit

Source: Figma Make `NqmyXu1t03HzZNssnm1dqL`, Version 24, inspected through the live preview and Make source on 2026-07-18.

## Shell

- Brand: `AiStudio / CREATE WITH AI`.
- Public navigation order and notes:
  1. `AI 对话 / 深度推理与创作`
  2. `图像生成 / 灵感可视化`
  3. `AI 一键 PPT / 从主题到成稿`
  4. `思维导图 / 洞见结构化`
  5. `助手库 / 专属工作伙伴`
  6. `翻译 / 自然表达转换`
- Desktop uses a fixed `224px` left rail. The selected item is a full-width blue rounded rectangle with icon, title, and note.
- Narrow layouts use a `64px` Brand/theme/menu header. The menu opens below the header and keeps the same six destinations in one vertical list. The Version 24 source uses a single `space-y-1` navigation stack; there is no tablet two-column variant.
- The desktop access card contains service status, theme control, `SECURE ACCESS`, address, and encryption status.
- No public API configuration or Admin command is present. The footer contains only the authorization line and masked key.

## AI Chat

- Heading card: `01 / INTELLIGENCE`, `<model> 对话空间`, and `AI 对话工作台`.
- `新对话` and `会话设置` belong to the heading card. They are not repeated in each session header.
- A new session is inserted first and expands; older sessions fold below it.
- An expanded session header contains only the model trigger and `点击折叠`. A folded session preserves avatar, title, and last-message preview.
- Model submenu:
  - anchored directly below the model trigger;
  - left vendor tabs are `OpenAI`, `Anthropic`, `视觉`;
  - right header is `<VENDOR> · 模型` with `显示 3 个`;
  - the viewport shows three rows and scrolls to additional models; the header count is the visible row count (`显示 3 个`), not the total catalog size;
  - every row includes model name, capability note, and selected/check state;
  - closes on outside click, Escape, selection, folding, or unmount and restores trigger focus.
- Session settings dialog:
  - `SESSION CONFIGURATION`, title, supporting sentence, and close command;
  - four AI avatar presets;
  - personal avatar upload, preview, and remove;
  - `气泡式 / 列表式` message layout;
  - Temperature and Top-P sliders with low/value/high labels;
  - context and maximum-token selects;
  - stream toggle;
  - `自动 / 询问后调用 / 禁用` tool mode;
  - `取消 / 保存设置` footer actions.

## Image

- Hero: `02 / VISUALS`, `图像生成`, `把文字灵感转换为一幅独有画面。`.
- Initial prompt: `一座漂浮在深海中的未来图书馆，蓝紫色生物荧光，电影感`.
- Main builder is a large prompt panel on the left and compact `创作参数` panel on the right.
- Prompt footer shows `1:1`, `写实`, and `立即生成`.
- Parameter rows use menu-button anatomy with chevrons:
  - model: `Flux Pro`;
  - aspect ratio: `1 : 1`;
  - count: `4 张`.
- `灵感瀑布流` has a right-aligned `换一批 →` command and six staggered image cards. Selecting a card reuses its prompt.

## PPT

- Hero: `03 / AUTO-DECK`, `一句主题，一份好 PPT。`; `一份好 PPT。` is blue.
- Supporting sentence: `AiStudio 会研究主题、编排故事、选择视觉语言，并生成可下载的演示文稿。`
- Default topic: `生成式 AI 如何重塑企业创新`.
- Main panel is split in two:
  - left: `01 描述你的主题`, topic surface, three option rows, submit action, and estimate;
  - right: blue-violet `WHAT AI CREATES` stage panel.
- Initial options:
  - `企业管理层`;
  - `8–10 分钟`;
  - `未来专业`.
- Stages:
  1. `发现叙事主线`
  2. `生成页面结构`
  3. `匹配视觉素材`
  4. `润色关键表达`
- Right-panel note: `不再从空白页面开始。只需表达你的目标，剩下的交给 AI。`
- `PROMPT IDEAS`: `年度战略复盘`, `新品发布方案`, `市场进入策略`, `行业趋势解读`.

## Mind Map

- Hero: `04 / THINKING MAP`, `把模糊想法，变成清晰路径。`; the second phrase is blue.
- Supporting sentence: `输入一个问题或主题，AI 将为你提炼关键分支、逻辑关系和下一步行动。`
- Default topic: `构建 AI 驱动的产品增长体系`.
- Topic input and `AI 生成导图` are one horizontal command row.
- The main dotted canvas contains the central topic and four positioned branch cards connected by lines:
  - `用户洞察`;
  - `价值主张`;
  - `产品策略`;
  - `增长实验`.
- Each branch shows `AI 已扩展 3 个节点`. Branch selection is retained without moving cards outside the canvas.
- Zoom controls float at the canvas bottom-right: `− / 100% / +`.
- Bottom capability cards:
  - `一键展开 / 从中心主题延展更多观点`;
  - `AI 重组 / 按时间、优先级或因果排序`;
  - `导出图片 / 生成可分享的高清结构图`.

## Assistants

- Hero: `05 / AGENT LIBRARY`, `给任务找一位 / 真正懂行的伙伴。`; second line is blue.
- Supporting sentence: `每位 AI 助手都有专属指令、知识结构与工作方式。选择一个，立即开始协作。`
- Count label: `06 CURATED AGENTS`.
- Category submenu: `全部`, `战略`, `写作`, `产品`, `数据`, `效率`.
- Desktop cards use a three-column, two-row grid with tinted backgrounds, colored symbol blocks, top-right arrows, one-line capability, and two tags.
- Figma reference entries:
  - `战略共创官 / 把模糊议题转成可执行策略 / 战略 / 分析`;
  - `内容主笔 / 写出有观点、有节奏的中文内容 / 写作 / 营销`;
  - `数据解读师 / 从复杂数据中提炼清晰结论 / 数据 / 报告`;
  - `产品研究员 / 发现用户需求与产品机会 / 产品 / 研究`;
  - `品牌策展人 / 建立统一而鲜明的品牌表达 / 品牌 / 创意`;
  - `会议纪要助手 / 梳理决策、待办和关键问题 / 效率 / 协作`.
- Detail overlay uses a dimmed, lightly blurred backdrop, `SPECIALIST AGENT`, specialist name/copy, and one full-width `启动此助手` action.

## Translation

- Hero: `06 / TRANSLATE`, `不只是翻译，更像母语表达。`; second phrase is blue.
- Supporting sentence: `理解上下文、保留语气、选择恰当表达。让每一句话在另一种语言中自然发生。`
- Top row contains source language, swap control, target language, and tone segmented control.
- Initial languages: `中文（简体）` to `英语（美式）`.
- Tone submenu: `自然专业`, `简洁`, `营销感`.
- The editor is one bordered two-column surface:
  - source: `SOURCE`, `63 / 5,000`, initial Chinese copy, `清空`, and `翻译文本`;
  - result: `TRANSLATION · 自然专业`, `复制`, initial English copy, `语义保真`, and `本地化表达`.
- Capability cards:
  - `文件翻译 / 上传 DOCX、PDF 或字幕文件`;
  - `术语库 / 锁定品牌、产品和行业术语`;
  - `双语对照 / 保留段落级对照与审校痕迹`.

## Responsive Contract

- Below `1024px`, the desktop rail is replaced by the compact header and menu overlay.
- Below `760px`, authored multi-column regions stack in source order; headings, primary actions, and filter/tone submenus remain visible.
- Controls keep `44px` touch targets, no horizontal overflow, and one visible scroll owner.
- Dialogs become viewport-contained sheets while preserving close, Cancel, and primary actions.

## Implementation Deltas Confirmed

### Phase 11.1 Fidelity Closure Notes

- The shared menu primitive now owns outside-pointer dismissal, Escape dismissal, trigger-focus restoration, listbox roving focus, and automatic up/down placement inside clipped workspaces.
- Chat model switching keeps the three-vendor layout and focuses the first model when the active model belongs to another vendor. The popover reports the three visible rows while preserving scrolling for the remaining catalog entries.
- Mobile navigation dismissal is covered for route selection, Escape, and outside-pointer clicks. The menu remains a single vertical stack through the full `<1024px` breakpoint; heading actions keep their text labels from `640px` upward.
- Retired responsive selectors for the pre-Figma generic workbench were removed so they cannot silently affect the six authored pages.

- Move Chat heading actions out of every session header.
- Treat `openai-compatible` as `OpenAI` in the model vendor submenu.
- Remove the keydown propagation guard that prevents Escape from closing the model submenu.
- Replace Image defaults and parameter anatomy with the reference state.
- Recompose PPT into the split creation/stage panel and use exact copy.
- Replace the generic Mindmap canvas presentation with the authored radial canvas and floating zoom control while preserving generated data.
- Project administrator-managed assistants into the six reference card profiles without breaking assistant launch.
- Initialize Translation with the reference source/result copy and use the exact editor/capability composition.
- Narrowly allow the PPT creation-panel gradient and assistant/session dialog backdrop blur because both are present in the authoritative design.

### Phase 11 Fidelity Closure - 2026-07-18

- The `1024px` desktop breakpoint retains the same `224px` rail and `32px` shell gap as the wide reference; the retired `214px`/`24px` compression rule is gone.
- The shared authored menu primitive uses the `16px` base radius and `10px` field label size. Image, PPT, and Translation menus share the same dismissal and focus behavior.
- PPT, Mind Map, and Translation hero emphasis phrases remain visually unbroken at `375px` while preserving the exact accessible heading names. The implementation uses inline `white-space: nowrap`, because `inline-block` introduces an accessibility-tree separator.
- Added browser contracts cover the `1024px` geometry, mobile phrase grouping, computed menu radius, all authored menu lifecycle states, Chat vendor switching, and mobile navigation dismissal.
- Verification: `npm run qa`, `npm run test:e2e` (116 passed, 8 conditional skips), `npm run smoke`, `npm run release-check`, and `git diff --check` passed.

### Phase 12 Geometry Re-Audit - 2026-07-18

- The live desktop Chat preview uses a full-width scroll viewport with an inner `896px` message track. The inner content is `832px` after `32px` horizontal padding, and the composer/tools share the same `896px` x-position.
- The live Chat history height is `calc(100vh - 340px)` with a `400px` minimum. The composer is approximately `89px` high, uses a `14px / 28px` textarea, and a `32px` send control with an `8px` radius.
- PPT option cards are approximately `60px` high, use a `16px` radius, and treat the whole card as the menu trigger. Prompt-idea controls are compact pill buttons.
- Mind Map desktop branches use the authored positions `26% / 62% / 20% / 58%`, approximately `114px` widths, and `16px` radii. Zoom controls use `28px` buttons inside the bottom-right capsule.
- Assistant filters are `34px` pills with an `8px` gap. The desktop card grid uses a `16px` gap, `16px` titles, `12px` descriptions, and `10px` tags.
- Translation desktop language controls are `96px / 28px / 96px`; tone buttons are `27px` high. Mobile retains the existing `44px` touch-target overrides.

## Version 24 Re-Audit Closure

- Rechecked all six route shells, the Chat model/settings surfaces, Image/PPT/Translation menus, Assistant detail dialog, and mobile navigation at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Chat's custom model popover now shares the viewport correction contract used by authored menus; repeated scroll events do not accumulate its horizontal transform.
- Vendor tab arrow navigation activates the corresponding vendor panel, while pointer selection continues to focus the first visible model row.
- The session header no longer repeats `新对话` or `会话设置`; both commands remain in the heading card, with compact accessible icon controls below `640px`.
- Fold/unfold accessible names now follow the visible state (`点击折叠对话` / `点击展开对话`).
- Static contracts, targeted Chat/menu E2E, visual captures, and the full quality gate were rerun. The live Make URL remains `404`, and the MCP Make source remains incomplete; this re-audit therefore uses the persisted Version 24 audit, reference snapshot, and local captures as the evidence set.
