import {
  knowledgeConfigSecrets,
  loadKnowledgeConfig
} from "./config.mjs";
import { closeKnowledgePool, createKnowledgePool } from "./db.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  redactKnowledgeValue
} from "./errors.mjs";
import { createKnowledgeAuthService } from "./auth/service.mjs";
import { createKnowledgeAdminService } from "./admin/service.mjs";
import { createKnowledgeLibraryService } from "./library/service.mjs";
import { createKnowledgeOperationsService } from "./operations/service.mjs";
import { createKnowledgeEmbeddingProvider } from "./embeddings/provider.mjs";
import { createKnowledgeEmbeddingService } from "./embeddings/service.mjs";
import { createKnowledgeRetrievalService } from "./retrieval/service.mjs";
import { createKnowledgeCitationService } from "./citations/service.mjs";
import { createTencentCosObjectStore } from "./object-store/tencent-cos.mjs";
import { verifyKnowledgeMigrations } from "./migrations/runner.mjs";
import { createKnowledgeRepositories } from "./repositories/index.mjs";

function disabledRuntime() {
  return Object.freeze({
    enabled: false,
    available: false,
    state: "disabled",
    reasonCode: KNOWLEDGE_ERROR_CODES.DISABLED,
    close: async () => {}
  });
}

function unavailableRuntime(error, { enabled, secrets, logger }) {
  const reasonCode =
    error instanceof KnowledgeError ? error.code : KNOWLEDGE_ERROR_CODES.DATABASE_UNAVAILABLE;
  logger.warn?.(
    JSON.stringify({
      event: "knowledge_runtime_unavailable",
      reasonCode,
      error: redactKnowledgeValue(error, { secrets })
    })
  );
  return Object.freeze({
    enabled,
    available: false,
    state: "unavailable",
    reasonCode,
    close: async () => {}
  });
}

export async function initializeKnowledgeRuntime({
  env = process.env,
  logger = console,
  configLoader = loadKnowledgeConfig,
  poolFactory = createKnowledgePool,
  repositoryFactory = createKnowledgeRepositories,
  migrationVerifier = verifyKnowledgeMigrations,
  authServiceFactory = createKnowledgeAuthService,
  adminServiceFactory = createKnowledgeAdminService,
  libraryServiceFactory = createKnowledgeLibraryService,
  operationsServiceFactory = createKnowledgeOperationsService,
  embeddingProviderFactory = createKnowledgeEmbeddingProvider,
  embeddingServiceFactory = createKnowledgeEmbeddingService,
  retrievalServiceFactory = createKnowledgeRetrievalService,
  citationServiceFactory = createKnowledgeCitationService,
  objectStoreFactory = createTencentCosObjectStore
} = {}) {
  let config;
  try {
    config = configLoader(env);
  } catch (error) {
    return unavailableRuntime(error, {
      enabled: String(env.KNOWLEDGE_ENABLED || "").toLowerCase() !== "false",
      secrets: [],
      logger
    });
  }
  if (!config.enabled) return disabledRuntime();

  const secrets = knowledgeConfigSecrets(config);
  let pool;
  try {
    pool = poolFactory(config.database);
    const repositories = repositoryFactory(pool);
    const databaseHealthy = await repositories.schema.ping();
    if (!databaseHealthy) {
      throw new KnowledgeError(
        KNOWLEDGE_ERROR_CODES.DATABASE_UNAVAILABLE,
        "知识库数据库健康检查失败",
        { status: 503 }
      );
    }
    const migrationState = await migrationVerifier(pool);
    const vectorVersion = await repositories.schema.vectorExtensionVersion();
    if (!vectorVersion) {
      throw new KnowledgeError(
        KNOWLEDGE_ERROR_CODES.VECTOR_EXTENSION_MISSING,
        "PostgreSQL vector 扩展未安装",
        { status: 503 }
      );
    }
    const auth = repositories.auth && config.auth
      ? authServiceFactory({
          repositories,
          tokenSecret: config.auth.tokenSecret,
          sessionTtlSeconds: config.auth.sessionTtlSeconds
        })
      : null;
    const admin = repositories.admin && config.auth
      ? adminServiceFactory({
          repositories,
          tokenSecret: config.auth.tokenSecret,
          objectStoreConfigured: Boolean(config.cos?.bucket && config.cos?.region)
        })
      : null;
    const objectStore = repositories.library && repositories.quota
      ? objectStoreFactory(config.cos)
      : null;
    const library = objectStore
      ? libraryServiceFactory({ repositories, objectStore })
      : null;
    const operations = repositories.operations && library
      ? operationsServiceFactory({
          repositories,
          library,
          config,
          schemaVersion: migrationState.applied.at(-1)?.version || 0,
          vectorVersion,
          objectStoreConfigured: Boolean(config.cos?.bucket && config.cos?.region),
          logger
        })
      : null;
    const embeddingProvider = repositories.embeddings
      ? embeddingProviderFactory({
          requestTimeoutMs: config.embedding?.requestTimeoutMs || 60_000
        })
      : null;
    const embeddings = embeddingProvider
      ? embeddingServiceFactory({
          repositories,
          provider: embeddingProvider,
          leaseSeconds: config.embedding?.leaseSeconds || 120
        })
      : null;
    const retrieval = embeddingProvider && repositories.retrieval && repositories.auth
      ? retrievalServiceFactory({
          repositories,
          provider: embeddingProvider,
          tokenSecret: config.auth.tokenSecret
        })
      : null;
    const citations = objectStore?.createSourceDownloadUrl && repositories.retrieval
      ? citationServiceFactory({
          repositories,
          objectStore,
          sourceUrlTtlSeconds: config.cos?.sourceUrlTtlSeconds
        })
      : null;

    logger.info?.(
      JSON.stringify({
        event: "knowledge_runtime_ready",
        schemaVersion: migrationState.applied.at(-1)?.version || 0,
        vectorVersion
      })
    );
    return Object.freeze({
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null,
      config,
      repositories,
      auth,
      admin,
      library,
      operations,
      embeddings,
      retrieval,
      citations,
      objectStore,
      pool,
      schemaVersion: migrationState.applied.at(-1)?.version || 0,
      vectorVersion,
      close: () => closeKnowledgePool(pool)
    });
  } catch (error) {
    await closeKnowledgePool(pool).catch(() => {});
    return unavailableRuntime(error, { enabled: true, secrets, logger });
  }
}

export function publicKnowledgeRuntimeStatus(runtime) {
  return {
    enabled: Boolean(runtime?.enabled),
    available: Boolean(runtime?.available),
    state: runtime?.state || "unavailable",
    reasonCode: runtime?.reasonCode || null,
    ...(runtime?.available
      ? {
          schemaVersion: runtime.schemaVersion,
          vectorVersion: runtime.vectorVersion
        }
      : {})
  };
}
