import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultModelCatalog,
  defaultModelVendors,
  normalizeCatalogEntry,
  normalizeModelCatalog,
  reconcileModelRegistry
} from "../../server/registry/model-registry.mjs";

test("default model registry exposes stable vendors and resolved public labels", () => {
  const vendors = defaultModelVendors();
  assert.deepEqual(vendors.map((entry) => entry.id), [
    "openai",
    "anthropic",
    "gemini",
    "kimi",
    "deepseek",
    "qwen",
    "botcf",
    "openai-compatible"
  ]);
  const catalog = defaultModelCatalog();
  assert(catalog.every((entry) => entry.vendorId === entry.vendor));
  assert(catalog.every((entry) => entry.vendorLabel === vendors.find((vendor) => vendor.id === entry.vendorId)?.label));

  vendors[0].label = "changed";
  assert.equal(defaultModelVendors()[0].label, "OpenAI");
});

test("legacy models migrate to default vendor IDs without changing runtime adapters", () => {
  const registry = reconcileModelRegistry(undefined, [{
    id: "legacy-claude",
    vendor: "anthropic",
    model: "claude-test",
    label: "Legacy Claude",
    capabilities: ["chat"],
    defaultFor: [],
    enabled: true
  }], []);

  assert.equal(registry.modelVendors.find((entry) => entry.id === "anthropic")?.adapter, "anthropic");
  assert.equal(registry.modelCatalog[0].vendorId, "anthropic");
  assert.equal(registry.modelCatalog[0].vendor, "anthropic");
  assert.equal(registry.modelCatalog[0].vendorLabel, "Claude");
});

test("streaming is stripped from model capabilities and remains a chat session concern", () => {
  const legacy = normalizeCatalogEntry({
    vendor: "openai",
    model: "legacy-streaming-model",
    label: "Legacy Streaming Model",
    capabilities: ["chat", "streaming"]
  });

  assert.deepEqual(legacy.capabilities, ["chat"]);
  assert(defaultModelCatalog().every((entry) => !entry.capabilities.includes("streaming")));
});

test("explicit vendor arrays remain authoritative and custom labels resolve onto models", () => {
  const registry = reconcileModelRegistry([
    { id: "acme", label: "Acme Claude", adapter: "anthropic", enabled: true, order: 0 }
  ], [{
    id: "acme-model",
    vendorId: "acme",
    vendor: "openai",
    vendorLabel: "untrusted",
    model: "shared-name",
    label: "Acme Model",
    capabilities: ["chat"],
    defaultFor: [],
    enabled: true
  }], []);

  assert.deepEqual(registry.modelVendors.map((entry) => entry.id), ["acme"]);
  assert.equal(registry.modelCatalog[0].vendor, "anthropic");
  assert.equal(registry.modelCatalog[0].vendorLabel, "Acme Claude");
});

test("catalog deduplication is scoped by vendorId rather than adapter", () => {
  const vendors = [
    { id: "first", label: "First", adapter: "openai-compatible", enabled: true, order: 0 },
    { id: "second", label: "Second", adapter: "openai-compatible", enabled: true, order: 1 }
  ];
  const catalog = normalizeModelCatalog([
    { id: "first-shared", vendorId: "first", vendor: "openai", model: "shared", label: "First Shared", capabilities: ["chat"], defaultFor: [], enabled: true },
    { id: "second-shared", vendorId: "second", vendor: "anthropic", model: "shared", label: "Second Shared", capabilities: ["chat"], defaultFor: [], enabled: true }
  ], [], vendors);

  assert.equal(catalog.length, 2);
  assert(catalog.every((entry) => entry.vendor === "openai-compatible"));
  const firstDerived = normalizeCatalogEntry({ vendorId: "first", vendor: "openai-compatible", model: "shared", label: "First", capabilities: ["chat"] });
  const secondDerived = normalizeCatalogEntry({ vendorId: "second", vendor: "openai-compatible", model: "shared", label: "Second", capabilities: ["chat"] });
  assert.notEqual(firstDerived.id, secondDerived.id);
});

test("catalog duplicate IDs advance past an occupied generated suffix", () => {
  const catalog = normalizeModelCatalog([
    { id: "x", vendorId: "openai", vendor: "openai", model: "model-a", label: "Model A", capabilities: ["chat"] },
    { id: "x-3", vendorId: "openai", vendor: "openai", model: "model-b", label: "Model B", capabilities: ["chat"] },
    { id: "x", vendorId: "openai", vendor: "openai", model: "model-c", label: "Model C", capabilities: ["chat"] }
  ], []);

  assert.deepEqual(catalog.map((entry) => entry.id), ["x", "x-3", "x-4"]);
});

test("legacy catalog order is backfilled and explicit order is normalized", () => {
  const legacy = normalizeModelCatalog([
    { id: "legacy-a", vendor: "openai", model: "a", label: "A", capabilities: ["chat"] },
    { id: "legacy-b", vendor: "openai", model: "b", label: "B", capabilities: ["chat"] }
  ], []);
  assert.deepEqual(legacy.map((entry) => [entry.id, entry.order]), [
    ["legacy-a", 0],
    ["legacy-b", 1]
  ]);

  const reordered = normalizeModelCatalog([
    { id: "ordered-a", vendor: "openai", model: "a", label: "A", capabilities: ["chat"], order: 20 },
    { id: "ordered-b", vendor: "openai", model: "b", label: "B", capabilities: ["chat"], order: 10 }
  ], []);
  assert.deepEqual(reordered.map((entry) => [entry.id, entry.order]), [
    ["ordered-b", 0],
    ["ordered-a", 1]
  ]);
});
