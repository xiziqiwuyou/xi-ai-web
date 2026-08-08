# Codebase Findings

- `ChatModule` owns the complete hydrated `conversationList` and transient
  `SessionUiState`; `displayedSessionStack` currently receives every record.
- `localConversationStore` is the local IndexedDB adapter and current pin/recency
  sorter. It sanitizes through `sanitizeWorkspaceConversation` before saving.
- `conversationArchive` bounds single-conversation import/export to 40 records,
  80 messages each, and 24,000 characters per message.
- Workspace exports already round-trip complete conversation records through an
  allowlist. Optional branch provenance established the non-fatal optional
  metadata pattern this task should reuse.
- `ChatModule` initializes a new conversation using total list length. It must
  switch to active-count semantics so an archive-only workspace is never blank.
- The shared Dialog already supplies focus trap, Escape, inert background, and
  scroll ownership. A feature-specific second modal system is unnecessary.
- No server route is required; all requested behavior can be implemented in
  browser state and IndexedDB.
