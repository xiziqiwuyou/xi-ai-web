# Phase 01 - Provider Registry Schema

## Overview

Status: Planned  
Priority: P0  

先把数据模型定死。后台必须能表达厂商、模型、能力、凭据、默认值和端点映射，前台才能按厂商和模型做选择。

## Requirements

- Provider kinds:
  - `openai`
  - `anthropic`
  - `gemini`
  - `openai-compatible`
- Provider record should include:
  - display name
  - kind
  - baseUrl
  - apiKey storage in backend only
  - enabled flag
  - supported capabilities
  - model catalog
- Model record should include:
  - model id / name
  - label
  - capability tags
  - default for a capability
  - enabled flag
  - optional endpoint override

## Proposed Server Data

```ts
type ProviderRegistryEntry = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKeyEncrypted?: string;
  enabled: boolean;
  models: ProviderModelEntry[];
};

type ProviderModelEntry = {
  id: string;
  model: string;
  label: string;
  capabilities: ProviderCapability[];
  defaultsFor?: ProviderModelCapability[];
  enabled: boolean;
  endpointOverrides?: Partial<Record<ProviderCapability, string>>;
};
```

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
- Create: `C:\Users\56252\Documents\New project 2\server\registry\provider-registry.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`

## Implementation Steps

1. Replace the old public-facing provider config shape with registry metadata.
2. Keep backwards compatibility with existing `providers` array in `data/app-data.json`.
3. Add migration helpers:
   - old provider `defaultModel` becomes first chat model.
   - old provider `capabilities` become model capability tags.
4. Add server-side lookup helpers:
   - `getProvider(id)`
   - `getProviderModel(providerId, modelId)`
   - `getModelsForCapability(providerId, capability)`

## Success Criteria

- Backend can describe all configured providers and models.
- Existing data still loads.
- No public page needs raw provider URLs or keys anymore.

## Risk

- Existing admin provider editor assumes one `defaultModel`.
- Mitigation: treat that as legacy and derive the first model entry from it.
