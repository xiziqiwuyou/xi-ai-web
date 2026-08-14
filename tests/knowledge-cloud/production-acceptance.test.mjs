import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("production acceptance reports missing credentials as SKIP without secret values", () => {
  const secret = "must-not-appear";
  const result = spawnSync(process.execPath, [path.resolve("scripts/knowledge-production-acceptance.mjs")], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      KNOWLEDGE_ACCEPTANCE_OPENAI_API_KEY: secret
    }
  });
  assert.equal(result.status, 2);
  const records = result.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  assert.equal(records.length, 7);
  assert(records.every((record) => record.status === "SKIP"));
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});
