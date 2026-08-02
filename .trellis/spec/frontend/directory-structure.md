# Directory Structure

> How frontend code is organized in this project.

---

## Overview

<!--
Document your project's frontend directory structure here.

Questions to answer:
- Where do components live?
- How are features/modules organized?
- Where are shared utilities?
- How are assets organized?
-->

Feature directories own the implementation for one public module. Keep the route-facing file small and move independent workspaces, dialogs, and pure helpers into sibling files.

---

## Directory Layout

```
src/
├── app/                         # shell, public navigation, lazy module routing
├── components/                  # shared UI and workbench primitives
├── features/
│   ├── chat/                    # Chat coordinator, session block, settings dialog
│   ├── admin/                   # Admin coordinator and active destination sections
│   ├── studio/                  # Studio coordinator, model selector, five workspaces
│   ├── automation/              # Automation coordinator, Agents, Workflows, graph runtime
│   └── knowledge-cloud/         # independent knowledge account/workspace boundary
├── styles.css                   # import-order contract
└── styles/                      # tokenized active layers and tracked legacy layers
```

---

## Module Organization

<!-- How should new features be organized? -->

Route-facing feature files coordinate bootstrap, persistence, and callbacks. Presentation/state-heavy areas are split by responsibility:

- `AdminConsole.tsx` owns drafts and API coordination; section components own form markup.
- `StudioModule.tsx` selects one of five workspaces; `studioShared.tsx` owns model selection.
- `AutomationModule.tsx` loads the browser workspace; `AgentsWorkspace` and `WorkflowsWorkspace` own editors and runners.
- Static contract scripts read the coordinator plus all extracted files when asserting a feature contract.

---

## Naming Conventions

<!-- File and folder naming rules -->

Use PascalCase for React components, lower camel case for feature-local helpers, and descriptive sibling filenames such as `AdminModelsSection.tsx` and `WorkflowsWorkspace.tsx`. Shared domain types live in `src/types.ts`; feature-only types stay beside their owner.

---

## Examples

<!-- Link to well-organized modules as examples -->

Use `StudioModule.tsx`, `ChatModule.tsx`, `AutomationModule.tsx`, and `AdminConsole.tsx` as composition examples. Extracted leaf components must preserve DOM classes, accessible names, request payloads, and storage contracts.
