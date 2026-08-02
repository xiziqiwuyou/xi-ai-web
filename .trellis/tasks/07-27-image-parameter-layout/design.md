# 技术设计

## 尺寸语义

`ImageStudio` 使用本地闭合类型表达九个尺寸预设。每个预设同时拥有：菜单值、用户标签、`ImageResolution`、`ImageAspectRatio` 和像素尺寸。提交请求时从一个预设原子地投影四个字段，避免比例与分辨率出现不一致组合。

- 正方形：`1:1`
- 横版：`16:9`，OpenAI 不支持精确宽屏时由现有适配器降级为其横向合法尺寸。
- 竖版：`9:16`，OpenAI 不支持精确竖屏时由现有适配器降级为其竖向合法尺寸。

尺寸选项按 `imageModelCapabilities.resolutions` 过滤。模型切换后若当前清晰度不支持，则回落到 `1K` 并保持方向。

## 隐藏兼容默认值

- `outputFormat`: 固定 `png`，保持返回 MIME 和下载扩展名一致。
- `background`: 固定 `auto`，保持原有默认背景行为。
- `outputCompression`: PNG 下省略。
- `quality`: UI 总是提供低、中、高。支持 OpenAI 质量字段的适配器接收结构化值；其他模型通过现有 `stylePreset` 提示词通道接收中文质量偏好，结构化 Provider 字段仍省略。

服务端继续执行现有 allowlist、尺寸降级和 MIME fallback，不扩大输入协议。

## 布局

参数网格桌面为 `模型 | 尺寸 | 质量 | 生成数量` 四个等宽列。`1024px` 以下两列，`760px` 以下单列；每个菜单和弹层占满自己的网格轨道。

`FigmaMenu` 增加可选 `placement="auto|up|down"`。默认 `auto` 继续使用现有边界计算，避免改变 Chat、PPT、翻译和后台菜单；图像参数区四项显式使用 `up`。`StudioModelSelect` 只负责透传该配置。

图像参数弹层使用同一 CSS keyframe，从靠近触发器方向轻微上移并淡入，持续约 180ms。动画使用独立 `translate/scale` 属性，不覆盖菜单为防横向溢出计算的 `transform: translateX(...)`。

## 回滚

若请求契约失败，只回滚尺寸预设投影和四控件 JSX；Provider 适配器、上传流程与历史数据不变。

## Phase 06 - 托管上游端点与响应边界

### 根因

后台默认保存裸域名 `https://api.xi-ai.cn`。现有 `providerUrl()` 直接把 `/chat/completions`、`/responses`、`/messages` 或 `/models/...` 拼到域名后，导致请求命中站点前端回退路由。实际探测显示裸 `/chat/completions` 返回 `200 text/html`，对应版本化端点返回结构化 JSON 鉴权错误。`fetchJson()` 又把成功的非 JSON 内容包装为 `{ text: raw }`，最终使 HTML 被当成优化后的提示词。

### 端点投影

`providerUrl(provider, endpointPath)` 继续作为模型适配器的单一 URL 构造入口，但增加厂商 API 根路径：

- `gemini`：默认 `/v1beta`。
- 其他模型适配器：默认 `/v1`。
- 若后台路径已经以版本段结尾，或 `endpointPath` 已显式包含版本段，则保持原路径，避免 `/v1/v1`。
- 自定义路径前缀保留，例如 `https://gateway.example/api` 投影为 `https://gateway.example/api/v1/...`。

Knowledge Embedding 通过相同 helper 构造 `/v1/embeddings`。Kimi 独立搜索复用同一 URL 规则；GLM 继续使用其厂商固定 `/paas/v4/web_search`。

### 响应边界

JSON helper 首先读取有界文本，再执行以下判断：成功 JSON 或可解析 JSON 文本正常返回；HTML 文档抛出带端点提示的配置错误；其他无法解析内容抛出非 JSON 错误。Multipart JSON 使用同一解析器。二进制资源 helper 对 `text/html` 单独拒绝，防止 HTML 被包装成音频或其他 data URL。

提示词优化在 Provider 层之外增加最终文本校验：剥离单层 Markdown 代码围栏和外层引号，拒绝空文本以及 `<!doctype html>`/`<html>` 文档，避免兼容网关把异常页面包进 JSON 后再次穿透。

### 兼容性

Provider 请求体、鉴权 Header、模型映射和 Capability 不变。已经保存 `/v1`、`/v1beta`、`/compatible-mode/v1` 的管理员配置继续生成相同 URL；只修复裸域名和无版本自定义前缀。
