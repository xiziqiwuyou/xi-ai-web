import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdminCredentialStore } from "../../server/admin-credentials.mjs";

function temporaryCredentialFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-admin-credentials-"));
  return {
    directory,
    filePath: path.join(directory, "admin-credentials.json")
  };
}

test("admin credentials default to xizi2333 and remain locked without a password", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({ filePath, password: "" });
    assert.equal(store.configured, false);
    assert.equal(store.username, "xizi2333");
    assert.equal(store.verify("xizi2333", "anything"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("admin credentials accept eight-character passwords and reject seven-character passwords", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    assert.throws(
      () => createAdminCredentialStore({ filePath, password: "1234567" }),
      (error) => error?.status === 400 && error?.code === "ADMIN_PASSWORD_INVALID"
    );
    const store = createAdminCredentialStore({ filePath, password: "12345678" });
    assert.equal(store.verify("xizi2333", "12345678"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("admin credentials verify both username and password without revealing which field failed", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({
      filePath,
      username: "operator",
      password: "correct-horse-battery-staple"
    });
    assert.equal(store.verify("operator", "correct-horse-battery-staple"), true);
    assert.equal(store.verify("other", "correct-horse-battery-staple"), false);
    assert.equal(store.verify("operator", "wrong-password"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("credential rotation atomically persists only salted hash material and survives restart", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({
      filePath,
      username: "xizi2333",
      password: "initial-admin-password"
    });
    const previousRevision = store.revision;
    const result = store.rotate({
      currentPassword: "initial-admin-password",
      username: "new-operator",
      password: "new-admin-password-2026"
    });

    assert.equal(result.username, "new-operator");
    assert.notEqual(result.revision, previousRevision);
    const serialized = fs.readFileSync(filePath, "utf8");
    assert.equal(serialized.includes("initial-admin-password"), false);
    assert.equal(serialized.includes("new-admin-password-2026"), false);
    const record = JSON.parse(serialized);
    assert.equal(record.version, 1);
    assert.equal(record.username, "new-operator");
    assert.match(record.salt, /^[A-Za-z0-9_-]+$/);
    assert.match(record.passwordHash, /^[A-Za-z0-9_-]+$/);

    const reloaded = createAdminCredentialStore({
      filePath,
      username: "ignored-bootstrap-user",
      password: "ignored-bootstrap-password"
    });
    assert.equal(reloaded.source, "file");
    assert.equal(reloaded.verify("new-operator", "new-admin-password-2026"), true);
    assert.equal(reloaded.verify("xizi2333", "initial-admin-password"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("username-only rotation rehashes the confirmed current password", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({
      filePath,
      username: "xizi2333",
      password: "initial-admin-password"
    });
    store.rotate({
      currentPassword: "initial-admin-password",
      username: "renamed-operator",
      password: ""
    });
    assert.equal(store.verify("renamed-operator", "initial-admin-password"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("persisted credentials can be rotated repeatedly on the same file", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({
      filePath,
      username: "xizi2333",
      password: "initial-admin-password"
    });
    store.rotate({
      currentPassword: "initial-admin-password",
      username: "first-operator",
      password: "first-rotated-password"
    });
    store.rotate({
      currentPassword: "first-rotated-password",
      username: "second-operator",
      password: "second-rotated-password"
    });
    const reloaded = createAdminCredentialStore({ filePath, password: "ignored-bootstrap-password" });
    assert.equal(reloaded.verify("second-operator", "second-rotated-password"), true);
    assert.equal(reloaded.verify("first-operator", "first-rotated-password"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("credential rotation rejects a wrong current password and unsafe new values", () => {
  const { directory, filePath } = temporaryCredentialFile();
  try {
    const store = createAdminCredentialStore({
      filePath,
      username: "xizi2333",
      password: "initial-admin-password"
    });
    assert.throws(
      () => store.rotate({ currentPassword: "wrong", username: "next-user", password: "new-admin-password-2026" }),
      (error) => error?.status === 401 && error?.code === "ADMIN_CREDENTIALS_INVALID"
    );
    assert.throws(
      () => store.rotate({ currentPassword: "initial-admin-password", username: "bad name", password: "" }),
      (error) => error?.status === 400 && error?.code === "ADMIN_USERNAME_INVALID"
    );
    assert.throws(
      () => store.rotate({ currentPassword: "initial-admin-password", username: "next-user", password: "short" }),
      (error) => error?.status === 400 && error?.code === "ADMIN_PASSWORD_INVALID"
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
