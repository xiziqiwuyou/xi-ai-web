# Release v0.0.9 Design

## Release Boundary

`v0.0.9` is a patch release after immutable `v0.0.8`. It packages two
independent completed bodies of work: Chat vision/search safety and
production-acceptance diagnostics. The release does not claim that an image
has been built, deployed, or live-provider tested until GitHub Actions and an
operator report those results separately.

## Version Source Of Truth

`package.json` is the product version source. `package-lock.json` mirrors it,
`server/app-version.mjs` projects it through health and operations routes, and
Compose templates pin the published GHCR tag. Human-readable release notes
record the same immutable tag.

## Publishing Flow

1. Commit the P0 diagnostics as a feature commit.
2. Commit the version/docs/template bump as `release: prepare v0.0.9`.
3. Create annotated tag `v0.0.9` on that release commit.
4. Push `master` and the tag. The existing GitHub workflow verifies and builds
   multi-architecture GHCR images for branch and tag references.

## Risk Controls

- Keep real credentials out of commands, diffs, tags, and release notes.
- Use the SOCKS proxy only as Git transport configuration for the push command;
  do not persist it into repository configuration or files.
- Check that `v0.0.9` does not already exist locally or remotely before
  creating the tag.
- Do not amend or overwrite `v0.0.8`.

## Rollback

Operators can switch Compose image references back to
`ghcr.io/xiziqiwuyou/xi-ai-web:v0.0.8`, then run `docker compose pull` and
`docker compose up -d`.
