# Phase 03: Workspace and Module Cards

Status: planned
Priority: P0

## Goal

Add Xiaohongshu-like content card energy to the main workspace.

## Changes

Modify:
- `C:\Users\56252\Documents\New project 2\src\styles.css`
- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`

## Design Details

Top bar:
- Floating glass header.
- Search box with softer inset surface.
- Admin button as red pill-like command.

Workspace:
- Add glass surface to `.conversation-panel`, `.chat-stage`, `.module-placeholder`, `.assistant-library`.
- Make thread cards resemble compact content notes:
  - thumbnail-like red/blue icon patch or edge accent.
  - active card has red top shine and stronger shadow.

Message cards:
- Assistant messages: white glass with red-tinted top border.
- User messages: blue-tinted but soft.
- Markdown code blocks keep high contrast.

## Success Criteria

- Workspace feels layered.
- Chat still reads as a work interface.
- Placeholder modules look designed, not empty.
