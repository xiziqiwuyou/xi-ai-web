import express from "express";
import {
  clearKnowledgeSessionCookie,
  knowledgeClientContext,
  knowledgeSessionToken,
  requireKnowledgeOrigin,
  setKnowledgeSessionCookie
} from "./auth/http.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  createKnowledgeRequestId,
  toKnowledgeErrorPayload
} from "./errors.mjs";
import { publicKnowledgeRuntimeStatus } from "./runtime.mjs";
import { createKnowledgeLibraryRouter } from "./library/routes.mjs";
import { createKnowledgeRetrievalRouter } from "./retrieval/routes.mjs";

export function knowledgeRequestIdMiddleware(req, res, next) {
  req.knowledgeRequestId ||= createKnowledgeRequestId();
  res.setHeader("X-Request-Id", req.knowledgeRequestId);
  res.setHeader("Cache-Control", "no-store");
  next();
}

export function registerKnowledgeRequestSecrets(req, secrets) {
  const values = Array.isArray(secrets) ? secrets : [secrets];
  req.knowledgeSecrets = [
    ...(Array.isArray(req.knowledgeSecrets) ? req.knowledgeSecrets : []),
    ...values.filter((value) => typeof value === "string" && value.length >= 4)
  ];
}

export function knowledgeErrorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  let normalizedError = error;
  if (!(error instanceof KnowledgeError) && error?.type === "entity.parse.failed") {
    normalizedError = new KnowledgeError(
      KNOWLEDGE_ERROR_CODES.INVALID_REQUEST,
      "请求 JSON 格式无效",
      { status: 400 }
    );
  } else if (!(error instanceof KnowledgeError) && error?.type === "entity.too.large") {
    normalizedError = new KnowledgeError(
      KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE,
      "请求内容超过大小限制",
      { status: 413 }
    );
  }
  const payload = toKnowledgeErrorPayload(normalizedError, {
    requestId: req.knowledgeRequestId,
    secrets: runtimeSecrets(req.knowledgeRuntime, req.knowledgeSecrets)
  });
  if (
    normalizedError instanceof KnowledgeError &&
    normalizedError.code === KNOWLEDGE_ERROR_CODES.RATE_LIMITED
  ) {
    const retryAfter = Number(normalizedError.details?.retryAfterSeconds);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      res.setHeader("Retry-After", String(Math.ceil(retryAfter)));
    }
  }
  if (payload.status >= 500 && !(normalizedError instanceof KnowledgeError)) {
    console.error(JSON.stringify(payload.log));
  }
  return res.status(payload.status).json(payload.body);
}

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function requireAuthService(runtime) {
  if (runtime?.auth) return runtime.auth;
  throw new KnowledgeError(
    KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    "知识库认证服务暂时不可用",
    { status: 503 }
  );
}

function runtimeSecrets(runtime, requestSecrets = []) {
  return [
    runtime?.config?.database?.connectionString,
    runtime?.config?.auth?.tokenSecret,
    runtime?.config?.cos?.secretId,
    runtime?.config?.cos?.secretKey,
    ...(Array.isArray(requestSecrets) ? requestSecrets : [])
  ].filter(Boolean);
}

export function createKnowledgeRouter(runtime) {
  const router = express.Router();
  router.use(knowledgeRequestIdMiddleware);
  router.use((req, res, next) => {
    req.knowledgeRuntime = runtime;
    next();
  });
  router.use(express.json({ limit: "64kb", strict: true }));

  router.get("/health", (req, res) => {
    const status = publicKnowledgeRuntimeStatus(runtime);
    res.status(status.available || status.state === "disabled" ? 200 : 503).json({
      ok: status.available,
      requestId: req.knowledgeRequestId,
      knowledge: status
    });
  });

  router.use((req, res, next) => {
    if (runtime?.available) return next();
    return next(
      new KnowledgeError(
        runtime?.state === "disabled"
          ? KNOWLEDGE_ERROR_CODES.DISABLED
          : KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
        runtime?.state === "disabled" ? "云知识库功能未启用" : "云知识库服务暂时不可用",
        { status: 503, details: { reasonCode: runtime?.reasonCode || null } }
      )
    );
  });

  router.get(
    "/public-config",
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      res.json({
        requestId: req.knowledgeRequestId,
        ...(await auth.publicConfig())
      });
    })
  );

  const sameOrigin = requireKnowledgeOrigin(runtime.config?.publicOrigin || "");

  router.post(
    "/auth/register",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      registerKnowledgeRequestSecrets(req, [
        req.body?.password,
        req.body?.inviteCode
      ]);
      const result = await auth.register(req.body, knowledgeClientContext(req));
      registerKnowledgeRequestSecrets(req, [result.token, result.csrfToken, result.recoveryCode]);
      setKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin, result.token);
      res.status(201).json({
        account: result.account,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
        recoveryCode: result.recoveryCode,
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/auth/login",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      registerKnowledgeRequestSecrets(req, req.body?.password);
      const result = await auth.login(req.body, knowledgeClientContext(req));
      registerKnowledgeRequestSecrets(req, [result.token, result.csrfToken]);
      setKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin, result.token);
      res.json({
        account: result.account,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/auth/session",
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      const token = knowledgeSessionToken(req, auth.cookieName);
      registerKnowledgeRequestSecrets(req, token);
      const result = await auth.session(token);
      if (!result.authenticated) clearKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin);
      res.json({ ...result, requestId: req.knowledgeRequestId });
    })
  );

  router.post(
    "/auth/logout",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      const token = knowledgeSessionToken(req, auth.cookieName);
      const csrfToken = String(req.headers["x-knowledge-csrf"] || "");
      registerKnowledgeRequestSecrets(req, [token, csrfToken]);
      const result = await auth.logout(token, csrfToken);
      clearKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin);
      res.json({ ...result, requestId: req.knowledgeRequestId });
    })
  );

  router.post(
    "/auth/recovery-code",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      const token = knowledgeSessionToken(req, auth.cookieName);
      const csrfToken = String(req.headers["x-knowledge-csrf"] || "");
      registerKnowledgeRequestSecrets(req, [token, csrfToken]);
      const result = await auth.regenerateRecoveryCode(token, csrfToken);
      registerKnowledgeRequestSecrets(req, result.recoveryCode);
      res.json({
        account: result.account,
        recoveryCode: result.recoveryCode,
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/auth/recover",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      registerKnowledgeRequestSecrets(req, [
        req.body?.newPassword,
        req.body?.recoveryCode
      ]);
      const result = await auth.recover(req.body, knowledgeClientContext(req));
      registerKnowledgeRequestSecrets(req, [result.token, result.csrfToken, result.recoveryCode]);
      setKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin, result.token);
      res.json({
        account: result.account,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
        recoveryCode: result.recoveryCode,
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/auth/admin-reset",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const auth = requireAuthService(runtime);
      registerKnowledgeRequestSecrets(req, [req.body?.newPassword, req.body?.resetCode]);
      const result = await auth.adminReset(req.body, knowledgeClientContext(req));
      registerKnowledgeRequestSecrets(req, [
        result.token,
        result.csrfToken,
        result.recoveryCode
      ]);
      setKnowledgeSessionCookie(res, auth, runtime.config.publicOrigin, result.token);
      res.json({
        account: result.account,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
        recoveryCode: result.recoveryCode,
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.use(createKnowledgeRetrievalRouter(runtime));
  router.use(createKnowledgeLibraryRouter(runtime));

  router.use((req, res, next) =>
    next(
      new KnowledgeError(KNOWLEDGE_ERROR_CODES.ROUTE_NOT_FOUND, "知识库接口不存在", {
        status: 404
      })
    )
  );
  router.use(knowledgeErrorMiddleware);
  return router;
}
