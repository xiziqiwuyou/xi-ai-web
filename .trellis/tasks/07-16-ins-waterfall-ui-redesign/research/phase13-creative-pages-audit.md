# Phase 13 Creative Pages Audit

## Scope And Evidence

- Active task: `.trellis/tasks/07-16-ins-waterfall-ui-redesign`.
- Pages audited: Version 24 Image, PPT, and Mind Map.
- Authoritative visual record: `.trellis/tasks/07-16-ins-waterfall-ui-redesign/research/figma-menu-submenu-audit.md`.
- Supplemental source: `.trellis/tasks/07-16-ins-waterfall-ui-redesign/research/figma-make-App.reference.tsx`. This export still references `ImageView`, `PptView`, and `MindmapView` at line 68 without preserving their definitions, so it cannot settle page-local markup questions.
- Current implementation: `src/features/studio/StudioModule.tsx`, `src/components/ui/FigmaMenu.tsx`, `src/features/mindmap/mindmapExport.ts`, and the active `rednote-flat-v2` CSS.
- Current contracts: `scripts/ui-contract.mjs` and `tests/e2e/module-shell.spec.ts`.
- Static verification run during this audit: `npm run ui-contract` passed. The findings below therefore describe gaps the current static contract permits.

## Verdict

The three initial desktop compositions now match most of the Version 24 inventory: exact heroes, sample topics, menu-button anatomy, Image inspiration waterfall, PPT split creation panel, and the authored radial Mind Map are present. Remaining risk is concentrated in option semantics after interaction, generated-result fidelity, the `1024-1279px` responsive band, mobile hit targets, and Mind Map state/export behavior.

No application files were modified by this audit.

## Prioritized Findings

### P1 - Image Count Is A Visual Choice, Not An Enforced Generation Parameter

**Evidence**

- Version 24 initializes Count to `4 张`: `figma-menu-submenu-audit.md:50-54`.
- The UI exposes `1 / 2 / 4 张` and initializes `4`: `StudioModule.tsx:65-69`, `StudioModule.tsx:279`.
- Submission appends the count only to free-form prompt text, while the typed options payload contains only `size` and `stylePreset`: `StudioModule.tsx:337-342`.
- `GenerationPayload.options` has no count field: `src/types.ts:236-255`.
- The server performs one `generateImage` adapter call and forwards only one size: `server/index.mjs:1909-1927`.
- Even if a provider returns several assets, the waterfall projection uses `.find(...)` for the current result and each gallery item, retaining only one image per result: `StudioModule.tsx:291-301`.
- E2E changes the displayed Count value but never submits Image or validates request/result cardinality: `module-shell.spec.ts:213-216`.

**Impact**

Selecting `4 张` does not deterministically request or render four images. The control looks equivalent to Model and Aspect Ratio but has materially weaker behavior.

**Recommended scoped update**

1. Add an explicit image count contract through `GenerationPayload`, server validation, and the provider adapter when the provider supports `n` or equivalent.
2. Define fallback behavior for providers without multi-image support instead of relying on prompt wording.
3. Project every returned image asset into the waterfall rather than the first asset only.
4. Add an Image submit E2E case that selects `4 张`, inspects the request, returns four deterministic assets, and verifies four generated cards are available.

### P1 - Generated Mind Maps Can Mix Live Output With Reference Fallback Content

**Evidence**

- The authored initial state is exactly four branches with three child nodes each: `figma-menu-submenu-audit.md:82-87` and `StudioModule.tsx:145-161`.
- The generation request sends only the topic and does not ask for exactly four primary branches or three children: `StudioModule.tsx:647-651`.
- The server asks for a generic Mermaid mind map with up to four levels, not the authored four-branch shape: `server/index.mjs:1994-2000`.
- Rendering reads only the first four generated children. Missing children fall back to the sample labels, and extra children are discarded: `StudioModule.tsx:623-631`.
- `node?.children.length || 3` reports `3` for a real generated branch with zero children: `StudioModule.tsx:626-629`.
- The deterministic fixture returns only one primary branch, but no Mind Map generation E2E exercises the resulting mixed state: `tests/e2e/support/app-fixture.ts:378-383`, `module-shell.spec.ts:614-650`.

**Impact**

After real generation, the radial canvas may present one or more generated branches beside untouched sample branches, suppress additional generated branches, or claim three expanded nodes when the model returned none. This is visually plausible but semantically inaccurate.

**Recommended scoped update**

1. Constrain the Mind Map prompt to four primary branches and three concise children when preserving the fixed Version 24 canvas.
2. When a result is present, do not silently substitute sample labels for missing generated branches. Use an explicit empty/generated state or normalize the response before rendering.
3. Replace the `|| 3` count fallback with a distinction between absent sample data and a real zero-child result.
4. Add a generated-state E2E fixture containing zero, fewer than four, exactly four, and more than four branches.

### P1 - Mobile Creative Controls Do Not Consistently Meet The 44px Contract

**Evidence**

- Version 24 responsive evidence requires `44px` touch targets: `figma-menu-submenu-audit.md:127-130`.
- Project component guidance repeats the same requirement: `.trellis/spec/frontend/component-guidelines.md:60`.
- Image prompt chips are `30px`: `rednote-flat-v2.workbench.css:227-235`.
- Image `换一批 →` is `38px`: `rednote-flat-v2.workbench.css:445-453`.
- PPT prompt ideas are `34px`: `rednote-flat-v2.workbench.css:755-763`.
- The post-generation PPT download command is `36px`: `rednote-flat-v2.workbench.css:793-804`.
- Mind Map zoom buttons are fixed at `28x28px` with no mobile override: `rednote-flat-v2.workbench.css:967-992`, `rednote-flat-v2.workbench.css:1543-1766`.
- Existing mobile tests validate navigation, authored menu triggers, Image footer alignment, and branch heights, but not these controls: `module-shell.spec.ts:228-303`, `tests/e2e/mobile-layout.spec.ts:37-69`.

**Impact**

The pages preserve compact desktop geometry on touch devices, but several frequently used commands have undersized hit boxes. Mind Map zoom is the largest discrepancy because the visible and interactive box is only `28px`.

**Recommended scoped update**

1. Under `max-width: 760px`, give prompt chips, refresh, prompt ideas, result download, and zoom buttons at least `44px` interactive boxes.
2. Preserve the Version 24 visual size by centering the existing compact glyph/pill inside the larger hit area where necessary.
3. Expand `.figma-map-zoom` mobile grid tracks from `28px / 56px / 28px` to touch-safe tracks.
4. Add a mobile E2E table that measures every interactive control unique to Image, PPT, and Mind Map.

### P1 - Mind Map Reorganization Does Not Preserve Branch Identity Or Exported State

**Evidence**

- Version 24 retains branch selection while branches remain on the authored canvas: `figma-menu-submenu-audit.md:82-88`.
- Selection is stored as a positional index: `StudioModule.tsx:613-616`.
- `AI 重组` rotates `branchCards` by offset but keeps the same active index: `StudioModule.tsx:623-632`, `StudioModule.tsx:742-744`.
- Active state is applied by current position, not a stable branch ID: `StudioModule.tsx:704-714`.
- Therefore a selected label can lose selection while a different label occupying the same position becomes selected after reorganization.
- `一键展开` only advances selection and posts a notice; it does not reveal or generate additional viewpoints: `StudioModule.tsx:735-740`.
- `AI 重组` changes only presentation order. The parsed tree remains unchanged, and export uses the unchanged tree: `StudioModule.tsx:742-747`.
- E2E verifies selection before reorganization and only verifies the notice afterward: `module-shell.spec.ts:631-649`.

**Impact**

The three capability cards are clickable but do not consistently perform their stated domain actions. Reorganization can transfer selection to another branch, and exported output ignores the visible reorganization.

**Recommended scoped update**

1. Store active selection by stable branch/node ID rather than visual slot index.
2. Represent reorganization as an ordered branch model used by both the canvas and export.
3. Make `一键展开` reveal or generate real child content, or present it as a non-command capability note.
4. Add E2E that selects `产品策略`, reorganizes, verifies the same branch remains selected, and validates the exported order.

### P2 - Image And PPT Collapse Into Stacked Layouts Above The Mobile Breakpoint

**Evidence**

- The task contract says desktop composition begins at `1024px`; only widths below `1024px` use the compact shell, and authored sections stack below `760px`: `design.md:221-223`.
- The active CSS stacks both `.figma-image-builder` and `.figma-ppt-creator` throughout `761-1279px`: `rednote-flat-v2.workbench.css:1536-1540`.
- This means `1024-1279px` uses the desktop rail but loses the desktop Image left/aside split and PPT input/stage split.
- The existing tablet test proves stacking only at `915px`, which is correctly below the desktop breakpoint: `module-shell.spec.ts:255-274`.
- The `1024px` test validates shell columns only, not creative-page composition: `module-shell.spec.ts:120-144`.

**Impact**

There is an untested responsive band where the shell is desktop but the creative pages use tablet composition. At `1024-1279px`, this conflicts with the stated desktop authored layout boundary.

**Recommended scoped update**

1. Limit the combined Image/PPT stacking rule to `<1024px`, or document a separate creative-content breakpoint if that is an intentional Figma measurement.
2. Add `1024px` and `1279px` geometry assertions for Image and PPT, not only the shell.
3. Keep the existing `915px` stacked-layout assertion as the below-desktop case.

### P2 - PPT Promises A Downloadable Presentation But Produces A Markdown Outline

**Evidence**

- Version 24 describes generation of a downloadable presentation: `figma-menu-submenu-audit.md:58-74`.
- The current hero repeats that promise and the estimate specifically mentions PDF: `StudioModule.tsx:511-515`, `StudioModule.tsx:561-567`.
- The server asks the model for Markdown slide content: `server/index.mjs:1985-1993`.
- The generated UI is titled `演示大纲` and downloads `presentation-outline.md`: `StudioModule.tsx:499-506`, `StudioModule.tsx:593-600`.
- No PPT submit/download E2E exists; the page contract stops after option and prompt-idea interactions: `module-shell.spec.ts:561-612`.

**Impact**

The first frame is visually faithful, but the primary action resolves to an outline workflow rather than the downloadable deck/PDF outcome described by the Figma page.

**Recommended scoped update**

1. Define whether `/api/generate/ppt` returns a deck/PDF asset or only structured source.
2. For exact fidelity, create a real downloadable presentation asset and expose it through the result payload.
3. Add an E2E submit case that verifies all three options reach the request and that the generated download has the promised format.

### P2 - Mind Map Export Does Not Match The Authored Radial Canvas

**Evidence**

- The visible canvas is radial, dotted, blue-accented, and uses four fixed branch slots: `StudioModule.tsx:692-726`, `rednote-flat-v2.workbench.css:856-998`.
- `mindmapToSvg` exports a separate left-to-right flattened tree with red nodes, a light background, `170x48` rectangles, and no radial slot state: `src/features/mindmap/mindmapExport.ts:21-61`.
- The export also ignores current zoom, active selection, and branch reorganization.
- No download-content test covers this command.

**Impact**

`导出图片 / 生成可分享的高清结构图` downloads a valid SVG, but it is not a high-resolution export of the structure the user is viewing.

**Recommended scoped update**

Export the authored radial stage itself, or share one layout model and token set between browser rendering and SVG generation. Add an export test that checks center/branch labels, branch order, and radial coordinates.

### P2 - Zooming The Entire Edge-To-Edge Stage Can Clip Outer Branches

**Evidence**

- The canvas clips overflow: `rednote-flat-v2.workbench.css:856-865`.
- The full stage is scaled around its center: `StudioModule.tsx:692-694`, `rednote-flat-v2.workbench.css:868-873`.
- Branches sit as close as `3-9%` to the canvas edges: `rednote-flat-v2.workbench.css:943-965`.
- Zoom permits `110%` and `120%`: `StudioModule.tsx:717-724`.
- Existing tests verify only the percentage text, not branch containment after zoom: `module-shell.spec.ts:634-639`.

**Inference**

At desktop widths, scaling an outer branch around the canvas center moves the left/right cards beyond the clipping boundary at `110-120%`. Exact clipping depends on rendered width, but the geometry makes it likely.

**Recommended scoped update**

Add internal canvas padding or scale a bounded scene with compensating translation. Add geometry assertions that every branch remains inside the canvas at `80%`, `100%`, and `120%`.

## Page-By-Page Fidelity Matrix

### Image

| Surface | Current status | Evidence / remaining delta |
| --- | --- | --- |
| Hero and supporting copy | Aligned | `StudioModule.tsx:357-363`; exact copy is covered at `module-shell.spec.ts:175-180`. |
| Initial prompt | Aligned | Exact reference prompt at `StudioModule.tsx:92`, initialized at line 276. |
| Model menu | Structurally aligned; dynamic-label exception | Uses shared menu and real catalog at `StudioModule.tsx:236-265`. Reference sample says `Flux Pro`, while deterministic E2E fixture renders `Test Image` at `app-fixture.ts:150-158`. Production catalog derivation is intentional; visual fixtures should use the reference label if screenshot fidelity is required. |
| Aspect menu | Aligned | Initial `1 : 1`; options and real payload size are wired at `StudioModule.tsx:59-63`, `StudioModule.tsx:398-405`, and line 341. |
| Count menu | Not behaviorally aligned | See P1 count finding. |
| Prompt chips | Initial state aligned | `1:1 / 写实` at `StudioModule.tsx:377-385`; mobile hit target remains undersized. |
| Primary action | Aligned for loading/error/BYOK states | `StudioModule.tsx:324-355`, `StudioModule.tsx:386-389`. Result cardinality remains incorrect for Count. |
| Inspiration cards | Mostly aligned | Six local assets at `StudioModule.tsx:94-125`; waterfall and prompt reuse at `StudioModule.tsx:420-449`. Tests do not lock all six source paths, order, or the three authored aspect classes. |
| Generated/saved waterfall entries | Partial | Correctly merged and deduplicated, but only one asset is retained per result: `StudioModule.tsx:291-310`. |
| Responsive composition | Partial | Mobile stacking works, but the split collapses through `1279px`; compact action targets are incomplete. |

### PPT

| Surface | Current status | Evidence / remaining delta |
| --- | --- | --- |
| Hero, blue emphasis, supporting copy | Aligned | `StudioModule.tsx:509-515`; mobile no-wrap emphasis is tested at `module-shell.spec.ts:146-168`. Supporting copy is not asserted by static or browser contracts. |
| Default topic | Aligned | `StudioModule.tsx:462`; covered at `module-shell.spec.ts:567-568`. |
| Audience, duration, visual tone | Aligned | Exact defaults at `StudioModule.tsx:463-465`; shared menu rows at lines 533-557; all values enter the prompt at line 484. |
| Option-card geometry | Aligned at 1440 | `60px`, `16px`, whole-card triggers at `rednote-flat-v2.workbench.css:581-630`; covered at `module-shell.spec.ts:385-397`. |
| Primary action and estimate | Initial state aligned | `StudioModule.tsx:561-567`; generated outcome remains an outline rather than a deck. |
| WHAT AI CREATES panel | Aligned | Exact stages and note at `StudioModule.tsx:570-581`; approved gradient at `rednote-flat-v2.workbench.css:648-738`. Browser tests do not assert the four stage labels or panel note, while static contract asserts only the labels. |
| PROMPT IDEAS | Aligned | Exact four labels at `StudioModule.tsx:136-141`; click-to-fill at lines 584-590. Mobile pills are undersized. |
| Generated result/download | Not outcome-aligned | Markdown outline and `.md` download; see P2 PPT finding. |
| Responsive composition | Partial | Correct source order when stacked, but stacking starts above the documented desktop boundary. |

### Mind Map

| Surface | Current status | Evidence / remaining delta |
| --- | --- | --- |
| Hero, emphasis, supporting copy | Aligned | `StudioModule.tsx:666-672`; emphasis grouping is tested at `module-shell.spec.ts:146-168`. Supporting copy is not directly contracted. |
| Default topic and command row | Aligned | `StudioModule.tsx:613`, `StudioModule.tsx:674-688`; exact initial value covered at `module-shell.spec.ts:618-621`. |
| Initial center and branches | Visually aligned | Initial source at `StudioModule.tsx:145-161`; authored radial stage at lines 692-716. |
| Desktop branch geometry | Aligned | Positions `26% / 62% / 20% / 58%`, approximately `114px`, `16px` radii at `rednote-flat-v2.workbench.css:914-965`; partially measured at `module-shell.spec.ts:398-411`. |
| Generated branch projection | Not robust | Can mix generated and sample content or truncate branches; see P1 generated-state finding. |
| Selection | Aligned before reorganization | `aria-pressed` is correct for direct selection at `StudioModule.tsx:704-714`; identity is not retained after reorder. |
| Zoom control visual | Desktop aligned | `28px / 100% / 28px` capsule at `rednote-flat-v2.workbench.css:967-998`. Mobile target and zoom clipping remain open. |
| Capability cards | Copy aligned; behavior partial | Exact copy at `StudioModule.tsx:163-167`; behavior at lines 728-754 does not fully match expand/reorganize/export semantics. |
| Mobile canvas | Initial layout mostly aligned | Four compact cards remain radial at `rednote-flat-v2.workbench.css:1614-1636` and `1705-1723`; current tests check equal heights but not containment, connector alignment, or zoom controls. |

## Contract And Test Blind Spots

1. `scripts/ui-contract.mjs:204-325` checks page structure and selected exact strings but omits several authoritative strings: PPT and Mind Map supporting sentences, the PPT right-panel note, all four prompt-idea labels, and all three Mind Map capability descriptions.
2. The static contract checks menu anatomy but not Image Count request semantics, multi-asset projection, Mind Map generated normalization, stable branch identity, export parity, or mobile control dimensions.
3. `module-shell.spec.ts` has no Image, PPT, or Mind Map submit-flow test. Translation is the only Studio API request whose payload is asserted (`module-shell.spec.ts:729-732`).
4. The `915px` stacked-layout test and `1024px` shell test leave creative-page geometry at `1024-1279px` uncovered.
5. Mobile tests measure PPT menu triggers and selected Image/Mind Map geometry but not Image chips/refresh, PPT prompt ideas/download, or Mind Map zoom controls.
6. Inspiration coverage checks count, one card, and rotation, but not all six asset URLs/order or their staggered aspect classes.
7. Mind Map tests stop after notices; they do not verify post-command branch identity, generated branch normalization, exported SVG content, or branch containment after zoom.

## Recommended Validation Additions

1. Add targeted API-flow E2E cases for Image, PPT, and Mind Map using the existing deterministic harness.
2. Add creative layout geometry at `1024px`, `1279px`, `760px`, `390px`, and `375px`.
3. Add a mobile control matrix requiring `44x44px` hit boxes for every page-local command.
4. Add Mind Map state invariants: stable selected ID through reorder, no sample/generated mixing, four visible branches or an explicit normalized state, all branches inside the canvas at every zoom, and exported layout parity.
5. Make the visual fixture's selected image model label `Flux Pro` while retaining its deterministic test ID, so screenshot baselines match the Version 24 initial sample without changing production catalog behavior.

## Evidence Boundary

- Direct evidence is available for all implementation, CSS, server, and test claims above.
- The exact generated PPT screen and provider-specific multi-image behavior are not preserved in the Make source. Findings about those outcomes are based on the visible Version 24 promises plus the current request/result implementation.
- Zoom clipping is a geometry inference from the active edge positions, centered transform, and clipped canvas. It should be confirmed by a focused browser measurement before implementation.
