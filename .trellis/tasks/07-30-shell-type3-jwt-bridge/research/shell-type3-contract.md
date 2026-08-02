# ShellAPI Type 3 Contract

## Sources

- `web/antd/src/helpers/utils.tsx` at commit `b95138f11458bb9f6433a6c9bafb124f4163e394`
- `web/antd/src/components/JwtLoginWaiting.tsx` at the same commit
- `middleware/jwt.go`, `router/api.go`, and `controller/token.go` at the same commit

Repository: `Next-AGI-Org/ShellAPI-BAC`.

## Findings

- `type: 3` generates `/#/jwt_auth?x_s_token=${localStorage.getItem('X-S-Token')}`.
- `x_s_token` is sent as the `X-S-Token` request header to `/api/user/login/refresh`.
- A successful refresh returns a new JWT in `token` and establishes the Shell user identity.
- `/api/token/default` runs `JWTAuth` plus `UserAuth`; its controller returns the user's initial token record in `data`, including `data.key`.
- Shell model relay also supports JWT auth through `X-S-Token`, but xi-ai-web uses its existing API-Key request model. Exchanging to the default model Key minimizes changes and preserves provider adapter behavior.
- The model token key is stored without the `sk-` prefix in Shell's token record; Shell's type-2 link prepends `sk-` before handing it to a chat client.

## Decision

Implement a same-origin, request-only bridge that validates/refreshes the Shell JWT and returns a normalized default API Key. Do not store the JWT or use it directly as a model credential.
