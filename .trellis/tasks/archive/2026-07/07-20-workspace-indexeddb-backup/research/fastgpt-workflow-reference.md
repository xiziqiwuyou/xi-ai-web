# FastGPT Workflow Reference

Date: 2026-07-20

## Sources

- FastGPT repository: https://github.com/labring/FastGPT
- Workflow introduction: https://doc.fastgpt.io/en/guide/build/workflow/intro
- Edge schema: https://github.com/labring/FastGPT/blob/main/packages/global/core/workflow/type/edge.ts
- Node schema: https://github.com/labring/FastGPT/blob/main/packages/global/core/workflow/type/node.ts
- Graph canvas: https://github.com/labring/FastGPT/tree/main/projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow
- Validation: https://github.com/labring/FastGPT/blob/main/projects/app/src/web/core/workflow/workflowCheck.ts

## Findings

FastGPT models workflows as positioned nodes plus edges that carry explicit
source and target handles. Its runtime tracks edge states (`waiting`, `active`,
and `skipped`) and begins from a Start node. The editor uses React Flow,
templates, ports, validation, and per-node debug state.

## Project Decision

This project adopts a restricted browser-local form of that model:

- Use `@xyflow/react` for the interaction canvas rather than hand-rolling pan,
  zoom, drag, and connection mechanics.
- Persist only safe graph definitions, positions, viewport, local IDs, and
  declarative Skill references in IndexedDB/archive data.
- Keep API URL/Key session-only, do not copy FastGPT's HTTP, code sandbox, MCP,
  RAG, server persistence, looping, or parallel-node features.
- Start with Start, Agent, and Reply nodes and a single-threaded DAG executor.
- Preflight rejects invalid topology before any provider request.
