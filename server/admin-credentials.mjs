import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ADMIN_USERNAME = "xizi2333";
const MIN_PASSWORD_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 512;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

function credentialError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizedUsername(value, fallback = "") {
  const username = String(value || fallback).trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw credentialError(
      400,
      "ADMIN_USERNAME_INVALID",
      "管理员用户名需为 3 至 64 位，仅支持字母、数字、点、下划线和连字符"
    );
  }
  return username;
}

function normalizedPassword(value, { allowEmpty = false } = {}) {
  const password = String(value || "");
  if (allowEmpty && !password) return "";
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw credentialError(
      400,
      "ADMIN_PASSWORD_INVALID",
      `管理员密码需为 ${MIN_PASSWORD_LENGTH} 至 ${MAX_PASSWORD_LENGTH} 个字符`
    );
  }
  return password;
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, SCRYPT_OPTIONS);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(String(left));
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function safeUsernameEqual(left, right) {
  const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();
  return safeEqual(digest(left), digest(right));
}

function randomRevision() {
  return crypto.randomBytes(18).toString("base64url");
}

function recordFromPassword(username, password) {
  const salt = crypto.randomBytes(18);
  return {
    version: 1,
    username,
    salt: salt.toString("base64url"),
    passwordHash: passwordHash(password, salt).toString("base64url"),
    revision: randomRevision(),
    updatedAt: new Date().toISOString()
  };
}

function parsePersistedRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) {
    throw credentialError(500, "ADMIN_CREDENTIAL_STORE_INVALID", "管理员凭据文件格式无效");
  }
  const username = normalizedUsername(value.username);
  const salt = String(value.salt || "");
  const hash = String(value.passwordHash || "");
  const revision = String(value.revision || "");
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(salt)
    || !/^[A-Za-z0-9_-]{64,256}$/.test(hash)
    || !/^[A-Za-z0-9_-]{16,128}$/.test(revision)
  ) {
    throw credentialError(500, "ADMIN_CREDENTIAL_STORE_INVALID", "管理员凭据文件格式无效");
  }
  return {
    version: 1,
    username,
    salt,
    passwordHash: hash,
    revision,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
  };
}

function writeRecordAtomically(filePath, record) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    fs.renameSync(temporaryPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Windows and some mounted filesystems do not expose POSIX modes.
    }
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function createAdminCredentialStore({
  filePath,
  username = DEFAULT_ADMIN_USERNAME,
  password = ""
} = {}) {
  if (!filePath) {
    throw credentialError(500, "ADMIN_CREDENTIAL_STORE_INVALID", "管理员凭据文件路径不能为空");
  }

  let source = "environment";
  let plaintextBootstrapPassword = String(password || "");
  let record;

  if (fs.existsSync(filePath)) {
    source = "file";
    plaintextBootstrapPassword = "";
    try {
      record = parsePersistedRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch (error) {
      if (error?.code === "ADMIN_CREDENTIAL_STORE_INVALID") throw error;
      throw credentialError(500, "ADMIN_CREDENTIAL_STORE_INVALID", "管理员凭据文件无法读取");
    }
  } else {
    const bootstrapUsername = normalizedUsername(username, DEFAULT_ADMIN_USERNAME);
    plaintextBootstrapPassword = normalizedPassword(plaintextBootstrapPassword, { allowEmpty: true });
    if (plaintextBootstrapPassword) {
      record = recordFromPassword(bootstrapUsername, plaintextBootstrapPassword);
      record.revision = crypto
        .createHmac("sha256", plaintextBootstrapPassword)
        .update(`xi-ai-web/admin-revision/v1\0${bootstrapUsername}`)
        .digest("base64url")
        .slice(0, 32);
    } else {
      record = {
        version: 1,
        username: bootstrapUsername,
        salt: "",
        passwordHash: "",
        revision: "unconfigured",
        updatedAt: ""
      };
    }
  }

  const store = {
    get configured() {
      return Boolean(record.passwordHash && record.salt);
    },
    get passwordPolicySatisfied() {
      return source === "file" || plaintextBootstrapPassword.length >= MIN_PASSWORD_LENGTH;
    },
    get username() {
      return record.username;
    },
    get revision() {
      return record.revision;
    },
    get source() {
      return source;
    },
    sessionSecret() {
      if (!store.configured) return Buffer.alloc(0);
      if (plaintextBootstrapPassword) {
        return crypto
          .createHmac("sha256", plaintextBootstrapPassword)
          .update("xi-ai-web/admin-session/v2")
          .digest();
      }
      return crypto
        .createHmac("sha256", Buffer.from(record.passwordHash, "base64url"))
        .update(`xi-ai-web/admin-session/v2\0${record.salt}`)
        .digest();
    },
    verify(inputUsername, inputPassword) {
      const rawPassword = String(inputPassword || "");
      const passwordWithinBounds = rawPassword.length > 0 && rawPassword.length <= MAX_PASSWORD_LENGTH;
      const candidatePassword = rawPassword.slice(0, MAX_PASSWORD_LENGTH);
      if (!store.configured) return false;
      const derived = passwordHash(candidatePassword, Buffer.from(record.salt, "base64url"));
      const expected = Buffer.from(record.passwordHash, "base64url");
      const usernameMatches = safeUsernameEqual(String(inputUsername || "").trim(), record.username);
      const passwordMatches = safeEqual(derived, expected);
      return passwordWithinBounds && usernameMatches && passwordMatches;
    },
    rotate({ currentPassword, username: nextUsername, password: nextPassword = "" } = {}) {
      const current = String(currentPassword || "");
      if (!store.verify(record.username, current)) {
        throw credentialError(401, "ADMIN_CREDENTIALS_INVALID", "当前管理员凭据不正确");
      }
      const usernameValue = normalizedUsername(nextUsername);
      const passwordValue = normalizedPassword(nextPassword, { allowEmpty: true }) || current;
      const nextRecord = recordFromPassword(usernameValue, passwordValue);
      writeRecordAtomically(filePath, nextRecord);
      record = nextRecord;
      source = "file";
      plaintextBootstrapPassword = "";
      return {
        username: record.username,
        revision: record.revision,
        updatedAt: record.updatedAt
      };
    }
  };

  return store;
}
