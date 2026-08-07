import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  APP_VERSION,
  normalizeAppVersion,
  readAppVersion
} from "../../server/app-version.mjs";

test("application version is sourced from package.json", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert.equal(APP_VERSION, manifest.version);
  assert.equal(readAppVersion(), manifest.version);
});

test("application version accepts semantic release labels and rejects unrelated values", () => {
  assert.equal(normalizeAppVersion("1.2.3-beta.1+build.7"), "1.2.3-beta.1+build.7");
  for (const invalid of ["", "0.3", "v0.0.8", "latest", "01.2.3"]) {
    assert.throws(() => normalizeAppVersion(invalid), /invalid application version/u);
  }
});

test("application version fails closed for missing or malformed manifests", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-version-"));
  try {
    const malformed = path.join(directory, "malformed.json");
    fs.writeFileSync(malformed, "not-json");
    assert.throws(() => readAppVersion(malformed), /Unable to read/u);

    const missingVersion = path.join(directory, "missing-version.json");
    fs.writeFileSync(missingVersion, JSON.stringify({ name: "xi-ai-web" }));
    assert.throws(() => readAppVersion(missingVersion), /invalid application version/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
