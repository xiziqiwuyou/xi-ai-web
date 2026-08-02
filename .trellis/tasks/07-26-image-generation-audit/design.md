# Technical Design

## Capability Contract

Add a typed image capability profile keyed by vendor and actual runtime model name. The profile is the only place that decides edit support, reference limits, output formats, quality/background support, image-size options, and prompt limits. Catalog entries keep the public label and actual request model separate; compatibility aliases are explicit.

The server remains the request authority. It validates normalized options, derives the profile from the resolved catalog entry, and passes only provider-supported fields to adapters:

- OpenAI: JSON `/images/generations`; multipart `/images/edits` for local uploads.
- BotCF native image models: JSON generation; multipart or documented HTTPS-reference JSON edit.
- BotCF `nano-banana-2`: preserve configured sync/async model naming; do not silently poll an async model without a configured status contract.

## Prompt Optimization

`ImageStudio` owns original, working, and optimized prompt state. A new client API call uses an existing chat-capable model only after explicit opt-in. The response is previewed locally; Apply replaces the working prompt and Restore returns the original. Generation always sends the working prompt.

## Timing History

Introduce `ImageGenerationTimingRecord` and an `imageGenerationHistory` IndexedDB store. The repository exposes load and append helpers with sanitization and a 60-record cap. The ETA helper uses the median of matching samples and a conservative model/mode baseline when history is insufficient. A record is written in a `finally` path, so failures are useful telemetry but no image data or API key is persisted.

## UI Structure

`image page -> header -> workbench (creation panel + compact parameter panel) -> active status -> latest results -> inspiration/history`.

The parameter panel uses grouped rows instead of a long undifferentiated stack. Model changes reset only invalid values. Results stay outside the form so completion does not shift input geometry.

## Compatibility And Rollback

Existing `GenerationPayload` fields remain optional and backwards compatible. Existing gallery records and workspace exports remain valid; the additive history collection sanitizes missing data as an empty list. If history persistence is unavailable, generation still succeeds with a static ETA.
