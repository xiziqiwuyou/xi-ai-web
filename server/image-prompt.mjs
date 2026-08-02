import { isHtmlDocument } from "./providers/types.mjs";

export function normalizeOptimizedImagePrompt(value, maxLength = 32_000) {
  let prompt = String(value || "").trim();
  const quotePairs = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    const wrappingQuote = quotePairs.find(([start, end]) => prompt.startsWith(start) && prompt.endsWith(end));
    if (wrappingQuote && prompt.length > 1) {
      prompt = prompt.slice(1, -1).trim();
      changed = true;
    }
    const fenced = prompt.match(/^```(?:[a-z0-9_-]+)?\s*\r?\n?([\s\S]*?)\r?\n?```$/iu);
    if (fenced) {
      prompt = fenced[1].trim();
      changed = true;
    }
    if (!changed) break;
  }
  if (!prompt) throw new Error("模型未返回可用的优化提示词");
  if (isHtmlDocument(prompt)) {
    throw new Error("上游 API 返回了 HTML 页面，提示词优化未完成。请检查后台统一上游 API 域名配置");
  }
  return prompt.length > maxLength ? prompt.slice(0, maxLength) : prompt;
}
