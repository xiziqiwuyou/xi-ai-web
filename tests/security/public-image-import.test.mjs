import assert from "node:assert/strict";
import test from "node:test";

import { importPublicImageAsset } from "../../server/public-image-import.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const allowUrl = async (value) => String(value);

test("public image importer returns a bounded detected image data URL", async () => {
  let requestOptions;
  const result = await importPublicImageAsset("https://images.example.test/result.png", {
    validateUrl: allowUrl,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return new Response(png, { status: 200, headers: { "content-type": "application/octet-stream" } });
    }
  });

  assert.equal(requestOptions.redirect, "error");
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.dataUrl, `data:image/png;base64,${png.toString("base64")}`);
});

test("public image importer rejects unsupported and oversized responses", async () => {
  await assert.rejects(
    importPublicImageAsset("https://images.example.test/redirect.png", {
      validateUrl: allowUrl,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://other.example.test/image.png" } })
    }),
    /不允许重定向/u
  );

  await assert.rejects(
    importPublicImageAsset("https://images.example.test/not-image", {
      validateUrl: allowUrl,
      fetchImpl: async () => new Response("not an image", { status: 200 })
    }),
    /不是受支持图片/u
  );

  await assert.rejects(
    importPublicImageAsset("https://images.example.test/large.png", {
      validateUrl: allowUrl,
      maxBytes: 16,
      fetchImpl: async () => new Response(png, {
        status: 200,
        headers: { "content-length": String(png.length) }
      })
    }),
    /超过允许大小/u
  );
});

test("public image importer keeps public HTTPS validation mandatory", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    importPublicImageAsset("https://127.0.0.1/private.png", {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(png, { status: 200 });
      }
    }),
    /restricted/u
  );
  assert.equal(fetchCalls, 0);
});
