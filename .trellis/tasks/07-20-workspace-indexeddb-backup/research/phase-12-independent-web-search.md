# Phase 12 Independent Web Search Research

Research date: 2026-07-21

## Official Sources

- Kimi web search guide: https://platform.kimi.com/docs/guide/use-web-search
- Kimi documentation index: https://platform.kimi.com/docs/llms.txt
- Zhipu Web Search API: https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2
- Zhipu web search guide: https://docs.bigmodel.cn/cn/guide/tools/web-search

## Confirmed Contracts

### Zhipu GLM

- Zhipu exposes a standalone `POST https://open.bigmodel.cn/api/paas/v4/web_search` endpoint with Bearer authentication.
- Required request fields are `search_query`, `search_engine`, and `search_intent`.
- `search_query` is limited to 70 characters. `count` supports 1-50. Supported engines include `search_std`, `search_pro`, `search_pro_sogou`, and `search_pro_quark`.
- The structured response contains `search_result[]` items with `title`, `content`, `link`, `media`, `icon`, `refer`, and `publish_date`.
- This endpoint is independent from the model used for the final answer and is the preferred architecture for this project.

### Kimi

- Kimi documents `$web_search` as a `builtin_function` submitted to `POST /chat/completions`, not as a standalone structured search endpoint.
- The caller echoes each `$web_search` tool call's arguments back as a `role=tool` message; Kimi performs the hosted search and returns a final answer.
- The official page warns that the feature is being upgraded, the page is outdated, and recent use is not recommended.
- Therefore Kimi is supported only as a separately credentialed compatibility backend. It is not represented as equivalent to GLM's standalone Web Search API.

## Adopted Design

- Store search provider credentials separately from the primary model connection in browser `sessionStorage`.
- Send search credentials only in a user-initiated request that explicitly includes `web_search`.
- Run search before the selected main model. Inject bounded results as untrusted external context with URL/source instructions.
- Do not require the selected main model to advertise `webSearch`, use a specific vendor, or support tool calling when search is the only requested tool.
- GLM is the recommended/default search backend. Kimi remains an explicitly labeled compatibility mode.
- Preserve existing provider-hosted search adapter code for direct provider contracts, but the product `web_search` tool no longer routes through the selected chat model.
