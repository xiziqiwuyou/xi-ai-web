# Implementation Plan

1. P0: Add registry and Admin route regression tests for placeholder removal and
   explicit empty catalog persistence.
2. P1: Remove placeholder entries from server defaults and Admin presets; bump
   metadata version and add the one-time cleanup migration.
3. P2: Fix model registry reconciliation so explicit empty arrays stay empty,
   while omitted data still receives fallback defaults.
4. P3: Verify public model filtering, Admin delete flow, and custom
   OpenAI-compatible model creation remain valid.
5. P4: Run targeted registry/server tests and all relevant contracts.
6. P5: Run typecheck, build, privacy, feature, security, release checks, review
   the diff, commit, archive the task, and record the session.
