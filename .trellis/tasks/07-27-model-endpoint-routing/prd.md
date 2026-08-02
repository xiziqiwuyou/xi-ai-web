# 模型端点协议路由

## Goal

让管理员在模型目录中为每个模型明确选择对话请求协议，使模型厂商、前台显示名称、实际请求模型名和请求端点相互独立，避免仅凭厂商名称推断错误端点。

## Requirements

- 对话请求仅支持四种协议：
  - OpenAI Chat Completions：`/v1/chat/completions`
  - OpenAI Responses：`/v1/responses`
  - Anthropic Messages：`/v1/messages`
  - Gemini generateContent：`/v1beta/models/{model}:generateContent`
- 后台模型编辑页必须提供“对话请求端点”选择项，并显示准确的协议名称和路径。
- `vendor` 继续用于前台分组、能力描述、默认参数和厂商特定参数归一化；不能通过修改厂商字段来伪造协议路由。
- 模型目录新增 `endpointProtocol` 字段，并在后台 CRUD、公开/后台 bootstrap、元数据导入导出、备份恢复和预设应用中完整保留。
- 旧模型记录缺少字段时按厂商迁移：OpenAI -> Responses；Claude -> Messages；Gemini -> generateContent；Kimi、DeepSeek、Qwen、BotCF、OpenAI Compatible -> Chat Completions。
- OpenAI Chat 模式下继续保留 Kimi、DeepSeek、Qwen 已有的参数归一化逻辑。
- 端点选择只影响对话方法。图像、图片编辑、语音、视频和向量等既有专用端点及厂商适配器不得被替换或删除。
- 不限制“厂商 + 协议”组合，管理员可以让任意模型记录走四种协议之一；服务端必须使用所选协议对应的请求体、鉴权头和响应解析器。
- 前端用户仍只携带 API Key；上游基础域名继续由后台全局设置提供。

## Acceptance Criteria

- [ ] 后台模型编辑页可选择并保存四种对话端点协议。
- [ ] 重新打开模型、刷新 bootstrap、导出再导入元数据后，协议选择保持不变。
- [ ] Kimi 模型选择 OpenAI Chat 后，请求准确发送到 `/v1/chat/completions`，并保留 Kimi 参数归一化。
- [ ] OpenAI 厂商模型可分别选择 Chat Completions 或 Responses，且请求体和解析器随协议切换。
- [ ] 任意厂商记录选择 Anthropic Messages 或 Gemini generateContent 后，使用对应协议的路径、鉴权头、请求体和解析器。
- [ ] 旧目录记录无需手工修改即可获得稳定默认协议。
- [ ] 图像、音频、视频和向量契约测试保持通过。
- [ ] TypeScript、provider contracts、Admin E2E、feature audit、build、runtime UI、smoke 和 `git diff --check` 通过。

## Notes

- 截图中的 HTML 解析错误属于错误端点/网页响应；现有边界校验已能拒绝 HTML。当前 `401 shell_api_error` 是上游鉴权结果，本任务不会把无效 Key 伪装成端点错误。
- 本任务不做真实厂商密钥联调，用户已明确后续自行测试。
