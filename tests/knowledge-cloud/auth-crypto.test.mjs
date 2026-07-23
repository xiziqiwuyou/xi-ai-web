import assert from "node:assert/strict";
import test from "node:test";
import {
  createKnowledgeRecoveryCode,
  hashKnowledgePassword,
  hashKnowledgeSecret,
  normalizeKnowledgeRecoveryCode,
  verifyKnowledgePassword
} from "../../server/knowledge-cloud/auth/crypto.mjs";

test("built-in Argon2id hashes use the versioned knowledge format", async () => {
  const password = "a-correct-long-password";
  const encoded = await hashKnowledgePassword(password);
  assert.match(encoded, /^\$xi-argon2id\$v=1\$m=65536,t=3,p=2\$/);
  assert.equal(await verifyKnowledgePassword(password, encoded), true);
  assert.equal(await verifyKnowledgePassword("incorrect-password", encoded), false);
  assert.equal(await verifyKnowledgePassword(password, "not-a-valid-hash"), false);
});

test("knowledge token hashes are keyed and domain separated", () => {
  const secret = "same-opaque-value";
  const tokenSecret = "knowledge-token-secret-0123456789abcdef";
  const sessionHash = hashKnowledgeSecret(secret, "session", tokenSecret);
  const csrfHash = hashKnowledgeSecret(secret, "csrf", tokenSecret);
  assert.equal(sessionHash.length, 32);
  assert.equal(csrfHash.length, 32);
  assert.notDeepEqual(sessionHash, csrfHash);
  assert.notDeepEqual(
    sessionHash,
    hashKnowledgeSecret(secret, "session", `${tokenSecret}-rotated`)
  );
});

test("recovery codes carry enough entropy and have one canonical form", () => {
  const code = createKnowledgeRecoveryCode();
  assert.match(code, /^XI-KB-(?:[A-F0-9]{4}-){9}[A-F0-9]{4}$/);
  assert.match(normalizeKnowledgeRecoveryCode(code), /^XIKB[A-F0-9]{40}$/);
});
