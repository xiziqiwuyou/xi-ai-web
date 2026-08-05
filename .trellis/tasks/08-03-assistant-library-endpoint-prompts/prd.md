# Assistant library expansion and endpoint prompt delivery

## Goal

Turn the public Assistant Library into a broad but curated catalog whose assistants have distinct responsibilities, effective server-owned prompts, function-specific avatars, and a verified launch path into Chat across every supported text endpoint protocol.

## Background

- The shipped catalog currently contains 12 assistants across six broad categories.
- Lobe Chat Agents Index currently exposes more than 500 source records and separates system role, metadata, avatar and suggested input. Cherry Studio advertises 300+ preconfigured assistants. Awesome ChatGPT Prompts demonstrates broad role coverage, but many entries are unsafe or too narrowly role-played to copy directly.
- `AssistantsStudio` launches an assistant by ID and optional starter prompt. Chat binds the ID to a conversation and the server resolves the authoritative `systemPrompt`.
- OpenAI Chat keeps the system message in `messages`; Responses maps it to `instructions`; Anthropic uses top-level `system`; Gemini uses `systemInstruction`.
- Assistant records currently have only one color. The library renders the same Bot icon for every card and Chat renders one global avatar preset regardless of the bound assistant.
- Existing data at version 12 will not receive newly shipped assistants because the current one-time backfill stops at version 7.

## Requirements

- R1: Ship 30 high-value assistants across seven user-oriented categories: general productivity, content creation, software development, learning/research, product/design, business/marketing and career/life.
- R2: Preserve existing stable assistant IDs and administrator edits. Add new defaults through one versioned migration that appends missing records without overwriting matching records.
- R3: Every shipped assistant must contain a purpose-specific prompt with role, working method, output contract, evidence boundary and safety constraint. Prompts must be original project content rather than copied catalog text.
- R4: Every shipped assistant must provide three useful starter prompts that become visible drafts and never auto-send.
- R5: Extend the Assistant contract with one allowlisted semantic avatar key. Use locally bundled installed icons and assistant colors; do not hotlink runtime assets or execute Iconfont scripts.
- R6: The public library, detail dialog and Chat messages/session header must render the bound assistant's semantic avatar. The global Chat assistant-avatar preset remains a fallback for legacy/custom records without a valid avatar key.
- R7: Admin assistant editing must expose the avatar selector and preserve category, tags, starter prompts, prompt, enabled state and color.
- R8: Assistant prompts remain server authoritative. Browser requests send `assistantId`, never the full prompt.
- R9: Exact adapter tests must prove prompt delivery as OpenAI Chat `messages[0].system`, OpenAI Responses `instructions`, Anthropic `system`, Gemini `systemInstruction`, and a compatibility projection for non-OpenAI Responses implementations.
- R10: Responses tool rounds must reapply the system instruction instead of assuming `previous_response_id` carries previous instructions.
- R11: Keep BYOK, managed upstream, model selection, local conversation persistence, starter-prompt handoff and unavailable-assistant behavior unchanged.

## Acceptance Criteria

- [x] Fresh metadata contains exactly 30 unique enabled shipped assistants and seven categories, with at least three assistants per category.
- [x] Every shipped assistant has a unique ID, valid avatar key, three starter prompts, non-empty tags, and a prompt containing role/workflow/output/boundary guidance.
- [x] Version-12 metadata receives missing shipped assistants once while preserving edited matching assistants and custom assistants.
- [x] Library search covers name, description, category and tags; category filters show counts and cards/details use distinct semantic avatars.
- [x] Selecting a starter and launching creates a new Chat conversation bound to the exact assistant, keeps the starter as an unsent draft, and renders that assistant's avatar.
- [x] Normal Chat sends only `assistantId`; the server-resolved prompt reaches OpenAI Chat, OpenAI Responses, Anthropic Messages and Gemini GenerateContent in their protocol-native fields.
- [x] Non-OpenAI Responses-compatible models receive a developer/system input fallback, and every Responses tool round retains the assistant instruction.
- [x] Admin can select and save an assistant avatar; invalid imported avatar values normalize to a safe fallback.
- [x] Desktop 1280/1440 and mobile 375/390 have no document-width overflow, keep readable card density and preserve 44px mobile actions.
- [x] Typecheck, build, static contracts, Provider contracts, server tests and focused Playwright tests pass.

## Out Of Scope

- Importing the full external catalogs, remote marketplace installation, per-user assistant creation, server-side user accounts, arbitrary remote avatar URLs, runtime Iconfont CDN dependencies, assistant-specific model pinning, tools, knowledge bases or paid marketplace behavior.

## References

- https://github.com/lobehub/lobe-chat-agents
- https://github.com/f/awesome-chatgpt-prompts
- https://github.com/CherryHQ/cherry-studio
- https://www.iconfont.cn/
- https://github.com/openai/openai-node
