# Implementation Plan

1. Add failing contracts for neutral Chat creation/request projection, the `/xizi2333` route, username/password login, credential hashing/rotation, and session invalidation.
2. Implement the server credential store and integrate it into readiness, login, Admin bootstrap, rotation, audit, and session validation.
3. Update Admin frontend route, login form, Site Settings credential form, API/types, styles, fixtures, and deployment documentation.
4. Update local conversation creation, workspace sanitization, Chat rendering/request projection, and server prompt construction for the neutral Assistant sentinel.
5. Run targeted contracts and Playwright tests, then full typecheck/build/security checks and browser visual verification.
