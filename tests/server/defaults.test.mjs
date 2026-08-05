import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAppPresets,
  defaultAssistants,
  defaultMenuItems,
  defaultPromptPresets,
  defaultSettings
} from "../../server/data/defaults.mjs";
import {
  ASSISTANT_AVATAR_KEYS,
  ASSISTANT_CATEGORY_ORDER,
  migrateAssistants,
  normalizeAssistantAvatar
} from "../../server/data/assistant-catalog.mjs";

const shippedAssistantIds = [
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
  "assistant-creative-curator",
  "assistant-task-planner",
  "assistant-decision-analyst",
  "assistant-copywriter",
  "assistant-scriptwriter",
  "assistant-frontend-engineer",
  "assistant-sql-analyst",
  "assistant-code-reviewer",
  "assistant-paper-reader",
  "assistant-knowledge-explainer",
  "assistant-project-manager",
  "assistant-presentation-designer",
  "assistant-customer-service",
  "assistant-marketing-strategist",
  "assistant-brand-content",
  "assistant-ecommerce-operator",
  "assistant-growth-experimenter",
  "assistant-travel-planner",
  "assistant-reflection-coach"
];

test("temporary progress sync is disabled by default in production and bounded when configured", () => {
  const production = defaultSettings({ env: {}, production: true });
  assert.equal(production.progressSync.enabled, false);
  assert.equal(production.progressSync.ttlSeconds, 600);
  assert.equal(production.progressSync.maxPayloadMb, 32);

  const configured = defaultSettings({
    env: {
      PROGRESS_SYNC_ENABLED: "true",
      PROGRESS_SYNC_TTL_SECONDS: "9999",
      PROGRESS_SYNC_MAX_PAYLOAD_MB: "1"
    },
    production: true
  });
  assert.equal(configured.progressSync.enabled, true);
  assert.equal(configured.progressSync.ttlSeconds, 1800);
  assert.equal(configured.progressSync.maxPayloadMb, 5);
});

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
  assert.deepEqual(
    defaultAssistants(() => "2026-07-27T00:00:00.000Z").map((item) => item.id),
    shippedAssistantIds
  );
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

test("shipped assistant catalog is complete, structured, and visually addressable", () => {
  const assistants = defaultAssistants(() => "2026-08-03T00:00:00.000Z");
  const ids = new Set(assistants.map((assistant) => assistant.id));
  const names = new Set(assistants.map((assistant) => assistant.name));
  const avatars = new Set(assistants.map((assistant) => assistant.avatar));
  const categories = new Map();

  assert.equal(assistants.length, 30);
  assert.equal(ids.size, assistants.length);
  assert.equal(names.size, assistants.length);
  assert.equal(avatars.size, assistants.length);

  for (const assistant of assistants) {
    categories.set(assistant.category, (categories.get(assistant.category) || 0) + 1);
    assert(ASSISTANT_AVATAR_KEYS.includes(assistant.avatar), `${assistant.id} has an allowlisted avatar`);
    assert.equal(assistant.starterPrompts.length, 3, `${assistant.id} has three starter prompts`);
    assert(assistant.tags.length > 0, `${assistant.id} has searchable tags`);
    for (const section of ["# 角色与目标", "# 工作流程", "# 输出要求", "# 证据与边界", "# 安全边界"]) {
      assert(assistant.systemPrompt.includes(section), `${assistant.id} includes ${section}`);
    }
  }

  assert.deepEqual([...categories.keys()].sort(), [...ASSISTANT_CATEGORY_ORDER].sort());
  assert(categories.values().every((count) => count >= 3));
});

test("assistant avatar normalization rejects unknown imported values", () => {
  assert.equal(normalizeAssistantAvatar("code-2"), "code-2");
  assert.equal(normalizeAssistantAvatar("remote-script", "book-heart"), "book-heart");
  assert.equal(normalizeAssistantAvatar("https://example.com/icon.svg"), "sparkles");
});

test("version-12 assistant migration appends missing defaults without overwriting edited or custom records", () => {
  const defaults = defaultAssistants(() => "2026-08-03T00:00:00.000Z");
  const edited = {
    ...defaults[0],
    name: "管理员定制通用助手",
    systemPrompt: "管理员保留的提示词",
    avatar: "invalid-imported-avatar",
    enabled: false,
    updatedAt: "2026-08-03T01:00:00.000Z"
  };
  const custom = {
    ...defaults[1],
    id: "assistant-custom-local",
    name: "本地自定义助手",
    systemPrompt: "本地自定义提示词",
    avatar: "palette"
  };

  const migrated = migrateAssistants([edited, custom], 12, defaults);
  const preservedEdited = migrated.find((assistant) => assistant.id === edited.id);
  const preservedCustom = migrated.find((assistant) => assistant.id === custom.id);

  assert.equal(migrated.length, 31);
  assert.equal(preservedEdited.name, edited.name);
  assert.equal(preservedEdited.systemPrompt, edited.systemPrompt);
  assert.equal(preservedEdited.enabled, false);
  assert.equal(preservedEdited.avatar, defaults[0].avatar);
  assert.equal(preservedCustom.systemPrompt, custom.systemPrompt);
  assert.equal(preservedCustom.avatar, custom.avatar);
  assert.equal(new Set(migrated.map((assistant) => assistant.id)).size, migrated.length);

  const alreadyMigrated = migrateAssistants([edited, custom], 13, defaults);
  assert.equal(alreadyMigrated.length, 2);
});
