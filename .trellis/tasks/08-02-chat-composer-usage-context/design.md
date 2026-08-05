# Technical Design

## Ownership

- `ChatSessionBlock` derives display-only usage/context summaries and renders the compact toolbar controls.
- `ChatModule` remains the owner of saved `ChatSessionSettings` and exposes one immediate context-count update callback.
- `ChatSessionSettingsDialog` removes only the duplicated referenced-history slider; the typed setting and request-selection behavior remain in `chatSessionSettings.ts`.

## Usage Contract

The latest assistant message controls the provider-usage display. When it has `usage`, show input/output/total values as reported by the API. When it does not, select the current outbound history through `selectChatHistory` and sum the existing local Token estimator plus message overhead. Label this value as an estimate so it cannot be mistaken for provider billing data.

## Context Control

The composer menu projects string menu values back to `ChatContextMessageCount` (`number | null`). A selection updates both the live settings object and settings draft, then writes through the existing sessionStorage helper. No conversation or IndexedDB schema changes are introduced.

## Responsive Behavior

The new controls live inside the existing horizontally reachable `.figma-session-tools` row. They reuse `FigmaMenu`, small rounded controls, and the existing 44px mobile target rule. No new card or separate settings surface is added.

## Rollback

Restore the dialog slider and per-message usage block, remove the immediate settings callback, and delete the scoped toolbar styles/tests. Typed settings and request payloads remain backward compatible throughout.
