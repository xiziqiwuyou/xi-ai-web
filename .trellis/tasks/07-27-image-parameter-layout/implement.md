# 执行计划

## Phase 01 - 契约更新

1. 更新图像模块 E2E，锁定四个可见菜单和已删除菜单缺失。
2. 锁定默认 `1K 正方形`、低质量、PNG、自动背景和无压缩请求。
3. 覆盖尺寸方向映射、模型能力回落和编辑请求兼容。

## Phase 02 - 参数模型与请求投影

1. 建立九个尺寸预设及模型能力过滤。
2. 用单一尺寸状态替换独立比例/分辨率状态。
3. 固定 PNG、自动背景和质量默认值，并为非结构化质量模型保留提示词语义。
4. 保持耗时记录继续存储规范化 resolution/aspectRatio。

## Phase 03 - 菜单与响应式布局

1. 删除比例、分辨率、背景、格式和压缩菜单。
2. 将参数网格调整为桌面四列、平板两列、移动单列。
3. 保持菜单键盘、焦点恢复、弹层边界和移动触控契约。

## Phase 04 - 验证

1. 运行 `npm run check`、`npm run ui-contract` 和图像模块 Playwright。
2. 运行 Provider/功能契约，确认安全默认值没有改变适配器边界。
3. 运行 Build、Smoke、`git diff --check`，记录结果与剩余风险。

## 执行结果

- 参数区只保留模型、尺寸、质量和生成数量；默认 `1K · 正方形`、低质量和 `1 张`数量。
- 尺寸提供 `1K/2K/4K × 正方形/横版/竖版`，并按模型能力过滤。切换到仅支持 1K 的模型时会保留方向并回落到 1K。
- 请求继续发送规范化 `aspectRatio`、`imageSize` 和像素 `size`，同时固定 `outputFormat=png`、`background=auto`，不发送 PNG 压缩参数。
- 质量始终发送低/中/高语义；OpenAI 使用结构化质量字段，Gemini/BotCF 继续由各自适配器过滤不支持字段，同时通过服务端提示词保留质量意图。
- 桌面四列、平板两列、移动端单列的视觉截图已检查；旧比例、分辨率、背景、格式和压缩菜单已移除。
- Playwright 响应式矩阵通过：89 passed，35 skipped，0 failed；尺寸回落、文生图、图生图、参考图与蒙版请求均有回归覆盖。
- TypeScript、UI Contract、Feature Audit、Provider Contract、Runtime UI、Build、Smoke、脚本语法和 `git diff --check` 通过。

## 剩余风险

- OpenAI 旧图片模型只支持其合法的 1K 方形/横向/竖向尺寸，因此界面会隐藏 2K/4K，而不是展示后静默降级。
- 4K 像素尺寸继续沿用现有安全映射，避免扩大 Provider 请求面积；不同中转服务最终返回的真实像素仍以响应资源为准。
- 构建仍有既有的 Chat chunk 超过 500 KB 警告，与本次图像参数调整无关。
- 当前工作树包含既有未提交改动，本任务不自动提交或归档。

## Phase 05 - 菜单方向与动效统一

1. 为共享 `FigmaMenu` 增加默认不改变行为的方向覆写接口，并由 `StudioModelSelect` 透传。
2. 图像参数四个菜单固定向上展开，弹层宽度跟随等宽网格轨道。
3. 增加统一淡入位移动画和 reduced-motion 兼容。
4. 补充宽度、方向、动画、边界、键盘和移动触控回归，重新运行验证链。

### Phase 05 执行结果

- 桌面参数网格改为四个等宽轨道，四个触发器和各自弹层保持同宽；平板两列、移动端单列规则不变。
- 模型、尺寸、质量和生成数量均显式使用 `placement="up"`，共享菜单的默认 `auto` 定位不变，因此不会影响其他页面。
- 参数弹层使用统一的 `180ms` 淡入和 `6px` 位移动画，不使用会造成瞬时宽度变化的缩放；系统减少动态效果设置继续生效。
- 新增 Playwright 回归覆盖等宽、向上定位、动画、Esc 关闭和跨视口行为；完整 `module-shell` 矩阵通过：85 passed，27 skipped，0 failed。
- 默认生成数量调整为 `1 张`；文生图与图片编辑请求均由浏览器回归确认发送 `count: 1`，用户主动选择其他数量时仍按选择值提交。

## Phase 06 - Provider 端点与提示词优化修复

1. 为 `providerUrl` 增加厂商版本前缀投影，锁定裸域名、已有版本路径和自定义前缀行为。
2. 收紧 `fetchJson`、Multipart JSON 与二进制资源响应边界，拒绝 `200 text/html` 和无效 JSON。
3. 在提示词优化路由增加空文本、HTML 文档和包装格式校验。
4. Knowledge Embedding 改用 `/v1/embeddings`，Kimi 独立搜索改用 `/v1/chat/completions`，GLM 路径保持不变。
5. 扩展 Provider、Knowledge、Search 和图像优化回归；运行 TypeScript、Provider Contracts、Search Contracts、Knowledge tests、Feature Audit、Build、Smoke 与 `git diff --check`。

### Phase 06 执行结果

- 裸 `https://api.xi-ai.cn` 已按厂商投影为 OpenAI `/v1/responses`、Anthropic `/v1/messages`、Gemini `/v1beta/models/...`，以及 Kimi/DeepSeek/Qwen/BotCF/通用兼容 `/v1/...`；已有版本路径保持不变。
- `fetchJson` 与 Multipart JSON 现在拒绝空响应、HTML 和无效 JSON，同时兼容内容类型错误但正文确实是 JSON 的中转服务；二进制媒体请求拒绝 HTML 页面。
- 提示词优化结果会移除单层代码围栏或外层引号，并拒绝空文本和 HTML 文档。图像页面浏览器测试确认优化预览显示正常中文提示词。
- 独立复核后补强了错误媒体类型边界：二进制响应从同一字节缓冲区检查 HTML 前缀，因此大写、缺失或伪装为 `text/plain` 的 HTML 也不会变成 data URL；引号与代码围栏嵌套的 HTML 同样会被提示词优化拒绝。
- Knowledge Embedding 使用 `/v1/embeddings`；Kimi 搜索使用 `/v1/chat/completions`；GLM 继续使用 `/paas/v4/web_search`。
- 无效测试 Key 的本地真实链路返回 `502 application/json`，正文为上游 `401` JSON 鉴权错误，不再返回或展示 HTML。
- 验证通过：TypeScript、Provider Contracts、Search Contracts、9 项 Server tests、5 项 Security tests、153 项 Knowledge tests、Privacy、UI Contract、Feature Audit、图像 Playwright（9 passed / 3 skipped）、Runtime UI、Build、Smoke 和 `git diff --check`。
