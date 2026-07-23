# State Management

> State ownership and persistence contracts for xi-ai-web.

## State Categories

| State | Owner | Persistence |
| --- | --- | --- |
| Public bootstrap and menu/catalog metadata | `App` | Server response only |
| Active public destination | `App` + History API | URL path |
| API URL/key and last model | `App` provider state | `sessionStorage` only |
| Independent GLM/Kimi search URL/key/options | `App` search-service state | Dedicated `sessionStorage` record only |
| One-shot Assistant launch intent | Assistant library + Chat | Versioned `sessionStorage` envelope, consumed once |
| Private workspace data | Feature owners + workspace repository | `xi-ai-web-workspace` IndexedDB |
| Feature drafts, selections, busy/error/result | Feature module | Existing feature behavior only |
| Admin authentication and console forms | Admin portal/console | Existing admin API/session cookie |
| Knowledge Admin filters, cursors, drafts and one-time plaintext | Active `KnowledgeAdminSection` destination | React memory only; server PostgreSQL owns durable settings/audit |
| Cloud knowledge account | Standalone `/knowledge` portal + server | HttpOnly `xi_kb_session`; CSRF and one-time recovery code in live React state only |
| Cloud knowledge bases, documents, quota and processing status | Knowledge API + PostgreSQL/COS | Server authoritative; frontend keeps only current projections |
| One-time COS upload grant | Active upload operation | React/request memory only; expires automatically and is never exported |

Do not introduce a global store for these boundaries. Promote state only when two routed modules must share the same live value and `App` is already the established owner.

## Public URL State

`src/app/publicRoutes.ts` is the sole route map for the eight public destinations:

```text
chat -> /chat
image -> /image
agents -> /agents
workflows -> /workflows
ppt -> /ppt
mindmap -> /mindmap
assistants -> /assistants
translate -> /translate
```

Rules:

1. Resolve only visible and enabled menu items.
2. Invalid or unavailable paths fall back to the configured default, then the first available item.
3. User navigation uses `history.pushState`; canonical correction uses `replaceState`; `popstate` restores module state.
4. The backend owns order, enabled state, and visibility. The visible labels and notes are fixed by the exact Figma contract in `TopBar`.
5. `/admin` and `/knowledge` are exact isolated routes. Neither is added to the eight-item public navigation or allowed to load public bootstrap/provider state.

The `/knowledge` portal may read the theme mirror only. It must not initialize public BYOK state, gallery/workspace hydration, or search-service state. Passwords and recovery codes never enter `localStorage`, `sessionStorage`, IndexedDB, URL state, or workspace export. A one-time recovery code is cleared from React state immediately after the user completes its mandatory acknowledgement.

Knowledge Admin state stays inside the address-only `/admin` tree. The six destination IDs are part of the typed Admin navigation state, not public URL state. Filters and opaque cursors may survive only while their destination remains mounted; settings and account writes always submit the last server `version`. One-time invite/reset plaintext is deliberately cleared on destination change, Admin logout, refresh, or component unmount and must never enter Web Storage, IndexedDB, query strings, bootstrap data, audit metadata, or generic notification history.

Cloud library reads are server projections keyed by stable base/document IDs. Pending uploads may hold one short-lived `KnowledgeUploadGrant` only for the active transfer; its temporary key, secret, token, and server-generated object path never enter `sessionStorage`, IndexedDB, workspace archives, conversations, URL state, or retry metadata. A reload restores document status from the server and requests a new upload flow rather than persisting or replaying expired credentials.

## Scenario: Exact Figma Public Route Contract

### 1. Scope / Trigger

- Trigger: any change to a public destination, server default menu, route resolver, or visible navigation item.

### 2. Signatures

```ts
const publicRoutes: ReadonlyArray<{ id: ModuleId; path: `/${string}` }>;
```

- `GET /api/public/bootstrap -> PublicBootstrapPayload`
- `resolvePublicModule(menuItems, requestedModule, defaultModule) -> PublicModuleId`

### 3. Contracts

- Route order is `chat`, `image`, `agents`, `workflows`, `ppt`, `mindmap`, `assistants`, `translate`.
- Paths are `/chat`, `/image`, `/agents`, `/workflows`, `/ppt`, `/mindmap`, `/assistants`, `/translate`.
- Visible labels are `AI 对话`, `图像生成`, `智能体`, `工作流`, `AI 一键 PPT`, `思维导图`, `助手库`, `翻译`.
- `/` canonicalizes to `/chat`; `/admin` remains address-only.
- BYOK values stay under `cherry-web-user-provider` in `sessionStorage` and never enter bootstrap data.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown path | Replace with the configured available default, then `/chat` |
| Hidden destination | Do not render or select it |
| Disabled destination | Render disabled when visible; do not navigate to it |
| Missing URL or Key | Open the required BYOK dialog; do not expose a persistent shell action |
| `/admin` requested | Render Admin directly without public bootstrap or navigation |

### 5. Good/Base/Bad Cases

- Good: server reorders or disables one of the eight known IDs and the shell reflects that state with fixed product copy.
- Base: all eight defaults render in the canonical order and Back/Forward restores the active destination.
- Bad: a legacy `apps` or `gallery` item becomes publicly routable or an API/Admin button appears in the shell.

### 6. Tests Required

- `npm run ui-contract`: route, label, class, and retired-token assertions.
- `npm run ui-runtime`: live bootstrap order and shell source assertions.
- `npm run test:e2e`: direct routes, canonical fallback, Back/Forward, eight-item desktop/mobile navigation, BYOK isolation, Chat Skill injection, and automation execution.

### 7. Wrong vs Correct

```ts
// Wrong: a visible route that is outside the Figma contract.
{ id: "gallery", path: "/gallery" }

// Correct: one shared canonical route entry used by URL guards and tests.
{ id: "translate", path: "/translate" }
```

## BYOK Contract

The storage key is `cherry-web-user-provider` with the existing payload shape:

```ts
type UserProviderConfig = {
  baseUrl: string;
  apiKey: string;
  lastModelId: string;
};
```

- Read and write through the existing provider storage helpers.
- Persist only in `window.sessionStorage`.
- Never copy these values to `localStorage`, backend metadata, URL state, logs, or public bootstrap.
- The backend receives connection data only in the user-initiated request payload required to call a provider.

Independent network search uses `xi-ai-web-search-service` with `SearchServiceConfig`. It is optional, is not part of the required first-use API dialog, and is sent only when the exact request includes `web_search`. Its URL, key, model, engine, and result options must never enter IndexedDB, workspace archives, backend metadata, logs, URL state, or public bootstrap data.

Assistant launch uses `xi-ai-web-assistant-launch` with `{ version, assistantId, starterPrompt?, requestedAt }`. Chat consumes it only after conversation hydration, removes it before creating state, validates an exact enabled public assistant, creates one independent conversation, and leaves all existing conversation bindings unchanged. The legacy `aistudio-selected-assistant` key is read once for compatibility and removed. Invalid, stale, disabled, or missing IDs are reported and never rebound to the first assistant.

## Scenario: Browser Workspace Persistence And Restore

### 1. Scope / Trigger

- Trigger: any new browser-persisted private dataset, legacy storage migration, workspace export/import, or remote-backup adapter.

### 2. Signatures

```ts
initializeWorkspace(): Promise<void>;
readWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
replaceWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
restoreWorkspaceArchive(envelope, mode: "merge" | "replace"): Promise<void>;
```

- IndexedDB database: `xi-ai-web-workspace`, version `2`.
- Data stores: `conversations`, `galleryItems`, `knowledgeDocuments`, `mediaJobs`, `userAgents`, `agentSkills`, `workflows`, `agentMemories`, `preferences`, `backupRuns`.

### 3. Contracts

- Feature modules own live React state; `src/features/workspace/` owns transactions, migration, archive validation and cross-store restore.
- Legacy localStorage and `cherry-web-knowledge-db` data migrate once under `meta.legacyMigrationV1`.
- Legacy sources are cleared only after the unified migration transaction commits.
- API URL/Key and admin data are never workspace datasets and never enter an export.
- Restore suspends new writes, waits for queued writes, commits all stores atomically, then reloads the page.
- Import rejects duplicate IDs/keys before IndexedDB writes can collapse records.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| IndexedDB unavailable | Preserve legacy fallback reads and report storage unavailable |
| Quota exceeded | Keep the previous transaction state and report storage-full guidance |
| Invalid schema/version/count/digest | Reject before mutation |
| Duplicate record ID/key | Reject before mutation |
| Restore transaction failure | Abort all stores and resume normal writes |
| Save arrives after restore suspension | Reject the save; do not overwrite restored data |

### 5. Good/Base/Bad Cases

- Good: an old localStorage conversation migrates, the old key is removed after commit, and export contains the migrated record without BYOK values.
- Base: a fresh browser creates the database, hydrates empty stores, and then creates the default Chat conversation.
- Bad: an empty React initializer writes before hydration, a duplicate import silently overwrites one ID, or a streaming callback writes after restore.

### 6. Tests Required

- `npm run workspace-storage-contracts`: schema, store list, SHA-256, duplicate rejection, future-version rejection, merge and BYOK dependency boundaries.
- `tests/e2e/workspace-data.spec.ts`: real IndexedDB migration, download privacy, merge/replace UI, atomic restore, tamper rejection, theme restore and single visible dialog owner.
- Full E2E must retain BYOK session-only, eight-item navigation, local automation persistence, and graph-workflow assertions.

### 7. Wrong vs Correct

```ts
// Wrong: initial empty state can erase migrated records.
useEffect(() => saveGalleryItems(items), [items]);

// Correct: writes begin only after asynchronous hydration completes.
useEffect(() => {
  if (hydrated) void saveGalleryItems(items);
}, [hydrated, items]);
```

## Scenario: Browser Automation Workspace

### 1. Scope / Trigger

- Trigger: changes to local agents, declarative Skills, workflow references, inline execution, or automation archive behavior.

### 2. Signatures

```ts
loadAutomationWorkspace(): Promise<AutomationWorkspace>;
saveUserAgents(agents: UserAgentDefinition[]): Promise<void>;
saveAgentSkills(skills: AgentSkillDefinition[]): Promise<void>;
saveAgentWorkflows(workflows: AgentWorkflowDefinition[]): Promise<void>;
activeChatCommand(value: string, caret?: number): ActiveChatCommand | null;
toolSetCompatibility(names: string[], tools: ToolSetting[], model?: ModelCatalogEntry, options?: { hasContext?: boolean }): ToolCompatibility;
```

- `POST /api/agents/run` accepts `moduleId`, BYOK `connection`, `modelId`, a bounded inline `agent`, `prompt`, `allowedTools`, and bounded sampling `options`.
- `POST /api/chat/stream` accepts the same request-scoped `allowedTools` array alongside `skillInstructions`; neither field is persisted by the server.

### 3. Contracts

- Agents, Skills, and workflows are private IndexedDB records and participate in complete workspace export/import. Only Agents and Workflows are public destinations; Skills are created and selected inside Chat.
- Agent catalog category/tags are part of each sanitized `UserAgentDefinition`. A one-time curated-catalog migration may add missing shipped Agents only when at least one shipped stable ID still exists; intentionally empty or fully custom stores remain untouched.
- Agent local-knowledge selections persist only document IDs. Run time resolves bounded chunks and enables request-scoped `knowledge_search`; the server still applies the administrator tool allowlist.
- `meta.automationDefaultsV1` is written after the first seed attempt. Empty stores with that marker are an intentional user state and must remain empty after reload.
- Workflow graphs resolve their exact `agentId`; missing or deleted references are marked failed before any provider call and never fall back to the first available agent. Start/Agent/Text Template/Local Knowledge Retrieval/Reply graphs reject invalid ports, self/duplicate edges, cycles, unreachable nodes, empty templates, and deleted document references before save or run.
- Skill definitions contain instructions, schemas, capability requirements, and tool names only. They never contain executable JavaScript or shell source.
- Chat sends only selected resolved declarative Skill text in `skillInstructions`; the server bounds and appends it to the transient request context without accessing IndexedDB or persisting it.
- Chat Skill selection belongs to each conversation's `SessionUiState.skillIds`. Opening settings targets one conversation, new conversations start with no selected Skills, and deleting a Skill removes stale IDs from every hydrated session without copying the selection into provider credentials or server state.
- `$` in a Chat draft resolves browser-local Skills and `/` resolves enabled developer-managed `appPresets`. Selecting either removes the token from the visible draft. Skills stay in `SessionUiState.skillIds`; a selected `SessionUiState.appId` is a one-shot request template, clears after a successful send, and is restored only when that request fails for retry.
- Template nodes replace only `{{task}}` and `{{input}}`. Knowledge nodes persist selected document IDs and `topK` only, then perform bounded deterministic local retrieval at run time. API URL, Key, document bodies, and run outputs do not enter graph definitions.
- `ToolSetting.execution`, `requiredCapability`, `supportedVendors`, and `requiresContext` are server-owned catalog metadata. Admin may toggle and relabel tools but must not rewrite those execution boundaries.
- `allowedTools` is a request-level allowlist. Missing means no tools, a non-array is rejected, and provider-returned calls are checked against the same allowlist before execution. Chat sends the exact deduplicated union of selected Skill tools and explicit search-tool state.
- Tool availability is the intersection required by its execution owner. Local/provider tools check administrator enablement, selected-model capabilities, vendor allowlists, and request context; independent search checks administrator enablement and search-session readiness only. Chat, Agents, and Workflows use `toolCompatibility` / `toolSetCompatibility`; do not recreate partial model checks inside each feature.
- Application tools (`datetime_now`, `calculator_eval`, request-bounded `knowledge_search`) enter function declarations and the local dispatcher. `web_search` enters the resolver's `searchTools` lane, runs before the main provider, and injects bounded untrusted external context. Other provider-hosted tools (`url_context`, `code_execution`) enter only adapter-specific hosted-tool mappings.
- Workflow execution preflights every Agent node before the first provider request. Agent-bound local knowledge is resolved to bounded `contextChunks` and adds request-scoped `knowledge_search` in both direct Agent and Workflow runs.
- Mandatory server instructions precede user agent and Skill text so bounded prompts cannot truncate the execution contract.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing `allowedTools` | Send no tools to the provider |
| Non-array `allowedTools` | Reject with HTTP 400 before provider access |
| Provider requests an unlisted tool | Reject the call and do not execute the globally enabled tool |
| Tool missing, disabled, vendor-incompatible, or unsupported by the selected model | Disable it in selection UI and reject before provider access if it remains in a saved definition |
| `knowledge_search` without bounded `contextChunks` | Reject before provider access |
| Provider-hosted tool reaches the local dispatcher | Contract failure; hosted tools must leave the resolver in `hostedTools` only |
| `web_search` has no ready independent config | Reject before search and main-model provider access |
| `web_search` is selected with a model lacking `webSearch`/`toolCalling` | Allow it when the independent config and Admin switch are ready |
| Generic OpenAI-compatible, Kimi, or DeepSeek request contains hosted tools | Reject in the resolver and again at the compatible adapter boundary |
| Workflow `agentId` is absent or unknown | Mark that node failed, skip downstream nodes, and make no provider request |
| A new Chat conversation is created after another conversation selected Skills | Start with an empty `skillIds` list and send an empty `skillInstructions` array |
| `$` or `/` command is dismissed with Escape | Keep the visible draft unchanged and suppress only that exact token until it changes |
| Selected application request succeeds | Clear `appId`; the next request has no application prompt |
| Selected application request fails | Restore its `appId` with the visible draft for retry |
| Template is empty or a knowledge document ID is deleted | Block save/run before any provider request |
| Empty automation stores after initial seeding | Preserve emptiness across reload |
| Temperature / top-p / max tokens outside bounds | Clamp to `0..2`, `0..1`, and `1..32768` |

### 5. Good/Base/Bad Cases

- Good: a compatible Chat Skill sends its instructions plus exact hosted tools; the same tool set runs from an Agent or Workflow without entering the local dispatcher.
- Base: first use seeds one safe declarative example set and records the seed marker.
- Bad: a generic OpenAI-compatible endpoint inherits OpenAI hosted tools, a later Workflow node fails after an earlier provider call, or a test fixture omits a tool referenced by a seeded Skill.

### 6. Tests Required

- `npm run provider-contracts`: exact OpenAI Responses, Anthropic versioned server-tool, Gemini GenerateContent, and Qwen Responses hosted-tool shapes plus explicit compatible/Kimi/DeepSeek rejection.
- `npm run automation-contracts` and `npm run search-contracts`: tool ownership metadata, independent-search preflight/injection, GLM/Kimi request shapes, credential redaction, incompatible/context-missing rejection before provider access, hosted/local/search separation, exact Chat tools, inline projection bounds, and sampling bounds.
- `tests/e2e/automation-workspace.spec.ts`: compatible tool-bearing Skill selection and exact `allowedTools`, incompatible-model disabled state, Agent knowledge context, full Workflow preflight, graph persistence, and archive round trip.
- `tests/e2e/public-navigation.spec.ts`: click `智能体` and `工作流` from desktop and mobile menus; assert `/skills` falls back to Chat.

### 7. Wrong vs Correct

```ts
// Wrong: imported workflows silently change behavior.
const agent = agents.find((item) => item.id === step.agentId) || agents[0];

// Correct: stable references either resolve exactly or fail visibly.
const agent = agents.find((item) => item.id === step.agentId);
if (!agent) throw new Error("工作流步骤引用的智能体已不存在");
```

```ts
// Wrong: persist the whole selected app or provider configuration in a conversation.
conversation.app = selectedApp;

// Correct: keep only a transient enabled app ID in session UI and compose it at send time.
patchSessionUi(conversation.id, { appId: selectedApp.id });
```

```ts
// Wrong: every tool is treated as generic function calling.
if (allowedTools.length && !model.capabilities.includes("toolCalling")) reject();

// Correct: resolve every named tool against catalog ownership, vendor, capability, and context.
const compatibility = toolSetCompatibility(allowedTools, toolSettings, model, { hasContext });
if (!compatibility.compatible) reject(compatibility.reason);
```

## Scroll And Overlay State

- All public destinations: `AppShell` marks `.figma-workspace` as `public-workspace`.
- The mobile function menu stays inside the shell and does not introduce a second scroll owner.
- Shared dialogs: the dialog root owns scrolling and temporarily suspends background owner attributes, including lazy owners mounted during the overlay.

Do not remove or restore parent attributes from a feature mount effect. That creates a lazy-load race and transiently exposes the wrong owner.

## Common Mistakes

- Persisting feature-local drafts globally during a visual refactor.
- Using `window.location` navigation and forcing a reload instead of the History API helpers.
- Selecting a route without checking menu availability.
- Storing BYOK credentials in backend configuration because the model catalog is admin-managed. The catalog and user credentials are separate boundaries.
- Leaving background scroll-owner markers active under a modal.
