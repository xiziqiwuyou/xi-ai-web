# State Management

> State ownership and persistence contracts for xi-ai-web.

## State Categories

| State | Owner | Persistence |
| --- | --- | --- |
| Public bootstrap and menu/catalog metadata | `App` | Server response only |
| Active public destination | `App` + History API | URL path |
| API URL/key and last model | `App` provider state | `sessionStorage` only |
| Shared gallery items | `App` + gallery storage helper | Existing local format |
| Feature drafts, selections, busy/error/result | Feature module | Existing feature behavior only |
| Admin authentication and console forms | Admin portal/console | Existing admin API/session cookie |

Do not introduce a global store for these boundaries. Promote state only when two routed modules must share the same live value and `App` is already the established owner.

## Public URL State

`src/app/publicRoutes.ts` is the sole route map for the six public destinations:

```text
chat -> /chat
image -> /image
mindmap -> /mindmap
agents -> /agents
apps -> /apps
gallery -> /gallery
```

Rules:

1. Resolve only visible and enabled menu items.
2. Invalid or unavailable paths fall back to the configured default, then the first available item.
3. User navigation uses `history.pushState`; canonical correction uses `replaceState`; `popstate` restores module state.
4. Menu labels, order, enabled state, and visibility remain server-owned.
5. `/admin` is an exact isolated route and is never added to public navigation.

## BYOK Contract

The storage key is `cherry-web-user-provider` with the existing payload shape:

```ts
type UserProviderConfig = {
  baseUrl: string;
  apiKey: string;
  lastModelId: string;
};
```

- Read and write through the existing provider storage helpers.
- Persist only in `window.sessionStorage`.
- Never copy these values to `localStorage`, backend metadata, URL state, logs, or public bootstrap.
- The backend receives connection data only in the user-initiated request payload required to call a provider.

## Scroll And Overlay State

- Non-chat public modules: `AppShell` marks `.workspace-frame` as `public-workspace`.
- Chat: `AppShell` has no owner; the message/empty viewport owns scrolling synchronously from `activeModule`.
- Mobile conversation sheet: its thread list owns scrolling while open.
- Shared dialogs: the dialog root owns scrolling and temporarily suspends background owner attributes, including lazy owners mounted during the overlay.

Do not remove or restore parent attributes from a feature mount effect. That creates a lazy-load race and transiently exposes the wrong owner.

## Common Mistakes

- Persisting feature-local drafts globally during a visual refactor.
- Using `window.location` navigation and forcing a reload instead of the History API helpers.
- Selecting a route without checking menu availability.
- Storing BYOK credentials in backend configuration because the model catalog is admin-managed. The catalog and user credentials are separate boundaries.
- Leaving background scroll-owner markers active under a modal.
