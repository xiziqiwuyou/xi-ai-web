# Codebase Baseline

Date: 2026-05-22

## Existing Files

- `C:\Users\56252\Documents\New project 2\src\App.tsx`
  - Main UI.
  - Contains login screen, sidebar, chat header, message list, composer, assistant panel, provider panel.
  - About 1100 lines. High priority split target.

- `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Fetch wrapper.
  - Auth, bootstrap, conversation, provider, assistant, streaming chat APIs.

- `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Provider, Assistant, Conversation, Message, BootstrapPayload, AuthStatus.

- `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Express app.
  - JSON data load/save.
  - Shared cookie auth.
  - CRUD for providers, assistants, conversations.
  - `/api/chat/stream` OpenAI-compatible streaming proxy.

- `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Current warm desktop-workbench visual system.
  - Needs full rewrite or split into CSS modules/files.

## Current Strengths

- Deployable as a single Node service.
- API keys already stay server-side.
- Chat streaming works with OpenAI-compatible APIs.
- JSON persistence is enough for single-admin MVP.

## Current Limitations

- No route/module concept.
- No guest vs admin role separation.
- No admin console.
- No menu switch schema.
- No feature-level settings.
- No image/audio/video/knowledge data structures.
- UI components are tightly coupled to chat.
- Chinese strings appear vulnerable to encoding display issues in PowerShell output. Keep source files UTF-8 and validate browser rendering.

## Refactor Principle

Keep the running product intact while extracting structure:
1. Add shared settings/menu/admin schema.
2. Split UI into layout + modules.
3. Move existing chat into `features/chat`.
4. Add admin console only after API auth boundaries exist.
