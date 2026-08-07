# Release v0.0.10 Design

## Boundary

`v0.0.10` is an immutable patch release after `v0.0.9`. Its product change is
the already verified DeepSeek Responses compatibility. Release-only edits are
limited to version sources, Compose image pins, README deployment references,
release notes, task records, commit, tag, and push.

## Publish Flow

1. Update package/lock versions and every root `v0.0.9` deployment pin to
   `v0.0.10`.
2. Add an evidence-bounded `v0.0.10` section to `RELEASE_NOTES.md`.
3. Run release checks and scan the staged release diff for supplied secrets.
4. Commit as `release: prepare v0.0.10`.
5. Create annotated `v0.0.10`, push `master` and the tag through the temporary
   approved Git transport, and confirm remote refs.
6. Archive and journal the release task, then push the bookkeeping commits to
   `master` without moving the release tag.

## Rollback

Operators can pin `ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.9`, pull, and restart.
The release does not mutate persistent model records or require a data
migration.
