# Implementation Plan

1. Add the documented Shell JWT exchange service with bounded parsing and redacted errors.
2. Add a guarded public exchange route using the administrator-managed upstream origin.
3. Add strict Hash consumption and one-shot startup orchestration in the frontend.
4. Add pending and failure states to the existing API connection flow without creating another credential UI.
5. Add server unit tests and BYOK E2E coverage for success, failure, URL scrubbing, and storage privacy.
6. Update Trellis frontend/backend credential-boundary specifications.
7. Run targeted checks, full relevant gates, browser verification, and `git diff --check`.
