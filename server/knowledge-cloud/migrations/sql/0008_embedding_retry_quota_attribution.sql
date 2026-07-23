DROP INDEX IF EXISTS kb_usage_ledger_unique_reserve_idx;

CREATE INDEX IF NOT EXISTS kb_usage_ledger_document_capacity_idx
  ON kb_usage_ledger (account_id, document_id, component, index_version_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_usage_ledger_index_capacity_idx
  ON kb_usage_ledger (account_id, index_version_id, component, document_id)
  WHERE index_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kb_usage_ledger_base_capacity_idx
  ON kb_usage_ledger (account_id, knowledge_base_id, component)
  WHERE knowledge_base_id IS NOT NULL;
