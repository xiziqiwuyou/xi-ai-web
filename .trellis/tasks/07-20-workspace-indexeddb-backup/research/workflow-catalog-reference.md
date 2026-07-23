# Research: workflow-catalog-reference

- Query: Research the official GitHub repositories FastGPT, Dify, Flowise, Langflow, and Coze Studio for workflow catalog UX, node categories, graph/port models, validation, and preset/template patterns; recommend safe first-wave nodes for this browser-local BYOK app.
- Scope: mixed (official external source review plus local task/spec alignment)
- Date: 2026-07-21

## Executive Summary / 核心结论

- 中文：五个官方仓库都采用“分类/搜索节点目录 + 显式节点与连线模型 + 保存/运行前校验 + 图快照模板”的组合。对本项目最值得复用的是目录分组、稳定端口、节点级错误定位和模板克隆；不应照搬它们的服务端执行能力。
- English: All five official repositories converge on categorized/searchable node catalogs, explicit node/edge models, pre-save or pre-run validation, and graph-snapshot templates. Reuse the catalog, stable-port, error-localization, and clone-on-apply patterns, not their server execution surface.
- 中文：第一波节点应固定为 `Start`、`Agent`、`Text Template`、`Local Knowledge Retrieval`、`Reply`。HTTP、代码、MCP/插件、外部写入、触发器，以及循环/并行/子工作流等复杂控制流应继续暂缓。
- English: Keep the first wave to `Start`, `Agent`, `Text Template`, `Local Knowledge Retrieval`, and `Reply`. Defer HTTP, code, MCP/plugins, external writes, triggers, and complex control flow such as loops, parallelism, and subworkflows.

## Local Baseline / 本项目边界

- The task requires a browser-orchestrated, single-threaded graph with local agents and declarative Skills; no arbitrary JavaScript, shell, HTTP, loops, parallelism, MCP, or server-side private workflow persistence: `.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md:17-33`.
- R11 explicitly adds a two-level saved-workflow catalog and the safe `Text Template` and `Local Knowledge Retrieval` nodes: `.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md:43-49`.
- The design fixes the safe runtime contract: only `{{task}}` / `{{input}}` templates, selected IndexedDB document IDs, bounded lexical retrieval, and optional `output` / `input` handles: `.trellis/tasks/07-20-workspace-indexeddb-backup/design.md:90-113`.
- Current graph persistence is a versioned `{ nodes, edges, viewport }` projection with explicit `output` / `input` handles: `src/types.ts:405-442`; validation rejects malformed topology and stale agent/document references before execution: `src/features/automation/workflowGraph.ts:159-300`.
- Current safe local execution is deliberately bounded: template replacement is capped, and knowledge retrieval reads only selected local chunks with `topK` clamped to `1..12`: `src/features/automation/workflowRuntime.ts:3-84`.
- BYOK remains session-only: `src/features/settings/userProviderConfig.ts:43-61`. Do not copy connection data, run output, or transient state into graph/archive records.

## External References / 官方仓库快照

All references below are official repositories, pinned to the `main` commit inspected on 2026-07-21 so line links remain reproducible.

| Repository | Pinned source snapshot |
| --- | --- |
| FastGPT | [labring/FastGPT @ df6dc47](https://github.com/labring/FastGPT/tree/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d) |
| Dify | [langgenius/dify @ 7da6b2c](https://github.com/langgenius/dify/tree/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846) |
| Flowise | [FlowiseAI/Flowise @ ed9e100](https://github.com/FlowiseAI/Flowise/tree/ed9e100fb71643cd3922b005908f9732bc0e07dc) |
| Langflow | [langflow-ai/langflow @ 54281f7](https://github.com/langflow-ai/langflow/tree/54281f7cef4f57de25ab0c0a69f6402f6236fbbc) |
| Coze Studio | [coze-dev/coze-studio @ 22275b1](https://github.com/coze-dev/coze-studio/tree/22275b1c2661d35344a7493cffe401e8cc61cf8e) |

## Findings / 证据

### FastGPT

- Files found: [Node palette header](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/header.tsx#L17-L159) exposes four catalog tabs: Basic Nodes, System Tools, My Tools, and Agent, with search where remote catalogs need it.
- Files found: [node category list](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/packages/web/core/workflow/constants.ts#L6-L29) groups basic nodes as system input, AI, interactive, tools, and other; [node enum](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/packages/global/core/workflow/node/constant.ts#L128-L174) shows why its catalog is much broader than a local-only app.
- Files found: [node schema](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/packages/global/core/workflow/type/node.ts#L149-L224) and [edge schema](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/packages/global/core/workflow/type/edge.ts#L3-L22) model positioned nodes with input/output schema plus `sourceHandle` and `targetHandle`; runtime edges retain `waiting`, `active`, and `skipped` state.
- Files found: [workflow check](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/projects/app/src/web/core/workflow/workflowCheck.ts#L327-L380) builds node/edge/reachability indexes, and its pre-run scan returns node-addressable errors before run/publish: [L792-L866](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/projects/app/src/web/core/workflow/workflowCheck.ts#L792-L866).
- Files found: [system node templates](https://github.com/labring/FastGPT/blob/df6dc47d6e467c2c0a83ee38ede818eea31e3d1d/packages/global/core/workflow/template/constants.ts#L44-L100) are typed node snapshots rather than executable uploaded code.

### Dify

- Files found: [tabbed block selector](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/block-selector/hooks.ts#L18-L114) and [panel implementation](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/block-selector/tabs.tsx#L90-L218) separate Blocks, Sources, Tools, Start, and Snippets, with disabled-state rules for mutually exclusive entry nodes.
- Files found: [block catalog](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/block-selector/constants.tsx#L35-L160) shows categories spanning Agent/LLM/RAG/control/code/HTTP; use it as a taxonomy reference, not as a local runtime backlog.
- Files found: [graph types](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/types.ts#L77-L145) store React Flow nodes, edges, and handle state; [node handles](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/nodes/_base/components/node-handle.tsx#L37-L127) make source/target insertion context-sensitive.
- Files found: [pre-publish checklist](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/hooks/use-checklist.ts#L286-L423) validates node configuration, variable references, connectivity, required nodes, and plugin availability. It deliberately supports loops/iteration, so it is not a simple DAG-only model.
- Files found: [snippet insertion](https://github.com/langgenius/dify/blob/7da6b2ce36f9e2aac5a21ca942006f8fa4e09846/web/app/components/workflow/block-selector/snippets/use-insert-snippet.ts#L85-L168) remaps node IDs, offsets positions, and rewrites edge endpoints before inserting a reusable subgraph.

### Flowise

- Files found: [Add Nodes drawer](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/features/node-palette/AddNodesDrawer.tsx#L43-L130) uses debounced search, category grouping, and collapsed accordions; its visible list is rendered by category at [L263-L291](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/features/node-palette/AddNodesDrawer.tsx#L263-L291).
- Files found: [AgentFlow default nodes](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/core/node-config/nodeIcons.ts#L118-L134) includes Start, LLM, Agent, condition, human input, loop, reply, custom function, tool, retriever, HTTP, iteration, and execute-flow. This is a useful explicit allowlist pattern, even though most entries are out of scope here.
- Files found: [flow type](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/core/types/flow.ts#L13-L42) persists node positions, edge endpoints, optional handles, and viewport; [node schema](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/core/types/node.ts#L11-L82) separates catalog metadata from user-entered inputs and anchors.
- Files found: [connection validation](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/core/validation/connectionValidation.ts#L6-L60) rejects self-links and cycle-creating edges; [flow validation](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/agentflow/src/core/validation/flowValidation.ts#L12-L80) checks one Start, disconnected nodes, cycles, required inputs, and hanging edges.
- Files found: [Marketplace](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/ui/src/views/marketplaces/index.jsx#L266-L347) filters templates by type, tags, framework, use case, and text; [read-only preview/copy](https://github.com/FlowiseAI/Flowise/blob/ed9e100fb71643cd3922b005908f9732bc0e07dc/packages/ui/src/views/marketplaces/MarketplaceCanvas.jsx#L46-L60) loads the template graph and copies it to a new canvas.

### Langflow

- Files found: [flow sidebar](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/pages/FlowPage/components/flowSidebarComponent/index.tsx#L250-L396) combines debounced fuzzy/traditional search with category, edge, beta, and legacy filters; [category registry](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/utils/styleUtils.ts#L314-L417) distinguishes core categories from extension bundles.
- Files found: [flow types](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/types/flow/index.ts#L1-L16) and [typed edge handles](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/types/flow/index.ts#L79-L120) carry output types, target input types, field names, and optional proxy metadata.
- Files found: [connection validator](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/utils/reactflowUtils.ts#L385-L510) checks self-links, type compatibility, target capacity, and cycles, but permits loops only through specialized loop inputs. This is direct evidence to defer loops until explicit branch/iteration semantics exist.
- Files found: [starter-template application](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/frontend/src/components/core/flowBuilderWelcome/hooks/use-apply-template-to-current-flow.ts#L12-L68) replaces a blank flow with template nodes/edges and fits the viewport; [starter loader](https://github.com/langflow-ai/langflow/blob/54281f7cef4f57de25ab0c0a69f6402f6236fbbc/src/backend/base/langflow/initial_setup/load.py#L10-L21) supplies built-in starter graphs.

### Coze Studio

- Files found: [node list](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/playground/src/components/node-panel/components/list.tsx#L79-L201) renders atom categories, favorite plugins, and search results; [search hook](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/playground/src/components/node-panel/hooks/use-search-node.ts#L57-L181) merges local-category and backend result sets.
- Files found: [standard node taxonomy](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/base/src/types/node-type.ts#L20-L107) includes LLM, API, code, dataset, subworkflow, database, text, loop, batch, and HTTP. It confirms which capabilities require privileged/server-backed handling.
- Files found: [canvas schema](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/backend/domain/workflow/entity/vo/canvas.go#L28-L89) uses stable node IDs, positions in node metadata, nested subgraphs, and `SourceNodeID`/`TargetNodeID` plus source/target port IDs. Start and End use fixed IDs in its default canvas: [L678-L754](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/backend/domain/workflow/entity/vo/canvas.go#L678-L754).
- Files found: [validation service contract](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/base/src/services/validation-service.ts#L31-L122) exposes node and line errors; [backend canvas validator](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/backend/domain/workflow/internal/canvas/validate/canvas_validate.go#L86-L122) detects cycles, and [connection checks](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/backend/domain/workflow/internal/canvas/validate/canvas_validate.go#L448-L568) validate start/exit connectivity and expected branch ports.
- Files found: [template cards](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/playground/src/components/template-panel/template-card.tsx#L68-L100) fetch/parse a template schema then create a workflow; [template list](https://github.com/coze-dev/coze-studio/blob/22275b1c2661d35344a7493cffe401e8cc61cf8e/frontend/packages/workflow/playground/src/components/template-panel/use-workflow-template-list.ts#L25-L57) loads examples separately from the canvas.

## Cross-Repo Pattern / 可迁移模式

| Concern | Evidence-backed pattern | Browser-local decision |
| --- | --- | --- |
| Catalog UX | FastGPT/Dify use searchable typed palettes; Flowise/Langflow group large catalogs by category; Coze separates local nodes, plugins, and workflows. | Keep a small two-group palette (`Core`, `Local data`) and a saved-workflow card catalog. Do not imitate marketplace/filter complexity until the catalog is materially larger. |
| Node availability | Dify disables invalid Start choices; Flowise filters an explicit node allowlist; Langflow shows disabled placement reasons. | Fixed Start/Reply are locked anchors, not draggable additions. Disable Knowledge until local documents exist; do not render unavailable/unsafe categories. |
| Graph model | All five persist nodes + edges; FastGPT/Dify/Flowise/Langflow/Coze retain directional endpoint/handle data and canvas geometry. | Keep the existing versioned graph with stable IDs, positions, viewport, `sourceHandle`, and `targetHandle`. Default legacy missing handles to `output` -> `input`. |
| Validation | Flowise gives the clearest DAG preflight; FastGPT/Dify/Coze return node/line-specific errors; Langflow permits special loops only with specialized semantics. | Validate at edit, save, import, and immediately before run. Invalid graphs must make zero provider calls. Keep first wave DAG-only. |
| Presets | Dify remaps IDs for snippets; Flowise previews then copies; Langflow replaces a blank flow; Coze keeps example cards separate from live workflows. | Built-in presets should be immutable, versioned graph snapshots. Instantiation deep-clones IDs and graph coordinates, validates references, and never copies credentials or transient run state. |

## Recommendation / 建议

### Safe First Wave / 第一波安全节点

| Node | Why it is safe here / 安全边界 | Required guardrails |
| --- | --- | --- |
| `Start` / `Reply` | Fixed browser-local input and aggregate output; no side effect. | Exactly one each; Start has no input, Reply has no output, and both are non-deletable anchors. |
| `Agent` | Uses the existing user-initiated BYOK path with stable local `agentId` and declarative Skill references. | Resolve exact local IDs; validate model capability and `allowedTools`; no fallback agent; never persist API URL/key or run state. |
| `Text Template` | Pure deterministic text composition. It is the safe subset of the template pattern used by all reference products. | Support only literal `{{task}}` and `{{input}}`; length-bound input/output; no Jinja/JS/eval, file includes, HTTP, or hidden variables. |
| `Local Knowledge Retrieval` | Read-only use of selected IndexedDB documents/chunks; no remote connector or server persistence. | Persist document IDs and bounded `topK` only; reject deleted IDs; deterministic bounded excerpts with source labels; never query URLs or export credentials. |

This exactly matches the current task design and implementation direction: the palette keeps Start/Reply fixed, exposes Agent/Template/Knowledge, and the executor runs Template/Knowledge locally before an Agent BYOK call: `src/features/automation/AutomationModule.tsx:827-936`, `src/features/automation/workflowRuntime.ts:3-84`.

### Deferred Nodes / 暂缓节点

| Deferred capability | Reason to defer |
| --- | --- |
| HTTP request, webhook, scheduled/event trigger, external search/data source | Network egress, SSRF, CORS, secret, retry, and audit boundaries; conflicts with browser-local/no-server-private-state scope. |
| Code, custom function, sandbox, arbitrary template language | Executes user-supplied logic and breaks the declarative Skill/graph safety contract. |
| MCP, plugins, tool marketplaces, external workflow-as-tool | Delegates authority to mutable third parties and requires installation, permission, capability, and credential lifecycle controls. |
| Database/file/email/message write nodes | Adds external credentials, irreversible writes, consent, logging, and recovery concerns. |
| Condition/router, loop, batch, parallel, subworkflow | Not necessarily privilege-unsafe, but unsafe for the current executor semantics: branch skip states, joins, cancellation, bounded iteration, resource quotas, and nested error propagation are not implemented. Langflow's specialized loop exception and Coze's nested-flow validation demonstrate the added contract surface. |
| Human input / long-running pause | Requires durable run/session state and resumption APIs; transient browser-only run state cannot safely provide it. |

### Catalog and Preset UX / 目录与预设交互

- Use the existing two-level model: saved workflow cards first, then one full-width editor. This follows the task design and avoids a permanently cramped list/editor split: `.trellis/tasks/07-20-workspace-indexeddb-backup/design.md:90-93`.
- Keep the node library intentionally small: `Core` contains the fixed anchors plus Agent and Text Template; `Local data` contains Knowledge. Use search only once the list has enough entries to justify it. Dify/Flowise/Langflow demonstrate search and grouping as scale mechanisms, not as required chrome for five nodes.
- Provide one-line node descriptions and disable unavailable nodes in place (for example, Knowledge when no local document exists). Do not put HTTP/code/MCP categories behind a misleading disabled UI in V1; absence is clearer than a promise of unsafe capability.
- Seed only a few deterministic built-ins, such as `Draft -> Review`, `Local documents -> Answer`, and `Template -> Agent -> Reply`. Use the existing one-time default marker behavior so user deletion remains intentional: `src/features/automation/automationRepository.ts:35-62`.
- Treat a preset as data, not code: `{ schemaVersion, name, description, tags, graph }`; omit API connection, API key, model secrets, generated output, selected runtime state, and user-private documents. On apply, clone all node/edge IDs, rebind only explicit local references, then run full validation.

### Validation Checklist / 校验清单

1. Schema allowlist: node kinds, field sizes, `output`/`input` ports, unique node/edge IDs, and no unknown executable payloads.
2. Topology: exactly one Start and Reply; no self, duplicate, dangling, or cycle edges; every executable node is reachable from Start and has a path to Reply.
3. Per-node contracts: Agent exact-ID/model/tool checks; Template non-empty and token-limited; Knowledge has selected existing document IDs and clamped `topK`.
4. Runtime gate: run validation after import/load and again immediately before execution. On failure, show node/edge status and do not invoke `api.runAgent`.
5. Archive gate: export/import only graph definitions and safe local references. Preserve the existing `sessionStorage`-only BYOK boundary and archive sanitizers.

## Related Specs / 关联规范

- `.trellis/tasks/07-20-workspace-indexeddb-backup/prd.md:17-33,43-49` - browser-local automation, restricted canvas, and safe-node acceptance criteria.
- `.trellis/tasks/07-20-workspace-indexeddb-backup/design.md:90-113` - graph-v1 extension and local template/knowledge runtime contract.
- `.trellis/spec/frontend/component-guidelines.md:40-42` - automation placement, declarative Skills, stable React Flow geometry, MiniMap, and fit control.
- `.trellis/spec/frontend/state-management.md:179-224` - IndexedDB ownership, stable references, fail-closed tools, and graph validation/run contracts.
- `.trellis/spec/frontend/type-safety.md:29-37` and `.trellis/spec/frontend/quality-guidelines.md:22-27` - strict archive validation and BYOK/session-only test boundary.

## Caveats / Not Found

- These projects are mature multi-tenant/server products; their HTTP, code, plugin, MCP, schedule, loop, and marketplace features are evidence of additional complexity, not candidates for direct adoption in this app.
- Main-branch source paths can move; pinned commit links above are the evidence version used for this report.
- No safe need was found for an external template marketplace in the current browser-local/no-account scope. Imported templates would need a separate trust, dependency, reference-rebinding, and credential-sanitization design before they could be enabled.
