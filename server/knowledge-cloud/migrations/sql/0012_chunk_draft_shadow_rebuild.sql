CREATE TABLE kb_chunk_revision_materializations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  document_id uuid NOT NULL,
  source_chunk_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  source_index_version_id uuid NOT NULL,
  target_index_version_id uuid NOT NULL,
  target_chunk_id uuid,
  revision integer NOT NULL CHECK (revision > 1),
  enabled boolean NOT NULL,
  text_bytes integer NOT NULL CHECK (text_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (revision_id, account_id, knowledge_base_id, document_id)
    REFERENCES kb_chunk_revisions(id, account_id, knowledge_base_id, document_id)
    ON DELETE CASCADE,
  UNIQUE (target_index_version_id, source_chunk_id),
  UNIQUE (revision_id, target_index_version_id)
);

CREATE INDEX kb_chunk_revision_materializations_source_idx
  ON kb_chunk_revision_materializations (
    account_id, knowledge_base_id, source_index_version_id, source_chunk_id
  );

CREATE INDEX kb_chunk_revision_materializations_target_idx
  ON kb_chunk_revision_materializations (
    account_id, knowledge_base_id, target_index_version_id, document_id
  );

CREATE TRIGGER kb_chunk_revision_materializations_immutable
  BEFORE UPDATE ON kb_chunk_revision_materializations
  FOR EACH STATEMENT
  EXECUTE FUNCTION kb_reject_immutable_record_mutation();
