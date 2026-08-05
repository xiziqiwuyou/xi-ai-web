import {
  getPptPresentationProfile,
  PPT_PRESENTATION_TYPE_IDS,
  pptPresentationProfilePrompt
} from "./ppt-preset-profiles.mjs";

const slideTypes = new Set([
  "cover",
  "section",
  "content",
  "two-column",
  "timeline",
  "data",
  "quote",
  "summary"
]);

const optionValues = {
  presentationType: new Set(PPT_PRESENTATION_TYPE_IDS),
  narrative: new Set(["pyramid", "problem-solution", "timeline", "story", "data-first"]),
  contentDensity: new Set(["concise", "balanced", "detailed"]),
  language: new Set(["zh-CN", "en-US", "bilingual"]),
  themeId: new Set(["red-note", "business-blue", "midnight"])
};

const defaults = Object.freeze({
  presentationType: "business-report",
  audience: "企业管理层",
  duration: "8-10 分钟",
  slideCount: 8,
  narrative: "pyramid",
  contentDensity: "balanced",
  language: "zh-CN",
  visualTone: "专业简洁",
  themeId: "red-note",
  mustInclude: "",
  avoidContent: ""
});

function text(value, maxLength, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  return Array.from(normalized || fallback).slice(0, maxLength).join("");
}

function choice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function stringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const normalized = text(item, maxLength);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function extractJsonCandidate(content) {
  const source = String(content || "").trim();
  if (!source) return "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) return fenced[1].trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start ? source.slice(start, end + 1) : source;
}

function normalizeSlide(value, index) {
  const source = record(value);
  if (!source) return null;
  const title = text(source.title, 24, `第 ${index + 1} 页`);
  const requestedType = choice(source.type, slideTypes, index === 0 ? "cover" : "content");
  const type = index === 0 ? "cover" : requestedType === "cover" ? "section" : requestedType;
  const bulletLimit = type === "quote" ? 1 : type === "data" ? 4 : type === "timeline" ? 5 : type === "summary" ? 5 : 6;
  const bullets = type === "cover" ? [] : stringList(source.bullets, bulletLimit, 45);
  const sourceLeft = type === "two-column" ? stringList(source.leftContent, 3, 45) : [];
  const sourceRight = type === "two-column" ? stringList(source.rightContent, 3, 45) : [];
  const fallbackColumns = bullets.slice(0, 6);
  const leftContent = type === "two-column"
    ? (sourceLeft.length ? sourceLeft : fallbackColumns.slice(0, 3))
    : [];
  const rightContent = type === "two-column"
    ? (sourceRight.length ? sourceRight : fallbackColumns.slice(3, 6))
    : [];
  return {
    id: text(source.id, 64, `slide-${index + 1}`),
    type,
    title,
    subtitle: text(source.subtitle, 60) || undefined,
    bullets: type === "two-column" ? [] : bullets,
    leftContent,
    rightContent,
    visualDescription: text(source.visualDescription, 360) || undefined,
    speakerNotes: text(source.speakerNotes, 900) || undefined
  };
}

function limitSlides(slides, count) {
  if (slides.length <= count) return slides;
  const cover = slides[0];
  let summaryIndex = -1;
  for (let index = slides.length - 1; index > 0; index -= 1) {
    if (slides[index].type === "summary") {
      summaryIndex = index;
      break;
    }
  }
  const summary = summaryIndex >= 0 ? slides[summaryIndex] : null;
  const middle = slides.filter((slide, index) => index !== 0 && index !== summaryIndex);
  const availableMiddle = Math.max(0, count - 1 - (summary ? 1 : 0));
  const selected = [cover, ...middle.slice(0, availableMiddle)];
  if (summary && selected.length < count) selected.push(summary);
  return selected.slice(0, count);
}

function retargetSlideLayout(slide, type) {
  const items = stringList(
    [...slide.bullets, ...(slide.leftContent || []), ...(slide.rightContent || [])],
    type === "data" ? 4 : type === "timeline" ? 5 : 6,
    45
  );
  if (type === "two-column") {
    const splitAt = Math.ceil(items.length / 2);
    return {
      ...slide,
      type,
      bullets: [],
      leftContent: items.slice(0, splitAt),
      rightContent: items.slice(splitAt)
    };
  }
  return {
    ...slide,
    type,
    bullets: items,
    leftContent: [],
    rightContent: []
  };
}

function avoidRepeatedLayouts(slides, presentationType) {
  const profile = getPptPresentationProfile(presentationType);
  return slides.reduce((result, slide) => {
    const previous = result.at(-1);
    const beforePrevious = result.at(-2);
    if (
      slide.type !== "cover"
      && slide.type !== "summary"
      && previous?.type === slide.type
      && beforePrevious?.type === slide.type
    ) {
      const replacement = profile.layoutCycle.find((type) => type !== slide.type);
      result.push(replacement ? retargetSlideLayout(slide, replacement) : slide);
    } else {
      result.push(slide);
    }
    return result;
  }, []);
}

export function normalizePptGenerationOptions(value = {}) {
  const source = record(value) || {};
  const requestedCount = Number(source.slideCount);
  return {
    presentationType: choice(source.presentationType, optionValues.presentationType, defaults.presentationType),
    audience: text(source.audience, 80, defaults.audience),
    duration: text(source.duration, 40, defaults.duration),
    slideCount: Number.isFinite(requestedCount)
      ? Math.max(4, Math.min(20, Math.trunc(requestedCount)))
      : defaults.slideCount,
    narrative: choice(source.narrative, optionValues.narrative, defaults.narrative),
    contentDensity: choice(source.contentDensity, optionValues.contentDensity, defaults.contentDensity),
    language: choice(source.language, optionValues.language, defaults.language),
    visualTone: text(source.visualTone, 80, defaults.visualTone),
    themeId: choice(source.themeId, optionValues.themeId, defaults.themeId),
    mustInclude: text(source.mustInclude, 1200),
    avoidContent: text(source.avoidContent, 800)
  };
}

export const PPT_DECK_SYSTEM_PROMPT = [
  "你是专业的演示文稿策划师和信息设计师。",
  "只输出一个合法 JSON 对象，不要使用 Markdown 代码块，不要添加解释。",
  "整份演示必须形成完整叙事，每页只表达一个核心观点，避免重复和目录式空话。",
  "标题不超过 24 个中文字符；每页 3-6 个要点，每个要点尽量不超过 45 个中文字符。",
  "不得编造无法确认的精确数字；需要数据时说明指标含义和建议的数据来源。",
  "页面 type 只能是 cover、section、content、two-column、timeline、data、quote、summary。",
  "第一项必须是 cover。每页都必须提供 id、type、title、bullets；可选 subtitle、leftContent、rightContent、visualDescription、speakerNotes。",
  "JSON 顶层必须包含 version、title、subtitle、summary、themeId、aspectRatio、slides；version 固定为 1，aspectRatio 固定为 16:9。"
].join("\n");

export function pptGenerationMessages(prompt, value = {}) {
  const options = normalizePptGenerationOptions(value);
  const profile = getPptPresentationProfile(options.presentationType);
  const userContent = [
    `演示主题：${text(prompt, 12000)}`,
    `演示类型：${profile.label}（${options.presentationType}）`,
    `目标受众：${options.audience}`,
    `演讲时长：${options.duration}`,
    `总页数：${options.slideCount} 页（包含封面）`,
    `必须严格输出恰好 ${options.slideCount} 个 slides，不能多也不能少。`,
    `叙事方式：${options.narrative}`,
    `内容密度：${options.contentDensity}`,
    `语言：${options.language}`,
    `视觉气质：${options.visualTone}`,
    `主题模板：${options.themeId}`,
    options.mustInclude ? `必须包含：${options.mustInclude}` : "",
    options.avoidContent ? `避免内容：${options.avoidContent}` : ""
  ].filter(Boolean).join("\n");
  return [
    {
      role: "system",
      content: [PPT_DECK_SYSTEM_PROMPT, "演示预设规则：", pptPresentationProfilePrompt(profile)].join("\n\n")
    },
    { role: "user", content: userContent }
  ];
}

export function parsePptDeckModelOutput(content, value = {}, fallbackTitle = "AI 演示文稿") {
  const options = normalizePptGenerationOptions(value);
  let parsed;
  try {
    parsed = JSON.parse(extractJsonCandidate(content));
  } catch {
    return null;
  }
  const source = record(record(parsed)?.deck) || record(parsed);
  if (!source || !Array.isArray(source.slides)) return null;
  const normalizedSlides = source.slides.map(normalizeSlide).filter(Boolean);
  if (normalizedSlides.length < options.slideCount) return null;
  const slides = avoidRepeatedLayouts(limitSlides(
    normalizedSlides,
    options.slideCount
  ), options.presentationType);
  if (!slides.length) return null;
  return {
    version: 1,
    title: text(source.title, 120, text(fallbackTitle, 120, "AI 演示文稿")),
    subtitle: text(source.subtitle, 200) || undefined,
    summary: text(source.summary, 500) || undefined,
    themeId: choice(source.themeId, optionValues.themeId, options.themeId),
    aspectRatio: "16:9",
    slides
  };
}

export function pptDeckToMarkdown(deck) {
  const lines = [`# ${deck.title}`];
  if (deck.subtitle) lines.push("", deck.subtitle);
  deck.slides.forEach((slide, index) => {
    if (index === 0 && slide.type === "cover") return;
    lines.push("", `## ${slide.title}`);
    if (slide.subtitle) lines.push(`- ${slide.subtitle}`);
    [...slide.bullets, ...(slide.leftContent || []), ...(slide.rightContent || [])]
      .forEach((item) => lines.push(`- ${item}`));
    if (slide.speakerNotes) lines.push(`- 演讲备注：${slide.speakerNotes}`);
  });
  return lines.join("\n").trim();
}
