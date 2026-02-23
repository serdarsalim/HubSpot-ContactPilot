# HubSpot Contact Point

A Chrome extension for HubSpot contact workflows with fast template-driven outreach.

## What It Does

- Extracts visible contacts from HubSpot contact tables
- Provides row actions using symbols/icons for:
  - `Email` (pick template and prefill HubSpot email composer)
  - `WhatsApp` (pick template and open WhatsApp Web message)
  - `Notes` (load notes and create notes)
- Supports an `Active Tab` workspace to run Email/WhatsApp/Notes actions directly from the currently open HubSpot contact tab
- Exports selected contacts to CSV/VCF
- Copies selected emails
- Includes dedicated managers for Email, WhatsApp, and Note templates
- Persists per-contact sent indicators for Email/WhatsApp template usage
- Supports dark mode for extension UI and optional HubSpot theming

## Quick Start (Local Install)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `contact-point`
5. Open a HubSpot page under `https://app.hubspot.com/*`
6. Click the extension icon to open Contact Point

## Permissions

- `storage`: save extension settings and templates
- `tabs`: find/open HubSpot tabs and contact records
- Content script scope: `https://app.hubspot.com/*`

## Storage Model

- `chrome.storage.sync`:
  - General settings (`popupSettings`)
- `chrome.storage.local`:
  - Email templates (`popupEmailTemplates`)
  - WhatsApp templates (`popupWhatsappTemplates`)
  - Note templates (`popupNoteTemplates`)

## Notes

- The extension uses HubSpot DOM automation heuristics. If HubSpot changes UI structure, automation selectors may need updates.
- Email flow does not auto-send; it fills a draft only.
- Notes flow is guarded to target note composer actions only and uses in-flight button locking to avoid duplicate submits.
- HubSpot dark mode support uses the bundled Dark Reader engine (MIT licensed).

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [`LICENSE`](./LICENSE) for the full text.
