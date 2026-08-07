# DeepSeek Responses Endpoint Implementation Plan

## P0. Research And Contract

- [x] Verify the official DeepSeek Responses URL, supported model, request
  fields, streaming terminal events, and stateless tool semantics.
- [x] Record the compatibility boundary and preserve the four existing
  endpoint protocol values.

## P1. Adapter And Routing

- [x] Add the opt-in stateless Responses tool-loop mode to the shared OpenAI
  Responses adapter.
- [x] Add the DeepSeek Responses wrapper and route it only for a DeepSeek
  model explicitly configured with `openai-responses`.
- [x] Keep DeepSeek Chat Completions normalization unchanged.

## P2. Catalog And Admin Semantics

- [x] Mark only `deepseek-v4-flash` in server and frontend shipped presets as
  `openai-responses`.
- [x] Clarify the existing Responses protocol label/details for OpenAI,
  DeepSeek, and Qwen compatibility without adding a new endpoint enum.

## P3. Regression Coverage

- [x] Add exact DeepSeek Responses non-streaming and streaming contracts.
- [x] Add reasoning/max-output projection and stateless function-call round
  assertions.
- [x] Add fresh catalog assertions for v4-flash/v4-pro endpoint separation.

## P4. Verification And Finish

- [x] Run check, build, privacy, provider contracts, feature audit, and server
  tests.
- [ ] Run `git diff --check`, update the backend spec, commit, and archive the
  task. Do not publish a version from this task.
