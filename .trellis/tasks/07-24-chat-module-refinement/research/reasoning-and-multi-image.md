# Reasoning And Multi-Image Research

Date checked: 2026-07-24

## Evidence

- The external search endpoint and direct official-page fetches were unavailable in this environment.
- The repository already contains an official-vendor-only review dated 2026-07-19 at `.trellis/tasks/07-16-ins-waterfall-ui-redesign/research/provider-api-implementation-matrix.md`.
- Current server code accepts up to six Chat attachments in `sanitizeChatAttachments`, but the browser reads only `files[0]`, replaces previous attachments, and renders only the first attachment.

## Reasoning Mapping

| Shared value | OpenAI Responses | Anthropic Messages | Gemini generateContent | Kimi | DeepSeek | Qwen/DashScope |
| --- | --- | --- | --- | --- | --- | --- |
| `default` | omit | omit | omit | omit | omit | omit |
| `off` | `reasoning.effort=none` | `thinking.type=disabled` | zero/minimal thinking config by model generation | `thinking.type=disabled` where supported | `thinking.type=disabled` | `enable_thinking=false` |
| `low` | effort `low` | adaptive + effort `low` | low level or 1,024-token budget | nearest supported active mode | effort `high` | budget 1,024 |
| `medium` | effort `medium` | adaptive + effort `medium` | medium level or 4,096-token budget | nearest supported active mode | effort `high` | budget 4,096 |
| `high` | effort `high` | adaptive + effort `high` | high level or 8,192-token budget | nearest supported active mode | effort `high` | budget 8,192 |
| `xhigh` | effort `xhigh` | adaptive + effort `max` | highest level or 16,384-token budget | K3 effort `max` / enabled thinking | effort `max` | budget 16,384 |

The mapping is intentionally lossy where a vendor exposes fewer levels. The browser sends semantic intent, and each adapter selects the nearest documented representation.

## Attachment Contract

- Browser-configurable values: 1, 2, 4, or 6.
- Default: 4.
- Server maximum: 6.
- Existing per-image maximum: 4 MB.
- Accepted MIME families remain PNG, JPEG, WebP, and GIF at the server boundary.
