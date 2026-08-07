import { APP_VERSION } from "../server/app-version.mjs";
import {
  publicSmokeFailure,
  runDeploymentSmoke
} from "./production-smoke.mjs";

try {
  const report = await runDeploymentSmoke({
    baseUrl: process.env.SMOKE_URL || "http://localhost:8787",
    expectedVersion: process.env.SMOKE_EXPECTED_VERSION || APP_VERSION,
    allowInsecureHttp: String(process.env.SMOKE_ALLOW_INSECURE_HTTP || "").toLowerCase() === "true",
    timeoutMs: process.env.SMOKE_TIMEOUT_MS,
    minSseGapMs: process.env.SMOKE_MIN_SSE_GAP_MS
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify(publicSmokeFailure(error), null, 2));
  process.exitCode = 1;
}
