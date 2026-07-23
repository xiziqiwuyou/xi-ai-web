# Embedding Provider And Pgvector Contracts

Research date: 2026-07-22

## OpenAI

Official sources:

- https://developers.openai.com/api/docs/guides/embeddings
- https://developers.openai.com/api/reference/resources/embeddings/methods/create

Locked request contract:

- `POST {baseUrl}/embeddings`
- Bearer API key
- JSON `{ model, input: string[], dimensions, encoding_format: "float" }`
- `text-embedding-3-small`: native/fixed 1536 dimensions
- `text-embedding-3-large`: native/fixed 3072 dimensions
- Both models document an 8192-token maximum input.

The implementation uses conservative batches of at most 32 inputs and rejects any response whose item count, indexes, finite values, or dimensions do not exactly match the leased chunk batch.

## Alibaba Cloud Model Studio / Qwen

Official source:

- https://www.alibabacloud.com/help/en/model-studio/embedding

Locked compatible-mode request contract:

- `POST {baseUrl}/embeddings`
- Bearer API key
- JSON `{ model: "text-embedding-v4", input: string[], dimensions: 1024 }`
- The documented default dimension is 1024; the approved profile fixes it at 1024.
- The documented batch limit is 10 texts and each text is limited to 8192 tokens.
- `text_type`, `instruct`, and sparse-output controls are DashScope-native only and are not sent through the OpenAI-compatible adapter.

## Pgvector

Official source:

- https://github.com/pgvector/pgvector/blob/master/README.md

HNSW limits:

- `vector`: up to 2000 dimensions for HNSW.
- `halfvec`: up to 4000 dimensions for HNSW.

Physical storage is therefore fixed by migration rather than request input:

- 1024 -> `vector(1024)` + `vector_cosine_ops`
- 1536 -> `vector(1536)` + `vector_cosine_ops`
- 3072 -> `halfvec(3072)` + `halfvec_cosine_ops`

Logical vector quota uses 4 bytes per component for `vector` and 2 bytes per component for `halfvec`. Arbitrary dimensions never become SQL identifiers or create runtime tables.
