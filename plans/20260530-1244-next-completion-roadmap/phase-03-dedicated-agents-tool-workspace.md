# Phase 03 - Dedicated Agents and Tool Workspace

## Context Links

- Module routing: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- Generic generation page: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Tool registry: `C:\Users\56252\Documents\New project 2\server\tools\registry.mjs`
- Provider adapters: `C:\Users\56252\Documents\New project 2\server\providers`
- Server generation route: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Overview

Date: 2026-05-30  
Priority: P1  
Status: Completed

Turn 智能体 from a generic prompt form into a real agent workspace with tool selection, visible execution trace, and reusable task templates.

## Key Insights

- Tool calling already exists in adapters.
- Server has base tools: date/time and calculator.
- Knowledge search tool exists only when context is provided.
- Current agents UI hides tool calls and uses `GenerationModule`.

## Requirements

- Dedicated `AgentsModule`.
- Select assistant, model, and allowed tools.
- Show execution trace:
  - planning step.
  - tool call name.
  - tool arguments summary.
  - tool result summary.
  - final answer.
- Allow optional knowledge context from local documents.
- Save agent results to gallery.
- Admin can enable/disable tools globally.

## Architecture

```text
AgentsModule
  task composer
  assistant/model/tool selectors
  trace panel
  result panel

POST /api/agents/run
  connection + modelId + assistantId + prompt + allowedTools + optional context
  returns final text + toolTrace[]
```

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\agents\AgentsModule.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\features\agents\AgentTracePanel.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
  - Route `agents` to `AgentsModule`.
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add `AgentRunPayload`, `AgentTraceEvent`, `ToolConfig`.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Add `runAgent`.
- Modify: `C:\Users\56252\Documents\New project 2\server\tools\registry.mjs`
  - Expose tool metadata and configurable allow list.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Add `/api/agents/run`.
  - Capture tool trace.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
  - Add tool enable/disable controls.

## Implementation Steps

1. Define tool metadata:
   - id/name.
   - label.
   - description.
   - risk level.
   - enabled default.
2. Add admin data field:
   - `toolSettings`.
   - Normalize old data to defaults.
3. Add agent endpoint:
   - Resolve model with `toolCalling`.
   - Filter requested tools by admin allow list.
   - Capture trace in `runTool`.
4. Build `AgentsModule`:
   - Use existing workbench layout.
   - Add tool chips/toggles.
   - Add task templates from prompt presets.
5. Render trace:
   - Collapsed by default.
   - Human-readable tool args/result.
6. Add knowledge context hook later or share Phase 05 store once ready.

## Todo List

- [ ] Add agent types and endpoint.
- [ ] Add visible tool trace.
- [ ] Build dedicated AgentsModule.
- [ ] Add admin tool controls.
- [ ] Add gallery persistence for agent runs.
- [ ] Validate with OpenAI-compatible tool calling.

## Success Criteria

- Agents page no longer uses generic generation layout.
- User can see which tools were called.
- Disabled tools cannot be invoked.
- Non-tool models still provide a clear unsupported message.
- No credentials or tool args are persisted server-side.

## Risk Assessment

- Risk: Tool traces leak sensitive prompt content.
  - Mitigation: store traces only in browser gallery, not server.
- Risk: Tool calling differs by provider.
  - Mitigation: rely on existing adapter abstraction and capability guard.

## Security Considerations

- Default tool set stays low-risk.
- Do not add network/file tools without explicit admin opt-in.
- Limit tool argument/result display length.

## Next Steps

After agent workspace, add STT and voice input.
