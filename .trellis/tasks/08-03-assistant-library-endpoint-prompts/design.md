# Assistant library expansion and endpoint prompt delivery design

## Data Contract

Add one optional `avatar` field to `Assistant`. Its value is an allowlisted semantic icon identifier owned by a shared frontend catalog. Server normalization stores only a bounded allowlisted value and falls back to the matching default or `sparkles`.

The new catalog lives in `server/data/assistant-catalog.mjs`. `defaultAssistants(clock)` projects timestamps onto immutable catalog metadata so existing callers and freshness tests remain stable.

## Catalog Shape

Ship 30 assistants in seven categories. Each prompt follows this project-owned structure:

1. Role and objective.
2. Required working sequence.
3. Default output structure.
4. Evidence and uncertainty handling.
5. Domain safety and prohibited claims.

Avoid medical, legal and investment decision agents. Specialized assistants may explain supplied material but must not claim external actions or current facts without evidence.

## Launch And Avatar Flow

```text
default/admin Assistant.avatar
  -> public bootstrap
  -> AssistantsStudio card/detail AssistantAvatar
  -> queue assistantId + optional starter draft
  -> Chat conversation assistantId
  -> ChatSessionBlock AssistantAvatar from bound assistant
  -> global avatar preset only when avatar is missing/invalid
```

`AssistantAvatar.tsx` maps a stable string key to installed Lucide components. This follows the semantic selection style reviewed on Alibaba Iconfont while avoiding remote scripts, changing CDN assets and unclear per-icon redistribution metadata.

## Prompt Delivery

The browser continues to send only `assistantId`. `buildPromptMessages()` remains the single server owner of the assistant system prompt.

Adapter projection:

- OpenAI Chat: keep `{ role: "system" }` in `messages`.
- OpenAI Responses: send the prompt through `instructions` on every request and every tool round.
- Non-OpenAI Responses compatibility: additionally/projectively place the prompt in a `developer` input item because compatible gateways may ignore top-level `instructions`.
- Anthropic Messages: top-level `system`.
- Gemini GenerateContent: `systemInstruction.parts`.

Provider contract tests inspect the serialized body. Browser tests prove ID binding but do not substitute for adapter tests.

## Migration

Bump metadata version from 12 to 13. For source versions below 13, normalize existing records first, append defaults missing by ID and name, and normalize again. Existing matching records win, including custom prompts, disabled state and timestamps. New fields may fall back from the matching shipped record.

## Compatibility And Rollback

- `avatar` remains optional in the TypeScript contract and all renderers provide a fallback.
- Admin-created and imported legacy assistants continue to work.
- Existing conversation records store only assistant IDs and need no migration.
- Rollback can remove the catalog file/avatar field while preserving all pre-existing assistant records and IDs.
