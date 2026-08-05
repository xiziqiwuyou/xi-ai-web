import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT,
  imagePromptOptimizationMessages,
  normalizeOptimizedImagePrompt
} from "../../server/image-prompt.mjs";

test("image prompt optimization uses an image-specific, parameter-isolated instruction", () => {
  const source = "一位穿白色礼服的女孩站在雨夜街头，保留霓虹招牌上的中文文字";
  const messages = imagePromptOptimizationMessages(source);

  assert.equal(messages[0].role, "system");
  assert.equal(messages[0].content, IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /主体|构图|镜头|光线|材质/u);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /图生图/u);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /--ar|尺寸|质量|数量/u);
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, new RegExp(source));
  assert.match(messages[1].content, /原始画面描述/u);
});

test("optimized image prompts remove transport wrappers without changing prompt content", () => {
  assert.equal(
    normalizeOptimizedImagePrompt("```text\n电影感产品摄影，柔和侧光\n```"),
    "电影感产品摄影，柔和侧光"
  );
  assert.equal(
    normalizeOptimizedImagePrompt("“未来城市夜景，蓝色霓虹”"),
    "未来城市夜景，蓝色霓虹"
  );
});

test("optimized image prompts reject empty and HTML landing-page responses", () => {
  assert.throws(() => normalizeOptimizedImagePrompt("   "), /未返回可用/u);
  assert.throws(
    () => normalizeOptimizedImagePrompt("<!doctype html><html lang=\"zh-cn\"><head></head></html>"),
    /HTML 页面/u
  );
  assert.throws(
    () => normalizeOptimizedImagePrompt("\"```html\n<html><body>Gateway</body></html>\n```\""),
    /HTML 页面/u
  );
});
