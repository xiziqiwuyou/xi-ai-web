# Claude streaming and output limit design

## Boundaries

The existing public endpoint remains `POST /api/chat/stream` and continues to
return the xi-ai-web SSE envelope (`meta`, zero or more `token`, optional
`error`, exactly one `done`). The selected catalog entry remains authoritative
for vendor, request model, endpoint protocol, and limits. The browser supplies
only a session API Key and user preferences.

## Streaming Contract

`ChatStreamPayload.streamOutput` becomes an optional boolean with a server
default of true. The browser always sends its current session value.

- Tool-free + true: call `adapter.streamChat` and forward Anthropic
  `content_block_delta.text_delta` through the existing bounded token buffer.
- Tool-free + false: call `adapter.completeText`, then pass the final text once
  through the same public token/done envelope.
- Local/hosted tools: preserve the bounded tool loop. The final answer remains
  buffered until a provider-neutral tool streaming contract exists. The
  client request phase must distinguish this from native text streaming.

Provider SSE parsing remains frame-based and must accept chunk boundaries that
split UTF-8 text or JSON. It ignores thinking deltas, records usage from
`message_start`/`message_delta`, and treats Provider `error` events as failures.
Application response headers retain `no-cache, no-transform` and
`X-Accel-Buffering: no`.

## Output-Limit Contract

`ModelCatalogEntry.maxOutputTokens` is a normalized positive integer. It is
separate from `contextWindowTokens`, `maxInputCharacters`, and the user's
optional lower per-session output limit.

The server resolves:

```text
catalogLimit = selected model.maxOutputTokens
requested = optional request.maxTokens
effective = requested is absent ? catalogLimit : requested
reject when requested > catalogLimit
```

The route passes `effective` through the existing generic `maxTokens`
parameter to streaming, non-streaming, and tool paths. The Anthropic adapter no
longer owns a fallback and fails closed if no valid limit reaches it.

Shipped Claude presets use current documented synchronous Messages limits:
128,000 for Fable 5, Sonnet 5, Opus 4.8, Opus 4.7, and Sonnet 4.6; 64,000 for
Haiku 4.5. Unknown/legacy Anthropic models receive a conservative normalized
fallback that administrators can edit. Other Provider entries receive a
bounded generic fallback without forcing optional output fields into their
wire formats.

## Persistence And Compatibility

The field is normalized centrally in `server/registry/model-registry.mjs`, so
fresh defaults, persisted metadata, Admin imports, and legacy entries converge
on one shape. Admin and public bootstraps expose only the numeric model
metadata. No credential or request content is added.

The Admin model editor places maximum output beside context window and maximum
input characters. Client and server validation use the same numeric bounds;
the server remains authoritative.

## Operational Diagnostics

Fixture tests prove application and Provider timing without logs. Online smoke
must separately inspect upstream `Content-Type`, first-byte/first-token timing,
and reverse-proxy buffering. Diagnostic output may include model ID, endpoint
protocol, status, event counts, and durations, but never API Keys, prompts, or
response text.

## Rollback

The change has no database migration. Reverting restores the previous catalog
normalizer; unknown extra JSON fields are ignored. Existing model ordering,
labels, capabilities, and endpoint selections remain intact.
