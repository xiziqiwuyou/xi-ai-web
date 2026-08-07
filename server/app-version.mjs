import fs from "node:fs";
import { fileURLToPath } from "node:url";

const defaultPackageFile = fileURLToPath(new URL("../package.json", import.meta.url));
const semanticVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export function normalizeAppVersion(value) {
  const version = String(value || "").trim();
  if (!semanticVersionPattern.test(version)) {
    throw new Error("package.json contains an invalid application version");
  }
  return version;
}

export function readAppVersion(packageFile = defaultPackageFile) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  } catch {
    throw new Error("Unable to read the application package manifest");
  }
  return normalizeAppVersion(manifest?.version);
}

export const APP_VERSION = readAppVersion();
