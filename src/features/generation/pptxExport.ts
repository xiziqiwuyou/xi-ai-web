import type PptxGenJS from "pptxgenjs";

type ParsedSlide = {
  title: string;
  points: string[];
  notes: string[];
};

type ParsedDeck = {
  title: string;
  summary: string[];
  slides: ParsedSlide[];
};

const DECK_W = 13.333;
const DECK_H = 7.5;
const MAX_POINTS_PER_SLIDE = 7;

const colors = {
  ink: "201F24",
  muted: "766F76",
  soft: "FFF3F4",
  paper: "FFFCFC",
  pink: "FF2442",
  pinkDeep: "D91937",
  pinkPale: "FFE8EC",
  line: "F1CDD3"
};

function stripMarkdown(input: string) {
  return input
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeading(input: string) {
  return stripMarkdown(input)
    .replace(/^(?:slide|page)\s*\d+\s*[:：.\-、)]?\s*/i, "")
    .replace(/^幻灯片\s*\d+\s*[:：.\-、)]?\s*/i, "")
    .replace(/^第\s*\d+\s*(?:页|张|部分|章|节)?\s*[:：.\-、)]?\s*/i, "")
    .replace(/^\d{1,2}\s*[.、)]\s*/, "")
    .trim();
}

function cleanPoint(input: string) {
  return stripMarkdown(input)
    .replace(/^(?:[-*+•]\s+|\d{1,2}[.)、]\s+)/, "")
    .replace(/^(?:要点|重点|内容)\s*\d*\s*[:：]\s*/i, "")
    .trim();
}

function isNoteLine(line: string) {
  return /^(?:[-*+•]\s*)?(?:备注|讲述|演讲备注|演示备注|讲稿|speaker notes?|notes?)\s*[:：]?/i.test(line);
}

function extractNote(line: string) {
  return cleanPoint(
    line.replace(
      /^(?:[-*+•]\s*)?(?:备注|讲述|演讲备注|演示备注|讲稿|speaker notes?|notes?)\s*[:：]?/i,
      ""
    )
  );
}

function isSlideHeading(line: string) {
  return (
    /^(?:#{2,4})\s+/.test(line) ||
    /^(?:slide|page)\s*\d+\s*[:：.\-、)]\s+/i.test(line) ||
    /^幻灯片\s*\d+\s*[:：.\-、)]\s*/i.test(line) ||
    /^第\s*\d+\s*(?:页|张)\s*[:：.\-、)]\s*/i.test(line)
  );
}

function isUnorderedBulletLine(line: string) {
  return /^\s*(?:[-*+•]\s+)/.test(line);
}

function nextMeaningfulLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line && !/^```/.test(line)) return line;
  }
  return "";
}

function numberedHeading(line: string) {
  const match = line.match(/^\s*(\d{1,2})[.)、]\s+(.{2,42})$/);
  if (!match) return "";
  const title = cleanHeading(match[2]);
  if (!title || /[。；;]$/.test(title)) return "";
  return title;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function parsePptMarkdown(markdown: string, topic?: string): ParsedDeck {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const summary: string[] = [];
  const rawSlides: ParsedSlide[] = [];
  let title = cleanHeading(topic || "") || "AI Presentation";
  const state: { current: ParsedSlide | null } = { current: null };
  let inFence = false;
  let noteMode = false;

  const pushCurrent = () => {
    const current = state.current;
    if (!current) return;
    current.points = unique(current.points.map(cleanPoint).filter(Boolean));
    current.notes = unique(current.notes.map(stripMarkdown).filter(Boolean));
    if (current.title || current.points.length || current.notes.length) rawSlides.push(current);
    state.current = null;
  };

  const startSlide = (heading: string) => {
    pushCurrent();
    state.current = {
      title: cleanHeading(heading) || `Slide ${rawSlides.length + 1}`,
      points: [],
      notes: []
    };
    noteMode = false;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (!line) {
      noteMode = false;
      continue;
    }
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingText = cleanHeading(heading[2]);
      if (/^(?:备注|讲述|演讲备注|演示备注|讲稿|speaker notes?|notes?)$/i.test(headingText)) {
        noteMode = true;
        continue;
      }
      if (level === 1 && rawSlides.length === 0 && !state.current) {
        title = headingText || title;
        continue;
      }
      if (level >= 2) {
        startSlide(headingText);
        continue;
      }
    }

    if (isSlideHeading(line)) {
      startSlide(line.replace(/^#{2,4}\s+/, ""));
      continue;
    }

    const possibleNumberedHeading = numberedHeading(line);
    if (
      possibleNumberedHeading &&
      (!state.current || isUnorderedBulletLine(nextMeaningfulLine(lines, lineIndex + 1)))
    ) {
      startSlide(possibleNumberedHeading);
      continue;
    }

    if (isNoteLine(line)) {
      const note = extractNote(line);
      if (state.current && note) state.current.notes.push(note);
      noteMode = true;
      continue;
    }

    const point = cleanPoint(line);
    if (!point) continue;

    if (!state.current) {
      summary.push(point);
      continue;
    }

    if (noteMode) {
      state.current.notes.push(point);
    } else {
      state.current.points.push(point);
    }
  }

  pushCurrent();

  const slides = rawSlides.flatMap((slide, slideIndex) => {
    const points = slide.points.length ? slide.points : slide.notes.slice(0, 4);
    const normalizedPoints = points.length ? points : ["补充本页核心信息、关键论据与行动建议。"];
    return chunk(normalizedPoints, MAX_POINTS_PER_SLIDE).map((slidePoints, chunkIndex) => ({
      title: chunkIndex === 0 ? slide.title : `${slide.title}（续）`,
      points: slidePoints,
      notes: chunkIndex === 0 ? slide.notes : []
    }));
  });

  if (!slides.length) {
    const fallbackPoints = unique([...summary, ...lines.map(cleanPoint)].filter(Boolean));
    chunk(fallbackPoints.length ? fallbackPoints : [title], 5).forEach((points, index) => {
      slides.push({
        title: index === 0 ? "内容概览" : `重点 ${index + 1}`,
        points,
        notes: []
      });
    });
  }

  return {
    title,
    summary: unique(summary).slice(0, 4),
    slides: slides.slice(0, 16)
  };
}

function addFooter(slide: PptxGenJS.Slide, index: number, total: number) {
  slide.addShape("rect", {
    x: 0.72,
    y: 6.93,
    w: DECK_W - 1.44,
    h: 0.01,
    fill: { color: colors.line, transparency: 18 },
    line: { color: colors.line, transparency: 45 }
  });
  slide.addText("xi-ai-web", {
    x: 0.72,
    y: 7.03,
    w: 2.4,
    h: 0.18,
    fontFace: "Microsoft YaHei",
    fontSize: 8.5,
    color: "B89BA2"
  });
  slide.addText(`${index}/${total}`, {
    x: 11.76,
    y: 7.03,
    w: 0.85,
    h: 0.18,
    fontFace: "Microsoft YaHei",
    fontSize: 8.5,
    color: "B89BA2",
    align: "right"
  });
}

function addTitleSlide(pptx: PptxGenJS, deck: ParsedDeck, total: number) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFF8F9" };
  slide.addShape("roundRect", {
    x: 0.72,
    y: 0.58,
    w: 2.35,
    h: 0.38,
    fill: { color: "FFFFFF", transparency: 8 },
    line: { color: "FFFFFF", transparency: 10 },
    shadow: { type: "outer", color: colors.pink, opacity: 0.08, blur: 2, angle: 45, offset: 1 }
  });
  slide.addText("AI PPT", {
    x: 0.94,
    y: 0.69,
    w: 1.9,
    h: 0.14,
    fontFace: "Microsoft YaHei",
    fontSize: 10,
    bold: true,
    color: colors.pinkDeep,
    align: "center"
  });
  slide.addShape("rect", {
    x: 0.78,
    y: 2.05,
    w: 0.12,
    h: 2.7,
    fill: { color: colors.pink },
    line: { color: colors.pink }
  });
  slide.addText(deck.title, {
    x: 1.08,
    y: 1.85,
    w: 9.8,
    h: 1.45,
    fontFace: "Microsoft YaHei",
    fontSize: deck.title.length > 22 ? 33 : 39,
    bold: true,
    color: colors.ink,
    breakLine: false,
    fit: "shrink",
    margin: 0.03
  });
  slide.addText(deck.summary[0] || "根据生成内容自动整理的可编辑演示文稿", {
    x: 1.12,
    y: 3.55,
    w: 8.8,
    h: 0.46,
    fontFace: "Microsoft YaHei",
    fontSize: 15,
    color: colors.muted,
    fit: "shrink",
    margin: 0.02
  });
  slide.addText(`${Math.max(total - 1, 1)} content slides`, {
    x: 1.12,
    y: 4.32,
    w: 2.4,
    h: 0.28,
    fontFace: "Microsoft YaHei",
    fontSize: 11,
    bold: true,
    color: colors.pinkDeep
  });
  slide.addShape("roundRect", {
    x: 9.55,
    y: 1.28,
    w: 2.82,
    h: 4.95,
    fill: { color: "FFFFFF", transparency: 8 },
    line: { color: "FFFFFF", transparency: 8 },
    shadow: { type: "outer", color: colors.pink, opacity: 0.1, blur: 4, angle: 45, offset: 2 }
  });
  deck.summary.slice(0, 3).forEach((item, index) => {
    slide.addText(item, {
      x: 9.92,
      y: 1.75 + index * 1.2,
      w: 2.05,
      h: 0.72,
      fontFace: "Microsoft YaHei",
      fontSize: 12,
      color: index === 0 ? colors.ink : colors.muted,
      bold: index === 0,
      fit: "shrink",
      margin: 0.02
    });
  });
  addFooter(slide, 1, total);
}

function addContentSlide(pptx: PptxGenJS, item: ParsedSlide, index: number, total: number) {
  const slide = pptx.addSlide();
  slide.background = { color: colors.paper };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: DECK_W,
    h: 0.13,
    fill: { color: colors.pink },
    line: { color: colors.pink }
  });
  slide.addText(`0${index - 1}`.slice(-2), {
    x: 0.72,
    y: 0.64,
    w: 0.58,
    h: 0.22,
    fontFace: "Microsoft YaHei",
    fontSize: 10,
    bold: true,
    color: colors.pinkDeep
  });
  slide.addText(item.title, {
    x: 1.42,
    y: 0.48,
    w: 10.55,
    h: 0.58,
    fontFace: "Microsoft YaHei",
    fontSize: item.title.length > 24 ? 22 : 27,
    bold: true,
    color: colors.ink,
    fit: "shrink",
    margin: 0.02
  });
  slide.addShape("roundRect", {
    x: 0.72,
    y: 1.35,
    w: 11.9,
    h: 5.32,
    fill: { color: "FFFFFF", transparency: 4 },
    line: { color: "FFFFFF", transparency: 5 },
    shadow: { type: "outer", color: colors.pink, opacity: 0.06, blur: 3, angle: 45, offset: 1 }
  });

  let y = 1.72;
  const overflowNotes: string[] = [];
  item.points.forEach((point, pointIndex) => {
    const compact = point.length > 64;
    const rowH = compact ? 0.72 : 0.55;
    if (y + rowH > 6.35) {
      overflowNotes.push(point);
      return;
    }
    slide.addShape("roundRect", {
      x: 1.08,
      y: y + 0.08,
      w: 0.22,
      h: 0.22,
      fill: { color: pointIndex % 2 === 0 ? colors.pink : colors.pinkPale },
      line: { color: pointIndex % 2 === 0 ? colors.pink : colors.pinkPale }
    });
    slide.addText(point, {
      x: 1.48,
      y,
      w: 10.25,
      h: rowH,
      fontFace: "Microsoft YaHei",
      fontSize: compact ? 14.5 : 16,
      color: colors.ink,
      fit: "shrink",
      margin: 0.02,
      breakLine: false
    });
    y += rowH + 0.15;
  });

  const notes = unique([...item.notes, ...overflowNotes]).join("\n");
  if (notes) slide.addNotes(notes);
  addFooter(slide, index, total);
}

function safeFileName(input: string) {
  const base = stripMarkdown(input)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 56);
  return `${base || "presentation"}.pptx`;
}

export async function buildPptxFromMarkdown(markdown: string, topic?: string) {
  const deck = parsePptMarkdown(markdown, topic);
  const { default: PptxGen } = await import("pptxgenjs");
  const pptx = new PptxGen();
  const total = deck.slides.length + 1;

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "xi-ai-web";
  pptx.company = "xi-ai-web";
  pptx.subject = deck.title;
  pptx.title = deck.title;
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei"
  };

  addTitleSlide(pptx, deck, total);
  deck.slides.forEach((slide, index) => addContentSlide(pptx, slide, index + 2, total));

  return pptx;
}

export async function exportPptxFromMarkdown(markdown: string, topic?: string) {
  const deck = parsePptMarkdown(markdown, topic);
  const pptx = await buildPptxFromMarkdown(markdown, topic);
  await pptx.writeFile({
    fileName: safeFileName(deck.title),
    compression: true
  });
}
