import crypto from "node:crypto";
import {
  KNOWLEDGE_ERROR_CODES,
  knowledgeError
} from "../errors.mjs";
import {
  constantTimeEqual,
  createKnowledgeRecoveryCode,
  createOpaqueKnowledgeToken,
  hashKnowledgePassword,
  hashKnowledgeSecret,
  hashKnowledgeSecretText,
  normalizeKnowledgeAdminResetCode,
  normalizeKnowledgeInviteCode,
  normalizeKnowledgeRecoveryCode,
  verifyKnowledgePassword
} from "./crypto.mjs";

export const KNOWLEDGE_ACCOUNT_RULES = Object.freeze({
  usernameMinLength: 3,
  usernameMaxLength: 64,
  passwordMinLength: 10,
  passwordMaxLength: 128
});

const SESSION_COOKIE_NAME = "xi_kb_session";
const ACCOUNT_LOCK = Object.freeze({ lockAfter: 5, lockSeconds: 15 * 60 });
const RATE_LIMITS = Object.freeze({
  login: Object.freeze({ windowSeconds: 15 * 60, maxAttempts: 10, blockSeconds: 15 * 60 }),
  recover: Object.freeze({ windowSeconds: 60 * 60, maxAttempts: 5, blockSeconds: 60 * 60 }),
  register: Object.freeze({ windowSeconds: 60 * 60, maxAttempts: 5, blockSeconds: 60 * 60 }),
  "register-ip": Object.freeze({ windowSeconds: 60 * 60, maxAttempts: 5, blockSeconds: 60 * 60 }),
  "admin-reset": Object.freeze({ windowSeconds: 60 * 60, maxAttempts: 5, blockSeconds: 60 * 60 })
});

function nowDate(clock) {
  const value = clock();
  return value instanceof Date ? value : new Date(value);
}

function isFuture(value, now) {
  return Boolean(value && new Date(value).getTime() > now.getTime());
}

function publicAccount(account) {
  return {
    id: account.id,
    username: account.username,
    status: account.status,
    quotaBytes: account.quotaBytes,
    usedBytes: account.usedBytes,
    reservedBytes: account.reservedBytes,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt || null
  };
}

function authenticationError() {
  return knowledgeError(
    KNOWLEDGE_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
    "知识库账号或凭据不正确",
    { status: 401 }
  );
}

function validatePassword(value) {
  const password = String(value || "");
  if (
    password.length < KNOWLEDGE_ACCOUNT_RULES.passwordMinLength ||
    password.length > KNOWLEDGE_ACCOUNT_RULES.passwordMaxLength
  ) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.INVALID_REQUEST,
      `密码长度需要在 ${KNOWLEDGE_ACCOUNT_RULES.passwordMinLength}-${KNOWLEDGE_ACCOUNT_RULES.passwordMaxLength} 个字符之间`,
      { status: 400, details: { field: "password" } }
    );
  }
  return password;
}

export function normalizeKnowledgeUsername(value) {
  const username = String(value || "").normalize("NFKC").trim();
  if (
    username.length < KNOWLEDGE_ACCOUNT_RULES.usernameMinLength ||
    username.length > KNOWLEDGE_ACCOUNT_RULES.usernameMaxLength ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(username)
  ) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.INVALID_REQUEST,
      "账号名需要 3-64 个字符，只能包含文字、数字、点、下划线和连字符",
      { status: 400, details: { field: "username" } }
    );
  }
  return {
    username,
    normalizedUsername: username.toLocaleLowerCase("en-US")
  };
}

function ensureActiveAccount(account) {
  if (account.status === "frozen") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_FROZEN, "知识库账号已冻结", {
      status: 423
    });
  }
  if (account.status !== "active") throw authenticationError();
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

export function createKnowledgeAuthService({
  repositories,
  tokenSecret,
  sessionTtlSeconds = 60 * 60 * 24 * 14,
  clock = () => new Date(),
  cryptoModule = crypto,
  passwordHasher = hashKnowledgePassword,
  passwordVerifier = verifyKnowledgePassword
}) {
  if (!repositories?.auth || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge auth service requires auth repositories and transactions");
  }
  if (String(tokenSecret || "").length < 32) {
    throw new TypeError("Knowledge auth service requires a token secret of at least 32 characters");
  }

  const hashSecret = (value, purpose) =>
    hashKnowledgeSecret(value, purpose, tokenSecret, { cryptoModule });
  const hashSecretText = (value, purpose) =>
    hashKnowledgeSecretText(value, purpose, tokenSecret, { cryptoModule });

  const consumeRateLimit = async (bucket, subject) => {
    const policy = RATE_LIMITS[bucket];
    const result = await repositories.auth.consumeRateLimit({
      bucket,
      subjectHash: hashSecret(subject, "rate-limit"),
      ...policy
    });
    if (result.blocked) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "请求过于频繁，请稍后再试", {
        status: 429,
        details: { retryAfterSeconds: Math.max(1, result.retryAfterSeconds || policy.blockSeconds) }
      });
    }
  };

  const clearRateLimit = (bucket, subject) =>
    repositories.auth
      .clearRateLimit(bucket, hashSecret(subject, "rate-limit"))
      .catch(() => undefined);

  const createSession = async (authRepository, account, context) => {
    const token = createOpaqueKnowledgeToken({ cryptoModule });
    const csrfToken = createOpaqueKnowledgeToken({ cryptoModule });
    const now = nowDate(clock);
    const expiresAt = new Date(now.getTime() + sessionTtlSeconds * 1000);
    await authRepository.createSession({
      id: cryptoModule.randomUUID(),
      accountId: account.id,
      tokenHash: hashSecret(token, "session"),
      csrfTokenHash: hashSecret(csrfToken, "csrf"),
      sessionGeneration: account.sessionGeneration,
      ipPrefixHash: context.ipPrefix ? hashSecret(context.ipPrefix, "ip-prefix") : null,
      userAgent: String(context.userAgent || "").slice(0, 512),
      expiresAt
    });
    return {
      token,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      account: publicAccount(account)
    };
  };

  const authenticate = async (token) => {
    if (!token) return null;
    const session = await repositories.auth.findSessionByTokenHash(hashSecret(token, "session"));
    if (!session || !session.account || session.sessionGeneration !== session.account.sessionGeneration) {
      return null;
    }
    ensureActiveAccount(session.account);
    return session;
  };

  const verifyCsrf = (session, csrfToken) => {
    const providedHash = hashSecret(String(csrfToken || ""), "csrf");
    if (!constantTimeEqual(providedHash, session.csrfTokenHash, { cryptoModule })) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.CSRF_INVALID, "会话校验失败，请刷新后重试", {
        status: 403
      });
    }
  };

  return Object.freeze({
    cookieName: SESSION_COOKIE_NAME,
    sessionTtlSeconds,

    async publicConfig() {
      const settings = await repositories.auth.getRuntimeSettings();
      return {
        registrationMode: settings.registrationMode,
        accountRules: {
          usernameMinLength: KNOWLEDGE_ACCOUNT_RULES.usernameMinLength,
          usernameMaxLength: KNOWLEDGE_ACCOUNT_RULES.usernameMaxLength,
          passwordMinLength: KNOWLEDGE_ACCOUNT_RULES.passwordMinLength,
          passwordMaxLength: KNOWLEDGE_ACCOUNT_RULES.passwordMaxLength
        },
        recoveryCodeShownOnce: true
      };
    },

    async register(input, context = {}) {
      const identity = normalizeKnowledgeUsername(input?.username);
      const password = validatePassword(input?.password);
      const rateSubject = `${context.ipPrefix || "unknown"}\0${identity.normalizedUsername}`;
      await consumeRateLimit("register-ip", context.ipPrefix || "unknown");
      await consumeRateLimit("register", rateSubject);

      const passwordHash = await passwordHasher(password, { cryptoModule });
      const recoveryCode = createKnowledgeRecoveryCode({ cryptoModule });
      const recoveryCodeHash = hashSecretText(
        normalizeKnowledgeRecoveryCode(recoveryCode),
        "recovery"
      );
      const inviteCode = normalizeKnowledgeInviteCode(input?.inviteCode);

      try {
        const session = await repositories.transaction(async (transaction) => {
          const settings = await transaction.auth.getRuntimeSettings({ forUpdate: true });
          if (settings.registrationMode === "disabled") {
            throw knowledgeError(
              KNOWLEDGE_ERROR_CODES.REGISTRATION_DISABLED,
              "知识库账号注册当前未开放",
              { status: 403 }
            );
          }

          let invite = null;
          if (settings.registrationMode === "invite_only") {
            if (!inviteCode) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_REQUIRED, "请输入有效邀请码", {
                status: 400
              });
            }
            invite = await transaction.auth.findInviteByCodeHash(
              hashSecret(inviteCode, "invite"),
              { forUpdate: true }
            );
            if (!invite || invite.status !== "active" || invite.revokedAt ||
                (invite.expiresAt && !isFuture(invite.expiresAt, nowDate(clock)))) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_INVALID, "邀请码无效或已失效", {
                status: 400
              });
            }
          }

          const accountId = cryptoModule.randomUUID();
          const inviteQuota = Number(invite?.initialLimitOverrides?.quotaBytes);
          const account = await transaction.auth.insertAccount({
            id: accountId,
            ...identity,
            passwordHash,
            recoveryCodeHash,
            quotaBytes: Number.isSafeInteger(inviteQuota) && inviteQuota >= 0
              ? inviteQuota
              : settings.defaultQuotaBytes,
            limitOverrides: invite?.initialLimitOverrides || {}
          });
          if (invite && !(await transaction.auth.consumeInvite(invite.id, account.id))) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_INVALID, "邀请码已被使用", {
              status: 409
            });
          }
          return createSession(transaction.auth, account, context);
        });
        await clearRateLimit("register", rateSubject);
        return { ...session, recoveryCode };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_EXISTS, "账号名不可用", {
            status: 409
          });
        }
        throw error;
      }
    },

    async login(input, context = {}) {
      const identity = normalizeKnowledgeUsername(input?.username);
      const password = validatePassword(input?.password);
      const rateSubject = `${context.ipPrefix || "unknown"}\0${identity.normalizedUsername}`;
      await consumeRateLimit("login", rateSubject);

      const account = await repositories.auth.findAccountByNormalizedUsername(
        identity.normalizedUsername
      );
      const passwordMatches = account
        ? await passwordVerifier(password, account.passwordHash, { cryptoModule })
        : Boolean(await passwordHasher(password, { cryptoModule })) && false;

      if (!account || !passwordMatches) {
        if (account) await repositories.auth.recordLoginFailure(account.id, ACCOUNT_LOCK);
        throw authenticationError();
      }

      if (account.passwordResetRequired) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.ADMIN_RESET_REQUIRED,
          "该账号需要使用管理员重置码设置新密码",
          { status: 403 }
        );
      }

      const now = nowDate(clock);
      if (isFuture(account.lockedUntil, now)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "账号暂时锁定，请稍后再试", {
          status: 429,
          details: {
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((new Date(account.lockedUntil).getTime() - now.getTime()) / 1000)
            )
          }
        });
      }
      ensureActiveAccount(account);

      const session = await repositories.transaction(async (transaction) => {
        const locked = await transaction.auth.findAccountByNormalizedUsername(
          identity.normalizedUsername,
          { forUpdate: true }
        );
        if (!locked || locked.passwordHash !== account.passwordHash) throw authenticationError();
        if (locked.passwordResetRequired) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.ADMIN_RESET_REQUIRED,
            "该账号需要使用管理员重置码设置新密码",
            { status: 403 }
          );
        }
        if (isFuture(locked.lockedUntil, nowDate(clock))) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.RATE_LIMITED, "账号暂时锁定，请稍后再试", {
            status: 429,
            details: { retryAfterSeconds: ACCOUNT_LOCK.lockSeconds }
          });
        }
        ensureActiveAccount(locked);
        await transaction.auth.markLoginSucceeded(locked.id);
        return createSession(transaction.auth, locked, context);
      });
      await clearRateLimit("login", rateSubject);
      return session;
    },

    async session(token) {
      const current = await authenticate(token);
      if (!current) return { authenticated: false };
      const csrfToken = createOpaqueKnowledgeToken({ cryptoModule });
      const rotated = await repositories.auth.rotateSessionCsrf(
        current.id,
        hashSecret(csrfToken, "csrf")
      );
      if (!rotated) return { authenticated: false };
      return {
        authenticated: true,
        csrfToken,
        expiresAt: new Date(current.expiresAt).toISOString(),
        account: publicAccount(current.account)
      };
    },

    async logout(token, csrfToken) {
      const current = await authenticate(token);
      if (!current) return { ok: true };
      verifyCsrf(current, csrfToken);
      await repositories.auth.revokeSession(current.id);
      return { ok: true };
    },

    async regenerateRecoveryCode(token, csrfToken) {
      const current = await authenticate(token);
      if (!current) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
          status: 401
        });
      }
      verifyCsrf(current, csrfToken);

      const recoveryCode = createKnowledgeRecoveryCode({ cryptoModule });
      const recoveryCodeHash = hashSecretText(
        normalizeKnowledgeRecoveryCode(recoveryCode),
        "recovery"
      );
      const account = await repositories.auth.replaceRecoveryCode(current.account.id, {
        expectedRecoveryCodeHash: current.account.recoveryCodeHash,
        recoveryCodeHash,
        sessionGeneration: current.account.sessionGeneration
      });
      if (!account) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "知识库会话已失效，请重新登录", {
          status: 401
        });
      }
      return { account: publicAccount(account), recoveryCode };
    },

    async recover(input, context = {}) {
      const identity = normalizeKnowledgeUsername(input?.username);
      const password = validatePassword(input?.newPassword);
      const recoveryCode = normalizeKnowledgeRecoveryCode(input?.recoveryCode);
      const rateSubject = `${context.ipPrefix || "unknown"}\0${identity.normalizedUsername}`;
      await consumeRateLimit("recover", rateSubject);

      const account = await repositories.auth.findAccountByNormalizedUsername(
        identity.normalizedUsername
      );
      const candidateHash = hashSecretText(recoveryCode, "recovery");
      const recoveryMatches = account?.recoveryCodeHash
        ? constantTimeEqual(candidateHash, account.recoveryCodeHash, { cryptoModule })
        : constantTimeEqual(candidateHash, "0".repeat(43), { cryptoModule }) && false;
      if (!account || !recoveryCode || !recoveryMatches) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RECOVERY_INVALID, "账号或恢复码不正确", {
          status: 401
        });
      }
      ensureActiveAccount(account);

      const passwordHash = await passwordHasher(password, { cryptoModule });
      const nextRecoveryCode = createKnowledgeRecoveryCode({ cryptoModule });
      const nextRecoveryHash = hashSecretText(
        normalizeKnowledgeRecoveryCode(nextRecoveryCode),
        "recovery"
      );
      const session = await repositories.transaction(async (transaction) => {
        const locked = await transaction.auth.findAccountByNormalizedUsername(
          identity.normalizedUsername,
          { forUpdate: true }
        );
        if (
          !locked?.recoveryCodeHash ||
          !constantTimeEqual(candidateHash, locked.recoveryCodeHash, { cryptoModule })
        ) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.RECOVERY_INVALID, "账号或恢复码不正确", {
            status: 401
          });
        }
        ensureActiveAccount(locked);
        const resetAccount = await transaction.auth.resetCredentials(locked.id, {
          passwordHash,
          recoveryCodeHash: nextRecoveryHash
        });
        await transaction.auth.revokeAllSessions(locked.id);
        return createSession(transaction.auth, resetAccount, context);
      });
      await clearRateLimit("recover", rateSubject);
      return { ...session, recoveryCode: nextRecoveryCode };
    },

    async adminReset(input, context = {}) {
      const identity = normalizeKnowledgeUsername(input?.username);
      const password = validatePassword(input?.newPassword);
      const resetCode = normalizeKnowledgeAdminResetCode(input?.resetCode);
      if (!resetCode) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RESET_INVALID, "管理员重置码无效", {
          status: 401
        });
      }
      const rateSubject = `${context.ipPrefix || "unknown"}\0${identity.normalizedUsername}`;
      await consumeRateLimit("admin-reset", rateSubject);

      const account = await repositories.auth.findAccountByNormalizedUsername(
        identity.normalizedUsername
      );
      if (!account || account.status !== "active") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.RESET_INVALID, "管理员重置码无效", {
          status: 401
        });
      }

      const candidateHash = hashSecret(resetCode, "admin-reset");
      const passwordHash = await passwordHasher(password, { cryptoModule });
      const nextRecoveryCode = createKnowledgeRecoveryCode({ cryptoModule });
      const nextRecoveryHash = hashSecretText(
        normalizeKnowledgeRecoveryCode(nextRecoveryCode),
        "recovery"
      );
      const session = await repositories.transaction(async (transaction) => {
        if (!transaction.admin) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
            "管理员重置服务暂时不可用",
            { status: 503 }
          );
        }
        const locked = await transaction.auth.findAccountByNormalizedUsername(
          identity.normalizedUsername,
          { forUpdate: true }
        );
        const reset = await transaction.admin.findAdminResetByCodeHash(candidateHash, {
          forUpdate: true
        });
        const valid =
          locked &&
          reset &&
          reset.accountId === locked.id &&
          reset.status === "active" &&
          isFuture(reset.expiresAt, nowDate(clock)) &&
          locked.passwordResetRequired;
        if (!valid) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.RESET_INVALID,
            "管理员重置码无效或已过期",
            { status: 401 }
          );
        }
        ensureActiveAccount(locked);
        const resetAccount = await transaction.auth.resetCredentials(locked.id, {
          passwordHash,
          recoveryCodeHash: nextRecoveryHash
        });
        await transaction.auth.revokeAllSessions(locked.id);
        if (!(await transaction.admin.consumeAdminReset(reset.id))) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.RESET_INVALID, "管理员重置码已失效", {
            status: 401
          });
        }
        await transaction.admin.retireActiveAdminResets(locked.id);
        return createSession(transaction.auth, resetAccount, context);
      });
      await clearRateLimit("admin-reset", rateSubject);
      return { ...session, recoveryCode: nextRecoveryCode };
    },

    async requireSession(token) {
      const current = await authenticate(token);
      if (!current) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
          status: 401
        });
      }
      return current;
    },

    verifyCsrf(session, csrfToken) {
      verifyCsrf(session, csrfToken);
    }
  });
}
