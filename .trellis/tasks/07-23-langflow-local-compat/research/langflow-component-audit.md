# Langflow Component Audit

- Audited upstream: `langflow-ai/langflow` at commit `0a8ef930283447d6411b71ebf3df3c627ea5e8a8`.
- Upstream license: MIT. Converted templates and provenance must retain attribution/license metadata when distributed.
- Starter projects are React Flow JSON under `src/backend/base/langflow/initial_setup/starter_projects`.
- Component implementations are Python `Component` subclasses under `src/lfx/src/lfx/components` and depend on `lfx`, graph context, provider registries, iteration state, and external Python packages.
- Direct browser execution is therefore not compatible. xi-ai-web will migrate component semantics, configuration schemas, ports, and template topology while implementing controlled TypeScript/Node executors.
- Arbitrary Python/custom components, direct SQL, shell, filesystem access, and dependency-specific connectors remain blocked.
