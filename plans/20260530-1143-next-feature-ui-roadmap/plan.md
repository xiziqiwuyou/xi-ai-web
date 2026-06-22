# Next Feature and UI Roadmap

Date: 2026-05-30

## Goal

Complete the next practical layer of features and polish the UI into a more usable AI workbench, while preserving the current BYOK and `/admin` boundary.

## Source Context

- Code notes: `reports/current-feature-gap-notes.md`
- Previous completed plan: `plans/20260530-0043-api-modal-admin-route-cleanup/plan.md`
- Full portal refactor plan: `plans/20260529-1643-goamzai-inspired-full-refactor/plan.md`

## Non-Negotiable Boundary

- No public login/register.
- Public users provide API URL and API Key.
- User credentials stay browser-side and request-time only.
- Admin manages metadata only.
- `/admin` is the only admin entrance.

## Phases

1. [Phase 01 - Foundation Cleanup and UI Consistency](phase-01-foundation-cleanup-ui-consistency.md)  
   Status: Completed. Removed stale settings/admin drawer coupling and tightened public shell polish.

2. [Phase 02 - Knowledge Files and Persistent Retrieval](phase-02-knowledge-files-persistent-retrieval.md)  
   Status: Completed. Added upload, extraction, chunking, browser-side persistence, and BYOK retrieval flow.

3. [Phase 03 - Multimodal Chat Attachments](phase-03-multimodal-chat-attachments.md)  
   Status: Completed. Attachment/image buttons are functional and routed by provider capability.

4. [Phase 04 - Mindmap Visual Workspace](phase-04-mindmap-visual-workspace.md)  
   Status: Completed. Generated mindmaps render visually with zoom and Markdown/SVG exports.

5. [Phase 05 - Media Job Experience](phase-05-media-job-experience.md)  
   Status: Completed. Added video job history/status refresh and media download controls.

6. [Phase 06 - Gallery Detail Workspace](phase-06-gallery-detail-workspace.md)  
   Status: Completed. Added search, favorites, detail view, batch export/delete, and replay navigation.

7. [Phase 07 - Admin Model and Prompt Ops](phase-07-admin-model-prompt-ops.md)  
   Status: Completed. Added model presets, validation, public preview, and metadata import/export.

8. [Phase 08 - QA and Deployment Hardening](phase-08-qa-deployment-hardening.md)  
   Status: Completed. Checks, route smoke tests, leak scans, docs, and QA notes were completed.

## Recommended Path

Start with Phase 01 and Phase 02. They reduce future rework and unlock the most visible feature gap: real knowledge base files.

## Key Risks

- File upload can accidentally become global storage. Keep public user files browser-local unless explicitly admin-managed.
- Multimodal payload formats differ by provider. Use normalized internal types first.
- Video providers have inconsistent status APIs. Keep status polling adapter-specific.
- More UI polish can drift into decoration. Keep controls dense, useful, and consistent.
