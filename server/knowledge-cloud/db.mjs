import pg from "pg";

const { Pool } = pg;

function databaseSslConfig(config) {
  if (config.sslMode === "disable") return false;
  if (config.sslMode === "require") return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ...(config.sslCa ? { ca: config.sslCa } : {})
  };
}

export function createKnowledgePool(config, { PoolClass = Pool } = {}) {
  return new PoolClass({
    connectionString: config.connectionString,
    ssl: databaseSslConfig(config),
    connectionTimeoutMillis: config.connectionTimeoutMs,
    max: config.poolMax,
    application_name: "xi-ai-web-knowledge"
  });
}

export async function withKnowledgeClient(pool, work) {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function withKnowledgeTransaction(pool, work) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query("BEGIN");
    try {
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError = rollbackError;
        Object.defineProperty(error, "rollbackError", {
          value: rollbackError,
          enumerable: false
        });
      }
      throw error;
    }
  } finally {
    client.release(releaseError);
  }
}

export async function closeKnowledgePool(pool) {
  if (pool && typeof pool.end === "function") await pool.end();
}
