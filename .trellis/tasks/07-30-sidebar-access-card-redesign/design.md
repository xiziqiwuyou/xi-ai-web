# Design

## Information Architecture

The access card keeps a compact header containing connection state and the two existing utility actions. Below it, a `figma-access-details` group contains:

1. A static endpoint row with server icon, `服务地址` label, and the configured hostname.
2. An interactive Key row with key icon, `API Key` label, and the masked suffix.

Both rows use the same three-column grid: icon, textual label/value stack, and a trailing affordance slot. The endpoint row uses a small online indicator; the Key row uses a chevron to communicate navigation to the existing dialog.

## Visual Contract

- One outer 16px card radius and one 12px details-group radius.
- Rows use a flat surface and a subtle divider rather than separate cards.
- Labels use the normal UI font, while address and masked Key values use the mono font.
- Hover/focus changes only the Key row borderless fill and foreground accent.
- No persistent glass blur, gradient, heavy shadow, or red focus frame.

## Compatibility

The existing `maskedApiKey` and `onOpenApiConfig` props remain unchanged. Mobile retains `figma-mobile-key-action`. No storage, API, or provider types change.

## Verification

Extend shell E2E to assert the grouped rows, address text, absence of the duplicated footer, row geometry, Key replacement, and privacy behavior.
