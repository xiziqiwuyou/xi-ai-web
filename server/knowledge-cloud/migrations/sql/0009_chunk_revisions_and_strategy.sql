ALTER TABLE kb_knowledge_bases
  ADD COLUMN chunk_strategy_id text NOT NULL DEFAULT 'balanced'
    CHECK (chunk_strategy_id IN ('compact', 'balanced', 'context_rich')),
  ADD COLUMN chunk_strategy_version integer NOT NULL DEFAULT 1
    CHECK (chunk_strategy_version > 0);

ALTER TABLE kb_index_versions
  ADD COLUMN chunk_strategy_id text NOT NULL DEFAULT 'balanced'
    CHECK (chunk_strategy_id IN ('compact', 'balanced', 'context_rich')),
  ADD COLUMN chunk_strategy_version integer NOT NULL DEFAULT 1
    CHECK (chunk_strategy_version > 0);

ALTER TABLE kb_chunks
  ADD COLUMN enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN chunk_strategy_id text NOT NULL DEFAULT 'balanced'
    CHECK (chunk_strategy_id IN ('compact', 'balanced', 'context_rich'));

CREATE TABLE kb_chunk_revisions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  document_id uuid NOT NULL,
  source_chunk_id uuid NOT NULL,
  source_index_version_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  text_content text NOT NULL
    CHECK (octet_length(text_content) BETWEEN 1 AND 16384),
  text_bytes integer NOT NULL
    CHECK (text_bytes = octet_length(text_content)),
  token_estimate integer NOT NULL CHECK (token_estimate > 0),
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_locator) = 'object'),
  enabled boolean NOT NULL,
  chunk_strategy_id text NOT NULL
    CHECK (chunk_strategy_id IN ('compact', 'balanced', 'context_rich')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id, account_id, knowledge_base_id)
    REFERENCES kb_documents(id, account_id, knowledge_base_id) ON DELETE CASCADE,
  UNIQUE (source_chunk_id, revision),
  UNIQUE (id, account_id, knowledge_base_id, document_id)
);

CREATE INDEX kb_chunk_revisions_owner_document_idx
  ON kb_chunk_revisions (
    account_id, knowledge_base_id, document_id, source_chunk_id, revision DESC
  );

CREATE TRIGGER kb_chunk_revisions_immutable
  BEFORE UPDATE ON kb_chunk_revisions
  FOR EACH STATEMENT
  EXECUTE FUNCTION kb_reject_immutable_record_mutation();
