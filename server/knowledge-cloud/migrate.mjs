import { pathToFileURL } from "node:url";
import { loadKnowledgeDatabaseConfig } from "./config.mjs";
import { closeKnowledgePool, createKnowledgePool } from "./db.mjs";
import { redactKnowledgeValue } from "./errors.mjs";
import {
  applyKnowledgeMigrations,
  verifyKnowledgeMigrations
} from "./migrations/runner.mjs";
import { createKnowledgeSchemaRepository } from "./repositories/schema-repository.mjs";

export async function runKnowledgeMigrationCommand({ env = process.env, checkOnly = false } = {}) {
  const database = loadKnowledgeDatabaseConfig({
    ...env,
    DATABASE_URL: env.KNOWLEDGE_MIGRATION_DATABASE_URL || env.DATABASE_URL
  });
  const pool = createKnowledgePool(database);
  try {
    const result = checkOnly
      ? await verifyKnowledgeMigrations(pool)
      : await applyKnowledgeMigrations(pool);
    const schema = createKnowledgeSchemaRepository(pool);
    const vectorVersion = await schema.vectorExtensionVersion();
    if (!vectorVersion) throw new Error("PostgreSQL vector extension is missing after migration");
    return {
      mode: checkOnly ? "check" : "up",
      applied: checkOnly ? [] : result.applied,
      currentVersion: checkOnly
        ? result.applied.at(-1)?.version || 0
        : result.currentVersion,
      vectorVersion
    };
  } finally {
    await closeKnowledgePool(pool);
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  try {
    const result = await runKnowledgeMigrationCommand({ checkOnly });
    console.log(JSON.stringify({ event: "knowledge_migration_complete", ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "knowledge_migration_failed",
        error: redactKnowledgeValue(error, {
          secrets: [process.env.KNOWLEDGE_MIGRATION_DATABASE_URL, process.env.DATABASE_URL].filter(Boolean)
        })
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
