# Implementation Plan

1. Add and test a reusable bounded provider-SSE frame consumer in
   `server/providers/types.mjs`; migrate OpenAI-compatible streaming to it.
2. Implement native OpenAI Responses streaming for no-tool Chat requests,
   including incremental text and optional normalized usage.
3. Implement native Anthropic and Gemini streaming for no-tool Chat requests.
   Filter non-display reasoning blocks and deduplicate cumulative Gemini text.
4. Flush the public Chat SSE response headers immediately and add a dedicated
   no-buffer/no-gzip Nginx Chat location to the deployment template.
5. Extend `scripts/provider-contracts.mjs` with split-frame request/response
   tests for all three native protocols and a non-SSE fallback where applicable.
6. Run provider contracts, server tests, TypeScript check, build, security tests,
   and release check. Review the final diff for secret-free deployment changes.

## Rollback

Revert only this patch commit and redeploy the previous immutable `v0.0.1` image.
No schema, data, or browser-storage migration is involved.
