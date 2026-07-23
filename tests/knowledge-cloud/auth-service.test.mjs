import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createKnowledgeAuthService,
  normalizeKnowledgeUsername
} from "../../server/knowledge-cloud/auth/service.mjs";
import {
  hashKnowledgeSecret,
  normalizeKnowledgeAdminResetCode,
  normalizeKnowledgeInviteCode
} from "../../server/knowledge-cloud/auth/crypto.mjs";

const tokenSecret = "knowledge-test-token-secret-0123456789";

function createHarness({ registrationMode = "open", blockedBucket = "" } = {}) {
  const clock = () => new Date("2026-01-01T00:00:00.000Z");
  const state = {
    accounts: new Map(),
    sessions: new Map(),
    invites: new Map(),
    adminResets: new Map(),
    rates: new Map(),
    settings: { registrationMode, defaultQuotaBytes: 5 * 1024 * 1024 * 1024 },
    blockedBucket,
    passwordHashCalls: 0,
    passwordVerifyCalls: 0
  };

  const accountRow = (account) => ({ ...account });
  const auth = {
    async getRuntimeSettings() {
      return { ...state.settings };
    },
    async findAccountByNormalizedUsername(normalizedUsername) {
      return state.accounts.get(normalizedUsername) ? accountRow(state.accounts.get(normalizedUsername)) : null;
    },
    async insertAccount(account) {
      if (state.accounts.has(account.normalizedUsername)) throw { code: "23505" };
      const stored = {
        ...account,
        passwordResetRequired: false,
        status: "active",
        sessionGeneration: 1,
        usedBytes: 0,
        reservedBytes: 0,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
      state.accounts.set(account.normalizedUsername, stored);
      return accountRow(stored);
    },
    async findInviteByCodeHash(codeHash) {
      return state.invites.get(codeHash.toString("hex")) || null;
    },
    async consumeInvite(inviteId, accountId) {
      const invite = [...state.invites.values()].find((entry) => entry.id === inviteId);
      if (!invite || invite.status !== "active") return false;
      invite.status = "consumed";
      invite.consumedByAccountId = accountId;
      return true;
    },
    async createSession(session) {
      state.sessions.set(session.id, { ...session, revokedAt: null });
      return { ...session, id: session.id, account: accountRow([...state.accounts.values()].find((entry) => entry.id === session.accountId)) };
    },
    async findSessionByTokenHash(tokenHash) {
      const entry = [...state.sessions.values()].find((candidate) => candidate.tokenHash.equals(tokenHash) && !candidate.revokedAt);
      if (!entry) return null;
      const account = [...state.accounts.values()].find((candidate) => candidate.id === entry.accountId);
      if (!account || account.sessionGeneration !== entry.sessionGeneration) return null;
      return { ...entry, account: accountRow(account) };
    },
    async rotateSessionCsrf(sessionId, csrfTokenHash) {
      const session = state.sessions.get(sessionId);
      if (!session || session.revokedAt) return false;
      session.csrfTokenHash = csrfTokenHash;
      return true;
    },
    async revokeSession(sessionId) {
      const session = state.sessions.get(sessionId);
      if (!session) return false;
      session.revokedAt = "2026-01-01T00:00:00.000Z";
      return true;
    },
    async revokeAllSessions(accountId) {
      for (const session of state.sessions.values()) {
        if (session.accountId === accountId) session.revokedAt = "2026-01-01T00:00:00.000Z";
      }
      return 1;
    },
    async recordLoginFailure(accountId, { lockAfter, lockSeconds }) {
      const account = [...state.accounts.values()].find((entry) => entry.id === accountId);
      account.failedLoginCount += 1;
      if (account.failedLoginCount >= lockAfter) {
        account.lockedUntil = new Date(clock().getTime() + lockSeconds * 1000).toISOString();
      }
      return { failedLoginCount: account.failedLoginCount, lockedUntil: account.lockedUntil };
    },
    async markLoginSucceeded(accountId) {
      const account = [...state.accounts.values()].find((entry) => entry.id === accountId);
      account.failedLoginCount = 0;
      account.lockedUntil = null;
      account.lastLoginAt = "2026-01-01T00:00:00.000Z";
      return true;
    },
    async resetCredentials(accountId, { passwordHash, recoveryCodeHash }) {
      const account = [...state.accounts.values()].find((entry) => entry.id === accountId);
      account.passwordHash = passwordHash;
      account.recoveryCodeHash = recoveryCodeHash;
      account.passwordResetRequired = false;
      account.sessionGeneration += 1;
      account.failedLoginCount = 0;
      account.lockedUntil = null;
      return accountRow(account);
    },
    async replaceRecoveryCode(accountId, { expectedRecoveryCodeHash, recoveryCodeHash, sessionGeneration }) {
      const account = [...state.accounts.values()].find((entry) => entry.id === accountId);
      if (
        !account ||
        account.status !== "active" ||
        account.sessionGeneration !== sessionGeneration ||
        account.recoveryCodeHash !== expectedRecoveryCodeHash
      ) return null;
      account.recoveryCodeHash = recoveryCodeHash;
      return accountRow(account);
    },
    async consumeRateLimit({ bucket, subjectHash, maxAttempts }) {
      if (bucket === state.blockedBucket) return { attempts: 99, blocked: true, retryAfterSeconds: 30 };
      const key = `${bucket}:${subjectHash.toString("hex")}`;
      const attempts = (state.rates.get(key) || 0) + 1;
      state.rates.set(key, attempts);
      return { attempts, blocked: attempts > maxAttempts, retryAfterSeconds: attempts > maxAttempts ? 30 : 0 };
    },
    async clearRateLimit(bucket, subjectHash) {
      state.rates.delete(`${bucket}:${subjectHash.toString("hex")}`);
    }
  };

  const admin = {
    async findAdminResetByCodeHash(codeHash) {
      return state.adminResets.get(codeHash.toString("hex")) || null;
    },
    async consumeAdminReset(resetId) {
      const reset = [...state.adminResets.values()].find((entry) => entry.id === resetId);
      if (!reset || reset.status !== "active") return false;
      reset.status = "consumed";
      return true;
    },
    async retireActiveAdminResets(accountId) {
      for (const reset of state.adminResets.values()) {
        if (reset.accountId === accountId && reset.status === "active") reset.status = "revoked";
      }
      return 1;
    }
  };

  const repositories = {
    auth,
    async transaction(work) {
      return work({ admin, auth });
    }
  };
  const service = createKnowledgeAuthService({
    repositories,
    tokenSecret,
    clock,
    passwordHasher: async (password) => {
      state.passwordHashCalls += 1;
      return `hash:${password}`;
    },
    passwordVerifier: async (password, encoded) => {
      state.passwordVerifyCalls += 1;
      return encoded === `hash:${password}`;
    }
  });
  return { state, auth, service };
}

const context = { ipPrefix: "127.0.0.0/24", userAgent: "knowledge-test" };
const validPassword = "correct-horse-battery-staple";

test("knowledge registration returns a one-time recovery code and opaque session", async () => {
  const { state, service } = createHarness();
  const result = await service.register({ username: "Alice", password: validPassword }, context);

  assert.equal(result.account.username, "Alice");
  assert.equal(result.account.status, "active");
  assert.match(result.recoveryCode, /^XI-KB-(?:[A-F0-9]{4}-){9}[A-F0-9]{4}$/);
  assert.equal(state.accounts.size, 1);
  const stored = [...state.accounts.values()][0];
  assert.notEqual(stored.recoveryCodeHash, result.recoveryCode);
  assert.equal(state.sessions.size, 1);
  assert(!JSON.stringify([...state.sessions.values()]).includes(result.token));
  assert(!JSON.stringify([...state.sessions.values()]).includes(result.csrfToken));

  const session = await service.session(result.token);
  assert.equal(session.authenticated, true);
  assert.notEqual(session.csrfToken, result.csrfToken);
  await service.logout(result.token, session.csrfToken);
  assert.equal((await service.session(result.token)).authenticated, false);
});

test("registration normalizes names and rejects duplicates without exposing hashes", async () => {
  const { service } = createHarness();
  assert.deepEqual(normalizeKnowledgeUsername("  Alice "), {
    username: "Alice",
    normalizedUsername: "alice"
  });
  await service.register({ username: "Alice", password: validPassword }, context);
  await assert.rejects(
    service.register({ username: "alice", password: validPassword }, context),
    (error) => error.code === "KB_ACCOUNT_EXISTS" && !JSON.stringify(error).includes(validPassword)
  );
});

test("login uses a generic failure and recovery revokes prior sessions", async () => {
  const { state, service } = createHarness();
  const registered = await service.register({ username: "RecoverMe", password: validPassword }, context);
  await assert.rejects(
    service.login({ username: "RecoverMe", password: "wrong-password" }, context),
    (error) => error.code === "KB_AUTH_INVALID_CREDENTIALS"
  );
  const second = await service.login({ username: "RecoverMe", password: validPassword }, context);
  const reset = await service.recover({
    username: "recoverme",
    recoveryCode: registered.recoveryCode,
    newPassword: "new-correct-password"
  }, context);
  assert.equal(reset.account.username, "RecoverMe");
  assert.equal([...state.sessions.values()].filter((session) => !session.revokedAt).length, 1);
  assert.equal((await service.session(second.token)).authenticated, false);
  await assert.rejects(
    service.recover({
      username: "RecoverMe",
      recoveryCode: registered.recoveryCode,
      newPassword: validPassword
    }, context),
    (error) => error.code === "KB_RECOVERY_INVALID"
  );
  const loggedIn = await service.login({ username: "RecoverMe", password: "new-correct-password" }, context);
  assert.equal((await service.session(loggedIn.token)).authenticated, true);
});

test("invite-only registration consumes an invite inside the transaction", async () => {
  const { state, service } = createHarness({ registrationMode: "invite_only" });
  await assert.rejects(
    service.register({ username: "NoInvite", password: validPassword }, context),
    (error) => error.code === "KB_INVITE_REQUIRED"
  );
  const inviteCode = "TEAM-ALPHA-001";
  const hash = hashKnowledgeSecret(
    normalizeKnowledgeInviteCode(inviteCode),
    "invite",
    tokenSecret
  );
  state.invites.set(hash.toString("hex"), {
    id: "invite-1",
    status: "active",
    initialLimitOverrides: {},
    expiresAt: null,
    revokedAt: null
  });
  await service.register({ username: "Invited", password: validPassword, inviteCode }, context);
  assert.equal([...state.invites.values()][0].status, "consumed");
  await assert.rejects(
    service.register({ username: "Second", password: validPassword, inviteCode }, context),
    (error) => error.code === "KB_INVITE_INVALID"
  );
});

test("shared rate limits reject a bucket before authentication work", async () => {
  const { service } = createHarness({ blockedBucket: "login" });
  await assert.rejects(
    service.login({ username: "someone", password: validPassword }, context),
    (error) => error.code === "KB_RATE_LIMITED" && error.status === 429 && error.details.retryAfterSeconds === 30
  );
});

test("unknown accounts still execute the password hashing cost path", async () => {
  const { state, service } = createHarness();
  await assert.rejects(
    service.login({ username: "missing-account", password: validPassword }, context),
    (error) => error.code === "KB_AUTH_INVALID_CREDENTIALS"
  );
  assert.equal(state.passwordHashCalls, 1);
  assert.equal(state.passwordVerifyCalls, 0);
});

test("repeated login failures lock the account before a correct password can create a session", async () => {
  const { service } = createHarness();
  await service.register({ username: "LockedAccount", password: validPassword }, context);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      service.login({ username: "LockedAccount", password: "wrong-password" }, context),
      (error) => error.code === "KB_AUTH_INVALID_CREDENTIALS"
    );
  }
  await assert.rejects(
    service.login({ username: "LockedAccount", password: validPassword }, context),
    (error) => error.code === "KB_RATE_LIMITED" && error.status === 429
  );
});

test("login creates a fresh session and invalid CSRF cannot revoke it", async () => {
  const { service } = createHarness();
  const registered = await service.register({ username: "SessionOwner", password: validPassword }, context);
  const loggedIn = await service.login({ username: "SessionOwner", password: validPassword }, context);
  assert.notEqual(loggedIn.token, registered.token);
  assert.notEqual(loggedIn.csrfToken, registered.csrfToken);

  const current = await service.session(loggedIn.token);
  await assert.rejects(
    service.logout(loggedIn.token, "invalid-csrf-token"),
    (error) => error.code === "KB_CSRF_INVALID" && error.status === 403
  );
  const stillAuthenticated = await service.session(loggedIn.token);
  assert.equal(current.authenticated, true);
  assert.equal(stillAuthenticated.authenticated, true);
});

test("an authenticated account can rotate its recovery code without ending active sessions", async () => {
  const { service } = createHarness();
  const registered = await service.register({ username: "RotateRecovery", password: validPassword }, context);
  const session = await service.session(registered.token);
  const rotated = await service.regenerateRecoveryCode(registered.token, session.csrfToken);
  assert.notEqual(rotated.recoveryCode, registered.recoveryCode);
  assert.equal((await service.session(registered.token)).authenticated, true);
  await assert.rejects(
    service.recover({
      username: "RotateRecovery",
      recoveryCode: registered.recoveryCode,
      newPassword: "new-correct-password"
    }, context),
    (error) => error.code === "KB_RECOVERY_INVALID"
  );
});

test("concurrent recovery-code rotations allow only one replacement", async () => {
  const { service } = createHarness();
  const registered = await service.register({ username: "ConcurrentRecovery", password: validPassword }, context);
  const session = await service.session(registered.token);
  const results = await Promise.allSettled([
    service.regenerateRecoveryCode(registered.token, session.csrfToken),
    service.regenerateRecoveryCode(registered.token, session.csrfToken)
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("open registration applies one shared IP limit across different account names", async () => {
  const { service } = createHarness();
  for (let index = 0; index < 5; index += 1) {
    await service.register({ username: `member-${index}`, password: validPassword }, context);
  }
  await assert.rejects(
    service.register({ username: "member-over-limit", password: validPassword }, context),
    (error) => error.code === "KB_RATE_LIMITED" && error.status === 429
  );
});

test("Admin reset blocks old-password login and consumes one 15-minute reset code", async () => {
  const { state, service } = createHarness();
  await service.register({ username: "AdminRecovered", password: validPassword }, context);
  const account = state.accounts.get("adminrecovered");
  account.passwordResetRequired = true;
  account.recoveryCodeHash = null;
  account.sessionGeneration += 1;

  await assert.rejects(
    service.login({ username: "AdminRecovered", password: validPassword }, context),
    (error) => error.code === "KB_ADMIN_RESET_REQUIRED" && error.status === 403
  );

  const resetCode = "XI-KB-RESET-1111-2222-3333-4444-5555-6666-7777-8888-9999-AAAA";
  const resetHash = hashKnowledgeSecret(
    normalizeKnowledgeAdminResetCode(resetCode),
    "admin-reset",
    tokenSecret
  );
  state.adminResets.set(resetHash.toString("hex"), {
    id: "reset-1",
    accountId: account.id,
    status: "active",
    expiresAt: "2026-01-01T00:15:00.000Z"
  });

  const result = await service.adminReset({
    username: "AdminRecovered",
    resetCode,
    newPassword: "new-admin-reset-password"
  }, context);
  assert.equal(result.account.username, "AdminRecovered");
  assert.match(result.recoveryCode, /^XI-KB-/);
  assert.equal(account.passwordResetRequired, false);
  assert.equal([...state.adminResets.values()][0].status, "consumed");

  await assert.rejects(
    service.adminReset({
      username: "AdminRecovered",
      resetCode,
      newPassword: "another-admin-reset-password"
    }, context),
    (error) => error.code === "KB_RESET_INVALID"
  );
});
