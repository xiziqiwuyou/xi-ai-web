import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "../errors.mjs";

const migrationDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "sql");
const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function normalizeMigrationSource(source) {
  return String(source).replace(/\r\n?/g, "\n");
}

export function checksumMigrationSource(source) {
  return crypto.createHash("sha256").update(normalizeMigrationSource(source), "utf8").digest("hex");
}

export async function loadKnowledgeMigrationManifest({ directory = migrationDirectory } = {}) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"));
  const invalid = sqlFiles.filter((entry) => !MIGRATION_FILE_PATTERN.test(entry.name));
  if (invalid.length) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
      "知识库迁移文件名不符合约定",
      { status: 500, details: { files: invalid.map((entry) => entry.name) } }
    );
  }

  const migrations = await Promise.all(
    sqlFiles.map(async (entry) => {
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      const source = normalizeMigrationSource(await fs.readFile(path.join(directory, entry.name), "utf8"));
      return Object.freeze({
        version: Number(match[1]),
        name: match[2],
        fileName: entry.name,
        checksum: checksumMigrationSource(source),
        source
      });
    })
  );
  migrations.sort((left, right) => left.version - right.version);

  for (let index = 0; index < migrations.length; index += 1) {
    if (index > 0 && migrations[index - 1].version === migrations[index].version) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
        "知识库迁移版本重复",
        { status: 500, details: { version: migrations[index].version } }
      );
    }
    if (migrations[index].version !== index + 1) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.CONFIG_INVALID,
        "知识库迁移版本必须从 0001 连续递增",
        {
          status: 500,
          details: { expected: index + 1, actual: migrations[index].version }
        }
      );
    }
  }
  return Object.freeze(migrations);
}

export const KNOWLEDGE_MIGRATION_DIRECTORY = migrationDirectory;
