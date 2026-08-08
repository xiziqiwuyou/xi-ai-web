# Feature assessment

## Current-system fit

The requested repository is useful as a feature catalog, but its Next.js/React
monorepo, data stack, state management, and UI layer do not match xi-ai-web.
Direct migration would increase dependency, license, persistence, and regression
risk while duplicating substantial existing functionality.

The first useful gap is chat branching because xi-ai-web already contains pure
helpers for truncating a conversation around a user message, plus stable local
persistence and session-stack ordering. The missing work is a typed branch
identity, UI actions, safe auto-send orchestration, and browser coverage.

## Deferred candidates

- Conversation search/archive/groups: high user value and fully local, but separate
  from branch correctness.
- Artifacts: build on the existing sandboxed HTML preview only after defining data
  records, supported MIME/render types, export, and script prohibition.
- Remote MCP: requires a separate security design for SSRF, consent, credentials,
  redaction, timeouts, result sizes, and administrator allowlists.
- Branch tree: defer until simple provenance has real usage evidence.

## Sources

- https://github.com/hushuaifei/lobe-chat
- https://github.com/hushuaifei/lobe-chat/blob/main/LICENSE
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/branching-conversations.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/artifacts.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/mcp.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/agents/topics.zh-CN.mdx
