import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  knowledgeError
} from "../errors.mjs";
import { loadKnowledgeMigrationManifest } from "./manifest.mjs";

const MIGRATION_LOCK_ID = 782031441;

const CREATE_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS kb_schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    checksum char(64) NOT NULL,
    execution_ms integer NOT NULL CHECK (execution_ms >= 0),
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE OR REPLACE FUNCTION kb_reject_schema_migration_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION 'kb_schema_migrations is append-only';
  END;
  $$;

  DROP TRIGGER IF EXISTS kb_schema_migrations_append_only ON kb_schema_migrations;
  CREATE TRIGGER kb_schema_migrations_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON kb_schema_migrations
    FOR EACH STATEMENT
    EXECUTE FUNCTION kb_reject_schema_migration_mutation();
`;

function normalizeAppliedRow(row) {
  return {
    version: Number(row.version),
    name: String(row.name),
    checksum: String(row.checksum),
    executionMs: Number(row.execution_ms),
    appliedAt: row.applied_at
  };
}

async function migrationLedgerExists(queryable) {
  const result = await queryable.query("SELECT to_regclass('kb_schema_migrations') AS ledger");
  return Boolean(result.rows?.[0]?.ledger);
}

async function readAppliedMigrations(queryable) {
  const result = await queryable.query(
    "SELECT version, name, checksum, execution_ms, applied_at FROM kb_schema_migrations ORDER BY version"
  );
  return (result.rows || []).map(normalizeAppliedRow);
}

export function compareKnowledgeMigrations(manifest, applied) {
  const expectedByVersion = new Map(manifest.map((migration) => [migration.version, migration]));
  for (let index = 0; index < applied.length; index += 1) {
    const row = applied[index];
    const expected = expectedByVersion.get(row.version);
    if (!expected) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.SCHEMA_AHEAD,
        "数据库知识库结构版本高于当前应用",
        { status: 503, details: { version: row.version } }
      );
    }
    if (row.version !== manifest[index]?.version) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.MIGRATION_HISTORY_INVALID,
        "知识库迁移历史不是连续前缀",
        {
          status: 503,
          details: {
            expectedVersion: manifest[index]?.version || null,
            actualVersion: row.version
          }
        }
      );
    }
    if (row.name !== expected.name || row.checksum !== expected.checksum) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.MIGRATION_CHECKSUM_MISMATCH,
        "知识库迁移校验和不匹配",
        {
          status: 503,
          details: {
            version: row.version,
            expectedName: expected.name,
            actualName: row.name
          }
        }
      );
    }
  }

  const appliedVersions = new Set(applied.map((row) => row.version));
  return manifest.filter((migration) => !appliedVersions.has(migration.version));
}

export async function inspectKnowledgeMigrations(queryable, options = {}) {
  const manifest = options.manifest || (await loadKnowledgeMigrationManifest());
  const exists = await migrationLedgerExists(queryable);
  if (!exists) {
    return { applied: [], pending: [...manifest], ledgerExists: false };
  }
  const applied = await readAppliedMigrations(queryable);
  const pending = compareKnowledgeMigrations(manifest, applied);
  return { applied, pending, ledgerExists: true };
}

export async function verifyKnowledgeMigrations(queryable, options = {}) {
  const state = await inspectKnowledgeMigrations(queryable, options);
  if (!state.ledgerExists || state.pending.length) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.MIGRATIONS_REQUIRED,
      "知识库数据库迁移尚未完成",
      {
        status: 503,
        details: { pending: state.pending.map((migration) => migration.fileName) }
      }
    );
  }
  return state;
}

export async function applyKnowledgeMigrations(
  pool,
  options = {}
) {
  const manifest = options.manifest || (await loadKnowledgeMigrationManifest());
  const logger = options.logger || console;
  const client = await pool.connect();
  let lockHeld = false;
  const appliedNow = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    lockHeld = true;
    await client.query(CREATE_LEDGER_SQL);
    const applied = await readAppliedMigrations(client);
    const pending = compareKnowledgeMigrations(manifest, applied);

    for (const migration of pending) {
      const startedAt = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.source);
        const executionMs = Math.max(0, Date.now() - startedAt);
        await client.query(
          `INSERT INTO kb_schema_migrations (version, name, checksum, execution_ms)
           VALUES ($1, $2, $3, $4)`,
          [migration.version, migration.name, migration.checksum, executionMs]
        );
        await client.query("COMMIT");
        appliedNow.push(migration.fileName);
        logger.info?.(`[knowledge] applied migration ${migration.fileName}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.MIGRATION_FAILED,
          `知识库迁移失败：${migration.fileName}`,
          { status: 500, details: { migration: migration.fileName }, cause: error }
        );
      }
    }

    return { applied: appliedNow, currentVersion: manifest.at(-1)?.version || 0 };
  } catch (error) {
    if (error instanceof KnowledgeError) throw error;
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.MIGRATION_FAILED,
      "知识库迁移执行失败",
      { status: 500, cause: error }
    );
  } finally {
    if (lockHeld) await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

export const KNOWLEDGE_MIGRATION_LOCK_ID = MIGRATION_LOCK_ID;
