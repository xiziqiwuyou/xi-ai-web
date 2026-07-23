function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asByteString(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return /^-?\d+$/.test(String(value ?? "")) ? String(value) : "0";
}

export function createKnowledgeQuotaRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge quota repository requires a queryable database client");
  }

  return Object.freeze({
    async lockAccountCapacity(accountId) {
      const accountResult = await queryable.query(
        `SELECT id, status, quota_bytes, used_bytes, reserved_bytes, limit_overrides
         FROM kb_accounts
         WHERE id = $1
         FOR UPDATE`,
        [accountId]
      );
      const row = accountResult.rows?.[0];
      if (!row) return null;
      const countsResult = await queryable.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM kb_knowledge_bases b
            WHERE b.account_id = $1) AS knowledge_base_count,
           (SELECT COUNT(*)::integer FROM kb_documents d
            WHERE d.account_id = $1) AS document_count,
           (SELECT COUNT(*)::integer FROM kb_chunks c
            WHERE c.account_id = $1) AS chunk_count,
           (SELECT COUNT(*)::integer FROM kb_documents d
            WHERE d.account_id = $1 AND d.status = 'pending_upload'
              AND (d.upload_expires_at IS NULL OR d.upload_expires_at > CURRENT_TIMESTAMP))
             AS active_upload_count`,
        [accountId]
      );
      const counts = countsResult.rows?.[0] || {};
      return row
        ? {
            id: row.id,
            status: row.status,
            quotaBytes: asByteString(row.quota_bytes),
            usedBytes: asByteString(row.used_bytes),
            reservedBytes: asByteString(row.reserved_bytes),
            limitOverrides: row.limit_overrides || {},
            knowledgeBaseCount: asNumber(counts.knowledge_base_count),
            documentCount: asNumber(counts.document_count),
            chunkCount: asNumber(counts.chunk_count),
            activeUploadCount: asNumber(counts.active_upload_count)
          }
        : null;
    },

    async countDocumentsInBase(accountId, baseId) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS count
         FROM kb_documents
         WHERE account_id = $1 AND knowledge_base_id = $2`,
        [accountId, baseId]
      );
      return asNumber(result.rows?.[0]?.count);
    },

    async reservationState(accountId, reservationKey, component) {
      const result = await queryable.query(
        `SELECT COUNT(*)::integer AS entry_count,
                COALESCE(SUM(reserved_delta_bytes), 0)::text AS reserved_bytes,
                COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1 AND reservation_key = $2 AND component = $3`,
        [accountId, reservationKey, component]
      );
      const row = result.rows?.[0] || {};
      return {
        entryCount: asNumber(row.entry_count),
        reservedBytes: asByteString(row.reserved_bytes),
        usedBytes: asByteString(row.used_bytes)
      };
    },

    async insertLedgerEntry(entry) {
      const result = await queryable.query(
        `INSERT INTO kb_usage_ledger (
           id, account_id, entry_type, component, reserved_delta_bytes,
           used_delta_bytes, reservation_key, knowledge_base_id, document_id,
           index_version_id, metadata, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
         RETURNING id`,
        [
          entry.id,
          entry.accountId,
          entry.entryType,
          entry.component,
          entry.reservedDeltaBytes,
          entry.usedDeltaBytes,
          entry.reservationKey || null,
          entry.knowledgeBaseId || null,
          entry.documentId || null,
          entry.indexVersionId || null,
          JSON.stringify(entry.metadata || {}),
          entry.expiresAt || null
        ]
      );
      return result.rows?.[0]?.id || null;
    },

    async adjustAccountUsage(accountId, { reservedDeltaBytes = 0, usedDeltaBytes = 0 }) {
      const result = await queryable.query(
        `UPDATE kb_accounts
         SET reserved_bytes = reserved_bytes + $2,
             used_bytes = used_bytes + $3,
             updated_at = CURRENT_TIMESTAMP,
             version = version + 1
         WHERE id = $1
           AND reserved_bytes + $2 >= 0
           AND used_bytes + $3 >= 0
         RETURNING quota_bytes::text, used_bytes::text, reserved_bytes::text`,
        [accountId, reservedDeltaBytes, usedDeltaBytes]
      );
      const row = result.rows?.[0];
      return row
        ? {
            quotaBytes: asByteString(row.quota_bytes),
            usedBytes: asByteString(row.used_bytes),
            reservedBytes: asByteString(row.reserved_bytes)
          }
        : null;
    },

    async documentUsage(accountId, documentId) {
      const result = await queryable.query(
        `SELECT component, COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1 AND document_id = $2
         GROUP BY component
         HAVING SUM(used_delta_bytes) <> 0`,
        [accountId, documentId]
      );
      return (result.rows || []).map((row) => ({
        component: row.component,
        usedBytes: asByteString(row.used_bytes)
      }));
    },

    async documentCapacity(accountId, documentId) {
      const result = await queryable.query(
        `SELECT component, index_version_id,
                COALESCE(SUM(reserved_delta_bytes), 0)::text AS reserved_bytes,
                COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1 AND document_id = $2
         GROUP BY component, index_version_id
         HAVING SUM(reserved_delta_bytes) <> 0 OR SUM(used_delta_bytes) <> 0`,
        [accountId, documentId]
      );
      return (result.rows || []).map((row) => ({
        component: row.component,
        indexVersionId: row.index_version_id || null,
        reservedBytes: asByteString(row.reserved_bytes),
        usedBytes: asByteString(row.used_bytes)
      }));
    },

    async indexUsage(accountId, indexVersionId) {
      const result = await queryable.query(
        `SELECT component, document_id,
                COALESCE(SUM(reserved_delta_bytes), 0)::text AS reserved_bytes,
                COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1 AND index_version_id = $2
         GROUP BY component, document_id
         HAVING SUM(reserved_delta_bytes) <> 0 OR SUM(used_delta_bytes) <> 0`,
        [accountId, indexVersionId]
      );
      return (result.rows || []).map((row) => ({
        component: row.component,
        documentId: row.document_id || null,
        reservedBytes: asByteString(row.reserved_bytes),
        usedBytes: asByteString(row.used_bytes)
      }));
    },

    async baseCapacity(accountId, knowledgeBaseId) {
      const result = await queryable.query(
        `SELECT component, document_id, index_version_id,
                COALESCE(SUM(reserved_delta_bytes), 0)::text AS reserved_bytes,
                COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1 AND knowledge_base_id = $2
         GROUP BY component, document_id, index_version_id
         HAVING SUM(reserved_delta_bytes) <> 0 OR SUM(used_delta_bytes) <> 0`,
        [accountId, knowledgeBaseId]
      );
      return (result.rows || []).map((row) => ({
        component: row.component,
        documentId: row.document_id || null,
        indexVersionId: row.index_version_id || null,
        reservedBytes: asByteString(row.reserved_bytes),
        usedBytes: asByteString(row.used_bytes)
      }));
    },

    async accountLedgerTotals(accountId) {
      const result = await queryable.query(
        `SELECT COALESCE(SUM(reserved_delta_bytes), 0)::text AS reserved_bytes,
                COALESCE(SUM(used_delta_bytes), 0)::text AS used_bytes
         FROM kb_usage_ledger
         WHERE account_id = $1`,
        [accountId]
      );
      return {
        reservedBytes: asByteString(result.rows?.[0]?.reserved_bytes),
        usedBytes: asByteString(result.rows?.[0]?.used_bytes)
      };
    },

    async findExpiredOutstandingReservations(limit = 50) {
      const result = await queryable.query(
        `SELECT account_id, reservation_key, component,
                MAX(knowledge_base_id::text)::uuid AS knowledge_base_id,
                MAX(document_id::text)::uuid AS document_id,
                MAX(index_version_id::text)::uuid AS index_version_id,
                SUM(reserved_delta_bytes)::text AS reserved_bytes,
                MIN(expires_at) FILTER (WHERE entry_type = 'reserve') AS expires_at
         FROM kb_usage_ledger
         WHERE reservation_key IS NOT NULL
         GROUP BY account_id, reservation_key, component
         HAVING SUM(reserved_delta_bytes) > 0
            AND MIN(expires_at) FILTER (WHERE entry_type = 'reserve') <= CURRENT_TIMESTAMP
         ORDER BY expires_at ASC, account_id ASC, reservation_key ASC
         LIMIT $1`,
        [limit]
      );
      return (result.rows || []).map((row) => ({
        accountId: row.account_id,
        reservationKey: row.reservation_key,
        component: row.component,
        knowledgeBaseId: row.knowledge_base_id || null,
        documentId: row.document_id || null,
        indexVersionId: row.index_version_id || null,
        reservedBytes: asByteString(row.reserved_bytes),
        expiresAt: row.expires_at || null
      }));
    }
  });
}
