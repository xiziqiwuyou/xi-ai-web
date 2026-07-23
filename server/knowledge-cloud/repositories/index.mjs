import { withKnowledgeTransaction } from "../db.mjs";
import { createKnowledgeAdminRepository } from "./admin-repository.mjs";
import { createKnowledgeAuthRepository } from "./auth-repository.mjs";
import { createKnowledgeEmbeddingRepository } from "./embedding-repository.mjs";
import { createKnowledgeLibraryRepository } from "./library-repository.mjs";
import { createKnowledgeJobRepository } from "./job-repository.mjs";
import { createKnowledgeOperationsRepository } from "./operations-repository.mjs";
import { createKnowledgeQuotaRepository } from "./quota-repository.mjs";
import { createKnowledgeRetrievalRepository } from "./retrieval-repository.mjs";
import { createKnowledgeSchemaRepository } from "./schema-repository.mjs";

export function createKnowledgeRepositoryContext(queryable) {
  return Object.freeze({
    admin: createKnowledgeAdminRepository(queryable),
    auth: createKnowledgeAuthRepository(queryable),
    embeddings: createKnowledgeEmbeddingRepository(queryable),
    jobs: createKnowledgeJobRepository(queryable),
    library: createKnowledgeLibraryRepository(queryable),
    operations: createKnowledgeOperationsRepository(queryable),
    quota: createKnowledgeQuotaRepository(queryable),
    retrieval: createKnowledgeRetrievalRepository(queryable),
    schema: createKnowledgeSchemaRepository(queryable)
  });
}

export function createKnowledgeRepositories(pool) {
  const root = createKnowledgeRepositoryContext(pool);
  return Object.freeze({
    ...root,
    transaction(work) {
      return withKnowledgeTransaction(pool, (client) =>
        work(createKnowledgeRepositoryContext(client))
      );
    }
  });
}
