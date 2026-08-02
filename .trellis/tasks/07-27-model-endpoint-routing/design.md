# Technical Design

## Data Contract

新增共享前端类型：

```ts
type ModelEndpointProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content";
```

`ModelCatalogEntry.endpointProtocol` 在服务端规范化后始终存在。后台请求仍使用 `Partial<ModelCatalogEntry>`，服务端是无效值和旧记录的最终规范化边界。

## Data Flow

```text
Admin selector
  -> ModelDraft
  -> ModelCatalogPayload
  -> sanitizeAdminModelCatalogEntry
  -> normalizeCatalogEntry
  -> db.modelCatalog
  -> buildRuntimeProvider
  -> createProviderAdapter
  -> selected chat protocol adapter
```

导入、备份恢复和旧 provider 迁移均通过 `normalizeModelCatalog()`，因此共享同一默认规则。

## Adapter Composition

`createProviderAdapter()` 分两步构造：

1. 按 `provider.kind` 创建厂商适配器，保留图像、音频、视频、向量及厂商特有实现。
2. 按 `provider.endpointProtocol` 创建对话适配器，仅覆盖 `streamChat` 和 `completeText`。

协议路由：

| endpointProtocol | 对话适配器 |
| --- | --- |
| `openai-chat` | OpenAI-compatible；Kimi/DeepSeek/Qwen 使用各自 Chat 参数归一化 |
| `openai-responses` | OpenAI Responses；Qwen 使用已有 Responses thinking 归一化 |
| `anthropic-messages` | Anthropic Messages |
| `gemini-generate-content` | Gemini generateContent |

这样 OpenAI 模型选择 Chat 时仍由 OpenAI 厂商适配器处理图片；Gemini 模型切到 Chat 时，Gemini 图片方法仍保持原生 `generateContent`。

## Version Prefix

`providerUrl()` 不再仅凭厂商判断 Gemini 版本。版本前缀以目标路径为准：Gemini 原生 `models/{model}:...` 使用 `/v1beta`，其余已支持协议使用 `/v1`；已有显式版本路径继续原样保留。

## Admin UX

- 厂商和对话端点是两个独立选择框。
- 端点选择展示协议名和精确路径。
- 模型名称映射预览同时展示选定协议。
- 应用模型预设时写入协议默认值。
- 更换厂商时应用推荐协议，管理员仍可随后手动覆盖。
- 帮助文本说明该选择仅影响对话，媒体端点不受影响。

## Compatibility

- 缺失/无效协议按厂商默认，不中断启动或元数据导入。
- 不删除任何 provider 文件或媒体方法。
- Qwen 原有“检测 hostedTools 后自动改走 Responses”的行为不再作为最终路由依据；后台协议是唯一对话端点来源。
- 端点与能力不自动互相修改。能力仍由管理员显式维护并由运行时 guard 校验。
