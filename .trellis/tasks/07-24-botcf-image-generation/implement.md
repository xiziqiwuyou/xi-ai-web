# Implementation Plan

1. Add the BotCF vendor, defaults, catalog presets, and provider registry route.
2. Implement `server/providers/botcf.mjs` plus provider-contract coverage for native Images, multipart edit, URL edit, and Gemini Chat modes.
3. Extend the shared image request type and server validation for multiple local references and HTTPS reference URLs.
4. Update the image studio with BotCF-specific reference input controls and preserve existing provider controls.
5. Update UI/static and browser coverage, then run typecheck, contracts, targeted tests, and build.
