# Deprecated Model Cleanup Design

## Data migration

Increment the metadata version to 14. During migration from older metadata,
filter only the reserved IDs `compatible-chat` and `compatible-video` before
vendor reconciliation. Models using the OpenAI-compatible adapter under any
other ID remain untouched.

## Empty catalog semantics

`reconcileModelRegistry` must distinguish an omitted catalog from an explicit
empty array. An omitted catalog uses fallback defaults for legacy/bootstrap
compatibility; an explicit empty array remains empty. The normalized catalog
must pass an empty fallback when the explicit source is empty so the generic
normalizer cannot reintroduce defaults.

## Compatibility

The OpenAI-compatible vendor remains in the default vendor list and the adapter
registry. Administrators can create a real model by selecting that vendor and
providing the actual model name and endpoint mapping.

## Validation

Add model registry assertions for placeholder absence and explicit empty
reconciliation. Add a server route regression that boots legacy metadata,
removes the placeholder, deletes the last real model, restarts, and verifies the
catalog remains empty.
