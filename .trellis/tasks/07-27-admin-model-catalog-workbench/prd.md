# 后台模型目录三级工作台重构

## Goal

将后台模型目录从“预设按钮 + 全量下拉 + 长表单”的堆叠页面，重构为适合长期运营的厂商、模型和设置三级工作台。

## Requirements

- 桌面端使用三栏信息架构：模型厂商、该厂商模型行列表、所选模型设置详情。
- 厂商栏固定展示已支持的厂商及每个厂商的已配置模型数量；点击厂商切换模型列表。
- 中间栏先展示当前厂商已配置模型，再展示尚未添加的官方预设模型；每项按紧凑行显示名称、实际模型名、状态和能力摘要。
- 点击已配置模型在右侧展开设置。点击预设模型在右侧打开未保存草稿，只有点击保存才写入模型目录。
- 当前厂商下支持新增空白模型；已配置模型继续通过右侧删除入口移除。厂商类型本身保持后端支持的固定集合。
- 右侧只保留具体设置，按基本信息、能力、默认用途、媒体配置和保存操作分组。
- 能力和默认用途不得继续使用高饱和、大量红色胶囊；改为低噪声的紧凑选择行，选中状态清晰但不喧宾夺主。
- 保持模型名称映射、对话请求端点、输入限制、能力、默认用途、启停、视频模板、保存和删除行为不变。
- 对话请求端点只对包含 `chat` 能力的模型展示。纯图片、音频、视频或向量模型不得显示为走 Responses/Chat/Messages 等对话协议；右侧改为展示厂商专用请求通道。
- OpenAI 图片模型明确展示 `/v1/images/generations` 与 `/v1/images/edits`，Gemini 图片模型展示 `/v1beta/models/{model}:generateContent`，且展示与后端实际媒体适配器一致。
- 所有后台菜单页面应共享同一套自适应内容边界，在宽屏中不保留大面积无意义左右留白；模型目录、运营概览、工具、菜单、内容编辑、知识库运营和审计页面均需充分使用可用空间。
- 低密度设置表单在宽容器中应使用合理的多列布局或字段跨度，不得把单个输入框无意义拉伸到整行。
- 响应式：桌面三栏，平板厂商横排加列表/详情两栏，手机依次显示厂商、模型列表、详情，不能水平溢出。

## Acceptance Criteria

- [x] 管理员可先切换厂商，再从该厂商的已配置或预设模型行打开右侧详情。
- [x] 点击预设不会立即发出创建请求；保存后才写入并在当前厂商列表出现。
- [x] 新增空白模型自动使用当前厂商及推荐对话端点。
- [x] 模型保存、重新加载和删除仍能正确更新厂商分组与选择状态。
- [x] 纯图片模型不显示对话协议选择器，映射预览显示真实图片专用请求通道。
- [x] 1920px 级宽屏下全部 16 个后台分区均接近填满后台可用内容区，不出现大面积左右留白。
- [x] 所有后台分区使用统一容器宽度策略，不依赖 `:has()` 或单个页面的特殊宽度覆盖。
- [x] 桌面、1280 宽桌面和 375/390 移动端无横向溢出，详情控件可读可操作。
- [x] TypeScript、Admin E2E、UI/feature contracts、build、runtime UI、smoke 和 `git diff --check` 通过。

## Model vendor management extension

- 模型厂商是管理员可维护的显示实体，包含稳定 ID、前台显示名称、底层请求适配器、启用状态和排序；底层请求适配器仍限定为系统已支持的 `ProviderKind`，不允许自定义协议代码。
- 旧模型数据必须自动映射到同名默认厂商，迁移后继续使用原有 `vendor` 适配器和端点，不改变真实请求行为。
- 厂商栏和模型栏都在各自列表底部提供新增与删除操作；模型新增始终归属当前厂商。
- 管理员可以删除空厂商。厂商仍有模型时，前端禁用删除并提示先迁移或删除模型，服务端再次拒绝删除，避免级联误删。
- 自定义厂商可以选择 OpenAI、Anthropic、Gemini、Kimi、DeepSeek、Qwen、BotCF 或 OpenAI Compatible 适配器；模型保存时由所选厂商确定真实 `vendor`。
- “模型能力”和“默认用途”改为低噪声设置分组：统一字体、行高和复选框，使用细分隔与低浓度选中背景，不再让每个选项看起来像独立的大卡片。
- 详情栏只保留模型保存；模型删除移入模型列表底部并继续使用确认流程。

## Additional acceptance criteria

- [x] 管理员新增厂商后无需刷新即可在厂商列表中选中，并可通过模型列表底部操作为它新增模型。
- [x] 新增厂商名称不能为空且不能与现有厂商重名；适配器必须来自系统支持集合。
- [x] 空厂商可经确认后删除；含模型厂商的删除按钮不可用，直接调用删除 API 也返回明确的冲突错误。
- [x] 元数据导入导出、备份恢复和旧版 `app-data.json` 均保留或补齐厂商与模型的关联。
- [x] 自定义厂商下的模型仍按所选适配器走既有请求协议，模型运行时不读取或执行管理员输入的自定义代码。
- [x] 桌面、平板与移动端的厂商操作区不被推到大块空白底部，能力/用途设置无横向溢出。

## Non-goals

- 不新增可自定义的请求协议、适配器实现或任意代码执行能力。
- 不在本轮提供厂商级 API Key、URL 或凭据配置。
- 不修改模型请求端点协议、后端路由或媒体调用行为。

## Model ordering extension

- 每个模型目录条目增加持久化的全局 `order`。旧数据按原数组顺序自动补齐，不要求管理员重新配置。
- 后台模型目录在当前厂商的已配置模型行中直接排序；桌面拖动，键盘和移动端使用上移/下移按钮，不再打开独立排序面板。
- 所有前台模型选择菜单按 `order` 展示。每个功能默认使用排序中第一个已启用且支持该功能的模型。
- 用户已经在浏览器中明确选择并保存的 `lastModelId` 继续优先于后台默认顺序；失效或不兼容时才回退到排序第一项。
- 原有 `defaultFor` 元数据保留用于旧数据导入导出兼容，但不再参与默认模型决策，后台不再展示会与排序冲突的“默认用途”设置。
- 排序必须通过一个原子批量接口保存，拒绝缺失、重复或未知模型 ID，不允许部分成功。

## Model ordering acceptance criteria

- [x] 管理员可在当前厂商模型列表直接拖动已配置模型，并可通过上移/下移按钮完成同样操作。
- [x] 保存后刷新、服务重启、元数据导入导出和备份恢复均保留模型顺序。
- [x] 对话、绘画、PPT、思维导图、翻译、应用、智能体和工作流的模型列表均按后台顺序展示。
- [x] 每个功能在没有有效用户历史选择时，默认选中排序中第一个兼容且已启用模型。
- [x] 旧数据缺少 `order` 时仍能稳定启动，并按原目录顺序补齐连续排序值。
- [x] 桌面端拖拽、键盘按钮和 375/390 移动端按钮均可用，排序成功不显示额外提示且不产生横向溢出。

## Model catalog density refinement

- 删除工作台内部重复的“模型目录”标题、正常状态下的“模型目录校验通过”和前台能力预览；保留后台页面自身的一级标题。
- 模型目录存在校验问题时，仅在工作台前显示一条紧凑警告；无问题时不占据垂直空间。
- 模型排序直接发生在当前厂商的模型行；新增与删除固定在模型列表底部。
- 模型列表最多展示约 8 条标准模型行的高度，已配置模型、草稿和可添加预设共享一个稳定宽度的纵向滚动区域。
- 右侧模型设置不再重复展示模型厂商选择器，也不再展示前台名称到实际请求名称的映射预览；厂商归属由左侧厂商导航和新增入口决定。
- 模型能力删除解释文案和大尺寸表格，在超宽屏压缩为 8 列、最多两行的勾选区；1440/1280 和手机按可用宽度降列且不得截断标签或水平溢出。

## Density refinement acceptance criteria

- [x] 正常模型目录打开后，工作台直接贴近页面标题，不显示内部重复标题、成功校验条或前台能力预览。
- [x] 有目录问题时仍能看到紧凑且可读的错误数量提示。
- [x] 模型行直接提供排序控制，新增与删除从模型列表底部触达。
- [x] 厂商模型超过 8 条时模型列表内部滚动，标题、厂商导航和右侧设置不随其滚动。
- [x] 右侧不存在“模型厂商”选择框和名称映射预览，保存请求仍携带正确的 `vendorId` 与适配器。
- [x] 14 项模型能力在宽屏中最多占两行，移动端保持 44px 触控目标且无横向溢出。

## Vendor order and scroll refinement

- 桌面模型厂商选项增加上下高度和内边距，使触控面积与模型行接近；厂商栏本身继续使用原有横向宽度比例。
- 厂商列表最多显示 6 个厂商，超过后在厂商列表内部纵向滚动；新增、删除和说明区不随厂商列表滚动。
- 管理员可直接拖动厂商行调整顺序，保存后的顺序必须在刷新、服务重启、元数据导入导出和备份恢复后保持。
- 厂商排序使用完整 ID 列表的原子批量接口，拒绝缺失、重复或未知厂商 ID；不允许部分成功。
- 模型列表从约 8 行收紧为最多约 6 个标准模型行高度，已配置模型、草稿和预设继续共享一个内部滚动区。
- 厂商与模型滚动区必须始终保留稳定滚动条宽度，空闲时滚动条透明；滚动期间显示稍粗、低对比的浅色滚动条，并在停止滚动后淡出，不得造成列表宽度抖动。
- 厂商行与已配置模型行使用相同的高度、间距、圆角、悬停和选中视觉语言；模型自身的请求名、能力摘要与状态仍保留。
- 厂商排序不显示全局成功提示或“已移至第 N 位”文案，仅在保存失败时显示错误。

## Vendor order and scroll acceptance criteria

- [x] 桌面厂商选项高度与模型行接近，图标、名称、数量和拖动柄保持垂直居中。
- [x] 厂商列表第 7 项开始通过内部滚动访问，管理操作始终位于列表下方。
- [x] 拖动厂商后立即更新列表位置，保存请求只发送一次完整厂商 ID 顺序，刷新后保持。
- [x] 厂商排序成功不显示全局成功提示；仅在保存失败时显示错误。
- [x] 厂商排序后页面不显示“已移至第 N 位”文案，模型行与厂商行使用一致的交互表面。
- [x] 非法厂商排序请求不会修改已有顺序。
- [x] 模型列表最多展示约 6 行，超出后内部滚动且不推长右侧设置面板。
- [x] 两个滚动区空闲时滚动条视觉隐藏，滚动时显示浅色 7px 滚动条，停止后平滑淡出且行宽不变化。
- [x] 1440、1280、390 和 375 四个视口均无横向溢出，移动端仍保留 44px 触控目标。

## Direct model-list ordering acceptance criteria

- [x] 当前厂商的已配置模型行可直接拖动排序；移动端和键盘替代操作提供上移/下移按钮。
- [x] 厂商内移动会保存完整全局模型 ID 顺序，但不改变其他厂商模型的相对位置。
- [x] 模型列与厂商列均使用标题、内部滚动区和底部操作区三段式框架，两个底部操作区垂直对齐。
- [x] 新增模型和已保存模型的删除入口位于模型列底部；删除继续经过确认，未保存草稿的删除按钮禁用。
- [x] 独立模型排序弹窗、成功提示和位置提示均不再出现；保存失败仍在当前模型列显示。

## Admin shell design-system extension

- 将模型管理的标题、列表、内部滚动、底部操作和详情设置模式沉淀为后台设计规范，供后续列表/详情型页面复用。
- 后台导航按管理员操作路径重排为运行总览、AI 能力、内容与展示、知识库、系统与安全五组；保留全部现有 `AdminSectionId` 与功能。
- 桌面后台使用紧凑工具栏、强层级侧栏和无重复外卡片的内容画布；不得继续让侧栏、内容外框和页面区块形成三层嵌套卡片。
- 页面头部显示中文分组路径、标题和必要说明，去掉英文 eyebrow 与重复标题。
- 桌面保持一个 `.admin-console` 页面滚动容器；模型页继续使用已有内部滚动。移动端保持一个粘性分区选择器和一个页面滚动容器。
- 第一层分组按钮包含图标、标签和分区数量；一次只展开一个分组，打开目标页面时自动展开所属分组。
- 导航选中态与模型厂商/模型行共享无阴影、低对比填充、小圆角和稳定尺寸的视觉语言。

## Xiaohongshu-style Admin navigation refinement

- Keep the existing blue-white Admin palette, feature IDs, API ownership, and one-expanded-group behavior.
- Remove the detached child indentation. The expanded group must be one surface whose parent button and destination area share a horizontal boundary.
- Desktop uses one full-width compact destination card per row. Mobile keeps the existing grouped select.
- Use card rhythm for repeated navigation and operational summaries, but do not introduce glass, gradients, shadows, nested page cards, decorative motion, or extra explanatory copy.
- Preserve keyboard navigation, truthful `aria-expanded`, `aria-controls`, `aria-current`, one mounted section, one scroll owner, and no horizontal overflow.

### Acceptance criteria

- [x] Desktop Admin sidebar is 288px and does not resize across destination changes.
- [x] Expanded parent and child grid share a left boundary; child tiles are not externally indented.
- [x] Desktop child destinations render as one column with 48px or larger stable targets and no shadow.
- [x] `1280x800`, `1440x900`, `390x844`, and `375x812` remain operable without horizontal overflow.
- [x] Figma redesign frame and web research are recorded in the task.

## Model invocation statistics refinement

- The operations overview must show real provider calls grouped by model: display/request model name, call count, most recent call time, average elapsed time, and total elapsed time.
- Statistics must cover chat, title generation, prompt optimization, image/audio/video, agents/workflows, PPT, mind map, translation, knowledge, transcription, and embedding requests.
- Usage records are operational telemetry only. They must never contain a Key, URL, prompt, attachment, response, tool payload, knowledge content, or user identity.
- Storage remains file-based and bounded; this refinement must not introduce a database or modify `app-data.json` on every call.
- The overview must provide a truthful empty state and remain readable without document-level horizontal overflow on desktop and mobile.

### Acceptance criteria

- [x] Completing a tracked model request produces exactly one allowlisted usage event.
- [x] Admin operations aggregates calls, latest time, average duration, and total duration by model.
- [x] Renaming a catalog display label is reflected in later Admin reads without rewriting historical events.
- [x] Malformed records and telemetry write failures do not break model requests or the Admin overview.
- [x] Server tests prove secret omission and aggregation math; Admin E2E proves desktop/mobile rendering.

## Admin shell acceptance criteria

- [x] 五个导航分组按既定顺序显示，全部 16 个后台分区在桌面和移动端均可访问。
- [x] 桌面一次只展开一个导航分组，活动页面具有 `aria-current="page"`，分组具有正确的 `aria-expanded`。
- [x] 页面不显示英文 eyebrow；标题区和活动内容上移且不被重复外框包裹。
- [x] `1440x900`、`1280x800`、`390x844`、`375x812` 无横向溢出、无页面切换几何跳动，并保持单一可见滚动容器。
- [x] 模型目录的厂商、模型、详情三列及其保存/排序/增删行为不因壳层重构而改变。
- [x] TypeScript、Admin E2E、UI/feature contracts、production build、runtime smoke 和 `git diff --check` 通过。
