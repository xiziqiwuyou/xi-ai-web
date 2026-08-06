# Remove deprecated compatible placeholder models

## Goal

Stop exposing the shipped `Compatible Chat` / `Compatible Video` placeholder
models as if they were real provider models, while preserving the
OpenAI-compatible adapter for administrator-created models.

## Requirements

- Remove the placeholder entries from server defaults and Admin addable presets.
- Migrate existing metadata by removing only the reserved shipped placeholder
  IDs; preserve other OpenAI-compatible entries.
- Preserve explicit empty model catalogs through normalization and restart.
- Keep the OpenAI-compatible vendor and adapter available for real configured
  models.
- Keep public model selection and default fallback behavior valid when a user
  deletes a model.

## Acceptance Criteria

- [ ] `Compatible Chat` and `Compatible Video` are absent from fresh public and
      Admin catalogs and from addable presets.
- [ ] Existing persisted `compatible-chat` / `compatible-video` entries are
      removed during the next metadata normalization.
- [ ] Deleting the final configured model leaves an empty catalog after restart;
      default models are not silently recreated.
- [ ] A custom OpenAI-compatible vendor/model can still be created and routed.
- [ ] Existing model registry, Admin route, provider, and feature audits pass.

## Notes

- This does not remove the `openai-compatible` adapter or vendor option.
- No browser workspace, provider request protocol, or API Key behavior changes.
