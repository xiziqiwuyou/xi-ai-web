# Implementation Plan

1. Extend shared workflow types, workspace sanitization, and graph validation for versioned components, declarative config, named ports, provenance, and unsupported nodes.
2. Add the component registry, node factory, local executor helpers, Langflow JSON importer, and 10 immutable starter templates.
3. Refactor the React Flow canvas and workflow editor palette/inspector to consume the registry, add template/import catalog actions, and add accessible human approval.
4. Extend execution preflight and scheduling for local nodes, model nodes, independent web search, conditional branch activation, and unsupported-node blocking.
5. Add focused browser regressions for templates, import reporting, unsupported preservation, and branch execution.
6. Run `npm run check`, targeted Playwright tests, `npm run qa`, `npm run release-check`, and `git diff --check`; fix all failures attributable to this task.
