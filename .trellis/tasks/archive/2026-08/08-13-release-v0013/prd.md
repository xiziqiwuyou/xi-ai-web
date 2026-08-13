# v0.0.13 Approved Remote MCP Release

## Goal

Publish the locally verified v0.0.13 source and multi-architecture container
release without changing the operator-only MCP enablement boundary.

## Requirements

- Publish the four verified commits ending at `21a8d35` to `master`.
- Create and push an annotated `v0.0.13` tag pointing to the same commit.
- Verify the branch and tag GitHub Actions runs, including amd64/arm64 GHCR
  publication for `v0.0.13`, the full SHA tag, and `latest`.
- Preserve both MCP execution switches as disabled by default.
- Distinguish image publication from production deployment. Do not claim
  `chat.xi-api.cn` runs v0.0.13 until its health endpoint reports that version.
- Keep real MCP execution operator-only until `MCP_LIVE_ENDPOINT` is supplied
  for an approved public HTTPS no-auth endpoint and the live smoke succeeds.

## Acceptance Criteria

- [x] The committed v0.0.13 snapshot passes `npm run qa`.
- [x] MCP Playwright coverage passes 12/12 across four standard viewports.
- [x] `master` and annotated `v0.0.13` point to `21a8d35` on GitHub.
- [x] Branch and tag container workflows complete successfully.
- [x] GHCR publishes `v0.0.13`, the full SHA tag, and `latest` as a
      multi-architecture image.
- [x] Online smoke reports the deployed site honestly as v0.0.12 and healthy;
      no v0.0.13 deployment is claimed.
- [x] Missing `MCP_LIVE_ENDPOINT` is recorded as an explicit skip, not a pass.

## Out Of Scope

- Updating the production server or 1Panel deployment.
- Real Provider API calls.
- Enabling remote MCP execution for public users.
- Multi-instance approval/session coordination.

