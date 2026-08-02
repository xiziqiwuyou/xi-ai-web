# Official Chat Endpoint Contracts

Checked on 2026-07-27 against the official reference locations listed below. Direct retrieval from this environment was partially blocked by timeouts, HTTP 403, and an Anthropic region redirect, so no live provider behavior is claimed here. The endpoint contracts also match the repository's existing provider adapters and contract tests.

## OpenAI Chat Completions

- Reference: https://platform.openai.com/docs/api-reference/chat/create
- Endpoint: `POST /v1/chat/completions`
- Auth: `Authorization: Bearer <key>`
- Core request: `model`, `messages`, optional Chat-style `tools`, `stream`.
- Core response: `choices[].message.content`; SSE deltas use `choices[].delta.content` and terminate with `[DONE]`.

## OpenAI Responses

- Reference: https://platform.openai.com/docs/api-reference/responses/create
- Endpoint: `POST /v1/responses`
- Auth: `Authorization: Bearer <key>`
- Core request: `model`, `input`, optional `instructions`, Responses-style tools, `previous_response_id`.
- Core response: `output_text` or typed `output[]` items. Function calls and outputs use Responses item types rather than Chat `tool_calls` messages.

## Anthropic Messages

- Reference: https://docs.anthropic.com/en/api/messages
- Endpoint: `POST /v1/messages`
- Auth: `x-api-key: <key>` plus `anthropic-version`.
- Core request: `model`, `max_tokens`, top-level `system`, and `messages` content blocks.
- Core response: typed `content[]` blocks; tool use and tool result blocks differ from OpenAI schemas.

## Gemini generateContent

- Reference: https://ai.google.dev/api/generate-content
- Endpoint: `POST /v1beta/models/{model}:generateContent`
- Auth: `x-goog-api-key: <key>`.
- Core request: `contents[].parts`, optional `systemInstruction`, `generationConfig`, and Gemini `tools`.
- Core response: `candidates[].content.parts`; function calls and responses are Gemini part objects.

## Implementation consequence

Changing only the URL is invalid. Each selected protocol must switch the request mapper, authentication headers, tool schema, response parser, and stream parser together. Media endpoints remain separate from this chat protocol choice.
