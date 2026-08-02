# Provider endpoint audit

## Reproduction

- `POST https://api.xi-ai.cn/chat/completions` with an invalid audit key returned `200 text/html; charset=utf-8`.
- `POST https://api.xi-ai.cn/v1/chat/completions` returned `401 application/json; charset=utf-8`.
- `POST https://api.xi-ai.cn/v1/responses` returned `401 application/json; charset=utf-8`.
- `POST https://api.xi-ai.cn/v1/messages` returned `401 application/json; charset=utf-8`.
- `POST https://api.xi-ai.cn/v1beta/models/gemini-2.5-flash:generateContent` returned `401 application/json; charset=utf-8`.

Only status and content type were inspected. The probes used an intentionally invalid audit key and did not access browser credentials.

## Official API references

- OpenAI Responses: https://platform.openai.com/docs/api-reference/responses/create
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat/create
- Anthropic Messages: https://docs.anthropic.com/en/api/messages
- Gemini generateContent: https://ai.google.dev/api/generate-content
- DeepSeek Chat Completions: https://api-docs.deepseek.com/api/create-chat-completion
- Alibaba Model Studio OpenAI compatibility: https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope

The normal web-search transport was unavailable during this audit, so endpoint behavior was additionally verified against the configured managed gateway with no real credentials.
