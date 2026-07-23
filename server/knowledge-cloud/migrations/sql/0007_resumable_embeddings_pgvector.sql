ALTER TABLE kb_runtime_settings
  ADD COLUMN max_concurrent_embeddings_per_account integer NOT NULL DEFAULT 2
    CHECK (max_concurrent_embeddings_per_account > 0);

ALTER TABLE kb_embedding_batches
  ADD COLUMN error_code text,
  ADD COLUMN error_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(error_metadata) = 'object'),
  ADD COLUMN vector_bytes bigint NOT NULL DEFAULT 0 CHECK (vector_bytes >= 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN released_at timestamptz;

CREATE INDEX kb_embedding_batches_document_status_idx
  ON kb_embedding_batches (account_id, document_id, index_version_id, status, created_at DESC);

CREATE INDEX kb_chunks_embedding_lease_expiry_idx
  ON kb_chunks (account_id, embedding_lease_expires_at)
  WHERE embedding_state = 'leased';

CREATE TABLE kb_vectors_1024 (
  chunk_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  index_version_id uuid NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id, account_id, knowledge_base_id, index_version_id)
    REFERENCES kb_chunks(id, account_id, knowledge_base_id, index_version_id)
    ON DELETE CASCADE
);

CREATE INDEX kb_vectors_1024_scope_idx
  ON kb_vectors_1024 (account_id, knowledge_base_id, index_version_id);
CREATE INDEX kb_vectors_1024_embedding_hnsw_idx
  ON kb_vectors_1024 USING hnsw (embedding vector_cosine_ops);

CREATE TABLE kb_vectors_1536 (
  chunk_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  index_version_id uuid NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id, account_id, knowledge_base_id, index_version_id)
    REFERENCES kb_chunks(id, account_id, knowledge_base_id, index_version_id)
    ON DELETE CASCADE
);

CREATE INDEX kb_vectors_1536_scope_idx
  ON kb_vectors_1536 (account_id, knowledge_base_id, index_version_id);
CREATE INDEX kb_vectors_1536_embedding_hnsw_idx
  ON kb_vectors_1536 USING hnsw (embedding vector_cosine_ops);

CREATE TABLE kb_vectors_3072 (
  chunk_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  index_version_id uuid NOT NULL,
  embedding halfvec(3072) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id, account_id, knowledge_base_id, index_version_id)
    REFERENCES kb_chunks(id, account_id, knowledge_base_id, index_version_id)
    ON DELETE CASCADE
);

CREATE INDEX kb_vectors_3072_scope_idx
  ON kb_vectors_3072 (account_id, knowledge_base_id, index_version_id);
CREATE INDEX kb_vectors_3072_embedding_hnsw_idx
  ON kb_vectors_3072 USING hnsw (embedding halfvec_cosine_ops);
