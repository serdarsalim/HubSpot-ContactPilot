# AGENTS.md

## Project Purpose

This is a Chrome extension (MV3) for HubSpot contact workflows:

- Extract contacts from HubSpot contact tables
- Generate WhatsApp-ready links from phone values
- Export selected contacts (CSV/VCF)
- Copy selected emails
- Open per-contact actions:
  - `Email` (open contact and apply selected email template into HubSpot composer)
  - `WhatsApp` (open WhatsApp with selected template)
  - `Notes` (read/create notes via HubSpot contact page automation)
- Run account-level actions from the currently active HubSpot contact tab

Main domain scope is `https://app.hubspot.com/*`.

## Runtime Architecture

- `manifest.json`
  - MV3 extension config
  - Permissions: `storage`, `tabs`
  - Content scripts on HubSpot pages (load order matters):
    1. `shared/messages.js` (message contract constants)
    2. `shared/config.js` (timing/retry constants)
    3. `content.js` (HubSpot DOM extraction/automation)
  - Background service worker: `background.js`

- `background.js`
  - Handles toolbar click
  - Opens/focuses a dedicated popup window running `popup.html`

- `popup.html`
  - Entire UI (contacts page, active tab page, settings page, notes modal, template pages, picker overlays)
  - Loads shared and popup modules in this order:
    1. `shared/messages.js`
    2. `shared/config.js`
    3. `vendor/tinymce/tinymce.min.js`
    4. `popup/core.js`
    5. `popup/analytics.js`
    6. `popup/hubspotApi.js`
    7. `popup/settings.js`
    8. `popup/emailTemplates.js`
    9. `popup/whatsappTemplates.js`
    10. `popup/noteTemplates.js`
    11. `popup/activeTabView.js`
    12. `popup/notesFlow.js`
    13. `popup/contactsView.js`
    14. `popup/exportUtils.js`
    15. `popup.js` (bootstrap/events only)

- `popup.js`
  - Thin bootstrap/event wiring only
  - Runs startup init: load settings -> load contacts -> adjust sticky layout

- `popup/core.js`
  - Shared popup app container (`window.PopupApp`)
  - DOM references, constants, in-memory state, common helpers
  - Exposes shared contracts/timing (`App.messageTypes`, `App.timing`)

- `popup/hubspotApi.js`
  - HubSpot tab discovery and portal detection
  - Message send/retry wrappers for notes and portal ID
  - Contact-tab helper for note read/create flows
  - Retries on a fresh contact tab when receiver is missing on an existing tab

- `popup/settings.js`
  - Settings page render/load/save
  - Personal template import/export
  - Template page open/close orchestration

- `popup/emailTemplates.js`
  - Email template draft CRUD/editor rendering
  - Email template picker overlay
  - Contact email open/apply flow

- `popup/whatsappTemplates.js`
  - WhatsApp template draft CRUD/editor rendering
  - WhatsApp template picker overlay
  - WhatsApp open/apply flow

- `popup/noteTemplates.js`
  - Note template draft CRUD/editor rendering
  - Notes template dropdown population in notes modal

- `popup/activeTabView.js`
  - Active HubSpot tab context loading (`recordId`, `portalId`, contact fields)
  - Active-tab action buttons: `Email`, `WhatsApp`, `Notes`

- `popup/notesFlow.js`
  - Notes modal rendering/loading/saving flow
  - Save button busy lock (`Sending...`) to prevent duplicate submits

- `popup/contactsView.js`
  - Contact table render/sort/select/actions
  - Calls `GET_CONTACTS` and portal ID retrieval
  - Deduplicates loaded contacts by Record ID before rendering

- `popup/exportUtils.js`
  - CSV/VCF export helpers and copy-email action

- `popup/analytics.js`
  - Extension telemetry helpers (non-workflow-critical)

- `content.js`
  - Runs inside HubSpot pages
  - Extracts table data and active-record context
  - Automates note and email composer interactions by DOM heuristics

- `shared/messages.js`
  - Canonical message type constants shared by popup/content

- `shared/config.js`
  - Canonical timing/retry constants shared by popup/content

## Message Contracts (Popup -> Content)

Implemented message types:

- `GET_CONTACTS`
  - Input: `countryPrefix`, `messageText`, `loadAll`
  - Output: `{ ok, columns, contacts, phoneColumnId }`

- `GET_ACTIVE_TAB_CONTEXT`
  - Output: `{ ok, context }` where context includes record/portal/contact info when available

- `GET_PORTAL_ID`
  - Output: `{ ok, portalId }`

- `CREATE_NOTE_ON_PAGE`
  - Input: `noteBody`
  - Creates note on currently open HubSpot contact page

- `GET_NOTES_ON_PAGE`
  - Input: `limit`
  - Returns list of note text snippets

- `APPLY_EMAIL_TEMPLATE_ON_PAGE`
  - Input: `subject`, `body`, `bodyHtml`
  - Fills already-open HubSpot email composer

- `OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE`
  - Input: `subject`, `body`, `bodyHtml`
  - Opens email composer on contact page and fills subject/body

Source of truth:

- Define/rename types in `shared/messages.js`
- Consume in popup modules via `App.messageTypes`
- Consume in content script via `globalThis.ContactPilotShared.MESSAGE_TYPES`

## Settings and Storage

Keys:

- Sync settings key: `popupSettings`
- Local template keys:
  - `popupEmailTemplates`
  - `popupWhatsappTemplates`
  - `popupNoteTemplates`

Stored in `chrome.storage.sync` (`popupSettings`):

- `countryPrefix: string`
- `messageTemplate: string` (currently maintained as blank)
- `noteTemplate: string` (currently maintained as blank)
- `rowFilterWord: string`
- `visibleColumns: Record<string, boolean>`

Stored in `chrome.storage.local`:

- `emailTemplates: Array<{ id, name, subject, body }>` under `popupEmailTemplates`
- `whatsappTemplates: Array<{ id, name, body }>` under `popupWhatsappTemplates`
- `noteTemplates: Array<{ id, name, body }>` under `popupNoteTemplates`

Import/export format in Settings is strict and current-only:

- Required top-level arrays:
  - `emailTemplates`
  - `whatsappTemplates`
  - `noteTemplates`

## UI Structure (Current)

- Main page (`#mainPage`)
  - Contact list table
  - Row actions: symbol buttons for `WhatsApp`, `Email`, `Notes`
  - Per-contact sent indicators for email and WhatsApp template picks
  - Selection actions in status bar: CSV, VCF, Copy Email

- Active tab page (`#activeTabPage`)
  - Shows current HubSpot record context
  - Actions: `Email`, `WhatsApp`, `Notes`

- Email templates page (`#emailTemplatesPage`)
- WhatsApp templates page (`#whatsappTemplatesPage`)
- Note templates page (`#noteTemplatesPage`)
  - Left: template list
  - Right: active template editor
  - Autosave state + delete controls

- Email template picker overlay (`#emailTemplatePickOverlay`)
- WhatsApp template picker overlay (`#whatsappTemplatePickOverlay`)

- Settings page (`#settingsPage`)
  - General settings
  - Personal template import/export controls

- Notes modal (`#notesOverlay`)
  - Loads notes for selected contact
  - Template dropdown can populate note input
  - Save uses busy state to avoid duplicate sends

## Important Workflows

### Contact Extraction

1. Popup finds most recent HubSpot tab.
2. Sends `GET_CONTACTS`.
3. Content script finds header/rows heuristically, normalizes values.
4. Popup deduplicates contacts by Record ID (if available).
5. Popup renders contacts and actions.

### Row Email Flow

1. User clicks `Email` on a row.
2. Popup opens email template picker.
3. User picks template.
4. Popup opens/focuses contact tab and sends `OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE`.
5. Content script opens composer and fills subject/body (no auto-send).

### Row WhatsApp Flow

1. User clicks `WhatsApp` on a row.
2. Popup opens WhatsApp template picker.
3. User picks template.
4. Popup opens WhatsApp Web link with templated message.

### Notes Flow

1. User clicks `Notes`.
2. Popup opens notes dialog and loads notes (`GET_NOTES_ON_PAGE`).
3. Save creates note (`CREATE_NOTE_ON_PAGE`) via contact-tab helper.
4. Save button is disabled and labeled `Sending...` during in-flight request.

### Active Tab Flow

1. User opens Active Tab page.
2. Popup asks content script for `GET_ACTIVE_TAB_CONTEXT`.
3. If active tab is a HubSpot contact record, Email/WhatsApp/Notes actions are enabled without reloading contacts list.

## Fragility Notes

`content.js` relies on HubSpot DOM heuristics (labels/roles/visibility), so UI changes in HubSpot can break:

- note editor detection
- note submit control detection
- email composer detection
- subject/body field detection

When fixing, prefer scoped scoring heuristics over brittle class selectors.

Timing/retry tuning:

- Do not hardcode magic delays in popup/content modules.
- Update shared timing config in `shared/config.js` and consume via existing helpers.

## Local Verification

No formal test suite exists. Use:

- `node --check shared/messages.js`
- `node --check shared/config.js`
- `node --check popup.js`
- `node --check popup/core.js`
- `node --check popup/analytics.js`
- `node --check popup/hubspotApi.js`
- `node --check popup/settings.js`
- `node --check popup/emailTemplates.js`
- `node --check popup/whatsappTemplates.js`
- `node --check popup/noteTemplates.js`
- `node --check popup/activeTabView.js`
- `node --check popup/notesFlow.js`
- `node --check popup/contactsView.js`
- `node --check popup/exportUtils.js`
- `node --check content.js`

Manual smoke test:

1. Open HubSpot contacts table.
2. Click extension icon.
3. Verify contacts render and sort/filter/select works.
4. Check CSV/VCF/copy-email actions.
5. Check row `Email` picker -> open contact -> fills composer.
6. Check row `WhatsApp` picker -> opens WhatsApp link with template text.
7. Check row `Notes` load + save note.
8. Check Active Tab page actions on a single open contact page.

## Editing Guidelines

- Keep messaging contracts explicit and symmetric between popup/content.
- Keep settings and storage keys intentional and documented.
- Preserve current UX split:
  - main contact-list workflow
  - active-tab workflow
  - dedicated template management pages
- Do not add auto-send behavior without explicit guardrails and user confirmation.

## Ideation Protocol

- If the user says `ideate`, discussion-only mode is active.
- In discussion-only mode, do not edit files, run mutating commands, or implement changes.
- Stay in discussion-only mode until the user explicitly gives a clear go-ahead to implement.

## Git/Repo Notes

- Core extension files:
  - `manifest.json`
  - `background.js`
  - `popup.html`
  - `popup.js`
  - `popup/` (modular popup logic)
  - `shared/` (shared contracts/config)
  - `content.js`
- Ignore macOS metadata:
  - `.DS_Store` (via `.gitignore`)
