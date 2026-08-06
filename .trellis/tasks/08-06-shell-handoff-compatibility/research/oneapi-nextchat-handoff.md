# OneAPI Next-Web Handoff Research

## Source inspected

- `songquanpeng/one-api` commit `8df4a2670b98266bd287c698243fff327d9748cf`
- `web/default/src/components/TokensTable.js`, `onCopy()` and `onOpenLink()`

## Confirmed behavior

OneAPI opens Next-Web with a fragment such as:

```text
https://app.nextchat.dev/#/?settings={"key":"sk-<token-key>","url":"<server-address>"}
```

The value is the user's actual OneAPI model token with the `sk-` prefix. The browser-side function reads the token record it already owns and injects it directly into Next-Web settings. It does not send a Shell login JWT to a refresh endpoint, and it does not exchange the value server-to-server.

## Comparison with xi-ai-web

| Aspect | OneAPI -> Next-Web | Shell type 3 -> xi-ai-web |
| --- | --- | --- |
| URL payload | Actual model API Key | Shell login JWT (`x_s_token`) |
| Receiver action | Parse settings and use Key | Call same-origin exchange route |
| Upstream dependency | No user-login refresh call | `/api/user/login/refresh` then `/api/token/default` |
| Failure currently observed | N/A | Shell rejects the incoming login token |
| URL risk | Long-lived Key exists in fragment | Short-lived login JWT exists in fragment |

## Implications

1. OneAPI's mechanism is a valid compatibility reference, but it does not fix a Shell type-3 token that the Shell control plane rejects.
2. xi-ai-web can support the OneAPI `#/?settings=...` format as an explicit, operator-gated direct-Key handoff. It must read only `settings.key`, ignore `settings.url`, immediately scrub the hash, and keep the Key only in existing session storage. The administrator-managed upstream remains authoritative.
3. Supporting the OneAPI format does not help a Shell configuration that only exposes `{{x_s_token}}`; Shell would need to expose an actual model-token placeholder for the direct-Key path, which must not be assumed.
4. The safer universal design remains a short-lived, single-use handoff code exchanged server-to-server. It requires explicit support from the external identity/token platform.

## Recommendation

Implement two explicitly separated handoff kinds:

- `shell-jwt`: retain the existing `#/jwt_auth?x_s_token=...` bridge for Shell type 3.
- `oneapi-settings`: add an opt-in OneAPI/Next-Web-compatible `#/?settings=...` direct-Key importer.

Do not infer one format from the other. Do not accept URL-provided upstream addresses. Keep the direct-Key compatibility feature disabled by default and expose it as an administrator-controlled setting with clear risk text.
