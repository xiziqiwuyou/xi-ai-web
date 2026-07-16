# Type Safety

> Type boundaries used by xi-ai-web frontend code.

## Type Organization

- Shared server/frontend payloads and domain IDs live in `src/types.ts`.
- Route-specific public types and guards live in `src/app/publicRoutes.ts`.
- Component-only props and transient UI types stay beside the owning component.
- Use `ModuleId` at existing app boundaries and narrow to `PublicModuleId` with `isPublicModuleId` before indexing the public route map.

```ts
export const publicModulePaths = {
  chat: "/chat",
  image: "/image",
  mindmap: "/mindmap",
  agents: "/agents",
  apps: "/apps",
  gallery: "/gallery"
} as const satisfies Record<PublicModuleId, string>;
```

## Runtime Boundaries

- Bootstrap and admin data use the existing API client/domain types. Preserve server normalization rather than recasting payloads in components.
- Browser storage must pass through the existing sanitizer/load/save helpers before becoming component state.
- DOM queries use concrete element generics, for example `querySelectorAll<HTMLElement>()`.
- Ref types include `null`; callback props state whether they return `void` or `Promise<void>`.

## Forbidden Patterns

- Do not use `any`, `@ts-ignore`, unchecked route-map indexing, or repeated inline casts of shared payloads.
- Do not redefine `UserProviderConfig`, menu item shapes, or model catalog entries inside feature components.
- Do not use stringly typed public paths outside `publicRoutes.ts` except tests that assert the canonical contract.

## Verification

Run `npm run check` after type or prop changes. Route changes additionally require the public navigation E2E suite; storage changes require the BYOK browser test and `npm run privacy`.
