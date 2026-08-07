import {
  publicSmokeFailure,
  runLiveProviderSmoke
} from "./production-smoke.mjs";

try {
  const report = await runLiveProviderSmoke({
    baseUrl: process.env.LIVE_SMOKE_URL || process.env.SMOKE_URL || "http://localhost:8787",
    apiKey: process.env.LIVE_SMOKE_API_KEY,
    chatModelId: process.env.LIVE_SMOKE_CHAT_MODEL_ID,
    imageModelId: process.env.LIVE_SMOKE_IMAGE_MODEL_ID,
    editImagePath: process.env.LIVE_SMOKE_EDIT_IMAGE_PATH,
    allowInsecureHttp: String(process.env.LIVE_SMOKE_ALLOW_INSECURE_HTTP || "").toLowerCase() === "true",
    timeoutMs: process.env.LIVE_SMOKE_TIMEOUT_MS
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify(publicSmokeFailure(error), null, 2));
  process.exitCode = 1;
}
