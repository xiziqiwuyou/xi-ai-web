import path from "node:path";
import { pathToFileURL } from "node:url";

const DRILL_KINDS = new Set(["backup", "restore", "rebuild"]);
const EXECUTION_FLAGS = new Set(["--apply", "--execute", "--run"]);

function normalizeEnvironment(value) {
  const environment = String(value || "staging").trim().toLowerCase();
  if (!new Set(["development", "staging", "production"]).has(environment)) {
    throw new TypeError("environment must be development, staging, or production");
  }
  return environment;
}

function basePlan(kind, environment) {
  return {
    schema: "xi-ai-knowledge-operations-drill/v1",
    kind,
    environment,
    mode: "plan-only",
    executesCommands: false,
    safeguards: [
      "No database, COS, API, or filesystem mutation is performed by this planner.",
      "Use separate restricted runtime and migration/restore roles.",
      "Never print DATABASE_URL, COS credentials, provider keys, object keys, or document text.",
      "A human operator must verify the isolated target before running any documented command."
    ]
  };
}

export function createKnowledgeOperationsDrillPlan(kindValue, options = {}) {
  const kind = String(kindValue || "").trim().toLowerCase();
  if (!DRILL_KINDS.has(kind)) {
    throw new TypeError("drill kind must be backup, restore, or rebuild");
  }
  const environment = normalizeEnvironment(options.environment);
  const plan = basePlan(kind, environment);

  if (kind === "backup") {
    return {
      ...plan,
      eligible: true,
      objective: "Produce a recoverable PostgreSQL/COS backup set without changing live knowledge state.",
      steps: [
        "Record the applied knowledge migration ledger and pgvector extension version.",
        "Run pg_dump in custom format with a read-only backup role and encrypted destination.",
        "Create a COS inventory or versioned snapshot under operator-owned retention controls.",
        "Write a secret-free manifest containing counts, byte totals, checksums, and timestamps.",
        "Verify the backup by planning an isolated restore drill; do not claim recovery from artifact creation alone."
      ],
      stopConditions: [
        "Migration history is incomplete or ahead of the application.",
        "The database dump or COS inventory cannot be checksummed.",
        "Any command would print or persist credentials in the manifest."
      ]
    };
  }

  if (kind === "restore") {
    return {
      ...plan,
      eligible: environment !== "production",
      objective: "Validate recovery in an isolated non-production database and COS prefix.",
      steps: [
        "Provision an empty isolated PostgreSQL database and a dedicated COS test prefix.",
        "Verify backup manifest checksums before connecting restore tooling.",
        "Restore PostgreSQL with the dedicated restore role, then run knowledge:migrate:check.",
        "Restore or map COS objects only inside the isolated prefix and verify sampled HEAD checks.",
        "Start one isolated worker and run knowledge acceptance, OCR-disabled baseline, retrieval, citation, and cleanup checks.",
        "Destroy the isolated drill resources through the operator's approved change process after evidence is retained."
      ],
      stopConditions: [
        "The target origin, database, bucket, or prefix is production.",
        "The target database is non-empty or shares the runtime role.",
        "Manifest checksums, migration verification, ownership checks, or sampled objects do not match."
      ]
    };
  }

  return {
    ...plan,
    eligible: environment !== "production",
    objective: "Exercise a shadow rebuild while proving the active index remains readable.",
    steps: [
      "Select a sanitized staging account/base and record its active index version and citation baseline.",
      "Verify quota headroom for the complete shadow index before requesting rebuild.",
      "Request the existing shadow rebuild through authenticated owner/Admin APIs with an audit reason.",
      "Observe pending-index age, embedding latency, queue age, retries, and quota drift while active retrieval continues.",
      "Verify atomic cutover only after all enabled chunks are ready; inject one failure and confirm the active index is unchanged.",
      "Retire test artifacts through normal cleanup jobs and run reconciliation."
    ],
    stopConditions: [
      "The selected base or endpoint belongs to production.",
      "Quota headroom is insufficient or the active index is not readable before the drill.",
      "Any step proposes in-place mutation of active chunks/vectors or direct SQL status changes."
    ]
  };
}

export function runKnowledgeOperationsDrillCli(args = process.argv.slice(2), output = process.stdout) {
  if (args.some((value) => EXECUTION_FLAGS.has(String(value).toLowerCase().split("=", 1)[0]))) {
    throw new TypeError("This command is plan-only; execution flags are not supported");
  }
  const [kind, ...rest] = args;
  const environmentArgs = rest.filter((value) => String(value).startsWith("--environment="));
  if (environmentArgs.length > 1 || rest.some((value) => !String(value).startsWith("--environment="))) {
    throw new TypeError("Only one --environment=development|staging|production option is supported");
  }
  const environmentArg = environmentArgs[0];
  const environment = environmentArg
    ? String(environmentArg).slice("--environment=".length)
    : process.env.KNOWLEDGE_DRILL_ENVIRONMENT || "staging";
  const plan = createKnowledgeOperationsDrillPlan(kind, { environment });
  output.write(`${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runKnowledgeOperationsDrillCli();
  } catch (error) {
    process.stderr.write(`Knowledge operations drill planner failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
