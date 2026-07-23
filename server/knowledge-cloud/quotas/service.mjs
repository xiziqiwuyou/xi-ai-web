import crypto from "node:crypto";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";
import { resolveKnowledgeEffectiveLimits } from "../limits.mjs";

function bytes(value, field) {
  try {
    const result = BigInt(value);
    if (result < 0n) throw new Error("negative");
    return result;
  } catch {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} 无效`, {
      status: 400,
      details: { field }
    });
  }
}

function requireActiveAccount(account) {
  if (!account) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "需要登录知识库账号", {
      status: 401
    });
  }
  if (account.status === "frozen") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_FROZEN, "知识库账号已冻结", {
      status: 423
    });
  }
  if (account.status !== "active") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "知识库账号不可用", {
      status: 401
    });
  }
}

export function createKnowledgeQuotaService({ repositories, cryptoModule = crypto }) {
  if (!repositories?.quota || !repositories?.admin) {
    throw new TypeError("Knowledge quota service requires quota and admin repositories");
  }

  async function lockContext(transaction, accountId, { requireActive = true } = {}) {
    const account = await transaction.quota.lockAccountCapacity(accountId);
    const settings = await transaction.admin.getRuntimeSettings();
    if (requireActive) requireActiveAccount(account);
    else if (!account) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, "知识库账号不存在", {
        status: 401
      });
    }
    const effectiveLimits = resolveKnowledgeEffectiveLimits(settings, account);
    effectiveLimits.quotaBytes = Number(account.quotaBytes);
    return { account, settings, effectiveLimits };
  }

  async function releaseCapacityGroups(transaction, input, groups) {
    const context = input.context || await lockContext(transaction, input.accountId, { requireActive: false });
    let releasedReserved = 0n;
    let releasedUsed = 0n;
    for (const group of groups) {
      const reserved = BigInt(group.reservedBytes || "0");
      const used = BigInt(group.usedBytes || "0");
      if (reserved < 0n || used < 0n) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量账本状态无效", {
          status: 409
        });
      }
      if (reserved === 0n && used === 0n) continue;
      await transaction.quota.insertLedgerEntry({
        id: cryptoModule.randomUUID(),
        accountId: input.accountId,
        entryType: "release",
        component: group.component,
        reservedDeltaBytes: (-reserved).toString(),
        usedDeltaBytes: (-used).toString(),
        reservationKey: input.reservationKey,
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: group.documentId || input.documentId,
        indexVersionId: group.indexVersionId || input.indexVersionId,
        metadata: input.metadata
      });
      releasedReserved += reserved;
      releasedUsed += used;
    }
    if (releasedReserved === 0n && releasedUsed === 0n) {
      return { releasedBytes: "0", releasedReservedBytes: "0", context };
    }
    const usage = await transaction.quota.adjustAccountUsage(input.accountId, {
      reservedDeltaBytes: (-releasedReserved).toString(),
      usedDeltaBytes: (-releasedUsed).toString()
    });
    if (!usage) {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量释放失败", {
        status: 409
      });
    }
    return {
      releasedBytes: releasedUsed.toString(),
      releasedReservedBytes: releasedReserved.toString(),
      context,
      usage
    };
  }

  return Object.freeze({
    lockContext,

    async reserve(transaction, input) {
      const requested = bytes(input.bytes, "bytes");
      if (requested === 0n) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "预留容量必须大于 0", {
          status: 400,
          details: { field: "bytes" }
        });
      }
      const context = input.context || await lockContext(transaction, input.accountId);
      const current = await transaction.quota.reservationState(
        input.accountId,
        input.reservationKey,
        input.component
      );
      if (current.entryCount > 0) {
        const outstanding = BigInt(current.reservedBytes);
        const settled = BigInt(current.usedBytes);
        if (outstanding === requested && settled === 0n) {
          return { ...context, reservationKey: input.reservationKey, reservedBytes: requested.toString() };
        }
        if (outstanding !== 0n || settled !== 0n) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID,
            "容量预留状态冲突",
            { status: 409 }
          );
        }
      }
      const used = BigInt(context.account.usedBytes);
      const reserved = BigInt(context.account.reservedBytes);
      const quota = BigInt(String(context.effectiveLimits.quotaBytes));
      if (used + reserved + requested > quota) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_EXCEEDED, "知识库容量不足", {
          status: 413,
          details: {
            quotaBytes: quota.toString(),
            usedBytes: used.toString(),
            reservedBytes: reserved.toString(),
            requestedBytes: requested.toString()
          }
        });
      }
      await transaction.quota.insertLedgerEntry({
        id: cryptoModule.randomUUID(),
        accountId: input.accountId,
        entryType: "reserve",
        component: input.component,
        reservedDeltaBytes: requested.toString(),
        usedDeltaBytes: "0",
        reservationKey: input.reservationKey,
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        metadata: input.metadata,
        expiresAt: input.expiresAt
      });
      const usage = await transaction.quota.adjustAccountUsage(input.accountId, {
        reservedDeltaBytes: requested.toString()
      });
      if (!usage) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量预留失败", {
          status: 409
        });
      }
      return { ...context, reservationKey: input.reservationKey, reservedBytes: requested.toString(), usage };
    },

    async settle(transaction, input) {
      const actual = bytes(input.actualBytes, "actualBytes");
      const context = input.context || await lockContext(transaction, input.accountId);
      const current = await transaction.quota.reservationState(
        input.accountId,
        input.reservationKey,
        input.component
      );
      const outstanding = BigInt(current.reservedBytes);
      if (current.entryCount === 0 || outstanding <= 0n || BigInt(current.usedBytes) !== 0n) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID,
          "容量预留已结算或不存在",
          { status: 409 }
        );
      }
      const used = BigInt(context.account.usedBytes);
      const reserved = BigInt(context.account.reservedBytes);
      const quota = BigInt(String(context.effectiveLimits.quotaBytes));
      if (used + reserved - outstanding + actual > quota) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_EXCEEDED, "实际文件大小超过剩余容量", {
          status: 413,
          details: { actualBytes: actual.toString(), quotaBytes: quota.toString() }
        });
      }
      await transaction.quota.insertLedgerEntry({
        id: cryptoModule.randomUUID(),
        accountId: input.accountId,
        entryType: "settle",
        component: input.component,
        reservedDeltaBytes: (-outstanding).toString(),
        usedDeltaBytes: actual.toString(),
        reservationKey: input.reservationKey,
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        metadata: input.metadata
      });
      const usage = await transaction.quota.adjustAccountUsage(input.accountId, {
        reservedDeltaBytes: (-outstanding).toString(),
        usedDeltaBytes: actual.toString()
      });
      if (!usage) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量结算失败", {
          status: 409
        });
      }
      return usage;
    },

    async release(transaction, input) {
      const context = input.context || await lockContext(transaction, input.accountId, { requireActive: false });
      const current = await transaction.quota.reservationState(
        input.accountId,
        input.reservationKey,
        input.component
      );
      const outstanding = BigInt(current.reservedBytes);
      if (outstanding <= 0n) return { releasedBytes: "0", context };
      await transaction.quota.insertLedgerEntry({
        id: cryptoModule.randomUUID(),
        accountId: input.accountId,
        entryType: "release",
        component: input.component,
        reservedDeltaBytes: (-outstanding).toString(),
        usedDeltaBytes: "0",
        reservationKey: input.reservationKey,
        knowledgeBaseId: input.knowledgeBaseId,
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        metadata: input.metadata
      });
      const usage = await transaction.quota.adjustAccountUsage(input.accountId, {
        reservedDeltaBytes: (-outstanding).toString()
      });
      if (!usage) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量释放失败", {
          status: 409
        });
      }
      return { releasedBytes: outstanding.toString(), context, usage };
    },

    async releaseDocumentUsage(transaction, input) {
      const groups = typeof transaction.quota.documentCapacity === "function"
        ? await transaction.quota.documentCapacity(input.accountId, input.documentId)
        : (await transaction.quota.documentUsage(input.accountId, input.documentId)).map((group) => ({
            ...group,
            reservedBytes: "0",
            documentId: input.documentId,
            indexVersionId: null
          }));
      return releaseCapacityGroups(transaction, input, groups);
    },

    async releaseIndexUsage(transaction, input) {
      const allowed = Array.isArray(input.components) ? new Set(input.components) : null;
      const groups = (await transaction.quota.indexUsage(input.accountId, input.indexVersionId))
        .filter((group) => !allowed || allowed.has(group.component))
        .map((group) => ({ ...group, indexVersionId: input.indexVersionId }));
      return releaseCapacityGroups(transaction, input, groups);
    },

    async releaseBaseUsage(transaction, input) {
      const groups = await transaction.quota.baseCapacity(input.accountId, input.knowledgeBaseId);
      return releaseCapacityGroups(transaction, input, groups);
    },

    async attributeIndexUsage(transaction, input) {
      const allowed = new Set(input.components || []);
      const groups = (await transaction.quota.indexUsage(input.accountId, input.indexVersionId))
        .filter((group) => allowed.has(group.component));
      const unattributed = groups.filter((group) => !group.documentId);
      if (!unattributed.length) return { attributedBytes: "0", releasedBytes: "0" };
      if (unattributed.some((group) => BigInt(group.reservedBytes || "0") !== 0n)) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "索引容量尚未完成结算", {
          status: 409
        });
      }

      const existing = new Map();
      for (const group of groups.filter((group) => group.documentId)) {
        existing.set(
          `${group.component}:${group.documentId}`,
          BigInt(group.usedBytes || "0")
        );
      }
      const targets = new Map();
      for (const allocation of input.allocations || []) {
        if (!allowed.has(allocation.component) || !allocation.documentId) continue;
        const amount = BigInt(allocation.usedBytes || "0");
        if (amount < 0n) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "索引容量归属无效", {
            status: 409
          });
        }
        const key = `${allocation.component}:${allocation.documentId}`;
        targets.set(key, (targets.get(key) || 0n) + amount);
      }

      const currentAttributed = [...existing.values()].reduce((sum, value) => sum + value, 0n);
      const currentUnattributed = unattributed.reduce(
        (sum, group) => sum + BigInt(group.usedBytes || "0"),
        0n
      );
      const targetTotal = [...targets.values()].reduce((sum, value) => sum + value, 0n);
      if (targetTotal > currentAttributed + currentUnattributed) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "索引容量归属超过已结算容量", {
          status: 409
        });
      }

      for (const group of unattributed) {
        const used = BigInt(group.usedBytes || "0");
        if (used <= 0n) continue;
        await transaction.quota.insertLedgerEntry({
          id: cryptoModule.randomUUID(),
          accountId: input.accountId,
          entryType: "release",
          component: group.component,
          reservedDeltaBytes: "0",
          usedDeltaBytes: (-used).toString(),
          reservationKey: input.reservationKey,
          knowledgeBaseId: input.knowledgeBaseId,
          indexVersionId: input.indexVersionId,
          metadata: input.metadata
        });
      }
      for (const [key, target] of targets) {
        const [component, documentId] = key.split(":");
        const delta = target - (existing.get(key) || 0n);
        if (delta <= 0n) continue;
        await transaction.quota.insertLedgerEntry({
          id: cryptoModule.randomUUID(),
          accountId: input.accountId,
          entryType: "reconcile",
          component,
          reservedDeltaBytes: "0",
          usedDeltaBytes: delta.toString(),
          reservationKey: input.reservationKey,
          knowledgeBaseId: input.knowledgeBaseId,
          documentId,
          indexVersionId: input.indexVersionId,
          metadata: input.metadata
        });
      }
      const usedDelta = targetTotal - currentAttributed - currentUnattributed;
      if (usedDelta !== 0n) {
        const usage = await transaction.quota.adjustAccountUsage(input.accountId, {
          usedDeltaBytes: usedDelta.toString()
        });
        if (!usage) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "索引容量归属失败", {
            status: 409
          });
        }
      }
      return {
        attributedBytes: targetTotal.toString(),
        releasedBytes: (-usedDelta).toString()
      };
    },

    async reconcileAccountCounters(transaction, accountId) {
      const context = await lockContext(transaction, accountId, { requireActive: false });
      const totals = await transaction.quota.accountLedgerTotals(accountId);
      const reservedDelta = BigInt(totals.reservedBytes) - BigInt(context.account.reservedBytes);
      const usedDelta = BigInt(totals.usedBytes) - BigInt(context.account.usedBytes);
      if (reservedDelta === 0n && usedDelta === 0n) {
        return {
          changed: false,
          usedBytes: totals.usedBytes,
          reservedBytes: totals.reservedBytes
        };
      }
      const usage = await transaction.quota.adjustAccountUsage(accountId, {
        reservedDeltaBytes: reservedDelta.toString(),
        usedDeltaBytes: usedDelta.toString()
      });
      if (!usage) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.QUOTA_RESERVATION_INVALID, "容量对账失败", {
          status: 409
        });
      }
      return { changed: true, ...usage };
    }
  });
}
