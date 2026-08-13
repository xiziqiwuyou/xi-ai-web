import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/features/chat/userMcpProfiles.ts", "utf8");
const workspaceFiles = [
  "src/features/workspace/workspaceDb.ts",
  "src/features/workspace/workspaceArchive.ts",
  "src/features/workspace/progressSyncTypes.ts",
  "src/features/workspace/workspaceRepository.ts"
].map((file) => fs.readFileSync(file, "utf8"));

assert(source.includes('"xi-ai-web-user-mcp"'), "user MCP must use a dedicated IndexedDB database");
assert(source.includes("window.sessionStorage"), "session-only MCP profiles must use sessionStorage");
assert(source.includes("persistedKeys"), "user MCP persistence must use an explicit allowlist");
assert(source.includes("credentials") === false, "user MCP profile storage must not contain credentials");
assert(source.includes("approval") === false, "user MCP profile storage must not contain approval state");
assert(source.includes("arguments") === false, "user MCP profile storage must not contain tool arguments");
assert(source.includes("results") === false, "user MCP profile storage must not contain tool results");
for (const file of workspaceFiles) {
  assert(!file.includes("userMcpProfileDatabaseName"), "workspace data must not import user MCP storage");
  assert(!file.includes("userMcpSessionStorageKey"), "workspace sync must not include user MCP session data");
}

console.log("user MCP storage contracts passed");
