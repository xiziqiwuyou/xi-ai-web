ALTER TABLE kb_runtime_settings
  ADD COLUMN query_rewrite_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN rerank_enabled boolean NOT NULL DEFAULT false;
