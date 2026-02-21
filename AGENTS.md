# AGENTS.md

## Project Purpose

This is a Chrome extension (MV3) for HubSpot contact workflows:

- Extract contacts from HubSpot contact tables
- Generate WhatsApp-ready links from phone values
- Export selected contacts (CSV/VCF)
- Copy selected emails
- Open per-contact actions:
  - `Notes` (read/create notes via HubSpot contact page automation)
  - `Email` (open contact and apply a selected email template into HubSpot composer)

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
  - Entire UI (contacts page + settings modal + notes modal + email templates page + template picker overlay)
  - Loads shared and popup modules in this order:
    1. `shared/messages.js`
    2. `shared/config.js`
    3. `popup/core.js`
    4. `popup/hubspotApi.js`
    5. `popup/settings.js`
    6. `popup/emailTemplates.js`
    7. `popup/notesFlow.js`
    8. `popup/contactsView.js`
    9. `popup/exportUtils.js`
    10. `popup.js` (bootstrap/events only)

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
  - Temporary contact-tab helper for note read/create flows

- `popup/settings.js`
  - Settings form render/load/save (`chrome.storage.sync`)
  - Email templates page open/close/save orchestration

- `popup/emailTemplates.js`
  - Template draft CRUD/editor rendering
  - Template picker overlay
  - Contact email open/apply flow

- `popup/notesFlow.js`
  - Notes modal rendering/loading/saving flow

- `popup/contactsView.js`
  - Contact table render/sort/select/actions
  - Calls `GET_CONTACTS` and portal ID retrieval
  - Deduplicates loaded contacts by Record ID before rendering

- `popup/exportUtils.js`
  - CSV/VCF export helpers and copy-email action

- `content.js`
  - Runs inside HubSpot pages
  - Extracts table data
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

- `GET_PORTAL_ID`
  - Output: `{ ok, portalId }`

- `CREATE_NOTE_ON_PAGE`
  - Input: `noteBody`
  - Creates note in currently open HubSpot contact page

- `GET_NOTES_ON_PAGE`
  - Input: `limit`
  - Returns list of note text snippets

- `APPLY_EMAIL_TEMPLATE_ON_PAGE`
  - Input: `subject`, `body`
  - Fills already-open HubSpot email composer

- `OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE`
  - Input: `subject`, `body`
  - Tries to open email composer on contact page and then fill subject/body

Source of truth:

- Define/rename types in `shared/messages.js`
- Consume in popup modules via `App.messageTypes`
- Consume in content script via `globalThis.ContactPilotShared.MESSAGE_TYPES`

## Settings Schema (`SETTINGS_KEY = "popupSettings"`)

Stored in `chrome.storage.sync`:

- `countryPrefix: string`
- `messageTemplate: string` (WhatsApp prefill; supports `[name]`)
- `noteTemplate: string`
- `rowFilterWord: string`
- `visibleColumns: Record<string, boolean>`
- `emailTemplates: Array<{ id, name, subject, body }>`

Legacy cleanup currently handled:

- `noteTemplate === "Reached out on WhatsApp"` -> cleared
- old `defaultEmailTemplateId` is ignored/stripped if present

Persistence behavior notes:

- Column visibility defaults are merged at runtime from detected columns.
- `chrome.storage.sync.set` on contacts load only happens when that merge introduces new column keys.

## UI Structure (Current)

- Main page (`#mainPage`)
  - Contact list table
  - Row actions: `Email`, `Notes`
  - Selection actions in status bar: CSV, VCF, Copy Email

- Email templates full page (`#emailTemplatesPage`)
  - Left: template list (single active row)
  - Right: active template editor (name/subject/body)
  - Actions: Back, New Template, Save Templates, Delete Template

- Email template picker overlay (`#emailTemplatePickOverlay`)
  - Opened by row `Email`
  - User picks one template for that contact action

- Settings modal (`#settingsOverlay`)
  - General settings only (not template editing)

- Notes modal (`#notesOverlay`)
  - Loads notes for selected contact
  - Adds note using current note template as starter

## Important Workflows

### Contact Extraction

1. Popup finds most recent HubSpot tab.
2. Sends `GET_CONTACTS`.
3. Content script finds header/rows heuristically, normalizes values.
4. Popup deduplicates contacts by Record ID (if Record ID column exists).
5. Popup renders contacts + actions.

### Row Email Flow

1. User clicks `Email` on a row.
2. Popup opens template picker overlay.
3. User picks template.
4. Popup opens contact tab, waits for load, sends `OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE`.
5. Content script opens composer and fills subject/body (no auto-send).

### Notes Flow

1. User clicks `Notes`.
2. Popup opens notes dialog and loads notes (`GET_NOTES_ON_PAGE` via temporary contact tab helper).
3. Save creates note (`CREATE_NOTE_ON_PAGE`) through tab automation helper.

## Fragility Notes

`content.js` relies on HubSpot DOM heuristics (labels/roles/visibility), so UI changes in HubSpot can break:

- note editor detection
- save button detection
- email composer detection
- subject/body field detection

When fixing, prefer scoring heuristics over brittle class selectors.

Timing/retry tuning:

- Do not hardcode new magic delays in popup/content modules.
- Update shared timing config in `shared/config.js` and consume via existing helpers.

## Local Verification

No formal test suite exists. Use:

- `node --check shared/messages.js`
- `node --check shared/config.js`
- `node --check popup.js`
- `node --check popup/core.js`
- `node --check popup/hubspotApi.js`
- `node --check popup/settings.js`
- `node --check popup/emailTemplates.js`
- `node --check popup/notesFlow.js`
- `node --check popup/contactsView.js`
- `node --check popup/exportUtils.js`
- `node --check content.js`

Manual smoke test:

1. Open HubSpot contacts table.
2. Click extension icon.
3. Verify contacts render and sort/filter/select works.
4. Check CSV/VCF/email copy actions.
5. Check row `Email` template picker -> open contact -> fills composer.
6. Check row `Notes` load + save note.

## Editing Guidelines

- Keep messaging contracts explicit and symmetric between popup/content.
- Keep settings backward compatible where possible.
- Preserve current UX split:
  - main workflow on contacts page
  - template management on full templates page
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
