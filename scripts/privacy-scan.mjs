import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = ["src", "server", "data", "README.md"];
const forbiddenDataKeys = [/"apiKey"\s*:/, /"baseUrl"\s*:/, /adminEntryEnabled/];

function walk(target) {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  return fs
    .readdirSync(full)
    .flatMap((name) => walk(path.join(target, name)))
    .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}dist${path.sep}`));
}

const dataFiles = walk("data").filter((file) => file.endsWith(".json") || file.endsWith(".jsonl"));
for (const file of dataFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbiddenDataKeys) {
    if (pattern.test(text)) {
      throw new Error(`Sensitive key matched ${pattern} in ${path.relative(root, file)}`);
    }
  }
}

for (const target of targets) {
  for (const file of walk(target)) {
    if (file.includes(`${path.sep}backups${path.sep}`)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) {
      throw new Error(`Possible API key in ${path.relative(root, file)}`);
    }
  }
}

console.log("Privacy scan passed");
