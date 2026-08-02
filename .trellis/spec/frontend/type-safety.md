# Type Safety

> Type boundaries used by xi-ai-web frontend code.

## Type Organization

- Shared server/frontend payloads and domain IDs live in `src/types.ts`.
- Route-specific public types and guards live in `src/app/publicRoutes.ts`.
- Component-only props and transient UI types stay beside the owning component.
- Use `ModuleId` at existing app boundaries and narrow to `PublicModuleId` with `isPublicModuleId` before indexing the public route map.

```ts
export const publicRoutes = [
  { id: "chat", path: "/chat" },
  { id: "image", path: "/image" },
  { id: "agents", path: "/agents" },
  { id: "workflows", path: "/workflows" },
  { id: "ppt", path: "/ppt" },
  { id: "mindmap", path: "/mindmap" },
  { id: "assistants", path: "/assistants" },
  { id: "translate", path: "/translate" }
] as const satisfies ReadonlyArray<{ id: ModuleId; path: `/${string}` }>;
```

## Runtime Boundaries

- Bootstrap and admin data use the existing API client/domain types. Preserve server normalization rather than recasting payloads in components.
- Admin bootstrap can briefly cross versions during local HMR or a rolling deployment. Normalize legacy payloads in `src/adminBootstrap.ts` before component state; missing `modelVendors`, `vendorId`, or `vendorLabel` must never be handled with scattered component fallbacks.
- `Assistant` includes one `category`, normalized `tags`, ordered `starterPrompts`, and `enabled`. Public bootstrap contains enabled records; Admin bootstrap may contain disabled records. Components must not invent a parallel profile type or infer identity from card order.
- Browser storage must pass through the existing sanitizer/load/save helpers before becoming component state.
- `UserAgentDefinition.category` and `tags` remain backward-compatible optional input fields, while the workspace sanitizer projects missing values to `通用效率` and `[]`.
- Full workspace imports use `WorkspaceExportEnvelope` and `WorkspaceSnapshot`; strict validation rejects invalid records and duplicate IDs/keys before any transaction begins.
- `AgentWorkflowNodeKind` is an explicit allowlist: `start`, `agent`, `template`, `knowledge`, and `reply`. Archive sanitizers reject unknown kinds, non-`output`/`input` handles, blank template data, and knowledge nodes without bounded document IDs.
- Chat command parsing returns a discriminated `ActiveChatCommand` (`skill` or `app`) with stable text offsets. Do not infer command type from display labels or send command IDs to the server.
- `ModelCapability` includes fine-grained `webSearch`, `urlContext`, and `codeExecution`. `ToolSetting` carries execution ownership, required capability, supported vendors, and context requirements; feature components consume this shared contract instead of inferring support from tool names.
- `ChatStreamPayload.allowedTools` and `AgentRunPayload.allowedTools` are explicit string arrays. Omitted means no tools; do not overload `skillInstructions`, prompt text, or model capability flags as an implicit tool request.
- `ChatStreamPayload.toolInvocationMode` is the closed `"prompt" | "function"` union. `responseVerbosity` is the closed OpenAI `"low" | "medium" | "high"` union and is mapped only by the native OpenAI adapter. Usage projections use normalized numeric input/output/total token fields on the final assistant `Message` and never contain credentials or raw provider payloads.
- `SearchServiceConfig` is shared request/session data, never a workspace record. `ChatStreamPayload.searchService` and `AgentRunPayload.searchService` are optional and may be projected only when `allowedTools` contains `web_search`; Chat constructs it from a narrowed `SearchProviderKind` plus `UserProviderConfig` rather than accepting a second credential form.
- Knowledge Admin payloads use the shared `KnowledgeAdminSettings`, `KnowledgeAdminLimits`, `KnowledgeAdminAccount`, `KnowledgeAdminInvite`, `KnowledgeAdminJob`, `KnowledgeAdminAuditEntry`, and `KnowledgeAdminPage<T>` contracts. Do not duplicate these shapes in the Admin component.
- `KnowledgeAdminSectionId` is the exact six-value union used by desktop navigation, the grouped mobile select, and `KnowledgeAdminSection`. Account status, registration mode, invite status, job status, and audit result remain closed unions rather than arbitrary strings after API parsing.
- Admin job retry/cancel returns `{ job: KnowledgeAdminJob }`. The reusable job type contains safe status/progress/error-code projections only; do not add lease owner, raw error detail, object keys, document text, or credentials to it.
- Potential bigint capacity values are decimal strings in Admin read models. Convert only at a bounded presentation/edit boundary; never coerce server usage totals with `Number()` and then send the rounded value back.
- Optimistic writes carry the exact server `version` as `expectedVersion`. Invite/reset plaintext exists only in the create/issue response type and is absent from reusable list/read types.
- Cloud library payloads use `KnowledgeBase`, `KnowledgeEmbeddingProfile`, `KnowledgeCloudDocument`, `KnowledgeCloudDocumentStatus`, `KnowledgeUploadGrant`, and `KnowledgeCleanupJob`. The browser sends stable IDs and optimistic versions; owner IDs and object keys are never writable CRUD fields.
- Quota and logical byte projections are decimal strings. Convert only for bounded display; upload declarations remain safe integers and server HEAD remains authoritative.
- `KnowledgeUploadGrant` is the sole frontend type containing the generated COS key and temporary credentials. It is returned only by `createKnowledgeUploadGrant` and must not be merged into `KnowledgeCloudDocument` or workspace types.
- DOM queries use concrete element generics, for example `querySelectorAll<HTMLElement>()`.
- Ref types include `null`; callback props state whether they return `void` or `Promise<void>`.

## Scenario: Admin Model Display And Request Mapping

### 1. Scope / Trigger

- Trigger: any change to model catalog Admin forms, public model selectors, request payloads, catalog normalization, or provider dispatch.

### 2. Signatures

```ts
type ModelCatalogEntry = {
  id: string;
  order: number;
  vendor: ProviderKind;
  endpointProtocol: ModelEndpointProtocol;
  label: string;
  model: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  enabled: boolean;
};
```

- Admin create/update: `POST|PATCH /api/admin/model-catalog`
- User execution payloads: `{ modelId: ModelCatalogEntry["id"] }`
- Server dispatch: `findModelEntry(catalog, modelId)` then adapter input `{ model: entry.model }`

### 3. Contracts

- `id` is the stable internal selection and request reference. Editing visible text must not change it.
- `order` is the server-owned global display and fallback priority. Missing legacy values normalize from source array position and Admin reorder sends every current model ID exactly once.
- `defaultFor` remains serialized only for backward-compatible metadata round trips. Public selectors and runtime fallbacks must not use it; they choose the first enabled compatible model by `order` after honoring a valid browser `lastModelId`.
- `label` is the frontend display name. Public selectors render it and may fall back to `model` only for legacy invalid records.
- `model` is the exact provider request model name. It may be long or vendor-specific and is never replaced by `label` during dispatch.
- `endpointProtocol` is the exact chat wire protocol. It is independent from `vendor`, which remains presentation and parameter-normalization metadata.
- Admin always labels and validates `前台显示名称` and `实际请求模型名`. It exposes `对话请求端点` only when `capabilities` contains `chat`; media-only models show the vendor adapter's dedicated request channel directly in the inspector instead. The stored `endpointProtocol` remains normalized for compatibility but never selects image, audio, video, or embedding routes.
- Public feature requests send the selected catalog `id`, not `label` or a copied raw model name.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Empty Admin `label` | Reject before save with `前台显示名称不能为空` |
| Empty Admin `model` | Reject before save with `实际请求模型名不能为空` |
| Unknown/disabled `modelId` | Reject before provider access |
| Display label edited | Keep the same `id` and provider `model` |
| Long actual request name | Wrap in Admin preview; do not expose it in public selectors |
| Missing legacy endpoint protocol | Normalize by vendor before bootstrap or dispatch |
| Media-only model stores a chat protocol | Hide the chat selector and show the dedicated media route; provider media methods remain vendor-owned |

### 5. Good/Base/Bad Cases

- Good: `id=fast-chat`, `label=极速对话`, and `model=provider/chat-production-long-context-2026-07` remain distinct through Admin, Chat, and provider dispatch.
- Base: a preset uses the same readable value for `label` and `model` but still sends its stable `id` from the frontend.
- Bad: a selector submits `label`, a provider receives `label`, or changing `label` creates a new catalog identity.

### 6. Tests Required

- Provider contract: resolve a stable ID, build the runtime provider, and assert the outgoing provider body uses the mapped `model` and never `label`.
- Admin E2E: assert both editable fields, the absence of the retired mapping preview, independent empty-field errors, and no save request for invalid data.
- Admin media E2E: assert OpenAI/Gemini image-only entries have no `对话请求端点` control and show their dedicated image routes.
- Provider contract: assert a stored Responses protocol cannot replace OpenAI `/v1/images/generations` or Gemini `generateContent` media methods.
- Public E2E: assert the short label is visible, the raw long model is absent, and the outbound app request contains the stable `modelId`.

### 7. Wrong vs Correct

```ts
// Wrong: visible copy becomes a provider protocol value.
send({ model: selectedModel.label });

// Correct: the browser sends identity; the server owns protocol mapping.
send({ modelId: selectedModel.id });
adapter.completeText({ model: resolvedEntry.model, messages });
```

## Forbidden Patterns

- Do not use `any`, `@ts-ignore`, unchecked route-map indexing, or repeated inline casts of shared payloads.
- Do not redefine `UserProviderConfig`, menu item shapes, or model catalog entries inside feature components.
- Do not cast or parse Assistant launch JSON inside Studio or Chat; use `src/features/assistants/assistantLaunch.ts` as the single version/expiry/storage boundary.
- Do not add API credentials, provider connection fields, executable Skill scripts, or unknown datasets to `WorkspaceSnapshot`.
- Do not use arbitrary template engines, `eval`, dynamically imported node code, or raw knowledge document text inside persisted workflow definitions. Persist bounded declarative references and resolve local text at execution time.
- Do not use stringly typed public paths outside `publicRoutes.ts` except tests that assert the canonical contract.
- Do not cast independent search or provider-hosted tools into local function-tool types. The server resolver owns the disjoint `localTools` / `searchTools` / `hostedTools` split.
- Do not widen `KnowledgeAdminSectionId`, account status, registration mode, or audit result to `string` to simplify a select handler; narrow at the event boundary against the shared union.
- Do not add `inviteCode` or `resetCode` to `KnowledgeAdminInvite`, `KnowledgeAdminAccount`, Admin bootstrap, or persisted form state. Plaintext belongs only to the one-time mutation response.

## Verification

Run `npm run check` after type or prop changes. Route changes additionally require the public navigation E2E suite; storage changes require the BYOK browser test and `npm run privacy`.
