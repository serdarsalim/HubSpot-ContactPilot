# Personal Template Import/Export Plan

## Scope
- Implement personal template import/export in the extension.
- Keep scope limited to personal templates only.
- Add settings page mode (full page) and place template data actions there.

## Import Format
- JSON object shape:
  - `version` (number)
  - `exportedAt` (ISO datetime string)
  - `templates` (array)
- Each template item:
  - `name` (string)
  - `subject` (string)
  - `body` (string)

## UX Flow
1. Open Settings page from header settings icon.
2. In Settings > Template Data:
   - `Export Personal Templates`
   - `Import Personal Templates`
3. Import opens file picker for `.json`.
4. After parse/validate, show import review modal:
   - Select templates to import (checkbox list)
   - Mode: `Add as new` or `Replace matching names`
5. Apply import and show summary:
   - added/replaced/skipped counts.

## Rules
- Personal templates only.
- Never auto-overwrite by default.
- Replace mode matches template names case-insensitively.
- Keep existing template IDs for replaced records when possible.
- If zero valid templates are selected, abort with message.

## Persistence
- Use existing local storage key for personal templates:
  - `popupEmailTemplates`
- Keep non-template settings in `chrome.storage.sync`.

## Validation
- Parse failures handled with clear status/toast.
- Invalid template entries skipped.
- Empty import file rejected.

## Delivery
- Add full Settings page mode (not popup modal).
- Add import/export actions and import review modal.
- Keep current template edit/apply flows unchanged.
