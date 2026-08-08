# LobeChat capability integration roadmap

## Goal

Selectively introduce proven product concepts visible in LobeChat into xi-ai-web
without copying its source code, visual implementation, assets, dependencies, or
application architecture. Each capability must be rebuilt against xi-ai-web's
existing React/Vite/Express/IndexedDB and BYOK boundaries.

## Reference Boundary

- The requested `hushuaifei/lobe-chat` repository is an older fork. It is useful
  for feature discovery, not as an authoritative implementation dependency.
- LobeHub Community License terms make source-level derivative reuse unsuitable
  for this project without separate licensing. Implementation is clean-room:
  public product behavior may inform requirements, while code, component trees,
  layouts, copy, assets, and styling are not copied.
- All outbound AI requests continue through xi-ai-web's administrator-owned
  upstream configuration. No borrowed feature may persist or export BYOK keys.
- Existing xi-ai-web features are extended in place. Do not create parallel
  assistant, workflow, knowledge, search, image, or model-catalog systems.

## Capability Assessment

### Already covered; improve only when a concrete gap is found

- Multi-provider model catalog and endpoint routing.
- Image generation/editing, independent GLM/Kimi search, local/cloud knowledge,
  assistants, agents, workflows, PWA/mobile layout, conversation pinning,
  import/export, Markdown/math/code rendering, and browser-local workspace data.

### Candidate roadmap

1. **P1 - Message actions and conversation branches**
   - Copy messages, edit a user turn into a new branch, regenerate an assistant
     turn in a new branch, and continue from any persisted message.
   - Preserve the original conversation and make branch provenance explicit.
2. **P2 - Conversation retrieval and organization**
   - Local full-text conversation search, archive state, and lightweight groups.
   - Keep this browser-local and compatible with workspace import/export.
   - Detailed staging, prompt, risks, and activation gate: see
     [P2A Conversation Retrieval And Archive Proposal](./p2-conversation-retrieval-and-archive.md).
3. **P3 - Secure artifact workspace**
   - Extend the existing sandboxed HTML preview into explicit artifact records,
     versioning, export, and safe preview types.
   - Keep raw HTML scripts disabled; do not add arbitrary code execution.
4. **P4 - Remote MCP connections**
   - Consider remote HTTP MCP only after defining administrator allowlists,
     per-tool consent, timeout/size limits, audit redaction, and SSRF controls.
   - Browser/Desktop stdio MCP is out of scope for the web deployment.
5. **P5 - Branch history navigation**
   - Add branch switching or a compact version tree only after P1 usage proves
     that simple branch provenance is insufficient.

## Explicit Non-goals

- No migration to Next.js, Drizzle, Zustand, Ant Design, or LobeChat's data model.
- No multi-user account system or cloud synchronization redesign.
- No direct Agent Market or MCP marketplace clone.
- No use of LobeChat trademarks, avatars, screenshots, templates, or layout.
- No broad refactor of `ChatModule` or the server provider layer in P1.

## Acceptance Criteria

- [x] Capability overlap and gaps are recorded before implementation.
- [x] License and clean-room boundaries are explicit.
- [x] Work is split into independently releasable phases.
- [x] The first child task is limited to message actions and branching.
- [ ] Each later phase receives its own PRD, design, tests, and release decision.

## References

- https://github.com/hushuaifei/lobe-chat
- https://github.com/hushuaifei/lobe-chat/blob/main/LICENSE
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/branching-conversations.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/artifacts.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/features/mcp.zh-CN.mdx
- https://github.com/hushuaifei/lobe-chat/blob/main/docs/usage/agents/topics.zh-CN.mdx
