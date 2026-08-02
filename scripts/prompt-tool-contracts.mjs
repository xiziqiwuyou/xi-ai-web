import assert from "node:assert/strict";
import { promptToolContracts, runPromptToolLoop } from "../server/tools/prompt-runner.mjs";
import { runTool as runRegisteredTool } from "../server/tools/registry.mjs";

const tools = [{
  name: "lookup",
  description: "Lookup a value",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false
  }
}];

const responses = [
  JSON.stringify({ type: "tool_call", name: "lookup", arguments: { query: "x" } }),
  JSON.stringify({ type: "final", content: "bounded answer" })
];
const seenMessages = [];
const calls = [];
const answer = await runPromptToolLoop({
  tools,
  messages: [{ role: "system", content: "System" }, { role: "user", content: "Question" }],
  complete: async (messages) => {
    seenMessages.push(messages.map((message) => ({ ...message })));
    return responses.shift();
  },
  execute: async (call) => {
    calls.push(call);
    return { value: 42 };
  }
});

assert.equal(answer, "bounded answer");
assert.deepEqual(calls[0], {
  name: "lookup",
  arguments: { query: "x" },
  raw: { type: "tool_call", name: "lookup", arguments: { query: "x" } }
});
assert.match(seenMessages[0][0].content, /Allowed tools/);
assert.match(seenMessages[1].at(-1).content, /Tool result data for lookup/);

assert.throws(
  () => promptToolContracts.parsePromptEnvelope("```json\n{}\n```"),
  /non-JSON envelope/
);
assert.throws(
  () => promptToolContracts.validateSchemaValue({ query: "x", extra: true }, tools[0].parameters),
  /extra is not allowed/
);
await assert.rejects(
  () => runPromptToolLoop({
    tools,
    messages: [{ role: "user", content: "Question" }],
    complete: async () => JSON.stringify({ type: "tool_call", name: "delete_everything", arguments: {} }),
    execute: async () => ({})
  }),
  /not allowed/
);
await assert.rejects(
  () => runRegisteredTool({
    name: "calculator_eval",
    arguments: { expression: "1 + 1", unexpected: true }
  }),
  /unexpected is not allowed/
);
assert.equal((await runRegisteredTool({
  name: "calculator_eval",
  arguments: { expression: "2 * (3 + 4) - .5" }
})).result, 13.5);
await assert.rejects(
  () => runRegisteredTool({ name: "calculator_eval", arguments: { expression: "1 / 0" } }),
  /Division by zero/
);
await assert.rejects(
  () => runRegisteredTool({ name: "calculator_eval", arguments: { expression: "1; process.exit()" } }),
  /arithmetic operators/
);

console.log("Prompt tool contracts passed");
