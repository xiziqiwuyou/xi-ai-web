# Technical Design

## Storage Boundary

Add a dedicated append-only `image-generation-timing.jsonl` store under the existing server data directory. Records contain only model ID, mode, resolution, aspect ratio, count, duration, and timestamp. The store has bounded retention and compaction and is independent from browser workspace exports and the Admin model-usage log.

## Estimate Contract

The estimate key is `(modelId, mode, resolution, aspectRatio, count)`. The store selects successful records newest-first and uses at most 10 samples. It prefers an exact key, then the same model and mode, then the same model. The estimate is the arithmetic mean of the selected durations, bounded to 8 seconds through 10 minutes. With no samples, it returns the existing parameter-aware baseline.

The public contract is:

```text
GET /api/image/timing-estimate?... -> ImageGenerationTimingEstimate
POST /api/generate/image -> GenerationResult.timingEstimate
```

The GET endpoint reads no credential and validates that `modelId` is an enabled image model. A successful POST records the completed upstream duration before returning the refreshed estimate. Failed, empty-result, timeout, and cancelled requests are not recorded.

## Frontend Flow

`ImageStudio` requests an estimate whenever the selected model or image parameters change and aborts stale reads. A successful generation adopts the estimate returned with the result. The progress bar and elapsed/estimated label keep using `estimatedMs`; only the source of that value changes. Existing IndexedDB timing records remain import-compatible but are no longer read or written by Image Studio.

## Rollback

Removing the new endpoint/store and restoring the former `loadImageGenerationHistory` effect returns to browser-local estimation without changing provider payloads or gallery records.
