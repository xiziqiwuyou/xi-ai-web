# Langflow Local Component Compatibility

## Goal

Let users build, import, save, and run useful Langflow-style workflows entirely from the xi-ai-web browser workspace while retaining the existing BYOK, IndexedDB, Admin, and optional online Langflow boundaries.

## Requirements

- Add one versioned component catalog that owns component IDs, labels, categories, ports, configuration fields, executor IDs, capability requirements, and security levels.
- Preserve existing workflow records and Start, Agent, Text Template, Knowledge Retrieval, and Reply behavior.
- Add controlled Language Model, If/Else, Structured Output, Web Search, Text Split, Merge, Transform, Human Approval, and Bounded Loop components.
- Support multiple named ports where required, including conditional true/false outputs.
- Import common Langflow React Flow JSON shapes and convert supported nodes and edges to the native versioned graph.
- Preserve unsupported Langflow nodes as visible blocked nodes with their original type; never silently delete them.
- Ship 8-12 useful local starter templates and let users create editable private copies.
- Keep API URL/key and independent search credentials in session storage only. Workflow records may store IDs and declarative configuration, never credentials, document bodies, run output, arbitrary code, SQL, or filesystem paths.
- Keep the existing optional online Langflow module unchanged.

## Acceptance Criteria

- [ ] Existing saved workflows still open, save, export/import, and run.
- [ ] The editor palette is rendered from the shared component catalog.
- [ ] Conditional routing executes only the selected branch.
- [ ] Human Approval pauses execution and requires an explicit in-app decision.
- [ ] Langflow JSON import reports supported, unsupported, and warning counts and opens the converted graph.
- [ ] Unsupported nodes remain visible and block save/run with a precise error.
- [ ] At least 8 starter templates can be opened as independent editable workflows.
- [ ] Typecheck, production build, workflow E2E, privacy scan, and existing automation contracts pass.

## Out Of Scope

- Running Langflow Python `Component` classes or `lfx` in the browser.
- Arbitrary Python, JavaScript, shell, SQL, filesystem, or custom-package execution.
- Bit-for-bit compatibility with every Langflow integration.
- Persisting user BYOK credentials in IndexedDB, templates, or server configuration.
