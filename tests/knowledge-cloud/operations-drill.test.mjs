import assert from "node:assert/strict";
import test from "node:test";
import {
  createKnowledgeOperationsDrillPlan,
  runKnowledgeOperationsDrillCli
} from "../../scripts/knowledge-operations-drill.mjs";

test("operations drill plans are deterministic and never execute commands", () => {
  for (const kind of ["backup", "restore", "rebuild"]) {
    const plan = createKnowledgeOperationsDrillPlan(kind, { environment: "staging" });
    assert.equal(plan.schema, "xi-ai-knowledge-operations-drill/v1");
    assert.equal(plan.mode, "plan-only");
    assert.equal(plan.executesCommands, false);
    assert(plan.steps.length >= 5);
    assert(plan.stopConditions.length >= 3);
  }
  assert.deepEqual(
    createKnowledgeOperationsDrillPlan("backup", { environment: "staging" }),
    createKnowledgeOperationsDrillPlan("backup", { environment: "staging" })
  );
});

test("restore and rebuild plans reject production eligibility and execution flags", () => {
  assert.equal(
    createKnowledgeOperationsDrillPlan("restore", { environment: "production" }).eligible,
    false
  );
  assert.equal(
    createKnowledgeOperationsDrillPlan("rebuild", { environment: "production" }).eligible,
    false
  );
  assert.throws(
    () => runKnowledgeOperationsDrillCli(["restore", "--execute"], { write() {} }),
    /plan-only/u
  );
  assert.throws(
    () => runKnowledgeOperationsDrillCli(["restore", "--execute=true"], { write() {} }),
    /plan-only/u
  );
  assert.throws(
    () => runKnowledgeOperationsDrillCli(["restore", "--env=production"], { write() {} }),
    /Only one --environment/u
  );
});

test("CLI emits a secret-free JSON plan", () => {
  let output = "";
  const plan = runKnowledgeOperationsDrillCli(
    ["backup", "--environment=production"],
    { write(value) { output += value; } }
  );
  assert.equal(plan.eligible, true);
  assert.equal(JSON.parse(output).kind, "backup");
  assert.equal(/postgres(?:ql)?:\/\/|AKID[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}/u.test(output), false);
});
