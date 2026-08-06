# Technical Design

## 1. Boundary

The browser receives an external handoff, parses only a bounded opaque value, and sends it once to the same-origin exchange route. The server owns the only outbound control-plane call and derives its origin from the administrator-managed `UPSTREAM_BASE_URL`. The browser stores only the resulting normalized API Key in the existing session-only provider store.

The canonical existing contract remains:

```text
https://chat.xi-ai.cn/#/jwt_auth?x_s_token=<short-lived-shell-token>
```

The external contract is now known: `type: 2` is reserved for ShellNext, while other external systems such as xi-ai-web must use `type: 3`. xi-ai-web must not implement a type 2 adapter. The type value is routing metadata owned by the launcher, not an authorization signal; the actual type 3 token must still be parsed and validated.

## 2. Failure taxonomy

Introduce a bounded internal/public error code mapping, for example:

| Code | Meaning | Retry | Secret exposure |
| --- | --- | --- | --- |
| `HANDOFF_MISSING` | No supported token arrived | No | None |
| `HANDOFF_UNSUPPORTED` | Route or parameter shape is unknown | No | None |
| `HANDOFF_INVALID` | Local validation rejected the value | No | None |
| `UPSTREAM_AUTH_EXPIRED` | Control plane rejected token with 401/403 | No, regenerate externally | None |
| `UPSTREAM_ENDPOINT_MISSING` | Expected control-plane endpoint returned 404/405 | No, operator fix | None |
| `UPSTREAM_UNAVAILABLE` | Network/5xx failure | Yes | None |
| `UPSTREAM_TIMEOUT` | Bounded timeout | Yes | None |
| `DEFAULT_KEY_UNAVAILABLE` | Login succeeded but no usable default Key | No, operator/account fix | None |
| `HANDOFF_ROUTE_MISSING` | Running service does not expose the exchange route | No, deploy matching version | None |

The exact code names may follow existing error conventions, but messages must remain stable and localized. A request id is safe to show and log. Never log the token, its raw hash, query string, response body, or Key.

## 3. Browser flow

1. Parse the current hash before public bootstrap.
2. Normalize only the verified canonical shape or a verified type 2 shape.
3. Remove the handoff from the address bar immediately with `replaceState`.
4. Keep the opaque value only in a short-lived in-memory state/ref while the exchange is pending.
5. Deduplicate by token identity within the current page lifecycle; do not persist it.
6. Call the same-origin exchange endpoint.
7. On success, sanitize and save the returned Key through the existing session provider helper.
8. On retryable failure, expose an in-page retry action while the in-memory handoff is still alive. On a full page reload after the URL was scrubbed, require a new external handoff rather than recovering a secret from storage.
9. On permanent failure, show the existing manual Key form with the stable reason and a short operator hint.

The UI must distinguish “未检测到嵌入令牌” from “外部令牌已过期”; both may still offer manual Key entry, but only retryable classes offer retry.

## 4. Server flow

1. Apply the existing shell route guard, request size limit, timeout, no-store headers and same-origin endpoint.
2. Validate only `{ token }` for the canonical exchange. A future type 2 adapter must map into a typed internal request before this point; it must not let the client choose an upstream URL or endpoint.
3. Call `/api/user/login/refresh` with `X-S-Token`, `redirect: "error"`, bounded response parsing and the request abort signal.
4. Use a refreshed token when the upstream returns one, then call `/api/token/default`.
5. Map status/shape failures to the bounded taxonomy, redact upstream messages, and return only `{ apiKey }` on success.
6. Include a non-secret request id in server diagnostics and response error details where the existing API error envelope permits it.

## 5. Type 3 diagnosis gate

Before changing the exchange implementation, record from a real type 3 redirect:

- final generated URL shape;
- token parameter name and location;
- whether its token is the expected Shell login JWT, not a model API Key;
- refresh/default-token endpoint paths and required headers;
- whether the control plane is the same origin as `UPSTREAM_BASE_URL`.

If the type 3 token and control-plane facts match the existing exchange, retain the current parser and improve diagnostics/retry behavior. If they do not match, fix the endpoint/header/response contract based on evidence rather than adding type 2 logic. If the value is a long-lived API Key, reject URL transport and require an explicit safer handoff design.

## 6. Operational compatibility

The route and static frontend must be deployed as one version. Add a health/readiness or diagnostic assertion that the running instance exposes the exchange route, so an old Node process/container cannot silently appear as an expired-token failure. Do not expose token values in this diagnostic.

## 7. Rollback

The canonical type 3 path remains unchanged until the new diagnostics and tests pass. Type 2 compatibility is feature-gated by a verified parser contract. If live validation fails, disable only the new adapter and retain manual Key entry; do not weaken the existing validation or upstream security policy.
