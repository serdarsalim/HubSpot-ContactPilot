# HubSpot Contact Point

A Chrome extension that adds fast outreach workflows on top of HubSpot contact views.

## What It Does

- Extracts visible contacts from HubSpot tables
- Generates WhatsApp-ready links from phone values
- Adds one-click row actions for:
  - `Email` (choose a template, open contact, fill HubSpot composer subject/body)
  - `Notes` (view and add notes)
- Supports selection action:
  - Copy selected emails
- Includes a dedicated full-page Email Templates workspace
- Includes dark mode support for:
  - Contact Point extension UI
  - HubSpot page theming (applied from the extension toggle)

## Quick Start (Local Install)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (`wa-extension`)
5. Open a HubSpot contacts page (`https://app.hubspot.com/*`)
6. Click the extension icon to open Contact Point

## Permissions

- `storage`: save extension settings and templates
- `tabs`: find/open HubSpot tabs and contact records
- Content script only runs on `https://app.hubspot.com/*`

## Notes

- The extension uses UI automation heuristics on HubSpot pages. If HubSpot changes DOM structure, selectors may require updates.
- Email flow does **not** auto-send; it fills draft content only.
- HubSpot dark mode is powered by the bundled Dark Reader engine (MIT licensed).

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [`LICENSE`](./LICENSE) for the full text.
