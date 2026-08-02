# Research: OpenAI session settings

- Query: Current official OpenAI API guidance for Chat Session Settings, specifically Responses API text verbosity/detail controls, streaming usage inclusion, tool/function calling fields, safe execution, and screenshot settings without a real OpenAI equivalent.
- Scope: mixed (official OpenAI API schema/docs plus repository implementation mapping)
- Date: 2026-07-25

## Findings

### Executive result

For the native OpenAI adapter, use the Responses API wire shape. The relevant request fields are:

```json
{
  "model": "<model-id>",
  "input": "<input or input items>",
  "text": { "verbosity": "low" },
  "max_output_tokens": 4096,
  "stream": true,
  "tools": [
    {
      "type": "function",
      "name": "lookup",
      "description": "Look up a record",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"],
        "additionalProperties": false
      },
      "strict": true
    }
  ],
  "tool_choice": "auto",
  "parallel_tool_calls": false
}
```

Do not send a top-level `detail`, `text.detail`, or Responses API `stream_options.include_usage` field. Those are not valid final-answer/usage controls in the current Responses schema.

### Text verbosity and the three different "detail" concepts

The final answer's verbosity is configured under `text.verbosity`:

```json
{
  "text": {
    "verbosity": "low"
  }
}
```

- Exact enum: `low | medium | high`.
- Schema default: `medium`.
- A UI choice named `Default` should omit `text.verbosity`; it must not send the literal string `default`.
- A UI label such as Brief/Normal/Detailed can map to `low/medium/high`.
- There is no `off`, `xhigh`, numeric percentage, top-level `detail`, or `text.detail` value for final-answer verbosity.
- `text.verbosity` is a soft answer-style constraint. It is not a hard length budget. Keep the separate `max_output_tokens` field for a hard upper bound; the current schema says this cap includes visible output and reasoning tokens.
- Gate this field by model/provider capability and use omission as the compatibility default. Do not forward it blindly to OpenAI-compatible vendors.

Two similarly named fields must not be used for answer verbosity:

- `input_image.detail` controls image input fidelity/token use, with current values `auto | low | high | original`. It does not control textual answer detail.
- `reasoning.summary: "detailed"` requests a more detailed reasoning summary. It does not make the final answer more verbose and is not hidden chain-of-thought. The final-answer setting remains `text.verbosity`.

The existing reasoning-length control is a different dimension. Native Responses uses `reasoning.effort`; the current schema lists `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, while warning that model support varies. The repository's `off -> none` and omission-for-default approach is structurally correct (`server/providers/openai.mjs:101-112`).

### Streaming and usage

#### Responses API

Use:

```json
{
  "stream": true
}
```

Consume SSE events and read token usage from the terminal `response.completed` event:

```text
event.type === "response.completed"
event.response.usage.input_tokens
event.response.usage.output_tokens
event.response.usage.total_tokens
```

Current `ResponseStreamOptions` contains `include_obfuscation`; it does not contain `include_usage`. Therefore this is invalid for `/v1/responses`:

```json
{
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

If the stream ends before `response.completed`, complete totals may be unavailable. A function-call loop can create more than one Response, so session/request accounting must sum the `usage` from every completed Response in the loop, not only the final text-producing Response.

#### Chat Completions API only

For `/v1/chat/completions`, this remains valid:

```json
{
  "stream": true,
  "stream_options": {
    "include_usage": true
  }
}
```

The official schema says this adds a final usage chunk before `data: [DONE]`; that chunk has an empty `choices` array, earlier chunks carry `usage: null`, and an interrupted stream may miss the final totals. This Chat Completions option must not be copied into the native Responses adapter.

### Function/tool request fields for Responses

The Responses function definition is flat. It is not the nested Chat Completions shape:

```json
{
  "type": "function",
  "name": "lookup",
  "description": "Look up a record",
  "parameters": { "type": "object", "properties": {} },
  "strict": true
}
```

Relevant fields:

- `tools`: array of function or built-in tool definitions.
- Function tool: required `type: "function"` and `name`; normally provide `description`, `parameters`, and explicit `strict: true`.
- `tool_choice: "none"`: prohibit tool calls and produce a message.
- `tool_choice: "auto"`: allow a message or one/more tool calls.
- `tool_choice: "required"`: require one or more tool calls.
- `tool_choice: { "type": "function", "name": "lookup" }`: force one named function.
- `tool_choice: { "type": "allowed_tools", "mode": "auto" | "required", "tools": [...] }`: constrain the callable subset when that current Responses feature is desired.
- `parallel_tool_calls`: boolean, default `true`. Set `false` when calls have side effects, require ordered approval, or the executor is not concurrency-safe.
- `max_tool_calls` applies to built-in tools in the current schema; keep an application-side round/call limit for custom functions.

The model emits an output item shaped as:

```json
{
  "type": "function_call",
  "call_id": "call_123",
  "name": "lookup",
  "arguments": "{\"query\":\"x\"}"
}
```

Return the result in a later Responses input item, preserving `call_id` exactly:

```json
{
  "type": "function_call_output",
  "call_id": "call_123",
  "output": "{\"ok\":true}"
}
```

`output` may be a string or a supported text/image/file content array in the current schema. For streamed function arguments, accumulate `response.function_call_arguments.delta` by `item_id`/`output_index` and parse/validate only after `response.function_call_arguments.done`, whose finalized payload includes `item_id`, `output_index`, `name`, and `arguments` (but not the later tool-result correlation `call_id`).

Do not use the Chat Completions nesting (`tools[].function`) or legacy request `function_call` field in the native Responses adapter. The repository correctly separates the native flat Responses mapping (`server/providers/openai.mjs:52-59`) from the nested compatible mapping (`server/providers/openai-compatible.mjs:18-26`).

### Safe handling contract

1. Treat browser-provided tool names as requests, not authority. Resolve them against the server-owned enabled/capability allowlist before exposing definitions or executing a call. The repository already does this at `server/index.mjs:2259-2281`, `server/index.mjs:1607-1610`, and `server/tools/registry.mjs:180-226`.
2. Send explicit, strict-compatible JSON Schemas and `strict: true`. Validate parsed arguments again at the executor boundary; schema-constrained generation reduces malformed arguments but does not authorize side effects.
3. Reject malformed JSON and schema mismatches. Do not reinterpret malformed JSON as a permissive fallback object. The current `parseToolArguments` fallback `{ input: rawString }` at `server/providers/types.mjs:250-257` is unsafe for strict tools because invalid arguments can reach an executor under a different shape.
4. Reject any returned function name that was not in the exact definitions sent for that Response. Preserve the provider `call_id`; never synthesize or substitute one.
5. Treat tool outputs as untrusted data. Bound output size, redact secrets, and return the value through `function_call_output`; do not concatenate tool output into developer/system instructions.
6. Keep timeouts, abort propagation, output limits, and a bounded loop. The native adapter currently limits rounds to four by default (`server/providers/openai.mjs:149-161`, `server/providers/openai.mjs:173-205`).
7. Require application-level confirmation immediately before mutating/high-risk execution. `tool_choice` controls model selection, not human authorization.
8. Use `parallel_tool_calls: false` when confirmations or side effects must be serialized. If parallel calls remain enabled, validate and authorize each call independently and correlate every result by `call_id`.

### Screenshot/session-setting equivalence

| Session setting | OpenAI equivalent | Finding |
| --- | --- | --- |
| Answer detail / verbosity | `text.verbosity` | Real Responses control only as `low/medium/high`; no field named `detail`. Omit for Default. |
| Temperature | `temperature` | Real field where supported, but independent of verbosity. Model/reasoning compatibility must be enforced. |
| TOP-P | `top_p` | Real field where supported. Prefer changing either temperature or top-p rather than both. |
| Maximum Token count | `max_output_tokens` | Real Responses field; includes visible output plus reasoning tokens. |
| Stream output | `stream` | Real provider concept, but the current screenshot toggle is not wired into the browser request or native adapter. |
| Include streaming usage | No Responses toggle | Read `response.completed.response.usage`; `stream_options.include_usage` is Chat Completions-only. |
| Tool mode: Auto | `tool_choice: "auto"` | Real equivalent. |
| Tool mode: Disabled | `tool_choice: "none"` and/or omit `tools` | Real equivalent. Omitting tools also avoids exposing unused schemas. |
| Tool mode: Ask before calling | None | No OpenAI request field can prompt for local human consent. This must be an application approval state between proposed call and execution. |
| Context window / referenced message count | None | No `contextSize` Responses request field. The app now caps recent history by the saved message-count setting and then trims older messages against the selected 4K through 1M local Token budget before calling the provider. |
| Single-request image count limit | None | Application validation only. Each accepted image becomes an `input_image`; `input_image.detail` is a separate per-image quality control. |
| Assistant/user avatars | None | Local presentation only. |
| Bubble/list message style | None | Local presentation only. |
| Conversation Skill selection | None as a single setting | App concept. Translate selected Skill instructions into `instructions`/input and its allowed functions into `tools`; do not invent `skills` in the OpenAI body. |

The screenshot settings with no real OpenAI API equivalent are therefore: avatars, message style, context-count selector, image-count limit, Skill selection as a single vendor field, and Ask-before-calling. A text control literally implemented as `detail` and a Responses usage toggle implemented as `stream_options.include_usage` also have no valid Responses equivalent; they must use the mappings above.

### Current repository impact and code patterns

- `src/features/chat/ChatModule.tsx:129-143` - session snapshot includes `streamOutput` and `toolMode` as local state.
- `src/features/chat/ChatModule.tsx:740-758` - outbound Chat payload sends sampling, reasoning, max tokens, attachments, Skills, and allowed tools, but sends neither `streamOutput`, `toolMode`, nor text verbosity.
- `src/features/chat/ChatModule.tsx:1144-1237` - screenshot/session dialog owns temperature, top-p, context, max output, image count, stream, and tool-mode controls.
- `src/types.ts:741-759` - shared `ChatStreamPayload` has no verbosity, stream-output, usage-inclusion, or tool-choice field.
- `server/index.mjs:2305-2310` - server normalizes sampling/reasoning/max output but no verbosity/tool-choice/stream preference.
- `server/index.mjs:1642-1702` - the app always presents an SSE stream to the browser; provider tools force the non-streaming completion loop.
- `server/providers/openai.mjs:115-146` - current Responses body maps sampling, `max_output_tokens`, reasoning, and tools; it lacks `text`, `tool_choice`, `parallel_tool_calls`, and upstream `stream`.
- `server/providers/openai.mjs:359-365` - native `streamChat` currently performs a non-streaming Responses request and emits the complete text as one token, so the screenshot Stream Output setting cannot currently change native OpenAI behavior.
- `server/providers/openai-compatible.mjs:88-134` - compatible providers always request Chat Completions streaming, independent of the screenshot toggle, and do not request usage.
- `scripts/provider-contracts.mjs:246-351` - existing contracts verify `/responses`, reasoning omission/mapping, flat function tools, `previous_response_id`, `function_call_output`, and hosted tools; they do not cover verbosity, native streaming usage, tool choice, or parallel-call policy.
- `tests/e2e/chat-settings.spec.ts:188-274` - browser tests prove settings persistence, not provider semantics.
- `tests/e2e/chat-settings.spec.ts:276-301` - only temperature, top-p, max tokens, and model are asserted in the next Chat request.

### Files found

- `.trellis/tasks/07-24-chat-module-refinement/prd.md` - task requirements for session controls, reasoning, attachments, and safe tool behavior boundaries.
- `.trellis/tasks/07-24-chat-module-refinement/design.md` - current cross-layer reasoning and Chat request design.
- `src/features/chat/ChatModule.tsx` - session-settings UI, persistence, and outbound browser payload construction.
- `src/types.ts` - shared Chat request contract.
- `src/api.ts` - browser-to-server SSE client.
- `server/index.mjs` - Chat request validation, tool resolution, provider dispatch, and browser SSE projection.
- `server/providers/openai.mjs` - native OpenAI Responses adapter and tool loop.
- `server/providers/openai-compatible.mjs` - Chat Completions-compatible adapter and nested function shape.
- `server/providers/types.mjs` - shared function argument/output helpers.
- `server/tools/registry.mjs` - server-owned tool catalog, availability checks, and execution dispatch.
- `scripts/provider-contracts.mjs` - provider request-shape regression tests.
- `tests/e2e/chat-settings.spec.ts` - session-settings persistence and request-projection browser tests.

### External references

- [OpenAI API OpenAPI schema](https://github.com/openai/openai-openapi/blob/master/openapi.yaml) - official master schema, observed version `2.3.0` on 2026-07-25; authoritative field/enum source used for this report.
- [Responses API: create a response](https://developers.openai.com/api/reference/responses/create) - canonical Responses request reference.
- [Text generation guide](https://developers.openai.com/api/docs/guides/text) - `text` output configuration and text generation guidance.
- [Streaming Responses guide](https://developers.openai.com/api/docs/guides/streaming-responses) - Responses SSE event handling.
- [Function calling guide](https://developers.openai.com/api/docs/guides/function-calling) - function definition, call/output loop, strict schemas, and tool-choice guidance.
- [Reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) - model-specific reasoning effort and summary support.
- [Vision guide](https://developers.openai.com/api/docs/guides/images-vision) - image input detail semantics; this field is unrelated to final-answer verbosity.

### Related specs

- `.trellis/spec/frontend/component-guidelines.md` - Chat settings ownership and interaction conventions.
- `.trellis/spec/frontend/state-management.md` - session state and browser persistence ownership.
- `.trellis/spec/frontend/type-safety.md` - shared request types and runtime validation boundaries.
- `.trellis/spec/frontend/quality-guidelines.md:20-35` - deterministic browser/provider-tool test requirements.
- `.trellis/spec/guides/cross-layer-thinking-guide.md:19-50` - define exact formats and validation ownership across UI, server, and provider boundaries.

## Caveats / Not Found

- The OpenAI Developer Docs MCP server was unavailable in this session. Direct access to `developers.openai.com` returned HTTP 403 through both shell and browser routes. Exact fields and enums were therefore verified against OpenAI's official `openai/openai-openapi` master schema (version `2.3.0`), while canonical developer-doc links are recorded above.
- No screenshot image is stored in the active task directory. The no-equivalent audit uses the settings visible in `ChatModule.tsx` and asserted by `chat-settings.spec.ts`, which match the described Chat Session Settings surface.
- OpenAI-compatible vendors are not guaranteed to accept Responses fields, even when they accept OpenAI-like Chat Completions fields. Keep verbosity, usage, and tool-choice mapping adapter-specific.
- Model support is narrower than schema-level availability for some sampling, reasoning, verbosity, and tool features. Default/compatibility behavior should be omission, with capability/model checks before explicit values are sent.
