# Technical Design

## Architecture Boundary

Branch history is a pure frontend projection. `Conversation.branch` remains the
only durable relationship. A new helper builds a bounded forest for rendering;
`ChatConversationManager` owns transient view/search/expansion state; and
`ChatModule` continues to own opening, restoring, streaming locks, persistence,
and single-expanded-session ordering.

```text
IndexedDB Conversation[]
  -> existing hydration and sanitizers
  -> buildConversationBranchFamilies(Conversation[])
  -> transient manager projection
  -> existing open/restore callbacks
```

No data flows from the projection back into storage.

## Pure Projection Contract

Add `src/features/chat/conversationBranchHistory.ts` with local projection
types similar to:

```ts
type ConversationBranchHistoryNode = {
  conversation: Conversation;
  depth: number;
  mode?: ConversationBranchMode;
  status: "linked" | "orphan" | "invalid";
  children: ConversationBranchHistoryNode[];
};

type ConversationBranchFamily = {
  id: string;
  root: ConversationBranchHistoryNode;
  nodeCount: number;
  hasArchived: boolean;
};
```

Implementation rules:

1. Normalize unique IDs into an insertion-ordered map.
2. Accept an edge only when the parent exists, differs from the child, and does
   not create a cycle in the accepted parent chain.
3. Promote rejected-cycle and missing-parent children to roots with a bounded
   diagnostic status.
4. Project only roots that have descendants or are themselves branch records.
5. Traverse iteratively or with an explicit visited set, depth limit, and node
   budget. Never trust imported graph shape.
6. Return fresh projection objects while retaining read-only references to the
   already-hydrated conversations.

Search receives the bounded normalized query and returns a pruned copy of the
forest. A node is visible when it matches title/preview/message content through
the existing local-search contract, has a visible descendant, or is an ancestor
needed to explain a matching descendant. Attachment and citation payloads are
never inspected.

## UI Integration

Extend `ConversationManagerView` to `"active" | "archived" | "branches"`.
The existing search box remains mounted for all views. The Branches tab count
represents branch families, not all conversations.

Branch families render inside the existing `.figma-conversation-manager-list`:

- A compact family header toggles expansion with `aria-expanded`.
- The family containing the current expanded conversation opens by default;
  otherwise the first family opens when the dialog enters Branches view.
- Nested lists use a capped visual indentation based on projected depth.
- Rows reuse existing title, preview, time, and message-count typography.
- Active rows expose Open; archived rows expose Restore. Current active row uses
  visible `Current conversation` copy and `aria-current="page"`.
- Orphan/invalid states use short neutral metadata, not error toasts or raw IDs.

Add a `currentConversationId` prop to `ChatConversationManager`. `ChatModule`
derives it from the currently expanded active session and does not persist it.
Existing callbacks remain unchanged.

## State And Compatibility

The following stay local to the mounted manager:

- active view
- search query and deferred query
- expanded family IDs
- list-scrolling state

Opening the dialog resets to Active, matching current behavior. Entering the
Branches view initializes family expansion without changing conversations.
Closing or refreshing discards all branch-view UI state.

No changes are allowed to `Conversation`, `ConversationBranch`, workspace
archives, single-conversation archives, temporary sync payloads, server
bootstrap, or Provider requests.

## Failure Handling

- Empty forest: show a Branches-specific empty state.
- Missing parent: render the child as an orphan root.
- Cycle or self edge: ignore the edge and render the affected node as invalid.
- Depth/node budget reached: truncate descendants locally and show bounded
  metadata; never mutate or drop the stored conversation.
- Current conversation absent or archived: omit the current marker.
- Streaming request: keep family/search controls enabled; existing mutation
  callbacks reject Open/Restore even if a disabled button is manipulated.

## Rollback

The change is removable by deleting the pure projection helper and Branches
view while leaving all existing conversation records untouched. No migration or
server rollback is required.
