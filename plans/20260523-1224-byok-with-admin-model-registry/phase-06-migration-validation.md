# Phase 06 - Migration and Validation

## Overview

Status: Completed  
Priority: P0

迁移旧的“后台托管凭据”方案，回到 BYOK + 管理员模型目录的正确边界。

## Validation

- `npm run check`
- `npm run build`
- `GET /api/public/bootstrap`
- `GET /api/admin/bootstrap`
- public page still requires URL / Key
- admin page only edits model catalog

## Migration

- Remove any backend persistence of public user api keys.
- Move model metadata to admin-managed catalog.
- Keep existing browser-side user connection state.
- Convert old provider defaults into catalog defaults where possible.

## Success Criteria

- No user login is required.
- No user credential is stored in admin backend.
- Public users can still use the app with their own endpoint and key.
