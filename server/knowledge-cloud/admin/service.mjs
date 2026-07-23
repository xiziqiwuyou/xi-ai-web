import crypto from "node:crypto";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  knowledgeError,
  redactKnowledgeValue
} from "../errors.mjs";
import {
  createKnowledgeAdminResetCode,
  hashKnowledgeSecret,
  normalizeKnowledgeAdminResetCode,
  normalizeKnowledgeInviteCode
} from "../auth/crypto.mjs";
import {
  KNOWLEDGE_ACCOUNT_OVERRIDE_BOUNDS,
  KNOWLEDGE_RUNTIME_LIMIT_BOUNDS,
  canonicalKnowledgeLimitOverrides,
  resolveKnowledgeEffectiveLimits
} from "../limits.mjs";

const MAX_REASON_LENGTH = 1000;
const RESET_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { KNOWLEDGE_RUNTIME_LIMIT_BOUNDS } from "../limits.mjs";

const REGISTRATION_MODES = new Set(["disabled", "invite_only", "open"]);
const ACCOUNT_STATUSES = new Set(["active", "frozen", "deleting"]);
const MUTABLE_ACCOUNT_STATUSES = new Set(["active", "frozen"]);
const INVITE_STATUSES = new Set(["active", "consumed", "revoked", "expired"]);
const JOB_STATUSES = new Set(["queued", "running", "retry", "succeeded", "failed", "cancelled"]);
const JOB_KINDS = new Set(["parse", "cleanup", "reconcile", "reindex"]);
const AUDIT_RESULTS = new Set(["succeeded", "failed"]);

function assertObject(value, field = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 必须是对象`, {
      status: 400,
      details: { field }
    });
  }
  return value;
}

function rejectUnknownKeys(value, allowed, field = "payload") {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 包含不支持的字段`, {
      status: 400,
      details: { field, unknown }
    });
  }
}

function validateReason(value) {
  const reason = String(value || "").normalize("NFKC").trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.ADMIN_REASON_REQUIRED,
      `请填写 1-${MAX_REASON_LENGTH} 个字符的操作原因`,
      { status: 400, details: { field: "reason" } }
    );
  }
  return reason;
}

function validateExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "expectedVersion 无效", {
      status: 400,
      details: { field: "expectedVersion" }
    });
  }
  return version;
}

function validateInteger(value, field, bounds) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < bounds.min || number > bounds.max) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 超出允许范围`, {
      status: 400,
      details: { field, min: bounds.min, max: bounds.max }
    });
  }
  return number;
}

function validateUuid(value, field) {
  const id = String(value || "").trim();
  if (!UUID_PATTERN.test(id)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 无效`, {
      status: 400,
      details: { field }
    });
  }
  return id;
}

function validateLimitObject(value, definitions, { sparse = false, allowNull = false } = {}) {
  const input = assertObject(value, "limits");
  rejectUnknownKeys(input, new Set(Object.keys(definitions)), "limits");
  const normalized = {};
  for (const [key, bounds] of Object.entries(definitions)) {
    if (!(key in input)) {
      if (sparse) continue;
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `缺少 ${key}`, {
        status: 400,
        details: { field: `limits.${key}` }
      });
    }
    if (input[key] === null && allowNull) {
      normalized[key] = null;
      continue;
    }
    normalized[key] = validateInteger(input[key], `limits.${key}`, bounds);
  }
  return normalized;
}

function publicSettings(settings) {
  return {
    version: settings.version,
    registrationMode: settings.registrationMode,
    limits: Object.fromEntries(
      Object.keys(KNOWLEDGE_RUNTIME_LIMIT_BOUNDS).map((key) => [key, settings[key]])
    ),
    updatedBy: settings.updatedBy,
    updatedAt: settings.updatedAt
  };
}

function projectAccount(account, settings) {
  const overrides = canonicalKnowledgeLimitOverrides(account.limitOverrides);
  const effectiveLimits = resolveKnowledgeEffectiveLimits(settings, account);
  const usage = BigInt(account.usedBytes || "0") + BigInt(account.reservedBytes || "0");
  const overLimit = [];
  if (usage > BigInt(String(effectiveLimits.quotaBytes))) overLimit.push("quotaBytes");
  if (account.knowledgeBaseCount > effectiveLimits.maxKnowledgeBasesPerAccount) {
    overLimit.push("maxKnowledgeBasesPerAccount");
  }
  if (account.documentCount > effectiveLimits.maxDocumentsPerAccount) {
    overLimit.push("maxDocumentsPerAccount");
  }
  if (account.chunkCount > effectiveLimits.maxChunksPerAccount) {
    overLimit.push("maxChunksPerAccount");
  }
  return {
    id: account.id,
    username: account.username,
    status: account.status,
    version: account.version,
    quotaBytes: account.quotaBytes,
    usedBytes: account.usedBytes,
    reservedBytes: account.reservedBytes,
    activeSessionCount: account.activeSessionCount,
    knowledgeBaseCount: account.knowledgeBaseCount,
    documentCount: account.documentCount,
    chunkCount: account.chunkCount,
    failedLoginCount: account.failedLoginCount,
    lockedUntil: account.lockedUntil,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    limitOverrides: overrides,
    effectiveLimits,
    overLimit
  };
}

function normalizeListLimit(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PAGE_LIMIT;
  return validateInteger(value, "limit", { min: 1, max: MAX_PAGE_LIMIT });
}

function encodeCursor(record) {
  return Buffer.from(
    JSON.stringify({ createdAt: record.createdAt, id: record.id }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(value, { numericId = false } = {}) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const createdAt = new Date(decoded.createdAt);
    const id = String(decoded.id || "");
    const validId = numericId ? /^\d+$/.test(id) : UUID_PATTERN.test(id);
    if (Number.isNaN(createdAt.getTime()) || !validId) throw new Error("invalid cursor");
    return { createdAt: createdAt.toISOString(), id };
  } catch {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "cursor 无效", {
      status: 400,
      details: { field: "cursor" }
    });
  }
}

function paginated(records, limit) {
  const items = records.slice(0, limit);
  return {
    items,
    nextCursor: records.length > limit && items.length ? encodeCursor(items.at(-1)) : null
  };
}

function projectJob(job, clock = () => new Date()) {
  const leaseExpiresAt = job.leaseExpiresAt ? new Date(job.leaseExpiresAt) : null;
  return {
    id: job.id,
    accountId: job.accountId,
    knowledgeBaseId: job.knowledgeBaseId,
    documentId: job.documentId,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    errorCode: job.errorCode,
    leaseActive: Boolean(
      job.status === "running" && leaseExpiresAt && leaseExpiresAt > clock()
    ),
    runAfter: job.runAfter,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function actorContext(context = {}) {
  return {
    actor: String(context.actor || "admin").slice(0, 128),
    requestId: String(context.requestId || crypto.randomUUID()).slice(0, 128)
  };
}

function failureMetadata(error) {
  return {
    errorCode: error instanceof KnowledgeError ? error.code : KNOWLEDGE_ERROR_CODES.INTERNAL
  };
}

export function createKnowledgeAdminService({
  repositories,
  tokenSecret,
  clock = () => new Date(),
  cryptoModule = crypto,
  objectStoreConfigured = false
}) {
  if (!repositories?.admin || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge Admin service requires Admin repositories and transactions");
  }
  if (String(tokenSecret || "").length < 32) {
    throw new TypeError("Knowledge Admin service requires a token secret of at least 32 characters");
  }

  const auditFailure = async ({ operation, targetType, targetId, reason, context }, error) => {
    const { actor, requestId } = actorContext(context);
    try {
      await repositories.transaction((transaction) =>
        transaction.admin.insertAudit({
          requestId,
          adminActor: actor,
          operation,
          targetType,
          targetId,
          reason,
          result: "failed",
          metadata: failureMetadata(error)
        })
      );
    } catch {
      // Preserve the original typed failure if PostgreSQL itself is unavailable.
    }
  };

  const auditedMutation = async (audit, work) => {
    const reason = validateReason(audit.reason);
    const { actor, requestId } = actorContext(audit.context);
    try {
      return await repositories.transaction(async (transaction) => {
        const result = await work(transaction, { actor, requestId, reason });
        const targetId = typeof audit.targetId === "function" ? audit.targetId(result) : audit.targetId;
        const metadata = typeof audit.metadata === "function" ? audit.metadata(result) : audit.metadata;
        await transaction.admin.insertAudit({
          requestId,
          adminActor: actor,
          operation: audit.operation,
          targetType: audit.targetType,
          targetId: targetId || null,
          reason,
          result: "succeeded",
          metadata: redactKnowledgeValue(metadata || {})
        });
        return result;
      });
    } catch (error) {
      await auditFailure(
        {
          operation: audit.operation,
          targetType: audit.targetType,
          targetId: typeof audit.targetId === "string" ? audit.targetId : null,
          reason,
          context: audit.context
        },
        error
      );
      throw error;
    }
  };

  const requireAccount = async (transaction, accountId) => {
    const account = await transaction.admin.findAccountById(accountId, { forUpdate: true });
    if (!account) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_NOT_FOUND, "知识库账号不存在", {
        status: 404
      });
    }
    return account;
  };

  return Object.freeze({
    async settings() {
      const settings = await repositories.admin.getRuntimeSettings();
      return publicSettings(settings);
    },

    async updateSettings(input, context) {
      const payload = assertObject(input);
      rejectUnknownKeys(
        payload,
        new Set(["expectedVersion", "registrationMode", "limits", "reason"])
      );
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const registrationMode = String(payload.registrationMode || "");
      if (!REGISTRATION_MODES.has(registrationMode)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "registrationMode 无效", {
          status: 400,
          details: { field: "registrationMode" }
        });
      }
      const limits = validateLimitObject(payload.limits, KNOWLEDGE_RUNTIME_LIMIT_BOUNDS);
      return auditedMutation(
        {
          operation: "settings.update",
          targetType: "settings",
          targetId: "global",
          reason: payload.reason,
          context,
          metadata: (result) => ({ version: result.version, registrationMode: result.registrationMode })
        },
        async (transaction, { actor }) => {
          const current = await transaction.admin.getRuntimeSettings({ forUpdate: true });
          if (!current || current.version !== expectedVersion) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "运行配置已更新，请刷新后重试", {
              status: 409
            });
          }
          const next = await transaction.admin.updateRuntimeSettings(
            { registrationMode, ...limits },
            expectedVersion,
            actor
          );
          if (!next) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "运行配置已更新，请刷新后重试", {
              status: 409
            });
          }
          if (next.defaultQuotaBytes !== current.defaultQuotaBytes) {
            await transaction.admin.applyInheritedQuota(next.defaultQuotaBytes);
          }
          return publicSettings(next);
        }
      );
    },

    async overview() {
      const [overview, settings] = await Promise.all([
        repositories.admin.getOverview(),
        repositories.admin.getRuntimeSettings()
      ]);
      return {
        ...overview,
        registrationMode: settings.registrationMode,
        objectStore: { state: objectStoreConfigured ? "configured" : "not_checked" }
      };
    },

    async listAccounts(query = {}) {
      const limit = normalizeListLimit(query.limit);
      const status = query.status ? String(query.status) : "";
      if (status && !ACCOUNT_STATUSES.has(status)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "账号状态筛选无效", {
          status: 400
        });
      }
      const search = String(query.search || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
      if (search.length > 64 || /[\u0000-\u001f\u007f]/.test(search)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "账号搜索内容无效", {
          status: 400
        });
      }
      const [settings, rows] = await Promise.all([
        repositories.admin.getRuntimeSettings(),
        repositories.admin.listAccounts({
          limit,
          status: status || null,
          search: search || null,
          cursor: decodeCursor(query.cursor)
        })
      ]);
      const page = paginated(rows, limit);
      return { ...page, items: page.items.map((account) => projectAccount(account, settings)) };
    },

    async updateAccount(accountIdValue, input, context) {
      const accountId = validateUuid(accountIdValue, "accountId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedVersion", "status", "limitOverrides", "reason"]));
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      const hasStatus = Object.hasOwn(payload, "status");
      const hasOverrides = Object.hasOwn(payload, "limitOverrides");
      if (!hasStatus && !hasOverrides) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "没有可更新的账号字段", {
          status: 400
        });
      }
      const status = hasStatus ? String(payload.status) : null;
      if (status && !MUTABLE_ACCOUNT_STATUSES.has(status)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "账号状态无效", {
          status: 400
        });
      }
      const overridePatch = hasOverrides
        ? validateLimitObject(payload.limitOverrides, KNOWLEDGE_ACCOUNT_OVERRIDE_BOUNDS, {
            sparse: true,
            allowNull: true
          })
        : null;
      return auditedMutation(
        {
          operation: "account.update",
          targetType: "account",
          targetId: accountId,
          reason: payload.reason,
          context,
          metadata: (result) => ({ status: result.status, overrideKeys: Object.keys(result.limitOverrides) })
        },
        async (transaction) => {
          const settings = await transaction.admin.getRuntimeSettings({ forUpdate: true });
          const current = await requireAccount(transaction, accountId);
          if (current.version !== expectedVersion) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "账号已更新，请刷新后重试", {
              status: 409
            });
          }
          if (status && status !== current.status) {
            await transaction.admin.setAccountStatus(accountId, status);
            if (status === "frozen") {
              await transaction.admin.revokeAllSessions(accountId);
              await transaction.admin.retireActiveAdminResets(accountId);
            }
          }
          if (overridePatch) {
            const overrides = canonicalKnowledgeLimitOverrides(current.limitOverrides);
            for (const [key, value] of Object.entries(overridePatch)) {
              if (value === null) delete overrides[key];
              else overrides[key] = value;
            }
            const quotaBytes = overrides.quotaBytes ?? settings.defaultQuotaBytes;
            await transaction.admin.setAccountLimitOverrides(accountId, overrides, quotaBytes);
          }
          const updated = await transaction.admin.findAccountById(accountId);
          return projectAccount(updated, settings);
        }
      );
    },

    async revokeSessions(accountIdValue, input, context) {
      const accountId = validateUuid(accountIdValue, "accountId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["reason"]));
      return auditedMutation(
        {
          operation: "account.sessions.revoke",
          targetType: "account",
          targetId: accountId,
          reason: payload.reason,
          context,
          metadata: (result) => ({ revokedSessions: result.revokedSessions })
        },
        async (transaction) => {
          await requireAccount(transaction, accountId);
          await transaction.admin.advanceSessionGeneration(accountId);
          const revokedSessions = await transaction.admin.revokeAllSessions(accountId);
          return { accountId, revokedSessions };
        }
      );
    },

    async issueReset(accountIdValue, input, context) {
      const accountId = validateUuid(accountIdValue, "accountId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["reason"]));
      const resetCode = createKnowledgeAdminResetCode({ cryptoModule });
      const normalizedCode = normalizeKnowledgeAdminResetCode(resetCode);
      const expiresAt = new Date(new Date(clock()).getTime() + RESET_TTL_MS);
      return auditedMutation(
        {
          operation: "account.reset.issue",
          targetType: "account",
          targetId: accountId,
          reason: payload.reason,
          context,
          metadata: (result) => ({ resetId: result.resetId, expiresAt: result.expiresAt })
        },
        async (transaction, { actor, reason }) => {
          const account = await requireAccount(transaction, accountId);
          if (account.status !== "active") {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_FROZEN, "请先解冻账号再签发重置码", {
              status: 423
            });
          }
          await transaction.admin.retireActiveAdminResets(accountId);
          const reset = await transaction.admin.insertAdminReset({
            id: cryptoModule.randomUUID(),
            accountId,
            codeHash: hashKnowledgeSecret(normalizedCode, "admin-reset", tokenSecret, {
              cryptoModule
            }),
            reason,
            createdBy: actor,
            expiresAt
          });
          await transaction.admin.markAccountResetRequired(accountId);
          const revokedSessions = await transaction.admin.revokeAllSessions(accountId);
          return {
            accountId,
            resetId: reset.id,
            resetCode,
            expiresAt: expiresAt.toISOString(),
            revokedSessions
          };
        }
      );
    },

    async listInvites(query = {}) {
      const limit = normalizeListLimit(query.limit);
      const status = query.status ? String(query.status) : "";
      if (status && !INVITE_STATUSES.has(status)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "邀请码状态筛选无效", {
          status: 400
        });
      }
      const rows = await repositories.admin.listInvites({
        limit,
        status: status || null,
        cursor: decodeCursor(query.cursor)
      });
      return paginated(rows, limit);
    },

    async createInvite(input, context) {
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expiresInHours", "initialLimitOverrides", "reason"]));
      const expiresInHours = payload.expiresInHours === undefined
        ? 168
        : validateInteger(payload.expiresInHours, "expiresInHours", { min: 1, max: 8760 });
      const initialLimitOverrides = payload.initialLimitOverrides
        ? validateLimitObject(payload.initialLimitOverrides, KNOWLEDGE_ACCOUNT_OVERRIDE_BOUNDS, {
            sparse: true
          })
        : {};
      const raw = cryptoModule.randomBytes(18).toString("hex").toUpperCase();
      const inviteCode = `XI-KB-INV-${raw.match(/.{1,4}/g).join("-")}`;
      return auditedMutation(
        {
          operation: "invite.create",
          targetType: "invite",
          targetId: (result) => result.invite.id,
          reason: payload.reason,
          context,
          metadata: (result) => ({ expiresAt: result.invite.expiresAt })
        },
        async (transaction, { actor }) => {
          const expiresAt = new Date(new Date(clock()).getTime() + expiresInHours * 60 * 60 * 1000);
          const invite = await transaction.admin.insertInvite({
            id: cryptoModule.randomUUID(),
            codeHash: hashKnowledgeSecret(
              normalizeKnowledgeInviteCode(inviteCode),
              "invite",
              tokenSecret,
              { cryptoModule }
            ),
            initialLimitOverrides,
            expiresAt,
            createdBy: actor
          });
          return { invite, inviteCode };
        }
      );
    },

    async revokeInvite(inviteIdValue, input, context) {
      const inviteId = validateUuid(inviteIdValue, "inviteId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["reason"]));
      return auditedMutation(
        {
          operation: "invite.revoke",
          targetType: "invite",
          targetId: inviteId,
          reason: payload.reason,
          context,
          metadata: { status: "revoked" }
        },
        async (transaction) => {
          const invite = await transaction.admin.findInviteById(inviteId, { forUpdate: true });
          if (!invite) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_NOT_FOUND, "邀请码不存在", {
              status: 404
            });
          }
          if (invite.status !== "active") {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_INVALID, "邀请码已失效，无法撤销", {
              status: 409
            });
          }
          const revoked = await transaction.admin.revokeInvite(inviteId);
          if (!revoked) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVITE_INVALID, "邀请码已失效，无法撤销", {
              status: 409
            });
          }
          return revoked;
        }
      );
    },

    async listJobs(query = {}) {
      const limit = normalizeListLimit(query.limit);
      const status = query.status ? String(query.status) : "";
      const kind = query.kind ? String(query.kind) : "";
      if (status && !JOB_STATUSES.has(status)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "任务状态筛选无效", {
          status: 400
        });
      }
      if (kind && !JOB_KINDS.has(kind)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "任务类型筛选无效", {
          status: 400
        });
      }
      const rows = await repositories.admin.listJobs({
        limit,
        status: status || null,
        kind: kind || null,
        cursor: decodeCursor(query.cursor)
      });
      return paginated(rows, limit);
    },

    async retryJob(jobId, input, context) {
      const id = validateUuid(jobId, "jobId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["reason"]));
      return auditedMutation(
        {
          operation: "job.retry",
          targetType: "job",
          targetId: id,
          reason: payload.reason,
          context,
          metadata: (result) => ({ kind: result.kind, status: result.status })
        },
        async (transaction) => {
          if (!transaction.jobs) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "任务控制暂时不可用", {
              status: 503
            });
          }
          const current = await transaction.jobs.findJob(id, { forUpdate: true });
          if (!current) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_NOT_FOUND, "任务不存在", {
              status: 404
            });
          }
          if (!["failed", "cancelled"].includes(current.status)) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "当前任务状态不能重试", {
              status: 409,
              details: { status: current.status }
            });
          }
          if (current.kind === "parse" && current.documentId) {
            const reset = await transaction.jobs.resetParseDocumentForRetry(
              current.accountId,
              current.documentId
            );
            if (!reset) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "解析文档当前无法重试", {
                status: 409
              });
            }
          }
          const retried = await transaction.jobs.retryJob(id);
          if (!retried) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "任务状态已变化，请刷新后重试", {
              status: 409
            });
          }
          return projectJob(retried, clock);
        }
      );
    },

    async cancelJob(jobId, input, context) {
      const id = validateUuid(jobId, "jobId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["reason"]));
      return auditedMutation(
        {
          operation: "job.cancel",
          targetType: "job",
          targetId: id,
          reason: payload.reason,
          context,
          metadata: (result) => ({ kind: result.kind, status: result.status })
        },
        async (transaction) => {
          if (!transaction.jobs) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "任务控制暂时不可用", {
              status: 503
            });
          }
          const current = await transaction.jobs.findJob(id, { forUpdate: true });
          if (!current) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_NOT_FOUND, "任务不存在", {
              status: 404
            });
          }
          if (!["queued", "running", "retry"].includes(current.status)) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "当前任务状态不能取消", {
              status: 409,
              details: { status: current.status }
            });
          }
          const cancelled = await transaction.jobs.cancelJob(id);
          if (!cancelled) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "任务状态已变化，请刷新后重试", {
              status: 409
            });
          }
          if (current.kind === "parse" && current.documentId) {
            await transaction.jobs.markParseDocumentCancelled(
              current.accountId,
              current.documentId
            );
          }
          return projectJob(cancelled, clock);
        }
      );
    },

    async listAudit(query = {}) {
      const limit = normalizeListLimit(query.limit);
      const result = query.result ? String(query.result) : "";
      if (result && !AUDIT_RESULTS.has(result)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "审计结果筛选无效", {
          status: 400
        });
      }
      const operation = String(query.operation || "").trim().slice(0, 128);
      const targetType = String(query.targetType || "").trim().slice(0, 64);
      const rows = await repositories.admin.listAudit({
        limit,
        operation: operation || null,
        targetType: targetType || null,
        result: result || null,
        cursor: decodeCursor(query.cursor, { numericId: true })
      });
      const page = paginated(rows, limit);
      return {
        ...page,
        items: page.items.map((entry) => ({
          ...entry,
          metadata: redactKnowledgeValue(entry.metadata)
        }))
      };
    }
  });
}
