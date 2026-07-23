# Provider Tool Capability Matrix

Research date: 2026-07-21.

This note separates application-executed function tools from provider-hosted tools. OpenAI-compatible request syntax does not imply that a vendor supports every OpenAI hosted tool.

## Sources

- OpenAI: [Using tools](https://developers.openai.com/api/docs/guides/tools), [Function calling](https://developers.openai.com/api/docs/guides/function-calling), [Web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter), [File search](https://developers.openai.com/api/docs/guides/tools-file-search), [Computer use](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Anthropic: [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Web fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool), [Code execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool), [Computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Gemini: [Function calling](https://ai.google.dev/gemini-api/docs/function-calling), [Google Search](https://ai.google.dev/gemini-api/docs/google-search), [URL context](https://ai.google.dev/gemini-api/docs/url-context), [Code execution](https://ai.google.dev/gemini-api/docs/code-execution), [File Search](https://ai.google.dev/gemini-api/docs/file-search), [Tool combination](https://ai.google.dev/gemini-api/docs/tool-combination), [Computer Use](https://ai.google.dev/gemini-api/docs/computer-use)
- Kimi: [Tool Calls](https://platform.kimi.com/docs/guide/use-kimi-api-to-complete-tool-calls), [Tool choice](https://platform.kimi.com/docs/guide/use-tool-choice), [Official tools](https://platform.kimi.com/docs/guide/use-official-tools), [Web search](https://platform.kimi.com/docs/guide/use-web-search)
- DeepSeek: [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls), [Chat API](https://api-docs.deepseek.com/api/create-chat-completion), [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)
- Qwen / Model Studio: [Function Calling](https://help.aliyun.com/zh/model-studio/qwen-function-calling), [Web search](https://help.aliyun.com/zh/model-studio/web-search), [Code Interpreter](https://help.aliyun.com/zh/model-studio/qwen-code-interpreter), [Responses API](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)

## Capability Matrix

| Provider | Application functions | Hosted web search | Hosted URL fetch | Hosted code execution | Hosted file search | Computer use |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | Responses `type=function` | Responses `type=web_search` | Covered by web-search actions, not a separate normalized tool | Responses `type=code_interpreter` with an ephemeral container | Requires provider vector-store IDs | Requires a client browser/VM loop and human approval |
| Anthropic | Messages client tools | `web_search_20250305` or later | `web_fetch_20250910` or later | `code_execution_20250825` or later on compatible models | No equivalent public file-search tool | Requires a client sandbox and beta header |
| Gemini | `functionDeclarations` | `googleSearch` | `urlContext` | `codeExecution` | Requires provider File Search stores | Requires a client action/screenshot loop |
| Kimi | OpenAI-style `tool_calls` | Legacy `$web_search` is explicitly being upgraded and is not recommended; Formula needs extra endpoints | Formula only | Formula only | File extraction, not hosted vector search | Not declared by the model API |
| DeepSeek | OpenAI-style `tool_calls`; strict schema is beta | Not declared | Not declared | Not declared | Not declared | Not declared |
| Qwen | OpenAI-compatible `tool_calls` | Model Studio Chat `enable_search` or Responses `web_search` | Model Studio web extractor, coupled to search/thinking | Chat `enable_code_interpreter` is thinking + streaming only; Responses supports `code_interpreter` | Requires Model Studio vector-store IDs | Separate AgentBay/platform product, not a model API tool |

## Adopted V1 Tool Set

- Keep `datetime_now`, `calculator_eval`, and request-bounded `knowledge_search` as application-executed tools.
- Add normalized provider-hosted `web_search`, `url_context`, and `code_execution` metadata.
- Map hosted tools only where the selected model catalog entry carries the corresponding fine-grained capability and the adapter has a documented request shape.
- OpenAI, Anthropic, and Gemini receive hosted-tool request mappings.
- Qwen hosted search and code execution use its documented OpenAI-compatible Responses API. The Chat-only code-interpreter path remains unused because it requires thinking plus streaming semantics that this runtime does not preserve.
- Kimi and DeepSeek continue to receive application function tools. Kimi's deprecated built-in search and Formula execution are not silently exposed as stable tools.

## Deferred Boundaries

- Provider file search is deferred because OpenAI, Gemini, and Qwen require provider-owned vector store IDs and remote file lifecycle management. Browser-local knowledge continues through `knowledge_search` and transient context chunks.
- Computer Use is deferred because every provider requires a client action loop, isolated browser or VM, screenshot transport, confirmation policy, and prompt-injection defenses.
- Remote MCP, shell, and arbitrary code tools are deferred because the current no-login BYOK product has no safe per-user credential/configuration boundary or execution sandbox.
- Hosted tool citations and generated files require richer response event types before they can be surfaced without losing attribution or download metadata.

## Security And Product Rules

- The server resolves requested tool names against administrator enablement, provider allowlists, model capabilities, and request context. Unsupported names fail before provider access.
- Provider-hosted tools are never passed to the local `runTool` dispatcher.
- Tool-bearing Skills may run in Chat only when every selected tool is compatible with the selected model and current surface.
- API URL, API key, provider tool outputs, and transient tool trace data remain request-scoped and are excluded from IndexedDB workspace exports and server metadata.
