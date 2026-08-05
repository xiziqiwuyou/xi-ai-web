# Design

## Boundaries

- Keep protected management APIs at `/api/admin/*`; only the SPA page route changes to `/xizi2333`.
- Keep `Conversation.assistantId` as a string for archive compatibility; the empty string is the explicit neutral-chat sentinel.
- Keep operator credentials outside `app-data.json` in `DATA_DIR/admin-credentials.json` so metadata export/restore cannot copy or overwrite authentication secrets.

## Admin credential store

- Add a server-only credential store initialized from `ADMIN_USERNAME` (default `xizi2333`) and `ADMIN_PASSWORD`.
- If `admin-credentials.json` exists, its valid versioned record overrides bootstrap credentials.
- Persist `username`, a random salt, a `scrypt` hash, a random credential revision, and `updatedAt`; never persist plaintext.
- Write through a same-directory temporary file and atomic rename with restrictive file mode where supported.
- Login compares normalized username and password-derived bytes with timing-safe equality and returns one generic failure response.
- Session payloads include the current credential revision. Rotation changes the revision, clears the current cookie, and invalidates every prior cookie even when `ADMIN_SESSION_SECRET` is stable.
- Rotation requires an authenticated session plus the current password. A blank new password preserves the current password by hashing the supplied current password into the new record.

## Frontend flow

- `AdminPortal` renders username and password inputs and posts both fields.
- Authenticated Admin bootstrap includes only the current username, never credential hashes or salts.
- Site Settings owns a compact credential form for current password, new username, optional new password, and confirmation. Success returns to the login shell with a one-time notice.

## Neutral Chat flow

- `createLocalConversation()` accepts an optional Assistant and stores `assistantId: ""` when absent.
- Generic New Conversation and first hydration create neutral conversations. Assistant-library launch passes an explicit Assistant.
- Chat request construction allows a missing Assistant only when the stored binding is empty. Non-empty missing bindings still stop with an error.
- The server treats an absent/empty `assistantId` as no Assistant and builds provider context from Skills, knowledge, and search only.

## Compatibility and rollback

- Existing assistant-bound archives remain valid; workspace sanitization now accepts both empty and non-empty assistant IDs.
- Existing `/api/admin/*` integrations remain unchanged.
- Deleting `DATA_DIR/admin-credentials.json` restores deployment-provided credentials on restart.
