import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOptimizedImagePrompt } from "../../server/image-prompt.mjs";

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
