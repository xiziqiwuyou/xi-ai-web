import crypto from "node:crypto";

function text(value, maxLength, fallback = "") {
  const candidate = String(value ?? fallback).trim();
  return candidate.slice(0, maxLength);
}

function orderValue(value, fallback = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(10000, Math.trunc(parsed))) : fallback;
}

function tagsValue(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 32)).filter(Boolean))].slice(0, 6);
}

function workflowId(value, fallback = "") {
  const candidate = text(value, 120, fallback);
  if (!candidate) return `langflow-${crypto.randomUUID()}`;
  return candidate.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function normalizeLangflowWorkflow(value, existing = null, { touch = Boolean(existing) } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const now = new Date().toISOString();
  const flowId = text(source.flowId, 180, existing?.flowId);
  const name = text(source.name, 80, existing?.name);
  if (!flowId) throw new Error("Langflow Flow ID 不能为空");
  if (!name) throw new Error("工作流名称不能为空");

  return {
    id: workflowId(existing?.id || source.id),
    flowId,
    name,
    description: text(source.description, 360, existing?.description),
    welcomeMessage: text(source.welcomeMessage, 1200, existing?.welcomeMessage),
    inputPlaceholder: text(source.inputPlaceholder, 160, existing?.inputPlaceholder),
    tags: tagsValue(source.tags ?? existing?.tags),
    enabled: typeof source.enabled === "boolean" ? source.enabled : existing?.enabled !== false,
    order: orderValue(source.order, existing?.order ?? 100),
    createdAt: existing?.createdAt || text(source.createdAt, 40, now),
    updatedAt: touch ? now : text(source.updatedAt, 40, now)
  };
}

export function normalizeLangflowWorkflows(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  const seenIds = new Set();
  const seenFlows = new Set();
  const workflows = [];
  for (const item of source) {
    try {
      const workflow = normalizeLangflowWorkflow(item);
      if (seenIds.has(workflow.id) || seenFlows.has(workflow.flowId)) continue;
      seenIds.add(workflow.id);
      seenFlows.add(workflow.flowId);
      workflows.push(workflow);
    } catch {
      // Invalid legacy rows are ignored during non-destructive normalization.
    }
  }
  return workflows.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function publicLangflowWorkflows(value) {
  return normalizeLangflowWorkflows(value)
    .filter((workflow) => workflow.enabled)
    .map(({ flowId, createdAt, updatedAt, ...workflow }) => workflow);
}
