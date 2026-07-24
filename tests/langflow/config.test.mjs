import assert from "node:assert/strict";
import test from "node:test";
import { loadLangflowConfig, publicLangflowStatus } from "../../server/langflow/config.mjs";

test("loads a safe public status while retaining private runtime configuration", () => {
  const config = loadLangflowConfig({
    LANGFLOW_ENABLED: "true",
    LANGFLOW_BASE_URL: "https://langflow.example.test/",
    LANGFLOW_API_KEY: "server-secret",
    LANGFLOW_REQUEST_TIMEOUT_MS: "999999",
    LANGFLOW_WORKFLOW_PATH: "/api/v2/workflows"
  });
  assert.equal(config.available, true);
  assert.equal(config.baseUrl, "https://langflow.example.test");
  assert.equal(config.timeoutMs, 600000);
  assert.equal(config.workflowPath, "/api/v2/workflows");
  assert.deepEqual(publicLangflowStatus(config), {
    enabled: true,
    available: true,
    state: "ready",
    reasonCode: null
  });
});

test("rejects unsafe or malformed endpoint configuration without throwing", () => {
  const config = loadLangflowConfig({
    LANGFLOW_ENABLED: "yes",
    LANGFLOW_BASE_URL: "file:///tmp/langflow",
    LANGFLOW_API_KEY: "",
    LANGFLOW_WORKFLOW_PATH: "https://evil.example/path\nX-Leak: yes"
  });
  assert.equal(config.available, false);
  assert.equal(config.baseUrl, "");
  assert.equal(config.workflowPath, "/api/v2/workflows");
  assert.equal(publicLangflowStatus(config).reasonCode, "LANGFLOW_NOT_CONFIGURED");
});
