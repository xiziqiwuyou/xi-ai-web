import express from "express";
import {
  knowledgeSessionToken,
  requireKnowledgeOrigin
} from "../auth/http.mjs";
import { KNOWLEDGE_ERROR_CODES, KnowledgeError } from "../errors.mjs";

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function registerKnowledgeRequestSecrets(req, values) {
  const secrets = Array.isArray(values) ? values : [values];
  req.knowledgeSecrets = [
    ...(Array.isArray(req.knowledgeSecrets) ? req.knowledgeSecrets : []),
    ...secrets.filter((value) => typeof value === "string" && value.length >= 4)
  ];
}

function connectionSecrets(value, result = [], depth = 0) {
  if (depth > 4 || !value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) connectionSecrets(entry, result, depth + 1);
    return result;
  }
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    if ((key === "apiKey" || key === "baseUrl") && typeof entry === "string") {
      result.push(entry);
    } else if (entry && typeof entry === "object") {
      connectionSecrets(entry, result, depth + 1);
    }
  }
  return result;
}

function requestDisconnectController(req, res) {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new Error("Knowledge retrieval request cancelled"));
  };
  const cleanup = () => {
    req.removeListener("aborted", abort);
    res.removeListener("close", onClose);
    res.removeListener("finish", cleanup);
  };
  const onClose = () => {
    if (!res.writableEnded) abort();
    cleanup();
  };
  req.once("aborted", abort);
  res.once("close", onClose);
  res.once("finish", cleanup);
  return { controller, cleanup };
}

function requireServices(runtime, { citations = false } = {}) {
  if (!runtime?.auth) {
    throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "知识库认证服务暂时不可用", {
      status: 503
    });
  }
  const service = citations ? runtime.citations : runtime.retrieval;
  if (!service) {
    throw new KnowledgeError(
      KNOWLEDGE_ERROR_CODES.UNAVAILABLE,
      citations ? "知识库来源服务暂时不可用" : "知识库检索服务暂时不可用",
      { status: 503 }
    );
  }
  return { auth: runtime.auth, service };
}

async function authenticatedRequest(req, runtime, { csrf = false, citations = false } = {}) {
  const { auth, service } = requireServices(runtime, { citations });
  const token = knowledgeSessionToken(req, auth.cookieName);
  const csrfToken = csrf ? String(req.headers["x-knowledge-csrf"] || "") : "";
  registerKnowledgeRequestSecrets(req, [token, csrfToken]);
  const session = await auth.requireSession(token);
  if (csrf) auth.verifyCsrf(session, csrfToken);
  return { session, service };
}

export function createKnowledgeRetrievalRouter(runtime) {
  const router = express.Router();
  const sameOrigin = requireKnowledgeOrigin(runtime?.config?.publicOrigin || "");

  router.post(
    ["/retrieve", "/retrieval"],
    (req, _res, next) => {
      registerKnowledgeRequestSecrets(req, connectionSecrets(req.body));
      next();
    },
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, service } = await authenticatedRequest(req, runtime, { csrf: true });
      const request = requestDisconnectController(req, res);
      try {
        const result = await service.retrieve(session.account.id, req.body, {
          signal: request.controller.signal
        });
        if (!request.controller.signal.aborted && !res.destroyed) {
          res.json({ ...result, requestId: req.knowledgeRequestId });
        }
      } catch (error) {
        if (!request.controller.signal.aborted || (!req.aborted && !res.destroyed)) throw error;
      } finally {
        request.cleanup();
      }
    })
  );

  const openSource = async (req, res, input) => {
    const { session, service } = await authenticatedRequest(req, runtime, {
      citations: true,
      csrf: req.method !== "GET"
    });
    const result = await service.openSource(session.account.id, req.params.documentId, input);
    registerKnowledgeRequestSecrets(req, result.source?.url);
    res.json({ ...result, requestId: req.knowledgeRequestId });
  };

  router.get(
    ["/documents/:documentId/source-url", "/sources/:documentId/open"],
    asyncRoute((req, res) => openSource(req, res, {
      chunkId: req.query.chunkId,
      disposition: req.query.disposition
    }))
  );

  router.post(
    "/documents/:documentId/source-url",
    sameOrigin,
    asyncRoute((req, res) => openSource(req, res, {
      chunkId: req.body?.chunkId,
      disposition: req.body?.disposition
    }))
  );

  router.post(
    "/sources/open",
    sameOrigin,
    asyncRoute(async (req, res) => {
      req.params.documentId = String(req.body?.documentId || "");
      return openSource(req, res, {
        chunkId: req.body?.chunkId,
        disposition: req.body?.disposition
      });
    })
  );

  return router;
}
