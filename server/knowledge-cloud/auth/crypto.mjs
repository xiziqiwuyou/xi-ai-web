import crypto from "node:crypto";

const PASSWORD_FORMAT = /^\$xi-argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;
const PASSWORD_VERSION = 1;
const PASSWORD_PARAMETERS = Object.freeze({
  memory: 65536,
  passes: 3,
  parallelism: 2,
  tagLength: 32,
  saltLength: 16
});
const SECRET_PURPOSES = new Set([
  "admin-reset",
  "csrf",
  "invite",
  "ip-prefix",
  "rate-limit",
  "recovery",
  "session"
]);

function deriveArgon2(parameters, cryptoModule = crypto) {
  return new Promise((resolve, reject) => {
    cryptoModule.argon2("argon2id", parameters, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function encodePasswordHash({ nonce, derivedKey }) {
  const { memory, passes, parallelism } = PASSWORD_PARAMETERS;
  return [
    "$xi-argon2id",
    `v=${PASSWORD_VERSION}`,
    `m=${memory},t=${passes},p=${parallelism}`,
    nonce.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

function decodePasswordHash(value) {
  const match = PASSWORD_FORMAT.exec(String(value || ""));
  if (!match) return null;
  const [, version, memory, passes, parallelism, nonceValue, keyValue] = match;
  const parsed = {
    version: Number(version),
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    nonce: Buffer.from(nonceValue, "base64url"),
    derivedKey: Buffer.from(keyValue, "base64url")
  };
  if (
    parsed.version !== PASSWORD_VERSION ||
    parsed.memory !== PASSWORD_PARAMETERS.memory ||
    parsed.passes !== PASSWORD_PARAMETERS.passes ||
    parsed.parallelism !== PASSWORD_PARAMETERS.parallelism ||
    parsed.nonce.length !== PASSWORD_PARAMETERS.saltLength ||
    parsed.derivedKey.length !== PASSWORD_PARAMETERS.tagLength
  ) {
    return null;
  }
  return parsed;
}

export async function hashKnowledgePassword(password, { cryptoModule = crypto } = {}) {
  const nonce = cryptoModule.randomBytes(PASSWORD_PARAMETERS.saltLength);
  const derivedKey = await deriveArgon2(
    {
      message: Buffer.from(String(password), "utf8"),
      nonce,
      parallelism: PASSWORD_PARAMETERS.parallelism,
      tagLength: PASSWORD_PARAMETERS.tagLength,
      memory: PASSWORD_PARAMETERS.memory,
      passes: PASSWORD_PARAMETERS.passes
    },
    cryptoModule
  );
  return encodePasswordHash({ nonce, derivedKey });
}

export async function verifyKnowledgePassword(password, encoded, { cryptoModule = crypto } = {}) {
  const parsed = decodePasswordHash(encoded);
  if (!parsed) return false;
  const actual = await deriveArgon2(
    {
      message: Buffer.from(String(password), "utf8"),
      nonce: parsed.nonce,
      parallelism: parsed.parallelism,
      tagLength: parsed.derivedKey.length,
      memory: parsed.memory,
      passes: parsed.passes
    },
    cryptoModule
  );
  return actual.length === parsed.derivedKey.length && cryptoModule.timingSafeEqual(actual, parsed.derivedKey);
}

export function hashKnowledgeSecret(secret, purpose, tokenSecret, { cryptoModule = crypto } = {}) {
  if (!SECRET_PURPOSES.has(purpose)) throw new TypeError("Unknown knowledge secret purpose");
  return cryptoModule
    .createHmac("sha256", String(tokenSecret))
    .update("xi-ai-web/knowledge/v1\0", "utf8")
    .update(purpose, "utf8")
    .update("\0", "utf8")
    .update(String(secret), "utf8")
    .digest();
}

export function hashKnowledgeSecretText(secret, purpose, tokenSecret, options) {
  return hashKnowledgeSecret(secret, purpose, tokenSecret, options).toString("base64url");
}

export function constantTimeEqual(left, right, { cryptoModule = crypto } = {}) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(String(left || ""));
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && cryptoModule.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createOpaqueKnowledgeToken({ bytes = 32, cryptoModule = crypto } = {}) {
  return cryptoModule.randomBytes(bytes).toString("base64url");
}

export function createKnowledgeRecoveryCode({ cryptoModule = crypto } = {}) {
  const raw = cryptoModule.randomBytes(20).toString("hex").toUpperCase();
  return `XI-KB-${raw.match(/.{1,4}/g).join("-")}`;
}

export function createKnowledgeAdminResetCode({ cryptoModule = crypto } = {}) {
  const raw = cryptoModule.randomBytes(20).toString("hex").toUpperCase();
  return `XI-KB-RESET-${raw.match(/.{1,4}/g).join("-")}`;
}

export function normalizeKnowledgeRecoveryCode(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeKnowledgeAdminResetCode(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeKnowledgeInviteCode(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase();
}

export const KNOWLEDGE_PASSWORD_PARAMETERS = PASSWORD_PARAMETERS;
