# Technical Design

## Architecture Boundary

The browser remains the sole owner of conversation retrieval and archival state.
No server route, database, provider adapter, or dependency is added.

## Data Contract

```ts
type Conversation = ConversationSummary & {
  messages: Message[];
  titleSummaryAt?: string;
  branch?: ConversationBranch;
  archivedAt?: string;
};
```

`archivedAt` is accepted only when it is a bounded string that parses to a valid
ISO instant and is already in canonical ISO form. Invalid values become
`undefined`; the containing conversation remains valid.

## Pure Retrieval Layer

Add `conversationRetrieval.ts` with pure helpers:

```ts
normalizeConversationQuery(value: unknown): string
searchConversations(conversations: readonly Conversation[], query: string, limit?: number): ConversationSearchResult[]
activeConversations(conversations: readonly Conversation[]): Conversation[]
archivedConversations(conversations: readonly Conversation[]): Conversation[]
archiveConversation(conversation: Conversation, now?: string): Conversation
restoreConversation(conversation: Conversation, now?: string): Conversation
```

Search result projection contains only conversation ID, score, and the existing
safe display fields needed by the manager. The normalized query is bounded to
240 characters; results are capped at 50. Title matches outrank preview, which
outranks body matches. Stable recency resolves score ties.

## Chat State Flow

- `conversationList` and `conversationsRef` continue to own all active and
  archived records so persistence/export remains complete.
- `displayedConversations` receives only the active projection.
- Hydration creates `SessionUiState` only for active records. Archive removes the
  archived record's transient UI entry; restore creates a fresh default UI entry.
- The empty-state effect checks active count, not total count.
- Open-result behavior reuses existing stack ordering and collapse semantics.
- Synchronous request refs plus streaming state guard archive/restore/open handlers.

## UI Composition

Create `ChatConversationManager.tsx` as a focused component receiving records and
callbacks. It owns query/filter state while mounted. Use existing `Dialog`,
Lucide icons, tokens, and date formatting patterns. The dialog has one scrollable
result region and no nested page scroll owner.

## Persistence And Import

- Extend workspace and conversation sanitizers with strict optional
  `archivedAt` handling.
- Preserve metadata through IndexedDB, complete workspace export/import, and
  single-conversation export/import.
- Keep `ConversationSummary` unchanged unless a consumer demonstrably needs
  archive metadata; the manager consumes complete local conversations.

## Compatibility And Rollback

- Legacy records are active by omission.
- Removing the new UI leaves valid optional metadata that older code ignores.
- Rollback is deletion of the manager and active projection while leaving
  sanitizer-compatible optional data; no database migration is required.

## Security And Privacy

- Retrieval is pure in-memory matching over approved persisted text fields.
- No browser-provided URL, credential, attachment payload, citation body, or
  transient state enters the index/result projection.
- No new network call exists in the feature path; E2E records all relevant API
  request families and asserts zero.
