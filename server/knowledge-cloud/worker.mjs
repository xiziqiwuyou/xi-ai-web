import { initializeKnowledgeRuntime, publicKnowledgeRuntimeStatus } from "./runtime.mjs";
import { createKnowledgeJobWorker } from "./jobs/worker-runtime.mjs";

const runtime = await initializeKnowledgeRuntime();
const status = publicKnowledgeRuntimeStatus(runtime);

if (!runtime.available) {
  console.error(JSON.stringify({ event: "knowledge_worker_unavailable", knowledge: status }));
  await runtime.close();
  process.exitCode = 1;
} else {
  const worker = createKnowledgeJobWorker({
    repositories: runtime.repositories,
    library: runtime.library,
    operations: runtime.operations,
    objectStore: runtime.objectStore,
    config: runtime.config.worker
  });
  console.log(
    JSON.stringify({
      event: "knowledge_worker_ready",
      knowledge: status,
      workerId: worker.workerId,
      concurrency: runtime.config.worker.concurrency,
      leaseSeconds: runtime.config.worker.leaseSeconds
    })
  );
  worker.start();
  const shutdown = async (signal) => {
    console.log(JSON.stringify({ event: "knowledge_worker_stopping", signal }));
    await worker.stop();
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
