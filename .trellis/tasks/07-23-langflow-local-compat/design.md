# Design

## Data Flow

```text
Langflow JSON -> boundary decoder/import report -> native graph v1 -> sanitizer -> IndexedDB
                                                              -> editor/canvas
                                                              -> validated scheduler
                                                              -> local executor or existing server API
```

## Contracts

- `workflowComponents.ts` is the source of truth for component metadata and port compatibility.
- Existing `kind` values remain stable. New nodes also carry a stable `componentId`, `componentVersion`, and bounded declarative `config` record.
- Graph edges use named string handles. The registry validates whether a source/target port exists and whether their data types are compatible.
- `workflowLangflowImport.ts` is the only owner of parsing and normalizing untrusted Langflow JSON.
- `workflowTemplates.ts` owns immutable template definitions and creates fresh IDs when a user opens one.
- `workflowRuntime.ts` owns pure local executors. Provider calls, cloud knowledge retrieval, independent search, citations, and UI state remain coordinated by `AutomationModule` through existing APIs.

## Execution

- The scheduler follows the validated topological order.
- Conditional nodes activate exactly one named outgoing handle. Nodes with no active inbound edge are skipped.
- Merge nodes receive all active upstream outputs.
- Human Approval uses the shared accessible confirmation dialog and resolves a pending in-memory promise. It is never persisted.
- Language Model nodes call the existing `/api/agents/run` path with a bounded inline agent projection.
- Web Search nodes use the existing independent GLM/Kimi search configuration through the `web_search` request tool; they do not pretend the main model has native browsing.

## Security

- Imported arbitrary-code components become `langflow.unsupported` nodes.
- Unsupported nodes are retained for inspection but fail validation before provider access.
- Config keys, values, collection sizes, graph sizes, and imported strings are bounded at the import and workspace archive boundaries.
- Langflow provenance records MIT as the upstream license and stores no source code.

## Compatibility

- Legacy graphs without `componentId` are projected through the registry by `kind`.
- Legacy edges default to `output -> input`.
- Legacy workflow steps continue to derive from Agent nodes for archive compatibility.
- Existing online Langflow routing remains optional and unchanged.
