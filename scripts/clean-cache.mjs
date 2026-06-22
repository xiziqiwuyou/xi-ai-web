import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  "dist",
  "node_modules/.vite",
  "tsconfig.tsbuildinfo",
  "-"
];

async function removeTarget(relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!absolutePath.startsWith(rootDir + path.sep) && absolutePath !== rootDir) {
    throw new Error(`Refusing to remove outside project: ${absolutePath}`);
  }
  await fs.rm(absolutePath, { recursive: true, force: true });
  console.log(`removed ${relativePath}`);
}

await Promise.all(targets.map(removeTarget));
