# NextChat Function Completion Plan

## Phase 01 - Mask Workflow Entry

- Combine existing assistants and app presets into a local Mask-like workflow list inside the chat page.
- Keep public menus unchanged.
- Do not add a new backend bootstrap shape.
- Selecting an assistant changes the chat role.
- Selecting an app copies its prompt into the composer as a task starter.

## Phase 02 - Context Compression

- Keep raw messages untouched.
- Generate a local summary artifact from the active conversation.
- Allow the generated summary to be attached to the next chat request as context.
- Do not create a new backend route.
- Do not persist summaries server-side.

## Phase 03 - Message Rendering Polish

- Add code block toolbar actions.
- Support copy code and download code as a local file.
- Keep Markdown rendering based on the current `react-markdown` stack.
- Avoid heavy dependencies in this pass.

## Phase 04 - Contract And QA

- Extend local chat contracts to cover Mask adapter behavior and summary context use.
- Preserve public menu order.
- Preserve `/admin` isolation.
- Confirm no API URL/key is exported.
- Run full QA before completion.

## Phase 05 - Bulk Conversation Operations

- Export all local conversations as one versioned JSON archive.
- Import versioned JSON archives through the existing local import path.
- Keep merge as the safe default.
- Do not add backend conversation persistence.

## Phase 06 - Share Card

- Add a local-only share card export for the active conversation.
- Export as an HTML file in this pass to avoid canvas/image dependency weight.
- Do not create public share links or backend share routes.

## Phase 07 - Prompt Marketplace In Chat

- Surface prompt presets alongside assistant/app masks.
- Keep prompt ownership in admin metadata.
- Picking a prompt preset fills the composer.

## Phase 08 - PWA And Mobile Ergonomics

- Add a web app manifest and service worker shell cache.
- Register the service worker from the client.
- Improve mobile chat layout so header actions wrap cleanly and the composer stays usable.

## Phase 09 - Plugin UI Surface

- Add a local plugin/tools strip in chat that reflects whitelisted capabilities.
- No dynamic remote plugin execution.
- No user-provided script execution.
