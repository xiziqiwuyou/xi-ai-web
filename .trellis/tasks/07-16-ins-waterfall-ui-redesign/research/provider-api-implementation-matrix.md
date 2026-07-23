# Provider API Implementation Matrix

Date checked: 2026-07-19

Scope: official vendor documentation only. This is an implementation handoff for Anthropic Claude, Moonshot/Kimi, DeepSeek, and Alibaba Cloud Model Studio (Qwen/DashScope). Model aliases are date-sensitive and must remain configuration data rather than hard-coded protocol logic.

## Executive Decision

Implement four distinct adapters:

| Adapter ID | Protocol source of truth | Why it must be separate |
| --- | --- | --- |
| `anthropic-native` | Anthropic Messages API | Native content blocks, required `max_tokens`, `x-api-key`, typed stream events, and `tool_use`/`tool_result` are not OpenAI Chat Completions. |
| `openai-compatible-kimi` | Kimi Chat Completions | K3/K2 reasoning controls, fixed sampling values, preserved thinking, and two documented streaming usage placements require vendor logic. |
| `openai-compatible-deepseek` | DeepSeek Chat Completions | `thinking`, `reasoning_effort`, `reasoning_content`, text-only hosted input, and strict tool-history requirements differ from OpenAI. |
| `openai-compatible-dashscope` | DashScope OpenAI-compatible Chat Completions | Region/workspace URLs, `enable_thinking`, `preserve_thinking`, `thinking_budget`, output-token semantics, and multimodal extensions require vendor logic. |

Do not route the four native vendor presets through one unqualified generic OpenAI adapter. A user-supplied arbitrary URL belongs only to a separately labelled `openai-compatible-custom` preset.

## Endpoint And Authentication Matrix

| Vendor | Base URL / allowed origin | Chat endpoint | Required authentication and headers |
| --- | --- | --- | --- |
| Anthropic | `https://api.anthropic.com` | `POST /v1/messages` | `x-api-key: <key>`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`; optional `anthropic-beta`. |
| Moonshot/Kimi | `https://api.moonshot.ai/v1` | `POST /chat/completions` (full URL `https://api.moonshot.ai/v1/chat/completions`) | `Authorization: Bearer <MOONSHOT_API_KEY>`, `Content-Type: application/json`. |
| DeepSeek | `https://api.deepseek.com` | `POST /chat/completions` | `Authorization: Bearer <DEEPSEEK_API_KEY>`, `Content-Type: application/json`. An optional Anthropic-compatible surface exists at `https://api.deepseek.com/anthropic`, but it is not the OpenAI adapter endpoint. |
| DashScope, Beijing | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | `Authorization: Bearer <DASHSCOPE_API_KEY>`, `Content-Type: application/json`. |
| DashScope, Hong Kong | `https://{WorkspaceId}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | Same; key and URL region must match. |
| DashScope, Singapore | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | Same; key and URL region must match. |
| DashScope, Tokyo | `https://{WorkspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | Same; key and URL region must match. |
| DashScope, Frankfurt | `https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | Same; key and URL region must match. |
| DashScope, US Virginia | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` | `POST /chat/completions` | Same; US key required. |

DashScope also documents shared/legacy endpoints such as `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. New presets should prefer the exact current workspace-scoped URL supplied by the console. Never silently combine a key from one region with another region's base URL.

Native DashScope bases use the same regional host with `/api/v1`. Native text generation calls `POST /services/aigc/text-generation/generation`; native multimodal calls `POST /services/aigc/multimodal-generation/generation`.

## Current Model And Capability Matrix

### Anthropic Claude

The official TypeScript SDK currently exposes these active aliases, among others: `claude-sonnet-5`, `claude-fable-5`, `claude-mythos-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, and `claude-haiku-4-5`.

Recommended product presets:

| Model | Intended preset use | Protocol capabilities |
| --- | --- | --- |
| `claude-sonnet-5` | Current general Claude preset | Messages, structured content blocks, image/PDF input, tools, streaming, thinking/output effort. |
| `claude-opus-4-8` | High-capability preset | Same native protocol; verify model-specific limits from the live model catalog. |
| `claude-sonnet-4-6` | Stable general fallback | Same native protocol. |
| `claude-haiku-4-5` | Fast/cost-oriented fallback | Same native protocol; keep capability flags model-configured. |

`claude-fable-5` and `claude-mythos-5` are confirmed active SDK aliases, but should not be assigned product positioning without the live model overview. Anthropic's documentation pages redirect to a region-unavailable page in this environment, so the official SDK types are the verified source for current IDs and request shapes. Do not hard-code context or output limits from memory.

### Moonshot/Kimi

| Model | Context / mode | Chat | Reasoning | Vision/video | Tools |
| --- | --- | --- | --- | --- | --- |
| `kimi-k3` | 1M context; flagship | Yes | Always on; top-level `reasoning_effort`, currently only `max`; preserved thinking | Native visual understanding; Chat API supports image and video content blocks | Yes; `tool_choice: auto|none|required` |
| `kimi-k2.7-code` | 256K; code-focused | Yes | Always on; preserved thinking always on | Do not advertise vision solely from the generic request schema | Yes; `required` is unsupported |
| `kimi-k2.7-code-highspeed` | Same model/constraints as K2.7 Code; faster output | Yes | Same as K2.7 Code | Same caveat | Yes |
| `kimi-k2.6` | 256K; general multimodal | Yes | `thinking` enabled by default, may be disabled; optional `keep: all` | Text, image, and video | Yes; `required` is unsupported |

`kimi-k2.5` and `moonshot-v1-*` are unavailable to newly registered users and are scheduled for full platform sunset on August 31. The older K2 series was discontinued on 2026-05-25.

### DeepSeek

| Model | Context / output | Chat | Reasoning | Vision | Tools |
| --- | --- | --- | --- | --- | --- |
| `deepseek-v4-flash` | 1M context; maximum output 384K | Yes | Thinking and non-thinking; thinking enabled by default | No hosted image schema documented | Yes; JSON output, prefix completion; FIM only in non-thinking mode |
| `deepseek-v4-pro` | 1M context; maximum output 384K | Yes | Thinking and non-thinking; thinking enabled by default | No hosted image schema documented | Same capabilities, lower documented concurrency than Flash |

`deepseek-chat` and `deepseek-reasoner` are deprecated at 2026-07-24 15:59 UTC. They map to `deepseek-v4-flash` non-thinking and thinking modes respectively.

### Alibaba Qwen / DashScope

| Model | Context | Positioning | Reasoning | Vision | Tools/output |
| --- | --- | --- | --- | --- | --- |
| `qwen3.7-max` | 1M | Strongest current generally available Qwen reasoning preset | Hybrid thinking; supported | Verify exact visual support per selected snapshot | Function calling, built-in tools, structured output |
| `qwen3.7-plus` | 1M | Official recommended balance for chat, coding, documents, and agents | Hybrid thinking; enabled by default | Official image/video examples use this model | Function calling, built-in tools, structured output |
| `qwen3.6-flash` | 1M | Lower-cost general preset with similar feature breadth | Hybrid thinking; enabled by default | Qwen3.6 series supports multimodal input | Function calling, built-in tools, structured output |
| `qwen3-coder-plus` | Model-specific | Code-oriented preset | Model-specific | Do not assume | Tool calling supported by the Qwen Coder family |

`qwen3.8-max-preview` is listed as Token Plan only and must not be a default pay-as-you-go preset. The current official text-generation page recommends `qwen3.7-plus`, `qwen3.7-max`, and `qwen3.6-flash`; model aliases and snapshots must be data-driven.

## Request, Response, Streaming, And Tool Formats

### 1. Anthropic Native Messages

Representative request:

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 4096,
  "system": "You are a helpful assistant.",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe this image." },
        {
          "type": "image",
          "source": { "type": "url", "url": "https://example.com/image.png" }
        }
      ]
    }
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather by city",
      "input_schema": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      }
    }
  ],
  "thinking": { "type": "adaptive" },
  "output_config": { "effort": "high" }
}
```

Key response shape:

- One `Message`, not `choices[]`.
- `content` is an ordered array of typed blocks such as `text`, `thinking`, `redacted_thinking`, and `tool_use`.
- A tool invocation is `{type:"tool_use", id, name, input}`.
- Return tool output in a subsequent user message as `{type:"tool_result", tool_use_id, content, is_error?}`. There is no OpenAI `role:"tool"` contract.
- Images use `{type:"image", source:{type:"url"|"base64", ...}}`; base64 media types are JPEG, PNG, GIF, or WebP.
- Documents use `{type:"document", source:...}` and support base64/URL PDFs plus text/content sources.
- Extended thinking supports `adaptive`, `disabled`, or `enabled` with `budget_tokens >= 1024` and less than `max_tokens`. Thinking tokens count toward `max_tokens`.

Streaming is a typed event state machine: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, and `message_stop`. Tool JSON arrives incrementally as `input_json_delta.partial_json`. It is not OpenAI `choices[0].delta` SSE and must have a dedicated decoder.

### 2. Kimi OpenAI-Compatible Chat Completions

Representative K3 request:

```json
{
  "model": "kimi-k3",
  "messages": [{ "role": "user", "content": "Solve this problem." }],
  "max_completion_tokens": 131072,
  "reasoning_effort": "max",
  "stream": true,
  "stream_options": { "include_usage": true },
  "tools": []
}
```

K2.6 uses the vendor extension `thinking`, passed in Python OpenAI SDK calls through `extra_body`:

```json
{ "thinking": { "type": "enabled", "keep": "all" } }
```

Response and tool behavior:

- OpenAI-style `choices[0].message.content`, with vendor field `reasoning_content` when reasoning is emitted.
- OpenAI-style `tools`, `tool_calls`, `finish_reason:"tool_calls"`, and tool-result messages with `role:"tool"`, `tool_call_id`, and string `content`.
- Multiple tool calls can be returned. Streaming fragments `function.arguments`; concatenate by `tool_calls[].index` and validate parsed JSON before execution.
- Preserve complete assistant messages, including `reasoning_content`, across K3 and preserved-thinking tool loops.
- Multimodal user content uses OpenAI-style arrays containing `text`, `image_url`, or `video_url`; URL strings, object form, and data URLs are documented.

Streaming uses SSE and terminates with `data: [DONE]`. Official Kimi pages currently document two usage placements:

1. The streaming guide shows normal final usage at `choices[0].usage`.
2. `stream_options.include_usage=true` is documented as an additional OpenAI-style final chunk with `choices: []` and top-level `usage`.

The decoder must accept both and must treat `[DONE]`, not `finish_reason`, as transport completion.

### 3. DeepSeek OpenAI-Compatible Chat Completions

Representative request:

```json
{
  "model": "deepseek-v4-pro",
  "messages": [{ "role": "user", "content": "Solve this problem." }],
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "stream": true,
  "stream_options": { "include_usage": true },
  "tools": []
}
```

Python OpenAI SDK calls must place `thinking` in `extra_body`; `reasoning_effort` is a normal top-level argument. Response reasoning is `choices[0].message.reasoning_content` or streamed as `choices[0].delta.reasoning_content`, alongside normal `content`.

Tool behavior is OpenAI-style. `tool_choice` supports `none`, `auto`, `required`, and a specific function object. Tool definitions may set `strict:true` as a beta feature. In thinking mode, if an assistant turn performs a tool call, its complete `reasoning_content` must be passed back in every subsequent request in that interaction; omission returns HTTP 400. For non-tool multi-turn chat, previous reasoning may be omitted and is ignored if resent.

Streaming is OpenAI-style SSE terminated by `data: [DONE]`. With `include_usage:true`, the final usage chunk has empty `choices` and top-level `usage`.

The hosted Chat Completions schema does not expose `image_url` or another image input block. DeepSeek's official Anthropic-compatibility table explicitly marks image and document blocks unsupported. Treat V4 hosted chat as text-only.

### 4. DashScope OpenAI-Compatible And Native Formats

Representative compatible request:

```json
{
  "model": "qwen3.7-plus",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "https://example.com/image.jpg" } },
        { "type": "text", "text": "Describe the image." }
      ]
    }
  ],
  "enable_thinking": true,
  "thinking_budget": 81920,
  "preserve_thinking": true,
  "max_completion_tokens": 131072,
  "stream": true,
  "stream_options": { "include_usage": true },
  "parallel_tool_calls": false,
  "tools": []
}
```

In Python OpenAI SDK calls, non-standard fields such as `enable_thinking`, `thinking_budget`, `preserve_thinking`, and `top_k` go in `extra_body`. Direct HTTP and the Node SDK send them at the request body's top level.

Compatible response behavior:

- OpenAI-style `choices`, `message`, `tool_calls`, and `usage`.
- Reasoning appears in `message.reasoning_content` or `delta.reasoning_content` before answer `content`.
- Streamed tool call names/IDs may appear once while `function.arguments` is fragmented; concatenate by index.
- `stream_options.include_usage=true` returns a final chunk with `choices: []` and top-level `usage`, then `[DONE]`.
- Image/video usage can include `image_tokens`, `video_tokens`, and audio-token details.

Native DashScope request shape:

```json
{
  "model": "qwen-plus",
  "input": {
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Who are you?" }
    ]
  },
  "parameters": {
    "result_format": "message",
    "enable_thinking": true,
    "incremental_output": true
  }
}
```

Native response is `{output:{choices:[{message,finish_reason}]},usage,request_id}`. Native multimodal content uses blocks such as `{"image":"..."}`, `{"video":...}`, and `{"text":"..."}` rather than OpenAI `image_url`. For native cURL streaming, send `X-DashScope-SSE: enable`; events contain `id`, `event:result`, HTTP status metadata, and `data:{...}`. Set `incremental_output:true` to avoid cumulative repeated content.

## Parameter Differences And Incompatibilities

| Concern | Anthropic | Kimi | DeepSeek | DashScope/Qwen |
| --- | --- | --- | --- | --- |
| System instruction | Native top-level `system` is canonical | OpenAI system message | OpenAI system message | OpenAI system message; visual docs advise avoiding system messages in ordinary non-agent visual conversations for best performance |
| Output limit | `max_tokens` required; includes thinking | `max_tokens` deprecated; use `max_completion_tokens`; K3 default 131072, maximum 1048576 | `max_tokens`; total input + output limited by model context | `max_tokens` is being deprecated and limits answer text excluding CoT for supported Qwen models; `max_completion_tokens` limits CoT + answer |
| Reasoning control | `thinking` plus `output_config.effort` | K3: `reasoning_effort:"max"`; K2.x: vendor `thinking` | `thinking.type` plus `reasoning_effort: high|max` | `enable_thinking`, `thinking_budget`, optional `preserve_thinking`; selected models also support vendor-specific `reasoning_effort` mappings |
| Sampling | Native ranges are model-specific | K3/K2.7/K2.6 values are fixed; sending different values errors | Thinking mode ignores `temperature`, `top_p`, and penalties without error; frequency/presence penalties are deprecated globally | `temperature` range `[0,2)`, `top_p` `(0,1]`; recommend setting only one; some reasoning families forbid changing defaults |
| Multiple candidates | Native Messages is one generated message | K3/K2 fixed `n=1` | Do not assume OpenAI `n` portability | `n` support is model/mode-specific; tools require `n=1` |
| Tool schema | `input_schema`; native tool blocks | OpenAI `function.parameters`; max 128 tools; strict mode uses Moonshot's supported JSON Schema subset | OpenAI schema; optional beta `strict:true` | OpenAI schema; validate generated arguments; native format differs |
| Forced tool | Native `tool_choice` shape, not OpenAI enums | K3 supports `required`; K2.6/K2.7 do not; forcing a specific function is incompatible with thinking | Supports `none`, `auto`, `required`, or specific function | Specific forced function is unsupported in thinking mode; `parallel_tool_calls` defaults false |
| Multimodal | Native `image`/`document` source blocks | OpenAI-like `image_url`/`video_url` extensions | Treat hosted V4 as text-only | OpenAI-like image/video/audio extensions; native DashScope uses different block keys |
| Reasoning history | Preserve native thinking/signature blocks when required by model flow | Preserve complete assistant messages for K3 and preserved-thinking K2 flows | Mandatory after tool calls in thinking mode or HTTP 400 | `preserve_thinking` requires exact historical `reasoning_content`; do not concatenate it into `content` |
| Stream protocol | Typed Anthropic event state machine | OpenAI-like SSE plus Kimi usage-placement variants | OpenAI-like SSE | OpenAI-like SSE on compatible API; different SSE event envelope on native API |

## Adapter Implementation Rules

1. Bind each native vendor preset to its documented origin and adapter ID. Reject a forged vendor/origin pair before sending credentials.
2. Store model capability data separately from protocol code: `supportsVision`, `supportsVideo`, `supportsTools`, `supportsThinking`, `thinkingControl`, `maxOutputParameter`, and `requiresReasoningHistory`.
3. Build request parameters from a vendor/model allowlist. Do not forward every generic UI field. Omit fixed or unsupported fields rather than relying on vendors to ignore them.
4. Normalize responses into separate channels: `reasoningText`, `answerText`, `toolCalls`, `usage`, `finishReason`, and `rawAssistantMessageForHistory`.
5. Preserve the raw assistant message needed for tool and reasoning continuity. A normalized text-only transcript is insufficient for Kimi, DeepSeek, and preserved-thinking Qwen flows.
6. Stream decoders must buffer fragmented tool arguments by tool-call index and tolerate a final empty-choices usage chunk. Kimi must additionally accept `choices[0].usage`.
7. Validate tool argument JSON and the declared schema before execution. Never execute directly from an unvalidated model string.
8. Keep multimodal transforms vendor-specific. Anthropic image/PDF blocks, Kimi/Qwen OpenAI-style blocks, native DashScope blocks, and DeepSeek text-only input are not interchangeable.
9. Do not follow cross-origin redirects with `Authorization`, `x-api-key`, or other credentials. Vendor presets should not need redirects in normal operation.
10. Surface a clear configuration error for region/key mismatch, unsupported model/feature combinations, fixed-parameter violations, and missing reasoning history.

## Minimum Contract Tests

| Test group | Required fixtures/assertions |
| --- | --- |
| Origin/auth | Exact origin and path per preset; forged Anthropic/Kimi/DeepSeek origin rejected; DashScope workspace/region pattern validated; correct auth header name; no credential forwarding across origin. |
| Basic non-stream chat | Serialize one user turn and normalize answer/usage for all four adapters. |
| Streaming | Anthropic event lifecycle; Kimi nested and top-level usage variants; DeepSeek/Qwen final empty-choices usage chunk; `[DONE]`; interrupted stream remains incomplete. |
| Reasoning | Anthropic thinking block; K3 `reasoning_effort`; K2.6 `thinking`; DeepSeek thinking on/off and ignored sampling; Qwen `enable_thinking` plus `thinking_budget`. |
| Tool calling | Single and multiple calls; fragmented arguments; schema validation; tool result round trip; preserved assistant/reasoning history; DeepSeek missing-history 400 fixture. |
| Multimodal | Anthropic URL/base64 image and PDF; Kimi image/video; Qwen image/video and native block conversion; DeepSeek rejects/does not expose vision UI. |
| Parameter pruning | Kimi fixed sampling fields omitted; K2 `required` rejected; Qwen forced tool in thinking rejected; correct max-output parameter chosen; unsupported penalties omitted. |
| Model lifecycle | Deprecated Kimi and DeepSeek aliases not offered as defaults; unknown aliases remain configurable without changing protocol code. |

## Official Sources

### Anthropic

- https://platform.claude.com/docs/en/api/messages
- https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://github.com/anthropics/anthropic-sdk-typescript
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/client.ts
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts

### Moonshot/Kimi

- https://platform.kimi.ai/docs/llms.txt
- https://platform.kimi.ai/docs/api/overview.md
- https://platform.kimi.ai/docs/api/chat.md
- https://platform.kimi.ai/docs/api/models-overview.md
- https://platform.kimi.ai/docs/models.md
- https://platform.kimi.ai/docs/api/tool-use.md
- https://platform.kimi.ai/docs/guide/use-kimi-api-to-complete-tool-calls.md
- https://platform.kimi.ai/docs/guide/use-tool-choice.md
- https://platform.kimi.ai/docs/guide/utilize-the-streaming-output-feature-of-kimi-api.md

### DeepSeek

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/guides/thinking_mode
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/guides/anthropic_api

### Alibaba Cloud Model Studio / Qwen / DashScope

- https://www.alibabacloud.com/help/en/model-studio/llms.txt
- https://www.alibabacloud.com/help/en/model-studio/models.md
- https://www.alibabacloud.com/help/en/model-studio/text-generation-model/
- https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions.md
- https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope.md
- https://www.alibabacloud.com/help/en/model-studio/text-generation.md
- https://www.alibabacloud.com/help/en/model-studio/deep-thinking.md
- https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling.md
- https://www.alibabacloud.com/help/en/model-studio/vision.md
- https://www.alibabacloud.com/help/en/model-studio/stream.md
