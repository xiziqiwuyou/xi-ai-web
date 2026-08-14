# Knowledge Workspace Contract

## 1. Scope / Trigger

Apply this contract to `/knowledge`, `src/features/knowledge-cloud/`, knowledge selectors in Chat/Agents/Workflows, knowledge Admin UI, shared knowledge types, API clients, citations, and related responsive styles/tests.

## 2. Signatures

```ts
type KnowledgeBaseReadiness = "not-ready" | "partial" | "ready";

knowledgeBaseReadiness(base: KnowledgeBase): KnowledgeBaseReadiness;
isKnowledgeBaseReady(base: KnowledgeBase): boolean;

api.runKnowledgeRetrievalLab(
  csrfToken: string,
  payload: KnowledgeRetrievalLabRequest,
  signal?: AbortSignal
): Promise<KnowledgeRetrievalLabResult>;
```

Knowledge owner routes use the opaque HttpOnly session Cookie, exact Origin, and `X-Knowledge-CSRF` for mutations. Embedding Keys remain in the dedicated session-only connection store.

## 3. Contracts

- The main workspace remains account-free. `/knowledge` owns its separate register/login/recovery/session flow and never treats the main API Key as knowledge identity.
- One owner account can create multiple private knowledge bases. Chat can select at most three. No sharing, team, invite-to-library, or public-base controls are rendered.
- Logged-out and unavailable knowledge entry points stay discoverable. UI states distinguish unavailable, logged out, partial, ready, missing embedding Key, retrieving, no reliable match, expired session, and citation-open failure.
- `partial` means a valid active index has at least one ready document while newer documents or an index build remain pending. Partial bases are selectable and must not be presented as fully ready.
- Pending API Keys live only in `sessionStorage`; they are never copied into IndexedDB, workspace export/import, conversation records, URLs, or telemetry.
- Chunk edits are clearly drafts: active-index content remains in use until reindex completes. Disable/edit actions require owner session + CSRF and never claim immediate replacement.
- Retrieval Lab always sends `trace: true`, uses request-only parameters, supports cancellation, and never mutates saved production settings. It renders original/effective query, stage timing, scores, filtering, budget/truncation, final context, and authorized citations.
- Citation open/download calls reauthorize every request. A failed source URL does not remove the answer or other citations.
- Desktop and mobile keep one page/dialog scroll owner, visible focus, keyboard operation, no horizontal overflow, and at least 44px touch targets on mobile.
- Knowledge Admin retrieval-enhancement toggles default off and explain that each request must still explicitly opt in with a transient Key.

## 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| Owner session missing | Show login entry; do not issue owner retrieval |
| Knowledge runtime unavailable | Preserve entry and show bounded unavailable reason |
| More than three bases selected | Keep previous valid selection; do not send |
| Base has active index and one ready document | Mark partial if newer work exists; allow selection |
| Base has zero ready documents | Disable retrieval selection |
| Required embedding vendor Key missing | Preserve selection and show the missing vendor action |
| Retrieval produces no reliable chunks | Show explicit no-match state; do not present an ungrounded answer |
| Retrieval/session expires | Clear live knowledge authorization state, preserve conversations and the main BYOK Key |
| Retrieval Lab is cancelled | Abort the request and keep the form values for retry |
| Citation opening fails | Show local citation failure without discarding generated content |

## 5. Good / Base / Bad Cases

- Good: the owner selects a partial base plus two ready bases, sends Chat once, sees `retrieving`, then generation and authorized citations without any Key entering conversation persistence.
- Base: a full-text Retrieval Lab query runs without an embedding Key and renders a trace with no embedding stage groups.
- Bad: hiding the knowledge entry while logged out, requiring every document to finish before using an old active index, putting a Key in localStorage/IndexedDB, or silently generating without knowledge after retrieval fails.

## 6. Tests Required

- `tests/e2e/knowledge-auth.spec.ts`: register/login/recovery/session-only behavior on desktop/mobile.
- `tests/e2e/knowledge-workspace.spec.ts`: upload/index/rebuild, chunk drafts, Retrieval Lab auth/payload/trace/cancel/no-result, keyboard, and containment.
- `tests/e2e/chat-knowledge-integration.spec.ts`: three-base projection, partial readiness, state transitions, no-match/session expiry, citation open, logout preservation, and Key privacy.
- `tests/e2e/knowledge-admin.spec.ts`: six Admin destinations, reason/confirmation flow, one-time values, and responsive containment.
- `npm run check`, `npm run privacy`, and the four knowledge Playwright viewports remain green.

## 7. Wrong vs Correct

```ts
// Wrong: block every base until all documents finish.
const selectable = base.readyDocumentCount === base.documentCount;

// Correct: preserve active-index availability and expose partial state.
const selectable = base.status === "active" &&
  base.activeIndexVersion !== null &&
  base.readyDocumentCount > 0;
```

```ts
// Wrong: save a request credential with the workspace snapshot.
snapshot.knowledgeConnection = { apiKey };

// Correct: resolve the session-only connection only when the user sends.
const embeddingConnections = knowledgeEmbeddingConnectionsForBases(baseIds, bases);
await api.retrieveKnowledge(csrfToken, { knowledgeBaseIds: baseIds, embeddingConnections });
```
