import express from "express";
import { requireKnowledgeOrigin } from "../auth/http.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError
} from "../errors.mjs";
import {
  knowledgeErrorMiddleware,
  knowledgeRequestIdMiddleware,
  registerKnowledgeRequestSecrets
} from "../routes.mjs";

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const SAFE_ADMIN_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requireAdminService(runtime) {
  if (runtime?.admin) return runtime.admin;
  throw new KnowledgeError(
    runtime?.state === "disabled"
      ? KNOWLEDGE_ERROR_CODES.DISABLED
      : KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    runtime?.state === "disabled"
      ? "Cloud knowledge is disabled"
      : "Knowledge admin service is unavailable",
    { status: 503, details: { reasonCode: runtime?.reasonCode || null } }
  );
}

function requireOperationsService(runtime) {
  if (runtime?.operations) return runtime.operations;
  throw new KnowledgeError(
    runtime?.state === "disabled"
      ? KNOWLEDGE_ERROR_CODES.DISABLED
      : KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
    runtime?.state === "disabled"
      ? "Cloud knowledge is disabled"
      : "Knowledge operations service is unavailable",
    { status: 503, details: { reasonCode: runtime?.reasonCode || null } }
  );
}

function mutationOrigin(runtime) {
  const validate = requireKnowledgeOrigin(runtime?.config?.publicOrigin || "");
  return (req, res, next) => {
    if (!runtime?.available) return next();
    return validate(req, res, next);
  };
}

export function createKnowledgeAdminRouter(
  runtime,
  {
    authorize = (_req, _res, next) => next(),
    actorFromRequest = () => "admin"
  } = {}
) {
  const router = express.Router();
  router.use(knowledgeRequestIdMiddleware);
  router.use((req, _res, next) => {
    req.knowledgeRuntime = runtime;
    next();
  });
  router.use(authorize);
  const sameOrigin = mutationOrigin(runtime);
  router.use((req, res, next) =>
    SAFE_ADMIN_METHODS.has(req.method) ? next() : sameOrigin(req, res, next)
  );
  router.use(express.json({ limit: "64kb", strict: true }));

  const context = (req) => ({
    actor: actorFromRequest(req),
    requestId: req.knowledgeRequestId
  });

  router.get(
    "/settings",
    asyncRoute(async (req, res) => {
      res.json({ ...(await requireAdminService(runtime).settings()), requestId: req.knowledgeRequestId });
    })
  );

  router.put(
    "/settings",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).updateSettings(req.body, context(req))),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/overview",
    asyncRoute(async (req, res) => {
      res.json({ ...(await requireAdminService(runtime).overview()), requestId: req.knowledgeRequestId });
    })
  );

  router.get(
    "/readiness",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireOperationsService(runtime).readiness()),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/accounts",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).listAccounts(req.query)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.patch(
    "/accounts/:accountId",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).updateAccount(
          req.params.accountId,
          req.body,
          context(req)
        )),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/accounts/:accountId/revoke-sessions",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).revokeSessions(
          req.params.accountId,
          req.body,
          context(req)
        )),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/accounts/:accountId/reset",
    asyncRoute(async (req, res) => {
      const result = await requireAdminService(runtime).issueReset(
        req.params.accountId,
        req.body,
        context(req)
      );
      registerKnowledgeRequestSecrets(req, result.resetCode);
      res.json({ ...result, requestId: req.knowledgeRequestId });
    })
  );

  router.delete(
    "/accounts/:accountId",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireOperationsService(runtime).deleteAccount(
          req.params.accountId,
          req.body,
          context(req)
        )),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/invites",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).listInvites(req.query)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/invites",
    asyncRoute(async (req, res) => {
      const result = await requireAdminService(runtime).createInvite(req.body, context(req));
      registerKnowledgeRequestSecrets(req, result.inviteCode);
      res.status(201).json({ ...result, requestId: req.knowledgeRequestId });
    })
  );

  router.delete(
    "/invites/:inviteId",
    asyncRoute(async (req, res) => {
      res.json({
        invite: await requireAdminService(runtime).revokeInvite(
          req.params.inviteId,
          req.body,
          context(req)
        ),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/jobs",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).listJobs(req.query)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/maintenance/reconcile",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireOperationsService(runtime).scheduleReconciliation(req.body, context(req))),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/maintenance/cleanup-stale",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireOperationsService(runtime).runMaintenance(req.body, context(req))),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/jobs/:jobId/retry",
    asyncRoute(async (req, res) => {
      res.json({
        job: await requireAdminService(runtime).retryJob(
          req.params.jobId,
          req.body,
          context(req)
        ),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/jobs/:jobId/cancel",
    asyncRoute(async (req, res) => {
      res.json({
        job: await requireAdminService(runtime).cancelJob(
          req.params.jobId,
          req.body,
          context(req)
        ),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/audit",
    asyncRoute(async (req, res) => {
      res.json({
        ...(await requireAdminService(runtime).listAudit(req.query)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.use((req, _res, next) =>
    next(
      new KnowledgeError(KNOWLEDGE_ERROR_CODES.ROUTE_NOT_FOUND, "Knowledge admin route was not found", {
        status: 404
      })
    )
  );
  router.use(knowledgeErrorMiddleware);
  return router;
}
