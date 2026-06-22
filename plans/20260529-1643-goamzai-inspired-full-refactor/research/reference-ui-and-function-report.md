# Reference UI and Function Report

Date: 2026-05-29

Sources:

- Frontend screenshots: https://d.goamzai.com/screenshot/user.html
- Admin screenshots: https://d.goamzai.com/screenshot/manage.html

## What The Reference System Shows

The reference is a broad AI portal, not just a chat client. The screenshots expose these front-facing areas:

- Login and authorization entry.
- AI chat with conversation list, model selection, assistant style cards, rich composer.
- AI painting with model/style controls, prompt form, generated gallery.
- AI music/audio workflow.
- AI PPT generation workflow.
- AI applications / app marketplace.
- AI gallery / public work wall.
- Mind map generation.
- PDF conversation.
- User center and account-level pages.
- Mobile user pages.

The admin screenshots imply:

- Dashboard and operational metrics.
- User management.
- Model/config management.
- Content/application management.
- Order/package/payment-related pages.
- System settings.

## Applicable To This Project

Keep and adapt:

- Portal-style workspace.
- Left product navigation plus feature pages.
- Card-based app/assistant marketplace.
- Unified model picker.
- Rich generation workbenches.
- Gallery/history of generated results.
- PDF/knowledge chat surfaces.
- Admin controls for menus, models, assistants, and feature visibility.

Reject or defer:

- User registration/login for public users.
- Payment, membership, package, balance, promotion, invite system.
- Backend-stored public user API keys.
- Exact reference branding, screenshots, copyrighted graphics, sample content.

Reason: existing product boundary is BYOK public usage plus admin-managed model catalog.

## UI Pattern Extraction

Use these patterns without cloning:

- Left vertical navigation with compact icon-first items.
- Main content uses dashboard/workbench cards with strong visual hierarchy.
- Feature pages split into control panel + result/history panel.
- App/assistant library uses grid cards, categories, search, tags.
- Generated content gallery uses masonry-like cards and preview actions.
- Mobile layout collapses navigation and prioritizes the active workspace.

## Functional Mapping

| Reference Area | Current Module | Target Module |
| --- | --- | --- |
| AI chat | `chat` | upgrade visual shell, attachments, model/actions bar |
| AI painting | `image` | richer prompt/settings/result gallery |
| AI music/audio | `audio` | audio workbench, TTS/music mode separation |
| AI PPT | none | new `ppt` module MVP |
| AI applications | `agents` / `assistants` | app/agent marketplace surface |
| Gallery | result-only local state | new `gallery` or integrated history |
| Mind map | none | new `mindmap` module MVP |
| PDF chat | `knowledge` partial | new PDF mode inside knowledge |
| User center | `settings` | keep only BYOK settings, no account |
| Admin | `admin` route | expand feature/menu/model/app management |

## Constraints

- Public users do not log in.
- API URL and key stay browser-side/request-time only.
- Admin only manages system metadata.
- Vendor adapters stay backend-routed by model catalog.
- Avoid adding paid SaaS complexity until explicitly requested.

