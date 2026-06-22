# Phase 02 - Knowledge Files and Persistent Retrieval

## Context Links

- Current retrieval: `C:\Users\56252\Documents\New project 2\server\knowledge\retrieval.mjs`
- Chunking: `C:\Users\56252\Documents\New project 2\server\knowledge\chunk-text.mjs`
- Generation UI: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`

## Overview

Date: 2026-05-30  
Priority: P0  
Status: Completed

Turn knowledge base from pasted text into a real file workflow: upload, extract, chunk, index, persist locally, retrieve with embeddings, and cite source chunks in results.

## Key Insights

- There is no public user identity, so public uploaded files must not become shared server-global data by default.
- Current retrieval accepts raw context per request and optionally embeds it.
- Best first version: browser-local knowledge library with request-time BYOK embedding.

## Requirements

- Upload documents from knowledge page.
- Support first: `.txt`, `.md`, `.csv`, `.json`.
- Add PDF support if dependency size is acceptable. Prefer lazy-loaded `pdfjs-dist`.
- Persist document metadata, text, chunks, and optional embeddings in browser storage.
- Do not store public API URL/Key or user uploaded docs in backend JSON.
- Let user select one or more documents for retrieval.
- Show retrieved chunks with source name and score.
- Keep pasted context as quick mode.

## Architecture

Use browser-local knowledge store:

```text
KnowledgeModule
  file picker/drop zone
  document list
  selected documents
  query composer
  retrieval result

knowledgeStore.ts
  IndexedDB/local fallback
  documents
  chunks
  embeddings metadata

server /api/generate/knowledge
  receives selected context or chunks
  calls retrieveContext
  uses request-time user connection for embeddings
```

First implementation can store extracted text and chunks locally. Embeddings can be recomputed on demand, then cached locally if dimensions/model match.

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\knowledge\KnowledgeModule.tsx`
  - Dedicated knowledge UI if `GenerationModule` becomes too crowded.
- Create: `C:\Users\56252\Documents\New project 2\src\features\knowledge\knowledgeStore.ts`
  - Browser local persistence for documents/chunks/embedding cache.
- Create: `C:\Users\56252\Documents\New project 2\src\features\knowledge\documentExtractors.ts`
  - Text extraction and file validation.
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
  - Route `knowledge` to dedicated module if created.
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add `KnowledgeDocument`, `KnowledgeChunk`, retrieval source types.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Add retrieval/index helper calls only if needed.
- Modify: `C:\Users\56252\Documents\New project 2\server\knowledge\retrieval.mjs`
  - Accept pre-chunked context and preserve source metadata.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Extend knowledge generation payload validation and result citations.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Add upload zone, doc list, chunk citations, progress states.
- Optional dependency: `pdfjs-dist`
  - Use only if PDF upload is included in this phase.

## Implementation Steps

1. Add knowledge-specific types.
2. Build `documentExtractors.ts`:
   - Enforce size limit from feature settings.
   - Reject unsupported MIME/extensions.
   - Normalize text.
3. Build `knowledgeStore.ts`:
   - IndexedDB preferred.
   - LocalStorage fallback only for small docs.
   - Versioned schema.
4. Add document upload UI:
   - Drop zone.
   - File list.
   - Remove document.
   - Re-index action.
5. Add chunking:
   - Mirror server chunk rules client-side or call shared route.
   - Store source document id, name, chunk index.
6. Add retrieval mode:
   - Quick paste.
   - Selected knowledge docs.
   - Mixed mode.
7. Use embedding model selector from model catalog.
8. On query:
   - If no embedding model or embedding call fails, fall back to lexical ranking.
   - Include top K chunks in generation request.
9. Render citations in `ResultPanel` or knowledge-specific result view.
10. Add cleanup controls:
   - Delete document.
   - Clear all local knowledge.

## Todo List

- [x] Add document extraction utilities.
- [x] Add browser-local knowledge persistence.
- [x] Add upload/drop zone and document list.
- [x] Add chunk metadata and source citations.
- [x] Add embedding fallback behavior.
- [x] Validate no uploaded docs enter backend data files.

## Success Criteria

- User can upload supported files on knowledge page.
- User can ask questions against selected files.
- Result shows retrieved source chunks.
- Refreshing the page keeps local knowledge documents.
- Clearing browser storage removes knowledge documents.
- API URL/Key remains `sessionStorage` only.
- `npm run check` and `npm run build` pass.

## Risk Assessment

- Risk: Large files exceed localStorage.
  - Mitigation: use IndexedDB and size limits.
- Risk: PDF extraction adds large bundle.
  - Mitigation: lazy import PDF parser and ship text/markdown first if needed.
- Risk: Public files become shared backend data accidentally.
  - Mitigation: no server persistence for public uploads in this phase.

## Security Considerations

- Sanitize file names and text previews.
- Never log raw document text on server.
- Cap file size, file count, chunk count, and prompt context size.
- Show user that files are local to browser unless admin global KB is introduced later.

## Next Steps

After knowledge files work, reuse the same attachment and extraction primitives for multimodal chat.
