# Chat Message Actions And Conversation Branching

## 1. Scope / Trigger

This specification applies when changing persisted Chat message actions, branch creation, conversation ordering, Chat archive sanitization, or automatic branch sending.

Conversation branches are a local Chat feature. They must remain inside the existing React, IndexedDB, and BYOK request pipeline. Do not introduce a branch API, copy another product's source or UI, or persist transient composer and credential state as branch provenance.

## 2. Signatures

```ts
type ConversationBranchMode = "continue" | "edit" | "retry";

type ConversationBranch = {
  parentConversationId: string;
  sourceMessageId: string;
  mode: ConversationBranchMode;
};

type ConversationBranchSeed = {
  conversation: Conversation;
  draft: string;
  attachments: ChatAttachment[];
};

createConversationBranchSeed(
  source: Conversation,
  sourceMessageId: string,
  mode: ConversationBranchMode,
  options: { branchId: string; editedContent?: string; now?: string }
): ConversationBranchSeed | null;
```

## 3. Contracts

- `continue` copies messages through the selected persisted message and never sends a request.
- `edit` is valid only for a persisted user message. It copies messages before that turn and stages the edited text plus cloned attachments in the new composer.
- `retry` is valid only for a persisted assistant message with an earlier completed user turn. It copies messages before that user turn and stages that user's text plus cloned attachments.
- Edit and retry call the existing Chat send pipeline exactly once. Provider selection, model capability checks, image limits, search state, cancellation, streaming, and error behavior remain owned by that pipeline.
- The source conversation and its messages are immutable. A branch receives a new client ID, is unpinned, opens at the top, and collapses all other sessions.
- Durable branch provenance contains only `parentConversationId`, `sourceMessageId`, and `mode`.
- A branch does not inherit Skill, app, independent search, knowledge-base selection, notices, request state, or any credential/URL value. Staged attachments stay in session UI until the normal send pipeline accepts them.
- Copying a message is non-mutating and may remain available while another conversation streams. Edit, retry, and continue are disabled globally while any Chat request streams.
- Automatic send failure keeps the new branch, draft, attachments, selected usable model, and bounded notice so the user can recover manually.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Source message ID is missing | Return `null`; do not create or send |
| Branch ID is empty or equals the source ID | Return `null`; preserve source |
| Source message is streaming | Return `null`; do not create or send |
| `edit` targets a non-user message | Return `null` |
| Edited text is empty and the source has no attachments | Return `null` |
| `retry` has no preceding completed user message | Return `null` |
| Branch metadata is malformed, oversized, incomplete, or self-referential | Drop only `branch`; keep the conversation |
| A request is already streaming | Disable mutating actions and reject handler bypass without creating a branch |
| Key/model/capability/upstream preflight fails after branch creation | Keep the branch and recovery composer state; show a bounded notice |

## 5. Good / Base / Bad Cases

- Good: editing an earlier user turn creates one unpinned top session, leaves the parent unchanged, and sends the edited turn once through the current model.
- Base: continuing from an assistant reply creates a local branch with the selected history and performs zero API calls.
- Bad: mutating the parent message array, duplicating a provider request, inheriting armed web search, or persisting attachments/API keys inside `Conversation.branch`.

## 6. Tests Required

- Local contracts assert all three projections, source immutability, cloned attachments, timestamps, invalid targets, and self-ID rejection.
- Workspace and conversation archive contracts assert branch allowlisting, legacy compatibility, empty `assistantId` compatibility, and graceful removal of malformed provenance.
- Browser tests assert copy feedback, inline edit focus, Escape focus restoration, one request for edit/retry, zero requests for continue, parent IndexedDB immutability, top/expanded ordering, streaming locks, and mobile viewport containment.
- Privacy checks assert that branch exports never add API keys, URLs, transient tool state, or attachment composer state to provenance.

## 7. Wrong Vs Correct

```ts
// Wrong: rewrite the parent and send from an ad-hoc provider call.
source.messages[index].content = editedContent;
await fetch(providerUrl, { body: JSON.stringify(source) });

// Correct: project a new local conversation and reuse the existing send pipeline.
const seed = createConversationBranchSeed(source, messageId, "edit", {
  branchId: createClientId("chat-branch"),
  editedContent
});
if (seed) await sendMessage(seed.conversation, branchUi, selectedModel);
```

```ts
// Wrong: reject an otherwise valid legacy conversation because provenance is bad.
if (!isValidBranch(source.branch)) return null;

// Correct: sanitize optional provenance independently.
return {
  ...conversation,
  branch: sanitizeWorkspaceConversationBranch(source.branch, conversation.id)
};
```

