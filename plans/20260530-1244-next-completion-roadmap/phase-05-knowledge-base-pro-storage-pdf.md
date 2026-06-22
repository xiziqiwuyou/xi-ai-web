# Phase 05 - Knowledge Base Pro Storage and PDF

## Context Links

- Knowledge module: `C:\Users\56252\Documents\New project 2\src\features\knowledge\KnowledgeModule.tsx`
- Extractors: `C:\Users\56252\Documents\New project 2\src\features\knowledge\documentExtractors.ts`
- Browser store: `C:\Users\56252\Documents\New project 2\src\features\knowledge\knowledgeStore.ts`
- Retrieval server: `C:\Users\56252\Documents\New project 2\server\knowledge`
- Embedding endpoint: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Overview

Date: 2026-05-30  
Priority: P1  
Status: Completed

Upgrade knowledge base from small local text files to a more complete browser-local library with PDF parsing, IndexedDB storage, embedding cache, and index lifecycle controls.

## Key Insights

- Current upload supports TXT/Markdown/CSV/JSON.
- PDF currently throws a clear unsupported error.
- LocalStorage is not ideal for larger document libraries.
- Retrieval can already use embeddings through request-time BYOK.

## Requirements

- Add PDF text extraction.
- Move knowledge documents from `localStorage` to IndexedDB.
- Keep compatibility migration from old localStorage records.
- Add embedding cache per document/chunk/model.
- Add library management:
  - search.
  - document tags.
  - select all/none.
  - re-index.
  - delete.
- Keep all public documents browser-local.

## Architecture

```text
knowledgeDb.ts
  documents store
  chunks store
  embeddings store keyed by documentId/chunkId/modelId

KnowledgeModule
  document library panel
  upload/extract/chunk/index flow
  ask flow sends selected chunks only
```

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\knowledge\knowledgeDb.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\knowledge\knowledgeStore.ts`
  - Migrate localStorage to IndexedDB.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\knowledge\documentExtractors.ts`
  - Add PDF extraction.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\knowledge\KnowledgeModule.tsx`
  - Add library UI and index controls.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Batch embedding helper if needed.
- Modify: `C:\Users\56252\Documents\New project 2\server\knowledge\retrieval.mjs`
  - Confirm score normalization and edge cases.
- Modify: `C:\Users\56252\Documents\New project 2\README.md`
  - Document browser-local library limits.

## Implementation Steps

1. Pick PDF extraction strategy:
   - Prefer browser-side PDF.js if dependency size is acceptable.
   - Keep server parser out of MVP unless browser parser is blocked.
2. Add IndexedDB wrapper:
   - No heavy state library.
   - Promise-based minimal helper.
3. Add migration:
   - Read old localStorage once.
   - Save to IndexedDB.
   - Mark migration complete.
4. Add embedding cache:
   - `embeddingKey = modelId + chunkHash`.
   - Store vector and dimensions.
5. Add re-index flow:
   - Batch chunks.
   - Show progress.
   - Abort/cancel support if simple.
6. Improve retrieval:
   - Prefer cached embeddings when available.
   - Fall back to lexical search.
7. Add document library UI:
   - filter/search.
   - tags.
   - selected document set.
   - clear cache/delete.

## Todo List

- [ ] Add IndexedDB knowledge store.
- [ ] Add PDF extraction.
- [ ] Add localStorage migration.
- [ ] Add embedding cache.
- [ ] Add re-index UI.
- [ ] Add document library controls.

## Success Criteria

- PDF upload extracts readable text.
- Existing localStorage knowledge records migrate.
- Larger document sets do not hit localStorage quota.
- Repeated questions reuse cached embeddings.
- Public documents never write to backend data.

## Risk Assessment

- Risk: PDF.js bundle size is large.
  - Mitigation: lazy-load only in knowledge module.
- Risk: IndexedDB APIs are verbose.
  - Mitigation: keep a small wrapper and test migration.

## Security Considerations

- Parse PDF text only; do not execute embedded content.
- Keep browser-local storage clear in UI.
- Never upload full document unless user explicitly asks a question or indexes with BYOK.

## Next Steps

After knowledge expansion, improve media provider templates and task polling.
