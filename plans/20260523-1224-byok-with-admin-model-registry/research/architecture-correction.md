# Architecture Correction

Date: 2026-05-23

## Corrected boundary

- No user login.
- Public users must provide their own `baseUrl` and `apiKey`.
- Backend does not manage user credentials.
- Backend manages only model catalog metadata.

## Backend-managed metadata

- provider/vendor kind
- model id/name
- display label
- capability tags
- default capability bindings
- enabled/disabled state

## Public-managed data

- baseUrl
- apiKey
- last selected model/provider preference

## Routing consequence

- Server combines public connection info with admin-managed model metadata.
- Endpoint path and request format come from provider kind.
- Model choice comes from the backend catalog.
