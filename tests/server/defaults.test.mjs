import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAppPresets,
  defaultAssistants,
  defaultMenuItems,
  defaultPromptPresets,
  defaultSettings
} from "../../server/data/defaults.mjs";

test("default metadata factories preserve stable public identifiers", () => {
  assert.deepEqual(defaultMenuItems().map((item) => item.id), [
    "chat",
    "image",
    "agents",
    "workflows",
    "ppt",
    "mindmap",
    "assistants",
    "translate"
  ]);
  assert.deepEqual(defaultAssistants(() => "2026-07-27T00:00:00.000Z").map((item) => item.id), [
    "assistant-general",
    "assistant-engineering",
    "assistant-research",
    "assistant-content-editor",
    "assistant-rednote-planner",
    "assistant-product-manager",
    "assistant-data-analyst",
    "assistant-meeting-notes",
    "assistant-learning-coach",
    "assistant-translation-editor",
    "assistant-career-coach",
    "assistant-creative-curator"
  ]);
  assert.deepEqual(defaultAppPresets().map((item) => item.id), [
    "rednote-note",
    "copy-polish",
    "competitor-analysis",
    "weekly-report",
    "requirement-breakdown",
    "code-explainer"
  ]);
  assert.deepEqual(defaultPromptPresets().map((item) => item.id), [
    "image-product-poster",
    "image-rednote-cover",
    "agents-launch-plan",
    "mindmap-meeting"
  ]);
  assert.equal(defaultSettings().upstreamBaseUrl, "https://api.xi-ai.cn");
});

test("default metadata factories return fresh values and one shared assistant timestamp", () => {
  let clockCalls = 0;
  const timestamp = "2026-07-27T01:02:03.000Z";
  const assistants = defaultAssistants(() => {
    clockCalls += 1;
    return timestamp;
  });
  assert.equal(clockCalls, 1);
  assert(assistants.every((item) => item.createdAt === timestamp && item.updatedAt === timestamp));

  const firstMenus = defaultMenuItems();
  firstMenus[0].label = "changed";
  assert.equal(defaultMenuItems()[0].label, "AI 对话");

  const firstAssistants = defaultAssistants(() => timestamp);
  firstAssistants[0].tags.push("changed");
  assert.equal(defaultAssistants(() => timestamp)[0].tags.includes("changed"), false);
});
