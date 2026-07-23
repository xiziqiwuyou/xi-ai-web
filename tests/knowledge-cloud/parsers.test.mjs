import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yazl from "yazl";
import { parseKnowledgeDocument } from "../../server/knowledge-cloud/parsers/index.mjs";
import { runKnowledgeParserIsolated } from "../../server/knowledge-cloud/parsers/isolated.mjs";
import { resolveKnowledgeParserLimits } from "../../server/knowledge-cloud/parsers/limits.mjs";

const limits = resolveKnowledgeParserLimits({
  maxSourceBytes: 2 * 1024 * 1024,
  maxNormalizedBytes: 4 * 1024 * 1024,
  maxZipEntryBytes: 2 * 1024 * 1024,
  maxZipUncompressedBytes: 8 * 1024 * 1024,
  parseTimeoutMs: 10_000
});

async function withTempFile(name, content, work) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xi-ai-parser-test-"));
  const filePath = path.join(directory, name);
  try {
    await fs.writeFile(filePath, content);
    return await work(filePath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function zipBuffer(entries, options = {}) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks = [];
    zip.outputStream.on("data", (chunk) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
    for (const [name, content] of Object.entries(entries)) {
      zip.addBuffer(Buffer.from(content), name, { compress: options.compress !== false });
    }
    zip.end();
  });
}

function pdfBuffer(text = "Hello PDF") {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n`;
  source += "0000000000 65535 f \n";
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source, "binary");
}

function markZipEntriesEncrypted(source) {
  const buffer = Buffer.from(source);
  for (let offset = 0; offset <= buffer.length - 10; offset += 1) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) buffer.writeUInt16LE(buffer.readUInt16LE(offset + 6) | 1, offset + 6);
    if (signature === 0x02014b50) buffer.writeUInt16LE(buffer.readUInt16LE(offset + 8) | 1, offset + 8);
  }
  return buffer;
}

test("plain text, Markdown, CSV, JSON and HTML preserve bounded source locators", async () => {
  const cases = [
    {
      name: "notes.txt",
      mime: "text/plain",
      content: "first line\nsecond line",
      locator: "text_lines",
      expected: "second line"
    },
    {
      name: "guide.md",
      mime: "text/markdown",
      content: "# Setup\n\nInstall the package.",
      locator: "markdown_lines",
      expected: "Install the package"
    },
    {
      name: "items.csv",
      mime: "text/csv",
      content: "name,price\nPen,3",
      locator: "csv_rows",
      expected: "name: Pen"
    },
    {
      name: "config.json",
      mime: "application/json",
      content: JSON.stringify({ service: { enabled: true } }),
      locator: "json_path",
      expected: "$.service.enabled"
    },
    {
      name: "page.html",
      mime: "text/html",
      content: "<h1>Title</h1><script>steal()</script><p>Safe body</p>",
      locator: "html_block",
      expected: "Safe body"
    }
  ];
  for (const fixture of cases) {
    await withTempFile(fixture.name, fixture.content, async (filePath) => {
      const result = await parseKnowledgeDocument({
        filePath,
        displayName: fixture.name,
        declaredMimeType: fixture.mime,
        limits
      });
      assert.equal(result.needsOcr, false);
      assert.ok(result.blocks.some((block) => block.locator.type === fixture.locator));
      assert.match(result.blocks.map((block) => block.text).join("\n"), new RegExp(fixture.expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(result.blocks.map((block) => block.text).join("\n"), /steal\(\)/);
    });
  }
});

test("PDF parsing preserves pages and marks an image-only page for OCR", async () => {
  await withTempFile("guide.pdf", pdfBuffer(), async (filePath) => {
    const result = await parseKnowledgeDocument({
      filePath,
      displayName: "guide.pdf",
      declaredMimeType: "application/pdf",
      limits
    });
    assert.equal(result.blocks[0].locator.type, "pdf_page");
    assert.equal(result.blocks[0].locator.page, 1);
    assert.match(result.blocks[0].text, /Hello PDF/);
  });
  await withTempFile("scan.pdf", pdfBuffer(""), async (filePath) => {
    const result = await parseKnowledgeDocument({
      filePath,
      displayName: "scan.pdf",
      declaredMimeType: "application/pdf",
      limits
    });
    assert.equal(result.needsOcr, true);
    assert.deepEqual(result.blocks, []);
  });
});

test("the isolated parser worker returns structured results and enforces a hard timeout", async () => {
  await withTempFile("isolated.txt", "isolated body", async (filePath) => {
    const input = {
      filePath,
      displayName: "isolated.txt",
      declaredMimeType: "text/plain",
      limits
    };
    const result = await runKnowledgeParserIsolated(input, { timeoutMs: 10_000 });
    assert.equal(result.blocks[0].locator.type, "text_lines");
    await assert.rejects(
      runKnowledgeParserIsolated(input, { timeoutMs: 1 }),
      (error) => error.code === "KB_PARSER_TIMEOUT"
    );
  });
});

test("DOCX, PPTX and XLSX parsing preserves paragraph, slide and cell-range locators", async () => {
  const docx = await zipBuffer({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document xmlns:w=\"w\"><w:body><w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Chapter</w:t></w:r></w:p><w:p><w:r><w:t>Body text</w:t></w:r></w:p></w:body></w:document>"
  });
  const pptx = await zipBuffer({
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
  });
  const xlsx = await zipBuffer({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": "<workbook xmlns:r=\"r\"><sheets><sheet name=\"Data\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    "xl/_rels/workbook.xml.rels": "<Relationships><Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
    "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><t>Xi</t></si></sst>",
    "xl/worksheets/sheet1.xml": "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row></sheetData></worksheet>"
  });
  for (const fixture of [
    ["guide.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx, "docx_paragraph", "Body text"],
    ["deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptx, "pptx_slide", "Slide text"],
    ["data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx, "xlsx_range", "B1: Xi"]
  ]) {
    await withTempFile(fixture[0], fixture[2], async (filePath) => {
      const result = await parseKnowledgeDocument({
        filePath,
        displayName: fixture[0],
        declaredMimeType: fixture[1],
        limits
      });
      assert.ok(result.blocks.some((block) => block.locator.type === fixture[3]));
      assert.match(result.blocks.map((block) => block.text).join("\n"), new RegExp(fixture[4]));
    });
  }
});

test("malformed, empty, disguised and compressed-bomb inputs fail with stable parser codes", async () => {
  await withTempFile("bad.json", "{", async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({ filePath, displayName: "bad.json", declaredMimeType: "application/json", limits }),
      (error) => error.code === "KB_PARSER_MALFORMED"
    );
  });
  await withTempFile("empty.txt", "", async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({ filePath, displayName: "empty.txt", declaredMimeType: "text/plain", limits }),
      (error) => error.code === "KB_PARSER_EMPTY"
    );
  });
  await withTempFile("fake.txt", Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({ filePath, displayName: "fake.txt", declaredMimeType: "text/plain", limits }),
      (error) => error.code === "KB_PARSER_TYPE_MISMATCH"
    );
  });
  await withTempFile("deep.html", `${"<div>".repeat(24)}text${"</div>".repeat(24)}`, async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({
        filePath,
        displayName: "deep.html",
        declaredMimeType: "text/html",
        limits: resolveKnowledgeParserLimits({ ...limits, maxHtmlDepth: 16 })
      }),
      (error) => error.code === "KB_PARSER_RESOURCE_LIMIT"
    );
  });
  await withTempFile("oversized.txt", "12345", async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({
        filePath,
        displayName: "oversized.txt",
        declaredMimeType: "text/plain",
        limits: resolveKnowledgeParserLimits({ ...limits, maxSourceBytes: 4 })
      }),
      (error) => error.code === "KB_PARSER_RESOURCE_LIMIT"
    );
  });
  const encrypted = markZipEntriesEncrypted(await zipBuffer({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document xmlns:w=\"w\"><w:body><w:p><w:r><w:t>Secret</w:t></w:r></w:p></w:body></w:document>"
  }));
  await withTempFile("encrypted.docx", encrypted, async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({
        filePath,
        displayName: "encrypted.docx",
        declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        limits
      }),
      (error) => error.code === "KB_PARSER_ENCRYPTED"
    );
  });
  const bomb = await zipBuffer({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<w:document xmlns:w=\"w\"><w:body><w:p><w:r><w:t>${"A".repeat(100_000)}</w:t></w:r></w:p></w:body></w:document>`
  });
  await withTempFile("bomb.docx", bomb, async (filePath) => {
    await assert.rejects(
      parseKnowledgeDocument({
        filePath,
        displayName: "bomb.docx",
        declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        limits: resolveKnowledgeParserLimits({ ...limits, maxZipCompressionRatio: 2 })
      }),
      (error) => error.code === "KB_PARSER_RESOURCE_LIMIT"
    );
  });
});
