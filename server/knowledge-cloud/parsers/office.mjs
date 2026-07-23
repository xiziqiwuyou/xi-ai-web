import path from "node:path";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { inspectOfficeArchive, officeArchiveType } from "./archive.mjs";
import { parserError, parserLimit } from "./parser-error.mjs";
import { normalizeExtractedText, requireMeaningfulBlocks } from "./text-utils.mjs";
import { parseBoundedXml, xmlAttribute } from "./xml.mjs";

const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/i;
const SHEET_ENTRY_PATTERN = /^xl\/worksheets\/sheet\d+\.xml$/i;

function tagName(tag) {
  return String(tag?.name || "").toLowerCase();
}

function parseDocx(entries, limits) {
  const source = entries.get("word/document.xml");
  if (!source) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "DOCX 缺少正文 XML");
  }
  const blocks = [];
  const headingPath = [];
  let paragraph = 0;
  let paragraphText = "";
  let paragraphStyle = "";
  let inParagraph = false;
  let textDepth = 0;
  parseBoundedXml(source, limits, {
    openTag(tag) {
      const name = tagName(tag);
      if (name === "w:p") {
        inParagraph = true;
        paragraphText = "";
        paragraphStyle = "";
      } else if (inParagraph && name === "w:pstyle") {
        paragraphStyle = xmlAttribute(tag, ["w:val", "val"]) || "";
      } else if (inParagraph && name === "w:t") {
        textDepth += 1;
      } else if (inParagraph && name === "w:tab") {
        paragraphText += "\t";
      } else if (inParagraph && (name === "w:br" || name === "w:cr")) {
        paragraphText += "\n";
      }
    },
    text(text) {
      if (inParagraph && textDepth > 0) paragraphText += text;
    },
    closeTag(tag) {
      const name = tagName(tag);
      if (name === "w:t") {
        textDepth = Math.max(0, textDepth - 1);
      } else if (name === "w:p") {
        paragraph += 1;
        const text = normalizeExtractedText(paragraphText);
        const headingMatch = /heading\s*([1-9])/i.exec(paragraphStyle);
        if (headingMatch && text) {
          const level = Number(headingMatch[1]);
          headingPath.splice(level - 1);
          headingPath[level - 1] = text.slice(0, 240);
        }
        if (text) {
          blocks.push({
            text,
            locator: {
              type: "docx_paragraph",
              paragraph,
              ...(headingPath.length ? { headingPath: headingPath.filter(Boolean) } : {})
            }
          });
        }
        inParagraph = false;
        textDepth = 0;
      }
    }
  });
  return requireMeaningfulBlocks(blocks);
}

function parsePptx(entries, limits) {
  const slides = [...entries.entries()]
    .map(([name, source]) => ({ match: SLIDE_ENTRY_PATTERN.exec(name), source }))
    .filter((entry) => entry.match)
    .map((entry) => ({ slide: Number(entry.match[1]), source: entry.source }))
    .sort((left, right) => left.slide - right.slide);
  if (!slides.length) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "PPTX 缺少幻灯片 XML");
  }
  if (slides.length > limits.maxSlides) {
    throw parserLimit("maxSlides", { actual: slides.length, max: limits.maxSlides });
  }
  const blocks = [];
  for (const { slide, source } of slides) {
    let shape = 0;
    let inShape = false;
    let textDepth = 0;
    let shapeText = "";
    parseBoundedXml(source, limits, {
      openTag(tag) {
        const name = tagName(tag);
        if (name === "p:sp") {
          inShape = true;
          shape += 1;
          shapeText = "";
        } else if (inShape && name === "a:t") {
          textDepth += 1;
        } else if (inShape && name === "a:br") {
          shapeText += "\n";
        }
      },
      text(text) {
        if (inShape && textDepth > 0) shapeText += text;
      },
      closeTag(tag) {
        const name = tagName(tag);
        if (name === "a:t") {
          textDepth = Math.max(0, textDepth - 1);
        } else if (name === "p:sp") {
          const text = normalizeExtractedText(shapeText);
          if (text) {
            blocks.push({
              text,
              locator: { type: "pptx_slide", slide, shape }
            });
          }
          inShape = false;
          textDepth = 0;
        }
      }
    });
  }
  return requireMeaningfulBlocks(blocks);
}

function parseSharedStrings(source, limits) {
  if (!source) return [];
  const values = [];
  let inItem = false;
  let textDepth = 0;
  let value = "";
  parseBoundedXml(source, limits, {
    openTag(tag) {
      const name = tagName(tag);
      if (name === "si") {
        inItem = true;
        value = "";
      } else if (inItem && name === "t") {
        textDepth += 1;
      }
    },
    text(text) {
      if (inItem && textDepth > 0) value += text;
    },
    closeTag(tag) {
      const name = tagName(tag);
      if (name === "t") textDepth = Math.max(0, textDepth - 1);
      if (name === "si") {
        values.push(normalizeExtractedText(value));
        inItem = false;
      }
    }
  });
  return values;
}

function parseWorkbookSheets(entries, limits) {
  const workbook = entries.get("xl/workbook.xml");
  if (!workbook) return [];
  const sheetDefinitions = [];
  parseBoundedXml(workbook, limits, {
    openTag(tag) {
      if (tagName(tag) !== "sheet") return;
      sheetDefinitions.push({
        name: (xmlAttribute(tag, ["name"]) || `Sheet ${sheetDefinitions.length + 1}`).slice(0, 240),
        relationId: xmlAttribute(tag, ["r:id", "id"]),
        sheetId: xmlAttribute(tag, ["sheetId", "sheetid"])
      });
    }
  });

  const relations = new Map();
  const relationSource = entries.get("xl/_rels/workbook.xml.rels");
  if (relationSource) {
    parseBoundedXml(relationSource, limits, {
      openTag(tag) {
        if (tagName(tag) !== "relationship") return;
        const id = xmlAttribute(tag, ["Id", "id"]);
        const target = xmlAttribute(tag, ["Target", "target"]);
        const targetMode = xmlAttribute(tag, ["TargetMode", "targetmode"]);
        if (!id || !target || String(targetMode || "").toLowerCase() === "external") return;
        const normalized = path.posix.normalize(path.posix.join("xl", target.replace(/^\/+/, "")));
        if (!normalized.startsWith("xl/worksheets/") || normalized.includes("../")) return;
        relations.set(id, normalized);
      }
    });
  }

  const fallbackEntries = [...entries.keys()]
    .filter((name) => SHEET_ENTRY_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  return sheetDefinitions.map((sheet, index) => ({
    name: sheet.name,
    entryName: relations.get(sheet.relationId) || fallbackEntries[index] || null
  })).filter((sheet) => sheet.entryName && entries.has(sheet.entryName));
}

function spreadsheetCellText(type, rawValue, inlineText, sharedStrings) {
  const value = type === "inlineStr" ? inlineText : rawValue;
  if (value === null || value === undefined || value === "") return "";
  if (type === "s") {
    const index = Number(value);
    return Number.isSafeInteger(index) && index >= 0 ? sharedStrings[index] || "" : "";
  }
  if (type === "b") return String(value) === "1" ? "TRUE" : "FALSE";
  if (type === "e") return `[${String(value).slice(0, 40)}]`;
  return normalizeExtractedText(value);
}

function parseWorksheet(source, sheetName, sharedStrings, limits, counters) {
  const blocks = [];
  let currentRow = null;
  let currentCell = null;
  let valueDepth = 0;
  let inlineTextDepth = 0;
  let rawValue = "";
  let inlineText = "";
  parseBoundedXml(source, limits, {
    openTag(tag) {
      const name = tagName(tag);
      if (name === "row") {
        const rowNumber = Number(xmlAttribute(tag, ["r"])) || counters.rows + 1;
        currentRow = { number: rowNumber, cells: [] };
        counters.rows += 1;
        if (counters.rows > limits.maxSpreadsheetRows) {
          throw parserLimit("maxSpreadsheetRows", {
            actual: counters.rows,
            max: limits.maxSpreadsheetRows
          });
        }
      } else if (name === "c" && currentRow) {
        currentCell = {
          address: (xmlAttribute(tag, ["r"]) || "").toUpperCase(),
          type: xmlAttribute(tag, ["t"]) || "n"
        };
        rawValue = "";
        inlineText = "";
        counters.cells += 1;
        if (counters.cells > limits.maxSpreadsheetCells) {
          throw parserLimit("maxSpreadsheetCells", {
            actual: counters.cells,
            max: limits.maxSpreadsheetCells
          });
        }
      } else if (currentCell && name === "v") {
        valueDepth += 1;
      } else if (currentCell && name === "t") {
        inlineTextDepth += 1;
      }
    },
    text(text) {
      if (valueDepth > 0) rawValue += text;
      if (inlineTextDepth > 0) inlineText += text;
    },
    closeTag(tag) {
      const name = tagName(tag);
      if (name === "v") valueDepth = Math.max(0, valueDepth - 1);
      if (name === "t") inlineTextDepth = Math.max(0, inlineTextDepth - 1);
      if (name === "c" && currentCell && currentRow) {
        const text = spreadsheetCellText(currentCell.type, rawValue, inlineText, sharedStrings);
        if (/^[A-Z]{1,4}[1-9]\d*$/.test(currentCell.address) && text) {
          currentRow.cells.push({ address: currentCell.address, text });
        }
        currentCell = null;
        valueDepth = 0;
        inlineTextDepth = 0;
      } else if (name === "row" && currentRow) {
        if (currentRow.cells.length) {
          const first = currentRow.cells[0].address;
          const last = currentRow.cells.at(-1).address;
          blocks.push({
            text: currentRow.cells.map((cell) => `${cell.address}: ${cell.text}`).join(" | "),
            locator: {
              type: "xlsx_range",
              sheet: sheetName,
              range: first === last ? first : `${first}:${last}`,
              rowStart: currentRow.number,
              rowEnd: currentRow.number
            }
          });
        }
        currentRow = null;
      }
    }
  });
  return blocks;
}

function parseXlsx(entries, limits) {
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"), limits);
  const sheets = parseWorkbookSheets(entries, limits);
  if (!sheets.length) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED, "XLSX 缺少工作表 XML");
  }
  const counters = { rows: 0, cells: 0 };
  const blocks = sheets.flatMap((sheet) =>
    parseWorksheet(entries.get(sheet.entryName), sheet.name, sharedStrings, limits, counters)
  );
  return requireMeaningfulBlocks(blocks);
}

export async function parseOfficeDocument(filePath, expectedType, limits) {
  const archive = await inspectOfficeArchive(filePath, limits);
  const actualType = officeArchiveType(archive.entries);
  if (!actualType || actualType !== expectedType) {
    throw parserError(KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH, "Office 文件类型与扩展名不一致", {
      details: { expectedType, actualType }
    });
  }
  if (actualType === "docx") return parseDocx(archive.entries, limits);
  if (actualType === "pptx") return parsePptx(archive.entries, limits);
  return parseXlsx(archive.entries, limits);
}
