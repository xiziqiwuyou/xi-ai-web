# Design

## Data contract

Add one optional allowlisted field to `Conversation`:

```ts
type ConversationBranch = {
  parentConversationId: string;
  sourceMessageId: string;
  mode: "continue" | "edit" | "retry";
};
```

The field identifies provenance only. Parent contents, model state, pending
attachments, search state, knowledge IDs, API credentials, and UI state are not
stored in it.

`conversationArchive.ts` owns pure branch construction. A branch seed contains:

- the sanitized new `Conversation`;
- a transient draft used only by edit/retry;
- transient source-message attachments used by the ordinary composer pipeline.

Mode projections:

| Mode | Persisted messages in branch seed | Transient draft |
| --- | --- | --- |
| continue | messages through the selected message | empty |
| edit | messages before the selected user message | edited text |
| retry | messages before the user turn preceding the selected assistant reply | original user text |

## State flow

1. `ChatSessionBlock` owns only presentation state for copy feedback and one
   inline user-message editor.
2. It emits typed callbacks to `ChatModule`; it never writes conversation state.
3. `ChatModule` creates the pure branch seed, commits the branch at the top,
   collapses existing sessions, installs a fresh `SessionUiState`, and optionally
   invokes the existing `sendMessage` pipeline with explicit branch UI/model input.
4. `commitConversations` remains the single IndexedDB persistence path.
5. Stream event handling continues to update the branch by its new conversation ID.

## UI

- The message action bar is inside each persisted message article and does not
  alter the outer avatar/bubble geometry.
- Use Lucide `Copy`, `Pencil`, `RefreshCw`, and `GitBranch` icons with visible
  tooltips and accessible labels. Desktop reveals actions on hover/focus; touch
  layouts keep them available without hover.
- Editing replaces only the selected user message content area with a compact
  textarea and command row. Escape cancels. Focus moves into the editor.
- A small branch provenance label may appear in the session header; it must not
  create another card or change collapsed-session height materially.

## Failure behavior

- Missing branch points return no seed and produce a local notice.
- Copy failure reports a local live-region message.
- Failed automatic send leaves the branch open with its draft/attachments and the
  existing request error. It never rolls back or alter the parent conversation.
- Streaming globally disables mutating actions to avoid request/ref races.

## Privacy and clean-room boundary

- No LobeChat implementation code, CSS, copy, visual assets, or dependencies are
  used. Public behavior is translated into this repository's existing patterns.
- Sanitizers accept only the three branch fields and existing conversation fields.
- Workspace/conversation exports remain allowlist-based and are checked for BYOK
  and session-state bait strings.
