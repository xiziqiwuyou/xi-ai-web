ALTER TABLE kb_chunks
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple'::regconfig, COALESCE(text_content, ''))
    ) STORED;

CREATE INDEX kb_chunks_search_vector_gin_idx
  ON kb_chunks USING gin (search_vector)
  WHERE embedding_state = 'ready';
