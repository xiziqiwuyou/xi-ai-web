import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLangflowWorkflow,
  normalizeLangflowWorkflows,
  publicLangflowWorkflows
} from "../../server/langflow/catalog.mjs";

test("normalizes a workflow and preserves immutable creation metadata on update", () => {
  const created = normalizeLangflowWorkflow({
    id: "flow/display",
    flowId: "flow-1",
    name: "Support",
    tags: ["support", "support", "x"],
    order: "12"
  }, null, { touch: false });
  const updated = normalizeLangflowWorkflow(
    { name: "Support v2", description: "Updated" },
    created
  );

  assert.equal(created.id, "flow-display");
  assert.equal(created.order, 12);
  assert.deepEqual(created.tags, ["support", "x"]);
  assert.equal(updated.id, created.id);
  assert.equal(updated.flowId, created.flowId);
  assert.equal(updated.createdAt, created.createdAt);
  assert.notEqual(updated.updatedAt, created.updatedAt);
  assert.equal(updated.name, "Support v2");
});

test("deduplicates flow IDs and hides disabled or private fields from the public catalog", () => {
  const workflows = normalizeLangflowWorkflows([
    { id: "one", flowId: "same", name: "First", order: 2 },
    { id: "two", flowId: "same", name: "Duplicate", order: 1 },
    { id: "three", flowId: "other", name: "Disabled", enabled: false, order: 3 }
  ]);
  assert.deepEqual(workflows.map((workflow) => workflow.id), ["one", "three"]);

  const publicItems = publicLangflowWorkflows(workflows);
  assert.deepEqual(publicItems.map((workflow) => workflow.id), ["one"]);
  assert.equal("flowId" in publicItems[0], false);
  assert.equal("createdAt" in publicItems[0], false);
  assert.equal("updatedAt" in publicItems[0], false);
});

test("ignores invalid rows without preventing valid workflows from loading", () => {
  const workflows = normalizeLangflowWorkflows([
    { flowId: "", name: "invalid" },
    { flowId: "valid", name: "Valid" }
  ]);
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].flowId, "valid");
});
