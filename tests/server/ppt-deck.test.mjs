import assert from "node:assert/strict";
import test from "node:test";

import {
  PPT_DECK_SYSTEM_PROMPT,
  normalizePptGenerationOptions,
  parsePptDeckModelOutput,
  pptDeckToMarkdown,
  pptGenerationMessages
} from "../../server/ppt-deck.mjs";
import {
  PPT_PRESENTATION_PROFILES,
  PPT_PRESENTATION_TYPE_IDS
} from "../../server/ppt-preset-profiles.mjs";

const expectedPresentationTypes = [
  "business-report",
  "product-launch",
  "pitch-deck",
  "project-plan",
  "course",
  "annual-review",
  "data-analysis",
  "industry-research"
];

test("PPT options are bounded and generation instructions require strict slide JSON", () => {
  const options = normalizePptGenerationOptions({
    slideCount: 99,
    presentationType: "unknown",
    narrative: "timeline",
    language: "bilingual",
    mustInclude: "收入、留存率和下一步行动"
  });
  assert.equal(options.slideCount, 20);
  assert.equal(options.presentationType, "business-report");
  assert.equal(options.narrative, "timeline");
  assert.equal(options.language, "bilingual");
  assert.match(PPT_DECK_SYSTEM_PROMPT, /只输出一个合法 JSON 对象/u);
  assert.match(PPT_DECK_SYSTEM_PROMPT, /cover、section、content/u);

  const messages = pptGenerationMessages("季度经营复盘", options);
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content, /总页数：20 页/u);
  assert.match(messages[1].content, /必须包含：收入、留存率和下一步行动/u);
});

test("all PPT presets contribute dedicated narrative and layout instructions", () => {
  assert.deepEqual(PPT_PRESENTATION_TYPE_IDS, expectedPresentationTypes);
  for (const presentationType of expectedPresentationTypes) {
    const profile = PPT_PRESENTATION_PROFILES[presentationType];
    assert.ok(profile, presentationType);
    assert.ok(profile.requiredSections.length >= 5, presentationType);
    assert.ok(profile.optionalSections.length >= 3, presentationType);
    assert.ok(profile.instructions.length >= 3, presentationType);
    assert.equal(new Set(profile.layoutCycle).size, profile.layoutCycle.length, presentationType);

    const messages = pptGenerationMessages("可验证的演示主题", {
      presentationType,
      slideCount: 10,
      audience: "测试听众",
      duration: "15 分钟",
      narrative: "story",
      contentDensity: "concise",
      language: "zh-CN",
      visualTone: "专业简洁",
      themeId: "red-note"
    });
    assert.match(messages[0].content, new RegExp(`当前预设：${profile.label}`, "u"), presentationType);
    assert.match(messages[0].content, new RegExp(profile.purpose, "u"), presentationType);
    assert.match(messages[0].content, /连续三页不得使用相同 type/u, presentationType);
    assert.match(messages[1].content, new RegExp(`演示类型：${profile.label}（${presentationType}）`, "u"), presentationType);
    assert.match(messages[1].content, /必须严格输出恰好 10 个 slides/u, presentationType);
  }
});

test("PPT model output accepts fenced JSON and sanitizes unsupported slide fields", () => {
  const deck = parsePptDeckModelOutput(`\`\`\`json
  {
    "title": "增长复盘",
    "themeId": "business-blue",
    "slides": [
      { "id": "cover", "type": "content", "title": "增长复盘", "bullets": [] },
      { "id": "metrics", "type": "unknown", "title": "核心指标", "bullets": ["收入增长 20%", "留存率改善"] },
      { "id": "actions", "type": "timeline", "title": "行动路径", "bullets": ["验证", "落地", "复盘"] },
      { "id": "summary", "type": "summary", "title": "行动总结", "bullets": ["下一步"] }
    ]
  }
  \`\`\``, { slideCount: 4 });

  assert.ok(deck);
  assert.equal(deck.version, 1);
  assert.equal(deck.aspectRatio, "16:9");
  assert.equal(deck.themeId, "business-blue");
  assert.equal(deck.slides[0].type, "cover");
  assert.equal(deck.slides[1].type, "content");
  assert.deepEqual(deck.slides[1].bullets, ["收入增长 20%", "留存率改善"]);
  assert.match(pptDeckToMarkdown(deck), /## 核心指标/u);
});

test("PPT output is trimmed to the requested count while retaining cover and summary", () => {
  const slides = [
    { id: "cover", type: "cover", title: "增长策略" },
    ...Array.from({ length: 15 }, (_, index) => ({
    id: `content-${index + 1}`,
      type: "content",
      title: index === 0 ? "标题".repeat(40) : `内容 ${index + 1}`,
      bullets: Array.from({ length: 10 }, (_, bulletIndex) => index === 0
        ? `要点 ${bulletIndex + 1}${"内容".repeat(30)}`
        : `要点 ${bulletIndex + 1}`)
    })),
    { id: "summary", type: "summary", title: "行动总结", bullets: ["下一步"] }
  ];

  const deck = parsePptDeckModelOutput(JSON.stringify({ title: "增长策略", slides }), { slideCount: 8 });

  assert.ok(deck);
  assert.equal(deck.slides.length, 8);
  assert.equal(deck.slides[0].type, "cover");
  assert.equal(deck.slides.at(-1)?.type, "summary");
  assert.equal(deck.slides[1].bullets.length, 6);
  assert.equal(Array.from(deck.slides[1].title).length, 24);
  assert.ok(deck.slides[1].bullets.every((item) => Array.from(item).length <= 45));
});

test("PPT parsing conservatively breaks a third repeated content layout", () => {
  const slides = [
    { id: "cover", type: "cover", title: "项目方案", bullets: [] },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `content-${index + 1}`,
      type: "content",
      title: `内容 ${index + 1}`,
      bullets: [`保留要点 ${index + 1}-1`, `保留要点 ${index + 1}-2`]
    })),
    { id: "summary", type: "summary", title: "行动总结", bullets: ["下一步"] }
  ];

  const deck = parsePptDeckModelOutput(JSON.stringify({ title: "项目方案", slides }), {
    presentationType: "project-plan",
    slideCount: 8
  });

  assert.ok(deck);
  assert.equal(deck.slides.length, 8);
  for (let index = 2; index < deck.slides.length; index += 1) {
    assert.equal(
      deck.slides[index].type === deck.slides[index - 1].type
        && deck.slides[index].type === deck.slides[index - 2].type,
      false
    );
  }
  assert.equal(deck.slides[3].type, "timeline");
  assert.deepEqual(deck.slides[3].bullets, ["保留要点 3-1", "保留要点 3-2"]);
});

test("invalid PPT provider text remains available for the client fallback", () => {
  assert.equal(parsePptDeckModelOutput("# 普通 Markdown 大纲", { slideCount: 8 }), null);
  assert.equal(parsePptDeckModelOutput('{"slides":[]}', { slideCount: 8 }), null);
  assert.equal(parsePptDeckModelOutput(JSON.stringify({
    title: "页数不足",
    slides: [
      { id: "cover", type: "cover", title: "页数不足", bullets: [] },
      { id: "content", type: "content", title: "仅一页内容", bullets: ["内容"] }
    ]
  }), { slideCount: 4 }), null);
});
