import type { GenerationResult, PptDeck, PptSlide, PptSlideType, PptThemeId } from "../../types";
import { parsePptMarkdown } from "./pptxExport";

const slideTypes = new Set<PptSlideType>([
  "cover",
  "section",
  "content",
  "two-column",
  "timeline",
  "data",
  "quote",
  "summary"
]);

const themeIds = new Set<PptThemeId>(["red-note", "business-blue", "midnight"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength: number, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  return Array.from(normalized || fallback).slice(0, maxLength).join("");
}

function cleanList(value: unknown, maxItems = 7, maxLength = 45) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.reduce<string[]>((items, candidate) => {
    const normalized = cleanText(candidate, maxLength);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key) || items.length >= maxItems) return items;
    seen.add(key);
    items.push(normalized);
    return items;
  }, []);
}

function cleanSlide(value: unknown, index: number): PptSlide | null {
  const source = record(value);
  if (!source) return null;
  const requestedType = slideTypes.has(source.type as PptSlideType)
    ? source.type as PptSlideType
    : "content";
  const normalizedType = index === 0 ? "cover" : requestedType === "cover" ? "section" : requestedType;
  const bulletLimit = normalizedType === "quote"
    ? 1
    : normalizedType === "data"
      ? 4
      : normalizedType === "timeline"
        ? 5
        : normalizedType === "summary"
          ? 5
          : 6;
  const bullets = normalizedType === "cover" ? [] : cleanList(source.bullets, bulletLimit, 45);
  const sourceLeft = normalizedType === "two-column" ? cleanList(source.leftContent, 3, 45) : [];
  const sourceRight = normalizedType === "two-column" ? cleanList(source.rightContent, 3, 45) : [];
  const fallbackColumns = bullets.slice(0, 6);
  const leftContent = normalizedType === "two-column"
    ? (sourceLeft.length ? sourceLeft : fallbackColumns.slice(0, 3))
    : [];
  const rightContent = normalizedType === "two-column"
    ? (sourceRight.length ? sourceRight : fallbackColumns.slice(3, 6))
    : [];
  return {
    id: cleanText(source.id, 64, `slide-${index + 1}`),
    type: normalizedType,
    title: cleanText(source.title, 24, `第 ${index + 1} 页`),
    subtitle: cleanText(source.subtitle, 60) || undefined,
    bullets: normalizedType === "two-column" ? [] : bullets,
    leftContent,
    rightContent,
    visualDescription: cleanText(source.visualDescription, 360) || undefined,
    speakerNotes: cleanText(source.speakerNotes, 900) || undefined
  };
}

function limitSlides(slides: PptSlide[], count: number) {
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

function boundedSlideCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(4, Math.min(20, Math.trunc(count))) : 20;
}

function deckFromMarkdown(markdown: string, topic: string, themeId: PptThemeId, slideCount = 20): PptDeck {
  const parsed = parsePptMarkdown(markdown, topic);
  const cover: PptSlide = {
    id: "slide-cover",
    type: "cover",
    title: parsed.title,
    subtitle: parsed.summary[0],
    bullets: []
  };
  const rawSlides = parsed.slides.map<PptSlide>((slide, index) => ({
    id: `slide-${index + 2}`,
    type: index === parsed.slides.length - 1 ? "summary" : "content",
    title: slide.title,
    bullets: slide.points,
    speakerNotes: slide.notes.join("\n") || undefined
  }));
  return {
    version: 1,
    title: parsed.title,
    subtitle: parsed.summary[0],
    summary: parsed.summary.join(" ") || undefined,
    themeId,
    aspectRatio: "16:9",
    slides: limitSlides(
      [cover, ...rawSlides]
        .map(cleanSlide)
        .filter((slide): slide is PptSlide => Boolean(slide)),
      boundedSlideCount(slideCount)
    )
  };
}

export function normalizePptDeck(
  value: unknown,
  fallbackMarkdown = "",
  topic = "AI 演示文稿",
  fallbackTheme: PptThemeId = "red-note",
  requestedSlideCount?: number
): PptDeck {
  const source = record(value);
  const rawSlides = Array.isArray(source?.slides) ? source.slides : [];
  const slideCount = boundedSlideCount(requestedSlideCount);
  const slides = limitSlides(
    rawSlides.slice(0, 20).map(cleanSlide).filter((slide): slide is PptSlide => Boolean(slide)),
    slideCount
  );
  if (!source || !slides.length) {
    return deckFromMarkdown(fallbackMarkdown, topic, fallbackTheme, slideCount);
  }
  const themeId = themeIds.has(source.themeId as PptThemeId)
    ? source.themeId as PptThemeId
    : fallbackTheme;
  return {
    version: 1,
    title: cleanText(source.title, 120, topic),
    subtitle: cleanText(source.subtitle, 200) || undefined,
    summary: cleanText(source.summary, 500) || undefined,
    themeId,
    aspectRatio: "16:9",
    slides
  };
}

export function pptDeckFromResult(
  result: GenerationResult,
  topic: string,
  fallbackTheme: PptThemeId,
  requestedSlideCount?: number
) {
  return normalizePptDeck(result.deck, result.text || "", topic, fallbackTheme, requestedSlideCount);
}
