# Phase 01 - Public Chat Privacy and Local History

## Context Links

- Chat UI: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- API client: `C:\Users\56252\Documents\New project 2\src\api.ts`
- Types: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Server routes: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Current gap report: `C:\Users\56252\Documents\New project 2\plans\20260530-1244-next-completion-roadmap\reports\current-gap-analysis.md`

## Overview

Date: 2026-05-30  
Priority: P0  
Status: Completed

Make public chat match the rest of the BYOK app: local user history in the browser, no shared public conversations stored or listed by the backend.

## Key Insights

- Knowledge, gallery, and media jobs are already browser-local.
- Chat is the outlier: server persists conversations in `data/app-data.json`.
- With no user login, backend conversation persistence means all public visitors can potentially see shared summaries.

## Requirements

- Public chat history stored in browser storage.
- Public bootstrap returns no conversation summaries.
- Chat stream request includes the selected local conversation transcript.
- Server streams a response without writing public messages to `data/app-data.json`.
- Existing admin metadata remains unchanged.
- Provide migration/escape hatch for old local server conversations.

## Architecture

Frontend owns public conversation state:

```text
ChatModule
  localConversationStore.ts
  sends {messages, assistantId, modelId, attachments, connection}
  receives stream events {assistantMessageId, token, done}
  writes final messages to local storage only

Server
  validates module/model/assistant/connection
  builds prompt from request messages
  streams provider response
  does not save public chat
```

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\chat\localConversationStore.ts`
  - Browser-local load/save/migration helpers.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
  - Remove backend conversation CRUD dependency.
  - Use local state and local persistence.
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
  - Stop depending on public `conversations` from bootstrap.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Remove or deprecate public conversation CRUD methods.
  - Update `streamChat` payload contract.
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add local chat transcript payload types.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Stop returning conversations in public bootstrap.
  - Make `/api/chat/stream` stateless.
  - Guard or remove public `/api/conversations/*`.
- Modify: `C:\Users\56252\Documents\New project 2\README.md`
  - Document browser-local chat history.

## Implementation Steps

1. Add local conversation storage:
   - `localStorage` first, capped by item count and message length.
   - Drop oldest records on quota errors.
2. Change `ChatModule` lifecycle:
   - Load local summaries at mount.
   - Create/delete/pin/search locally.
   - Save after each stream completes.
3. Change stream payload:
   - Include current conversation messages, excluding empty streaming placeholders.
   - Include `content` and `attachments` for the new user message.
4. Refactor server prompt builder:
   - Accept request transcript.
   - Add new user message with attachments.
   - Keep assistant system prompt from admin metadata.
5. Remove public bootstrap conversations:
   - Return `conversations: []` or remove when type migration is complete.
6. Lock public conversation CRUD:
   - Return `410 Gone` with migration note, or keep only development export behind admin.
7. Add optional one-time migration UI:
   - If public bootstrap still returns legacy summaries in development, allow import to local.
   - Do not keep this visible in production.
8. Validate privacy boundary:
   - Public bootstrap contains no user chat content.
   - `data/app-data.json` does not grow after public chat.

## Todo List

- [ ] Add local chat storage.
- [ ] Convert ChatModule to local history.
- [ ] Make chat stream stateless.
- [ ] Remove public conversation bootstrap data.
- [ ] Lock/deprecate public conversation CRUD.
- [ ] Update docs and QA checks.

## Success Criteria

- Public chat works after refresh in same browser.
- Another browser receives no chat history.
- Server `data/app-data.json` does not store public chat messages.
- API URL/Key remain request-time only.
- `npm run check` and `npm run build` pass.

## Risk Assessment

- Risk: Users lose existing server-side chat history.
  - Mitigation: optional admin/export migration before route removal.
- Risk: Large local chats exceed browser storage.
  - Mitigation: caps, trimming, and export option.
- Risk: Stream event contract changes break UI.
  - Mitigation: keep event names stable where possible.

## Security Considerations

- Do not persist public chat messages server-side.
- Do not include user API URL/Key in local conversation records.
- Redact provider errors as current server already does.

## Next Steps

After this privacy fix, harden admin metadata import/export and backups.
