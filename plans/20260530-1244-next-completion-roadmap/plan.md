# Next Completion Roadmap

Date: 2026-05-30

## Goal

Complete the next practical product layer while preserving BYOK, no-login public usage, and `/admin`-only metadata management.

## Source Context

- Gap report: `reports/current-gap-analysis.md`
- Previous roadmap: `C:\Users\56252\Documents\New project 2\plans\20260530-1143-next-feature-ui-roadmap\plan.md`
- QA report: `C:\Users\56252\Documents\New project 2\reports\qa-20260530-phase-03-08.md`

## Non-Negotiable Boundary

- No public login/register.
- Public users provide API URL and API Key.
- User credentials remain browser-side and request-time only.
- Admin manages only metadata, not user secrets.
- `/admin` is the only admin entrance.

## Phases

1. [Phase 01 - Public Chat Privacy and Local History](phase-01-public-chat-privacy-local-history.md)  
   Status: Completed. Public conversation history is browser-local and chat streaming is stateless on the server.

2. [Phase 02 - Admin Data Safety and Metadata Ops](phase-02-admin-data-safety-metadata-ops.md)  
   Status: Completed. Added import dry-run, backups, audit notes, and data migration safeguards.

3. [Phase 03 - Dedicated Agents and Tool Workspace](phase-03-dedicated-agents-tool-workspace.md)  
   Status: Completed. Replaced generic agents page with a tool-aware agent console and visible execution trace.

4. [Phase 04 - Audio STT and Voice Input](phase-04-audio-stt-voice-input.md)  
   Status: Completed. Added speech-to-text upload and chat microphone flow.

5. [Phase 05 - Knowledge Base Pro Storage and PDF](phase-05-knowledge-base-pro-storage-pdf.md)  
   Status: Completed. Added PDF text extraction fallback, IndexedDB storage, and index metadata.

6. [Phase 06 - Media Provider Templates and Polling](phase-06-media-provider-templates-polling.md)  
   Status: Completed. Added configurable video/status templates, auto-polling, and local job controls.

7. [Phase 07 - Artifact Editing and Export Polish](phase-07-artifact-editing-export-polish.md)  
   Status: Completed. Added PPT outline editing, mindmap source editing, richer image/video controls, and gallery replay drafts.

8. [Phase 08 - Automated QA and Deployment Release Gate](phase-08-automated-qa-deployment-release-gate.md)  
   Status: Completed. Added smoke scripts, privacy scans, docs cleanup, and release checklist template.

## Recommended Execution

Start with Phase 01 and Phase 02. They reduce deployment/privacy risk before adding more public workflows.

## Key Risks

- Chat history must not silently become globally visible on a server.
- Larger knowledge files can exceed browser storage unless moved to IndexedDB.
- Provider-specific media APIs can drift; templates must be explicit, not magical.
- Tool calling can become risky unless allowed tools are constrained and visible.

## Unresolved Questions

- Should old backend chat conversations be exportable before migration removes public access?
- Should admin audit logs stay in JSON first, or wait for SQLite/Postgres?
- Should PDF parsing happen fully browser-side, or through a server parser with no persistence?
