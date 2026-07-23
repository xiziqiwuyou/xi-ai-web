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

function requireServices(runtime) {
  if (runtime?.auth && runtime?.library) {
    return { auth: runtime.auth, library: runtime.library };
  }
  throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "知识库内容服务暂时不可用", {
    status: 503
  });
}

function requireEmbeddingService(runtime) {
  if (runtime?.embeddings) return runtime.embeddings;
  throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.UNAVAILABLE, "知识库向量服务暂时不可用", {
    status: 503
  });
}

async function authenticatedRequest(req, runtime, { csrf = false } = {}) {
  const { auth, library } = requireServices(runtime);
  const token = knowledgeSessionToken(req, auth.cookieName);
  const csrfToken = csrf ? String(req.headers["x-knowledge-csrf"] || "") : "";
  registerKnowledgeRequestSecrets(req, [token, csrfToken]);
  const session = await auth.requireSession(token);
  if (csrf) auth.verifyCsrf(session, csrfToken);
  return { session, library };
}

export function createKnowledgeLibraryRouter(runtime) {
  const router = express.Router();
  const sameOrigin = requireKnowledgeOrigin(runtime?.config?.publicOrigin || "");

  router.get(
    "/embedding-profiles",
    asyncRoute(async (req, res) => {
      const { library } = await authenticatedRequest(req, runtime);
      res.json({ ...library.embeddingProfiles(), requestId: req.knowledgeRequestId });
    })
  );

  router.get(
    "/bases",
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime);
      res.json({ ...(await library.listBases(session.account.id)), requestId: req.knowledgeRequestId });
    })
  );

  router.post(
    "/bases",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      res.status(201).json({
        ...(await library.createBase(session.account.id, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/bases/:baseId",
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime);
      res.json({
        ...(await library.getBase(session.account.id, req.params.baseId)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.patch(
    "/bases/:baseId",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      res.json({
        ...(await library.updateBase(session.account.id, req.params.baseId, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.delete(
    "/bases/:baseId",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      res.status(202).json({
        ...(await library.deleteBase(session.account.id, req.params.baseId, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.get(
    "/bases/:baseId/documents",
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime);
      res.json({
        ...(await library.listDocuments(session.account.id, req.params.baseId)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/bases/:baseId/documents/upload-grant",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      const result = await library.createUploadGrant(
        session.account.id,
        req.params.baseId,
        req.body
      );
      registerKnowledgeRequestSecrets(req, [
        result.upload?.credentials?.tmpSecretId,
        result.upload?.credentials?.tmpSecretKey,
        result.upload?.credentials?.sessionToken
      ]);
      res.status(201).json({ ...result, requestId: req.knowledgeRequestId });
    })
  );

  router.post(
    "/documents/:documentId/finalize",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      res.json({
        ...(await library.finalizeUpload(session.account.id, req.params.documentId, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.delete(
    "/documents/:documentId",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session, library } = await authenticatedRequest(req, runtime, { csrf: true });
      res.status(202).json({
        ...(await library.deleteDocument(session.account.id, req.params.documentId, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/documents/:documentId/embedding-batches/next",
    sameOrigin,
    asyncRoute(async (req, res) => {
      registerKnowledgeRequestSecrets(req, [
        req.body?.connection?.baseUrl,
        req.body?.connection?.apiKey
      ]);
      const { session } = await authenticatedRequest(req, runtime, { csrf: true });
      const embeddings = requireEmbeddingService(runtime);
      res.json({
        ...(await embeddings.nextBatch(
          session.account.id,
          session.id,
          req.params.documentId,
          req.body
        )),
        requestId: req.knowledgeRequestId
      });
    })
  );

  router.post(
    "/bases/:baseId/reindex",
    sameOrigin,
    asyncRoute(async (req, res) => {
      const { session } = await authenticatedRequest(req, runtime, { csrf: true });
      const embeddings = requireEmbeddingService(runtime);
      res.status(202).json({
        ...(await embeddings.reindex(session.account.id, req.params.baseId, req.body)),
        requestId: req.knowledgeRequestId
      });
    })
  );

  return router;
}
