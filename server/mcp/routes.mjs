import crypto from "node:crypto";
import express from "express";
import {
  MCP_ERROR_CODES,
  McpError,
  assertMcpServerCollection,
  normalizeMcpServerProfile
} from "./contract.mjs";
import { assertSafeMcpEndpoint } from "./security.mjs";
import { assertMcpExecutionUnavailable, discoverMcpTools } from "./client.mjs";

function positiveInt(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function safeError(error) {
  if (error instanceof McpError) return error;
  return new McpError(MCP_ERROR_CODES.NETWORK_ERROR, "MCP discovery failed", { status: 502, cause: error });
}

function createRateLimiter({ windowMs, maxRequests, now = () => Date.now() }) {
  const buckets = new Map();
  return (key) => {
    const timestamp = now();
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(bucketKey);
    }
    const current = buckets.get(key);
    if (!current || current.resetAt <= timestamp) {
      buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    if (current.count <= maxRequests) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))
    };
  };
}

export function createMcpAdminRouter({
  getProfiles,
  setProfiles,
  save,
  audit = () => {},
  production = process.env.NODE_ENV === "production",
  allowLocal = false,
  allowInsecureHttp = false,
  lookup,
  requestImpl,
  now = () => new Date().toISOString(),
  rateLimitWindowMs = positiveInt(process.env.MCP_DISCOVERY_RATE_LIMIT_WINDOW_MS, 60_000, 3_600_000),
  rateLimitMaxRequests = positiveInt(process.env.MCP_DISCOVERY_RATE_LIMIT_MAX, 12, 120)
} = {}) {
  if (typeof getProfiles !== "function" || typeof setProfiles !== "function" || typeof save !== "function") {
    throw new TypeError("MCP Admin router requires profile storage callbacks");
  }
  const router = express.Router();
  const takeRateLimit = createRateLimiter({ windowMs: rateLimitWindowMs, maxRequests: rateLimitMaxRequests });
  const inFlight = new Map();

  const currentProfiles = () => Array.isArray(getProfiles()) ? getProfiles() : [];

  const validateEndpoint = async (profile) => {
    const target = await assertSafeMcpEndpoint(profile.endpoint, {
      production,
      allowLocal,
      allowInsecureHttp,
      ...(lookup ? { lookup } : {})
    });
    return { ...profile, endpoint: target.url };
  };

  const commitProfiles = (profiles, action, details = {}) => {
    const next = assertMcpServerCollection(profiles);
    setProfiles(next);
    save();
    try {
      audit(action, details);
    } catch {
      // A telemetry failure must not roll back an already-validated metadata write.
    }
    return next;
  };

  router.get("/", (_req, res) => {
    res.json(currentProfiles());
  });

  router.post("/", asyncRoute(async (req, res) => {
    let profile = normalizeMcpServerProfile(req.body || {}, {
      now,
      touch: true,
      allowTimestamps: false
    });
    profile = await validateEndpoint(profile);
    const next = commitProfiles(
      [...currentProfiles(), profile],
      "mcp-profile-create",
      { id: profile.id, enabled: profile.enabled }
    );
    res.status(201).json(next.find((item) => item.id === profile.id));
  }));

  router.patch("/:id", asyncRoute(async (req, res) => {
    const profiles = currentProfiles();
    const index = profiles.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      throw new McpError(MCP_ERROR_CODES.PROFILE_NOT_FOUND, "MCP profile was not found", { status: 404 });
    }
    let profile = normalizeMcpServerProfile(req.body || {}, {
      existing: profiles[index],
      now,
      touch: true,
      allowTimestamps: false
    });
    profile = await validateEndpoint(profile);
    profiles[index] = profile;
    const next = commitProfiles(profiles, "mcp-profile-update", { id: profile.id, enabled: profile.enabled });
    res.json(next[index]);
  }));

  router.delete("/:id", (req, res) => {
    const profiles = currentProfiles();
    const index = profiles.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      throw new McpError(MCP_ERROR_CODES.PROFILE_NOT_FOUND, "MCP profile was not found", { status: 404 });
    }
    if (inFlight.has(req.params.id)) {
      throw new McpError(MCP_ERROR_CODES.DISCOVERY_IN_PROGRESS, "MCP discovery is still running", { status: 409 });
    }
    const [removed] = profiles.splice(index, 1);
    commitProfiles(profiles, "mcp-profile-delete", { id: removed.id });
    res.status(204).end();
  });

  router.post("/:id/tools/call", (_req, _res, next) => {
    try {
      assertMcpExecutionUnavailable();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/discover", asyncRoute(async (req, res) => {
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      throw new McpError(
        MCP_ERROR_CODES.PROFILE_INVALID,
        "MCP discovery accepts only the administrator profile ID",
        { status: 400 }
      );
    }
    const profile = currentProfiles().find((item) => item.id === req.params.id);
    if (!profile) {
      throw new McpError(MCP_ERROR_CODES.PROFILE_NOT_FOUND, "MCP profile was not found", { status: 404 });
    }
    if (!profile.enabled) {
      throw new McpError(MCP_ERROR_CODES.PROFILE_DISABLED, "MCP profile is disabled", { status: 409 });
    }
    const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${profile.id}`;
    const rate = takeRateLimit(key);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      throw new McpError(MCP_ERROR_CODES.RATE_LIMITED, "MCP discovery is rate limited", { status: 429 });
    }
    if (inFlight.has(profile.id)) {
      throw new McpError(MCP_ERROR_CODES.DISCOVERY_IN_PROGRESS, "MCP discovery is still running", { status: 409 });
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", abort);
    const operationId = crypto.randomUUID();
    const operation = discoverMcpTools({
      profileId: profile.id,
      endpoint: profile.endpoint,
      signal: controller.signal,
      production,
      allowLocal,
      allowInsecureHttp,
      lookup,
      requestImpl,
      now
    });
    inFlight.set(profile.id, operationId);
    try {
      const discovery = await operation;
      try {
        audit("mcp-discovery", {
          id: profile.id,
          result: "succeeded",
          toolCount: discovery.tools.length,
          durationMs: Math.min(900_000, Math.max(0, Date.now() - startedAt))
        });
      } catch {}
      if (res.destroyed || res.writableEnded) return;
      res.json({ profile, discovery });
    } catch (error) {
      const safe = safeError(error);
      try {
        audit("mcp-discovery", {
          id: profile.id,
          result: "failed",
          errorCode: safe.code,
          durationMs: Math.min(900_000, Math.max(0, Date.now() - startedAt))
        });
      } catch {}
      throw safe;
    } finally {
      if (inFlight.get(profile.id) === operationId) inFlight.delete(profile.id);
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
    }
  }));

  return router;
}
