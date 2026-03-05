(() => {
  const DEFAULT_COUNTRY_CODE = "";
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;
  const shared = globalThis.ContactPilotShared || {};
  const MESSAGE_TYPES = shared.MESSAGE_TYPES || Object.freeze({
    GET_CONTACTS: "GET_CONTACTS",
    GET_ACTIVE_TAB_CONTEXT: "GET_ACTIVE_TAB_CONTEXT",
    GET_PORTAL_ID: "GET_PORTAL_ID",
    CREATE_NOTE_ON_PAGE: "CREATE_NOTE_ON_PAGE",
    GET_NOTES_ON_PAGE: "GET_NOTES_ON_PAGE",
    APPLY_EMAIL_TEMPLATE_ON_PAGE: "APPLY_EMAIL_TEMPLATE_ON_PAGE",
    OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE: "OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE"
  });
  const TIMING = shared.TIMING?.content || Object.freeze({
    tableScrollDelayMs: 240,
    noteComposerOpenAttempts: 20,
    noteComposerOpenDelayMs: 400,
    noteEditorSettleDelayMs: 250,
    noteSaveSettleDelayMs: 1200,
    noteReadRetryAttempts: 14,
    noteReadRetryDelayMs: 450,
    emailComposerOpenAttempts: 20,
    emailComposerOpenDelayMs: 300
  });
  const SETTINGS_KEY = "popupSettings";
  const EMAIL_TEMPLATES_LOCAL_KEY = "popupEmailTemplates";
  const WHATSAPP_TEMPLATES_LOCAL_KEY = "popupWhatsappTemplates";
  const NOTE_TEMPLATES_LOCAL_KEY = "popupNoteTemplates";
  const TEMPLATE_USAGE_LOCAL_KEY = "popupTemplateUsageByContact";
  const INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY = "popupInlineNoteTemplateUsageByContact";
  const CLOUD_AUTH_LOCAL_KEY = "popupCloudAuth";
  const CLOUD_AUTH_LIST_LOCAL_KEY = "popupCloudAuthList";
  const CLOUD_EMAIL_CACHE_PREFIX = "popupCloudEmailTemplates::";
  const CLOUD_WHATSAPP_CACHE_PREFIX = "popupCloudWhatsappTemplates::";
  const CLOUD_NOTE_CACHE_PREFIX = "popupCloudNoteTemplates::";
  const CLOUD_TEMPLATE_ID_PREFIX = "cloud_";
  const INLINE_QUICK_ACTIONS_ROOT_ID = "cpInlineQuickActionsRoot";
  const INLINE_QUICK_ACTIONS_STYLE_ID = "cpInlineQuickActionsStyle";
  const INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY = "popupInlineQuickActionsPosition";
  const INLINE_QUICK_ACTIONS_CHECK_INTERVAL_MS = 900;
  const DARK_READER_THEME = Object.freeze({
    brightness: 100,
    contrast: 90,
    sepia: 10
  });

  function normalizeThemeMode(value) {
    return String(value || "").toLowerCase() === "dark" ? "dark" : "light";
  }

  function getDarkReaderApi() {
    const api = globalThis.DarkReader;
    if (!api) return null;
    if (typeof api.enable !== "function" || typeof api.disable !== "function") return null;
    return api;
  }

  function applyHubSpotThemeMode(themeMode) {
    const mode = normalizeThemeMode(themeMode);
    const darkReader = getDarkReaderApi();
    if (!darkReader) return false;

    if (mode === "dark") {
      if (typeof darkReader.setFetchMethod === "function" && typeof globalThis.fetch === "function") {
        darkReader.setFetchMethod(globalThis.fetch.bind(globalThis));
      }
      darkReader.enable(DARK_READER_THEME);
      return true;
    }

    darkReader.disable();
    return true;
  }

  function applyHubSpotThemeFromSettingsStorage() {
    try {
      chrome.storage.sync.get(SETTINGS_KEY, (result) => {
        if (chrome.runtime.lastError) return;
        const settings = result?.[SETTINGS_KEY];
        applyHubSpotThemeMode(settings?.themeMode || "light");
        applyInlineQuickActionsSettings(settings);
      });
    } catch (_error) {
      // Ignore storage read failures.
    }
  }

  function subscribeHubSpotThemeChanges() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!changes) return;

        if (areaName === "sync" && Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) {
          const nextSettings = changes[SETTINGS_KEY]?.newValue;
          applyHubSpotThemeMode(nextSettings?.themeMode || "light");
          applyInlineQuickActionsSettings(nextSettings);
        }

        if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY)) {
          const nextPosition = normalizeInlineQuickActionsPosition(changes[INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY]?.newValue);
          inlineQuickActionsState.position = nextPosition;
          applyInlineQuickActionsPosition();
        }

        if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, TEMPLATE_USAGE_LOCAL_KEY)) {
          inlineQuickActionsState.templateUsageByContact = normalizeInlineTemplateUsageMap(
            changes[TEMPLATE_USAGE_LOCAL_KEY]?.newValue
          );
          if (inlineQuickActionsState.activeKind) {
            renderInlineQuickActionsPanel(inlineQuickActionsState.activeKind);
          }
        }

        if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY)) {
          inlineQuickActionsState.noteTemplateUsageByContact = normalizeInlineNoteTemplateUsageMap(
            changes[INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY]?.newValue
          );
          if (inlineQuickActionsState.activeKind === "note") {
            renderInlineQuickActionsPanel("note");
          }
        }

        if (areaName === "local") {
          const changedKeys = Object.keys(changes);
          const templatesDataChanged = changedKeys.some((key) => {
            return (
              key === EMAIL_TEMPLATES_LOCAL_KEY ||
              key === WHATSAPP_TEMPLATES_LOCAL_KEY ||
              key === NOTE_TEMPLATES_LOCAL_KEY ||
              key === CLOUD_AUTH_LIST_LOCAL_KEY ||
              key === CLOUD_AUTH_LOCAL_KEY ||
              key.startsWith(CLOUD_EMAIL_CACHE_PREFIX) ||
              key.startsWith(CLOUD_WHATSAPP_CACHE_PREFIX) ||
              key.startsWith(CLOUD_NOTE_CACHE_PREFIX)
            );
          });

          if (templatesDataChanged && inlineQuickActionsState.rootEl) {
            void refreshInlineQuickActionsData().then(() => {
              if (inlineQuickActionsState.activeKind) {
                renderInlineQuickActionsPanel(inlineQuickActionsState.activeKind);
              }
            });
          }
        }
      });
    } catch (_error) {
      // Ignore storage subscription failures.
    }
  }

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isDashLikePlaceholder(value) {
    const text = cleanText(value);
    if (!text) return false;
    const compact = text.replace(/[\s|_]+/g, "");
    if (!compact) return false;
    return /^[-–—−‐‑‒﹘﹣－]+$/.test(compact);
  }

  function hasMeaningfulCellValue(value) {
    const text = cleanText(value);
    if (!text) return false;
    if (isDashLikePlaceholder(text)) return false;
    const compact = text.replace(/[\s\-–—|_]+/g, "");
    return compact.length > 0;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function slugify(input) {
    return cleanText(input)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "column";
  }

  function stripOuterNoise(text) {
    return cleanText((text || "").replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "").replace(/\s*--\s*--\s*/g, " "));
  }

  function removeLeadingInitials(name) {
    const tokens = cleanText(name).split(" ").filter(Boolean);
    if (tokens.length < 2) return cleanText(name);

    const isInitialToken = (token) => {
      const cleaned = token.replace(/[^A-Za-z]/g, "");
      return cleaned.length >= 1 && cleaned.length <= 2 && cleaned === cleaned.toUpperCase();
    };

    while (tokens.length > 1 && isInitialToken(tokens[0])) {
      tokens.shift();
    }

    return cleanText(tokens.join(" "));
  }

  function sanitizeNameValue(rawName) {
    const withoutPreview = cleanText(rawName).replace(/\bpreview\b/gi, " ");
    return removeLeadingInitials(stripOuterNoise(withoutPreview));
  }

  function cleanPhoneCandidate(raw) {
    let text = cleanText(raw || "");
    if (!text) return "";

    // Keep trailing digit groups intact (e.g. +90 544 157 14 74).
    // Trimming short suffixes here can clip valid international numbers.
    return cleanText(text);
  }

  function normalizePhone(raw, countryPrefix = DEFAULT_COUNTRY_CODE) {
    const trimmed = cleanPhoneCandidate(raw);
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    const prefix = String(countryPrefix || DEFAULT_COUNTRY_CODE).replace(/\D/g, "");

    // International number already has explicit country code.
    if (trimmed.startsWith("+")) return digits;
    // International format with leading 00 (e.g. 0060...).
    if (digits.startsWith("00")) return digits.slice(2);
    // Already starts with configured prefix.
    if (prefix && digits.startsWith(prefix)) return digits;

    if (prefix) {
      // Local format with trunk zero: 017... -> 60 + 17...
      if (digits.startsWith("0")) return `${prefix}${digits.slice(1)}`;
      // Short local numbers likely missing country code.
      if (digits.length <= 9) return `${prefix}${digits}`;
    } else {
      // No default prefix configured: avoid guessing for local numbers.
      if (digits.startsWith("0")) return null;
    }

    // Looks like a full international number without +.
    return digits;
  }

  function findHeaderRow() {
    const rows = Array.from(document.querySelectorAll("thead tr, [role='row']"));
    let best = null;
    let bestScore = 0;

    for (const row of rows) {
      const headerCells = Array.from(row.querySelectorAll("th, [role='columnheader']"));
      if (!headerCells.length) continue;

      const labels = headerCells.map((cell) => cleanText(cell.innerText || cell.textContent || ""));
      const score = labels.filter((label) => label && !/^[-|]+$/.test(label)).length;

      if (score > bestScore) {
        bestScore = score;
        best = { row, headerCells, labels };
      }
    }

    return bestScore >= 2 ? best : null;
  }

  function buildColumns(headerInfo) {
    const used = new Set();
    const columns = [];

    headerInfo.headerCells.forEach((cell, sourceIndex) => {
      const rawLabel = cleanText(cell.innerText || cell.textContent || "");
      if (!rawLabel) return;
      if (/^[-|]+$/.test(rawLabel)) return;

      let id = slugify(rawLabel);
      let count = 2;
      while (used.has(id)) {
        id = `${slugify(rawLabel)}_${count}`;
        count += 1;
      }

      used.add(id);
      columns.push({ id, label: rawLabel, sourceIndex });
    });

    return columns;
  }

  function getDataRows(headerInfo) {
    const headerRow = headerInfo.row;
    const table = headerRow.closest("table");

    if (table) {
      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      if (bodyRows.length) return bodyRows;
    }

    return Array.from(document.querySelectorAll("[role='row']")).filter((row) => {
      if (row === headerRow) return false;
      const hasHeaderCells = row.querySelectorAll("th, [role='columnheader']").length > 0;
      if (hasHeaderCells) return false;
      const cellCount = row.querySelectorAll("td, [role='gridcell']").length;
      if (!cellCount) return false;
      if (row.offsetParent === null) return false;
      return true;
    });
  }

  function findPhoneColumnId(columns) {
    const phoneCol = columns.find((c) => /phone/i.test(c.label));
    return phoneCol ? phoneCol.id : null;
  }

  function findNameColumnId(columns) {
    const nameCol = columns.find((c) => /name/i.test(c.label) || /^name(_\d+)?$/i.test(c.id));
    return nameCol ? nameCol.id : null;
  }

  function applyMessageTemplate(template, values, nameColumnId) {
    const rawName = cleanText(values?.[nameColumnId || ""] || "");
    const firstName = rawName ? rawName.split(" ")[0] : "";
    return String(template || "").replace(/\[name\]/gi, firstName);
  }

  function extractValuesFromRow(row, columns) {
    const cells = Array.from(row.querySelectorAll("td, [role='gridcell']"));
    if (!cells.length) return null;

    const values = {};
    for (const col of columns) {
      const cell = cells[col.sourceIndex] || null;
      let value = cleanText(cell?.innerText || cell?.textContent || "");

      if (!value) {
        values[col.id] = "";
        continue;
      }

      if (/name/i.test(col.label) || /^name(_\d+)?$/i.test(col.id)) {
        value = sanitizeNameValue(value);
      }

      values[col.id] = value;
    }

    return values;
  }

  function extractRecordIdFromRow(row) {
    if (!(row instanceof Element)) return "";
    const anchor = row.querySelector("a[href*='/record/0-1/']");
    const href = anchor?.getAttribute("href") || "";
    const match = String(href).match(/\/record\/0-1\/(\d+)/i);
    return match ? String(match[1]) : "";
  }

  function buildContactFromValues(row, values, columns, phoneColumnId, nameColumnId, countryPrefix, messageText) {
    if (!values) return null;
    const rowValues = Object.values(values);
    const dashOnlyRow = rowValues.length > 0 && rowValues.every((value) => isDashLikePlaceholder(value));
    if (dashOnlyRow) return null;

    const hasAny = Object.values(values).some((value) => hasMeaningfulCellValue(value));
    if (!hasAny) return null;

    let phoneRaw = "";
    if (phoneColumnId) {
      phoneRaw = cleanPhoneCandidate(values[phoneColumnId] || "");
    }

    if (!phoneRaw) {
      const firstPhoneCell = Object.values(values).find((v) => PHONE_PATTERN.test(v));
      phoneRaw = cleanPhoneCandidate(firstPhoneCell || "");
    }

    const phoneDigits = phoneRaw ? normalizePhone(phoneRaw, countryPrefix) || "" : "";
    const baseWaUrl = phoneDigits ? `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number` : "";
    const text = cleanText(applyMessageTemplate(messageText, values, nameColumnId));
    const waUrl = baseWaUrl ? (text ? `${baseWaUrl}&text=${encodeURIComponent(text)}` : baseWaUrl) : "";
    const recordId = extractRecordIdFromRow(row);
    const key = recordId ? `record_${recordId}` : columns.map((c) => values[c.id] || "").join("|");

    return {
      key,
      recordId,
      values,
      phoneDisplay: phoneRaw || values[phoneColumnId || ""] || "",
      phoneDigits,
      waUrl
    };
  }

  function collectContactsFromRows(rows, columns, phoneColumnId, nameColumnId, countryPrefix, messageText, seenKeys, contacts) {
    for (const row of rows) {
      const values = extractValuesFromRow(row, columns);
      const contact = buildContactFromValues(row, values, columns, phoneColumnId, nameColumnId, countryPrefix, messageText);
      if (!contact) continue;
      if (seenKeys.has(contact.key)) continue;
      seenKeys.add(contact.key);
      contacts.push(contact);
    }
  }

  function isScrollableElement(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const overflowY = String(style.overflowY || "").toLowerCase();
    const canScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (!canScroll) return false;
    return element.scrollHeight - element.clientHeight > 60;
  }

  function findTableScrollContainer(headerInfo) {
    const seeds = [
      headerInfo?.row?.closest("table"),
      headerInfo?.row?.closest("[role='grid']"),
      headerInfo?.row
    ].filter(Boolean);

    for (const seed of seeds) {
      let node = seed;
      while (node && node !== document.body) {
        if (isScrollableElement(node)) return node;
        node = node.parentElement;
      }
    }

    const fallback = document.scrollingElement || document.documentElement;
    return fallback || null;
  }

  async function extractTableContactsWithAutoScroll(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const headerInfo = findHeaderRow();
    if (!headerInfo) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const columns = buildColumns(headerInfo);
    if (!columns.length) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const phoneColumnId = findPhoneColumnId(columns);
    const nameColumnId = findNameColumnId(columns);
    const contacts = [];
    const seen = new Set();
    const collectSnapshot = () => {
      const rows = getDataRows(headerInfo);
      collectContactsFromRows(rows, columns, phoneColumnId, nameColumnId, countryPrefix, messageText, seen, contacts);
    };

    collectSnapshot();

    const scroller = findTableScrollContainer(headerInfo);
    if (!scroller) return { columns, contacts, phoneColumnId };

    const startTop = scroller.scrollTop;

    try {
      scroller.scrollTop = 0;
      await sleep(TIMING.tableScrollDelayMs);
      collectSnapshot();

      let stableBottomRounds = 0;
      let previousHeight = scroller.scrollHeight;
      let previousCount = contacts.length;

      for (let i = 0; i < 180; i += 1) {
        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const step = Math.max(220, Math.floor(scroller.clientHeight * 0.85));
        const nextTop = Math.min(maxTop, scroller.scrollTop + step);
        scroller.scrollTop = nextTop;

        await sleep(TIMING.tableScrollDelayMs);
        collectSnapshot();

        const newMaxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const atBottom = scroller.scrollTop >= newMaxTop - 2;
        const heightChanged = Math.abs(scroller.scrollHeight - previousHeight) > 1;
        const countChanged = contacts.length !== previousCount;

        if (atBottom && !heightChanged && !countChanged) {
          stableBottomRounds += 1;
        } else {
          stableBottomRounds = 0;
        }

        previousHeight = scroller.scrollHeight;
        previousCount = contacts.length;

        if (stableBottomRounds >= 6) break;
      }

      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      await sleep(TIMING.tableScrollDelayMs);
      collectSnapshot();
    } finally {
      scroller.scrollTop = startTop;
    }

    return { columns, contacts, phoneColumnId };
  }

  function extractTableContacts(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const headerInfo = findHeaderRow();
    if (!headerInfo) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const columns = buildColumns(headerInfo);
    if (!columns.length) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const phoneColumnId = findPhoneColumnId(columns);
    const nameColumnId = findNameColumnId(columns);

    const contacts = [];
    const seen = new Set();
    const rows = getDataRows(headerInfo);
    collectContactsFromRows(rows, columns, phoneColumnId, nameColumnId, countryPrefix, messageText, seen, contacts);

    return { columns, contacts, phoneColumnId };
  }

  function getPortalIdFromPath() {
    const match = String(location.pathname || "").match(/\/contacts\/(\d+)\//i);
    return match ? match[1] : "";
  }

  function getRecordIdFromPath() {
    const match = String(location.pathname || "").match(/\/record\/0-1\/(\d+)/i);
    return match ? match[1] : "";
  }

  function inferObjectKindFromPath() {
    const objectTypeMatch = String(location.pathname || "").match(/\/record\/0-(\d+)\//i);
    if (!objectTypeMatch) return "unknown";
    const objectTypeId = objectTypeMatch[1];
    if (objectTypeId === "1") return "contact";
    if (objectTypeId === "2") return "company";
    if (objectTypeId === "3") return "deal";
    return "record";
  }

  function findActiveContactName() {
    const heading = Array.from(document.querySelectorAll("h1, [data-test-id*='name'], [data-selenium-test*='record-name']"))
      .map((el) => cleanText(el.textContent || ""))
      .find(Boolean);
    return sanitizeNameValue(heading || "");
  }

  function findActiveContactEmail() {
    const labeledEmail = findLabeledFieldValue(/\bemail\b/i, /\S+@\S+\.\S+/i, 120);
    if (labeledEmail) return labeledEmail.toLowerCase();

    const mailto = Array.from(document.querySelectorAll("a[href^='mailto:']"))
      .map((el) => cleanText(el.textContent || "").toLowerCase())
      .find((text) => /\S+@\S+\.\S+/.test(text));
    if (mailto) return mailto;

    const textEmail = cleanText(document.body?.innerText || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return textEmail ? String(textEmail[0]).toLowerCase() : "";
  }

  function findLabeledFieldValue(labelRegex, valueRegex, maxLen = 120) {
    function isBlockedFieldValue(value) {
      const normalized = cleanText(value || "").toLowerCase();
      return !normalized || normalized === "details" || normalized === "--" || normalized === "-";
    }

    function splitLines(text) {
      return String(text || "")
        .split(/\n+/)
        .map((line) => cleanText(line))
        .filter(Boolean);
    }

    function extractFromLines(lines) {
      for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        if (!labelRegex.test(line)) continue;
        for (let j = idx + 1; j < Math.min(lines.length, idx + 5); j += 1) {
          const candidate = cleanText(lines[j] || "");
          if (isBlockedFieldValue(candidate)) continue;
          if (labelRegex.test(candidate)) break;
          if (!valueRegex || valueRegex.test(candidate)) {
            return cleanSummaryText(candidate, maxLen);
          }
        }
      }
      return "";
    }

    const labels = Array.from(document.querySelectorAll("label, dt, th, span, div, p, strong, h4, h5"));
    for (const node of labels) {
      if (!isVisible(node)) continue;
      const labelText = cleanText(node.textContent || "");
      if (!labelText || labelText.length > 60 || !labelRegex.test(labelText)) continue;

      const siblingText = cleanText(node.nextElementSibling?.textContent || "");
      if (!isBlockedFieldValue(siblingText) && !labelRegex.test(siblingText) && (!valueRegex || valueRegex.test(siblingText))) {
        return cleanSummaryText(siblingText, maxLen);
      }

      const row = node.closest("li, tr, [role='row'], section, article, div");
      const rowLines = splitLines(row?.innerText || "");
      const extractedFromRow = extractFromLines(rowLines);
      if (extractedFromRow) {
        return extractedFromRow;
      }
    }

    const bodyLines = splitLines(document.body?.innerText || "");
    const extractedFromBody = extractFromLines(bodyLines);
    if (extractedFromBody) return extractedFromBody;

    return "";
  }

  function findActiveContactOwner() {
    const labeledOwner = findLabeledFieldValue(/\bcontact owner\b/i, /[a-z]/i, 70);
    if (labeledOwner && !/^(?:--|-|n\/a)$/i.test(labeledOwner)) {
      const cleanedOwner = cleanSummaryText(
        labeledOwner
          .replace(/^details\s+/i, "")
          .replace(/\b(phone(?: number)?|email|city|country|office)\b.*$/i, "")
          .trim(),
        70
      );
      if (cleanedOwner) return cleanedOwner;
    }

    const ownerLabels = Array.from(document.querySelectorAll("label, dt, th, [data-test-id*='owner'], [data-selenium-test*='owner']"));
    for (const labelNode of ownerLabels) {
      const labelText = cleanText(labelNode.textContent || "");
      if (!/\bcontact owner\b/i.test(labelText)) continue;

      const siblingText = cleanText(labelNode.nextElementSibling?.textContent || "");
      if (siblingText && !/\bcontact owner\b/i.test(siblingText)) {
        return cleanSummaryText(siblingText, 70);
      }

      const rowText = cleanText(labelNode.closest("tr, [role='row'], li, article, section, div")?.innerText || "");
      const inlineMatch = rowText.match(/contact owner\s*[:\-]?\s*([a-z0-9 .,'-]{2,70})/i);
      if (inlineMatch) {
        return cleanSummaryText(inlineMatch[1], 70);
      }
    }

    const bodyMatch = cleanText(document.body?.innerText || "").match(/contact owner\s*[:\-]?\s*([a-z0-9 .,'-]{2,70})/i);
    if (bodyMatch) {
      return cleanSummaryText(bodyMatch[1], 70);
    }
    return "";
  }

  function findActiveContactPhone() {
    const labeledPhone = findLabeledFieldValue(/\bphone(?: number)?\b/i, /\+?\d[\d\s\-().]{6,}\d/, 30);
    if (labeledPhone) return labeledPhone;

    const telAnchor = Array.from(document.querySelectorAll("a[href^='tel:']"))
      .map((el) => {
        const href = String(el.getAttribute("href") || "");
        const hrefPhone = href.replace(/^tel:/i, "").trim();
        const textPhone = cleanText(el.textContent || "");
        return cleanText(textPhone || hrefPhone);
      })
      .find(Boolean);
    if (telAnchor) return telAnchor;

    const candidates = Array.from(document.querySelectorAll("a, span, div"))
      .map((el) => cleanText(el.textContent || ""))
      .filter((text) => /\+?\d[\d\s\-().]{6,}\d/.test(text));
    return candidates[0] || "";
  }

  function cleanSummaryText(value, maxLen = 120) {
    const cleaned = cleanText(value || "").replace(/\s*[|•·]\s*/g, " ").trim();
    if (!cleaned) return "";
    return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trim()}...` : cleaned;
  }

  function extractRecentNotesFromText(text) {
    const raw = String(text || "");
    let body = raw;
    body = body.replace(/^note by\s+.+?\s+\d{1,2}\s+[a-z]{3,9}\s+\d{4}\s+at\s+\d{1,2}:\d{2}(?:\s*[ap]m)?/i, "");
    body = body.replace(/\bnote description\b/i, "");
    body = body.replace(/\bthis activity is collapsed.*$/i, "");
    body = body.replace(/\bnote\b[:\s-]*/i, "");
    return cleanSummaryText(body, 120);
  }

  function extractRecentTaskTitleFromText(text) {
    const raw = String(text || "");
    const compact = cleanText(raw);
    const dueMatch = compact.match(
      /\bdue:\s*([0-9]{1,2}\s+[a-z]{3,9}\s+[0-9]{4}\s+at\s+[0-9]{1,2}:[0-9]{2})(?:\s*gmt[+-]\d{1,2})?/i
    );
    const dueText = cleanSummaryText(String(dueMatch?.[1] || "").trim(), 45);

    const lines = raw
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean);

    let title = "";
    for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
      const line = lines[idx];
      const lowered = line.toLowerCase();
      if (
        lowered.includes("task assigned to") ||
        lowered.startsWith("due:") ||
        lowered.includes("task is incomplete") ||
        lowered.includes("click to mark") ||
        lowered === "incomplete." ||
        lowered === "incomplete"
      ) {
        continue;
      }
      if (line.length >= 2 && line.length <= 110) {
        title = cleanSummaryText(line, 80);
        break;
      }
    }

    if (!title) {
      const inlineTitleMatch = compact.match(
        /\bdue:\s*[a-z0-9 ,:+-]{6,80}(?:\s*gmt[+-]\d{1,2})?\s+(.+?)(?:\s+task is incomplete\b|\s+click to mark\b|$)/i
      );
      if (inlineTitleMatch?.[1]) {
        title = cleanSummaryText(inlineTitleMatch[1], 80);
      }
    }

    if (!title) {
      const titleMatch = compact.match(/\btask\b\s*[:\-]?\s*([^|]{3,140})/i);
      if (titleMatch) {
        title = cleanSummaryText(titleMatch[1], 80);
      }
    }

    if (!title) {
      let fallback = compact.replace(/\b(task|completed|due|owner|assignee)\b/gi, " ");
      title = cleanSummaryText(fallback, 80);
    }

    if (!title) return "";
    return dueText ? `${title}\nDue: ${dueText}` : title;
  }

  function collectRecentActivity(limit = 1) {
    const selectors = [
      "[data-test-id*='timeline'] [role='listitem']",
      "[data-test-id*='activity']",
      "[data-test-id*='engagement']",
      "[data-test-id*='task']",
      "[data-selenium-test*='timeline'] [role='listitem']",
      "[data-selenium-test*='engagement']",
      "[data-selenium-test*='task']",
      "[aria-label*='task' i]",
      "main [role='listitem']",
      "main article",
      "main li"
    ];

    const seenText = new Set();
    const notes = [];
    const tasks = [];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const text = cleanText(node.innerText || node.textContent || "");
        if (!text || text.length < 8) continue;
        if (seenText.has(text)) continue;
        seenText.add(text);

        const lowered = text.toLowerCase();
        if (notes.length < limit && lowered.includes("note")) {
          const note = extractRecentNotesFromText(text);
          if (note) notes.push(note);
        }
        if (tasks.length < limit && (lowered.includes("task") || lowered.includes("to-do") || lowered.includes("todo"))) {
          const task = extractRecentTaskTitleFromText(text);
          if (task) tasks.push(task);
        }

        if (notes.length >= limit && tasks.length >= limit) {
          return { notes, tasks };
        }
      }
    }

    if (tasks.length < limit) {
      const fallbackNodes = Array.from(document.querySelectorAll("main div, main li, main article"));
      for (const node of fallbackNodes) {
        if (!isVisible(node)) continue;
        const text = cleanText(node.innerText || node.textContent || "");
        if (!text) continue;
        const lowered = text.toLowerCase();
        if (!lowered.includes("task assigned to") && !(lowered.includes("task") && lowered.includes("due:"))) continue;
        const task = extractRecentTaskTitleFromText(text);
        if (task) {
          tasks.push(task);
          break;
        }
      }
    }

    return { notes, tasks };
  }

  function getActiveTabContext(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const portalId = getPortalIdFromPath();
    const recordId = getRecordIdFromPath();
    const kind = inferObjectKindFromPath();

    if (kind !== "contact" || !recordId) {
      return { kind, portalId, recordId: "" };
    }

    const name = findActiveContactName();
    const owner = findActiveContactOwner();
    const email = findActiveContactEmail();
    const phone = findActiveContactPhone();
    const recentActivity = collectRecentActivity(1);
    const phoneDigits = normalizePhone(phone, countryPrefix) || "";
    const baseWaUrl = phoneDigits ? `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number` : "";
    const messageBody = String(messageText || "").replace(/\[name\]/gi, name ? name.split(" ")[0] : "").trim();
    const waUrl = baseWaUrl ? (messageBody ? `${baseWaUrl}&text=${encodeURIComponent(messageBody)}` : baseWaUrl) : "";

    return {
      kind,
      portalId,
      recordId,
      contact: {
        key: `record_${recordId}`,
        recordId,
        values: {
          name,
          owner,
          email,
          phone,
          record_id: recordId
        },
        phoneDigits,
        waUrl
      },
      owner,
      latestNote: recentActivity.notes[0] || "",
      latestTask: recentActivity.tasks[0] || "",
      recentNotes: recentActivity.notes,
      recentTasks: recentActivity.tasks
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementText(element) {
    return cleanText(
      element?.innerText ||
        element?.textContent ||
        element?.getAttribute?.("aria-label") ||
        element?.getAttribute?.("value") ||
        ""
    );
  }

  function isLikelyPropertyFieldHint(hint) {
    const text = String(hint || "").toLowerCase();
    if (!text) return false;
    return (
      text.includes("first name") ||
      text.includes("last name") ||
      text.includes("phone") ||
      text.includes("email") ||
      text.includes("contact owner") ||
      text.includes("city") ||
      text.includes("country") ||
      text.includes("company")
    );
  }

  function hasNoteActionControl(root) {
    if (!root) return false;
    const controls = Array.from(root.querySelectorAll("button, [role='button']"));
    return controls.some((el) => {
      if (!isVisible(el)) return false;
      const text = elementText(el).toLowerCase();
      if (!text) return false;
      return text.includes("save note") || text.includes("create note") || text.includes("log activity") || text.includes("add note");
    });
  }

  function getNoteComposerRoot(editor) {
    const candidates = [
      editor?.closest("[role='dialog']"),
      editor?.closest("form"),
      editor?.closest("section"),
      editor?.closest("article"),
      editor?.closest("div")
    ].filter(Boolean);

    let best = null;
    let bestScore = -Infinity;

    for (const root of candidates) {
      const text = elementText(root).toLowerCase();
      if (!text) continue;

      let score = 0;
      if (text.includes("note")) score += 8;
      if (text.includes("create note") || text.includes("add note")) score += 8;
      if (text.includes("save note") || text.includes("log activity")) score += 6;
      if (hasNoteActionControl(root)) score += 10;
      if (text.includes("first name") || text.includes("last name")) score -= 24;
      if (root.matches("[role='dialog']")) score += 4;

      if (score > bestScore) {
        bestScore = score;
        best = root;
      }
    }

    return bestScore >= 6 ? best : null;
  }

  function findNoteEditor() {
    const candidates = Array.from(document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']")).filter((el) => {
      if (!isVisible(el)) return false;
      if (el.tagName === "INPUT") return false;
      const hint = cleanText(
        el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("data-selenium-test") || ""
      ).toLowerCase();
      if (hint.includes("search")) return false;
      if (isLikelyPropertyFieldHint(hint)) return false;
      return true;
    });

    if (!candidates.length) return null;

    const scored = candidates
      .map((el) => {
        const hint = cleanText(
          el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("data-selenium-test") || ""
        ).toLowerCase();
        const composerRoot = getNoteComposerRoot(el);
        let score = 0;
        if (hint.includes("note")) score += 8;
        if (hint.includes("body")) score += 4;
        if (hint.includes("activity")) score += 3;
        if (hint.includes("comment")) score += 2;
        if (el.closest("[role='dialog']")) score += 4;
        if (el.tagName === "TEXTAREA") score += 3;
        if (composerRoot) score += 12;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.score >= 10 ? scored[0].el : null;
  }

  function clickNoteTrigger() {
    const triggers = Array.from(document.querySelectorAll("button, [role='button']")).filter((el) => {
      if (!isVisible(el)) return false;
      const text = elementText(el).toLowerCase();
      if (!text) return false;
      if (text.includes("cancel") || text.includes("close")) return false;
      if (text.includes("first name") || text.includes("last name")) return false;
      return text === "note" || text.includes("add note") || text.includes("create note");
    });

    if (!triggers.length) return false;
    triggers[0].click();
    return true;
  }

  function findHubSpotCenterTabControl(targetLabel) {
    const desired = String(targetLabel || "").trim().toLowerCase();
    if (!desired) return null;

    const controls = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], a"));
    let best = null;
    let bestScore = -Infinity;

    for (const el of controls) {
      if (!isVisible(el)) continue;
      const label = elementText(el).toLowerCase();
      if (!label) continue;
      if (label !== desired) continue;

      // Never use side menus/popovers.
      if (el.closest("[role='menu'], [role='listbox'], [data-test-id*='menu'], [data-testid*='menu']")) continue;

      const container = el.closest("[role='tablist'], nav, section, article, main, div") || document.body;
      const scopeText = elementText(container).toLowerCase();

      let score = 0;
      if (scopeText.includes("overview") && scopeText.includes("activities") && scopeText.includes("intelligence")) score += 30;
      if (scopeText.includes("activity") && scopeText.includes("notes") && scopeText.includes("emails")) score += 22;
      if (scopeText.includes("search activities")) score += 16;
      if (scopeText.includes("about this contact")) score -= 30;
      if (scopeText.includes("reorder activity buttons")) score -= 30;
      if (scopeText.includes("log whatsapp message")) score -= 30;
      if (scopeText.includes("more")) score -= 12;
      if (el.getAttribute("role") === "tab") score += 8;
      if (el.closest("main")) score += 6;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  function clickActivitiesTab() {
    const tab = findHubSpotCenterTabControl("activities");
    if (!tab) return false;
    tab.click();
    return true;
  }

  function clickNotesActivityTab() {
    const tab = findHubSpotCenterTabControl("notes");
    if (!tab) return false;
    tab.click();
    return true;
  }

  function setEditorText(editor, noteBody) {
    const text = String(noteBody || "").trim();
    if (!text) return;

    editor.focus();

    if (editor.tagName === "TEXTAREA") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    editor.textContent = text;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findCreateNoteButton(editor) {
    const composerRoot = getNoteComposerRoot(editor);
    if (!composerRoot) return null;

    const roots = [composerRoot, editor?.closest("[role='dialog']"), editor?.closest("form")].filter(Boolean);
    const seen = new Set();
    let best = null;
    let bestScore = -Infinity;

    for (const root of roots) {
      const buttons = Array.from(root.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button']"));
      for (const button of buttons) {
        if (seen.has(button)) continue;
        seen.add(button);
        if (!isVisible(button)) continue;
        const text = elementText(button).toLowerCase();
        if (!text) continue;
        if (text !== "create note") continue;

        let score = 20;
        const classText = String(button.className || "").toLowerCase();
        if (classText.includes("primary")) score += 4;

        const rootText = elementText(root).toLowerCase();
        if (rootText.includes("first name") || rootText.includes("last name")) score -= 28;
        if (hasNoteActionControl(root)) score += 6;

        if (score > bestScore) {
          bestScore = score;
          best = button;
        }
      }
    }

    return bestScore >= 10 ? best : null;
  }


  async function createNoteOnPage(noteBody) {
    const text = cleanText(noteBody || "");
    if (!text) throw new Error("Note text is empty.");

    let editor = null;
    for (let i = 0; i < TIMING.noteComposerOpenAttempts; i += 1) {
      editor = findNoteEditor();
      if (editor && getNoteComposerRoot(editor)) break;

      // Move to contact Activities > Notes context before opening composer.
      if (i === 0 || i % 3 === 0) clickActivitiesTab();
      if (i === 1 || i % 3 === 1) clickNotesActivityTab();
      clickNoteTrigger();
      await sleep(TIMING.noteComposerOpenDelayMs);
    }

    if (!editor || !getNoteComposerRoot(editor)) {
      throw new Error("Could not find note editor on contact page.");
    }

    setEditorText(editor, text);
    await sleep(TIMING.noteEditorSettleDelayMs);

    const createNoteButton = findCreateNoteButton(editor);
    if (!createNoteButton) {
      throw new Error("Could not find Create note button.");
    }

    createNoteButton.click();
    await sleep(TIMING.noteSaveSettleDelayMs);
    return { ok: true };
  }

  function isEditorElement(element) {
    if (!element) return false;
    if (element.matches("textarea, input, [contenteditable='true'], [role='textbox']")) return true;
    return !!element.querySelector("textarea, input, [contenteditable='true'], [role='textbox']");
  }

  function normalizeNoteText(rawText) {
    const lines = String(rawText || "")
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) => {
        const lower = line.toLowerCase();
        if (lower === "note") return false;
        if (lower === "add note") return false;
        if (lower.includes("save note")) return false;
        if (lower === "cancel") return false;
        return true;
      });

    return cleanText(lines.join(" "));
  }

  function getNotesFromPage(limit = 25) {
    const max = Math.max(1, Math.min(100, Number(limit) || 25));
    const selectors = [
      "[data-engagement-type='NOTE']",
      "[data-engagement-type='note']",
      "[data-activity-type='NOTE']",
      "[data-activity-type='note']",
      "[data-testid*='note']",
      "[data-test-id*='note']",
      "[data-selenium-test*='note']",
      "[aria-label*='note' i]"
    ];

    const candidateSet = new Set();
    const candidates = [];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements) {
        if (!(element instanceof Element)) continue;
        const card = element.closest("[role='listitem'], article, li, section") || element;
        if (candidateSet.has(card)) continue;
        candidateSet.add(card);
        candidates.push(card);
      }
    }

    const fallbackCards = Array.from(document.querySelectorAll("[role='listitem'], article"));
    for (const card of fallbackCards) {
      if (candidateSet.has(card)) continue;
      const text = elementText(card).toLowerCase();
      if (!text || !text.includes("note")) continue;
      candidateSet.add(card);
      candidates.push(card);
      if (candidates.length >= 220) break;
    }

    const seen = new Set();
    const notes = [];

    for (const card of candidates) {
      if (!isVisible(card)) continue;
      if (isEditorElement(card)) continue;

      const raw = elementText(card);
      if (!raw) continue;
      if (raw.length < 8 || raw.length > 1400) continue;

      const normalized = normalizeNoteText(raw);
      if (!normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      notes.push(normalized);
      if (notes.length >= max) break;
    }

    return notes;
  }

  async function getNotesOnPage(limit = 25) {
    for (let i = 0; i < TIMING.noteReadRetryAttempts; i += 1) {
      const notes = getNotesFromPage(limit);
      if (notes.length) return notes;
      await sleep(TIMING.noteReadRetryDelayMs);
    }
    return [];
  }

  function findOpenEmailDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog']")).filter((dialog) => isVisible(dialog));
    if (!dialogs.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const dialog of dialogs) {
      const text = elementText(dialog).toLowerCase();
      let score = 0;
      if (text.includes("subject")) score += 6;
      if (text.includes("send")) score += 6;
      if (text.includes("to")) score += 2;
      if (text.includes("email")) score += 4;
      if (text.includes("bcc")) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = dialog;
      }
    }

    return bestScore > 5 ? best : null;
  }

  function getElementHint(el) {
    if (!el) return "";
    const parts = [
      el.getAttribute?.("placeholder"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("name"),
      el.getAttribute?.("id"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-selenium-test"),
      el.getAttribute?.("data-test-id"),
      el.getAttribute?.("data-testid")
    ]
      .map((v) => cleanText(v || ""))
      .filter(Boolean);

    const labelledBy = cleanText(el.getAttribute?.("aria-labelledby") || "");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const labelNode = document.getElementById(id);
        if (labelNode) parts.push(elementText(labelNode));
      }
    }

    const elementId = cleanText(el.id || "");
    if (elementId) {
      try {
        const linkedLabel = document.querySelector(`label[for="${CSS.escape(elementId)}"]`);
        if (linkedLabel) parts.push(elementText(linkedLabel));
      } catch (_error) {
        // Ignore malformed IDs.
      }
    }

    const parentLabel = el.closest?.("label");
    if (parentLabel) parts.push(elementText(parentLabel));

    const fieldRoot = el.closest?.("[data-field], [data-field-name], [data-selenium-test], [data-test-id], [data-testid]");
    if (fieldRoot && fieldRoot !== el) {
      parts.push(cleanText(fieldRoot.getAttribute("data-field-name") || ""));
      const labelInRoot = fieldRoot.querySelector?.("label");
      if (labelInRoot) parts.push(elementText(labelInRoot));
    }

    return cleanText(parts.join(" ")).toLowerCase();
  }

  function isRecipientFieldHint(hint) {
    const text = String(hint || "").toLowerCase();
    return /\b(to|recipient|recipients|from|cc|bcc)\b/.test(text);
  }

  function findSubjectInput(dialog) {
    const candidates = Array.from(dialog.querySelectorAll("input, textarea, [role='textbox']")).filter(
      (el) => isVisible(el) && !el.hasAttribute("disabled") && !el.hasAttribute("readonly")
    );
    if (!candidates.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of candidates) {
      const hint = getElementHint(el);
      const tag = String(el.tagName || "").toLowerCase();
      const type = String(el.getAttribute("type") || "").toLowerCase();
      let score = 0;

      if (hint.includes("subject")) score += 28;
      if (hint.includes("email subject")) score += 12;
      if (hint === "subject") score += 8;
      if (hint.includes("title")) score += 4;
      if (isRecipientFieldHint(hint)) score -= 40;
      if (hint.includes("search")) score -= 18;
      if (type === "email") score -= 20;
      if (tag === "input") score += 3;
      if (!type || type === "text") score += 2;
      if (el.getAttribute("contenteditable") === "true") score -= 10;

      const rect = el.getBoundingClientRect();
      if (rect.height <= 64) score += 2;
      if (rect.width >= 220) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return bestScore >= 10 ? best : null;
  }

  function getIframeEditorElement(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) return null;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return null;

      if (doc.body && doc.body.isContentEditable) {
        return doc.body;
      }

      const candidates = Array.from(doc.querySelectorAll("[contenteditable='true'], textarea, [role='textbox']")).filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = doc.defaultView?.getComputedStyle(el);
        if (!style) return true;
        if (style.display === "none" || style.visibility === "hidden") return false;
        return true;
      });
      return candidates[0] || null;
    } catch (_error) {
      return null;
    }
  }

  function scoreBodyEditorCandidate(el) {
    const hint = getElementHint(el);
    const tag = String(el.tagName || "").toLowerCase();
    const classText = cleanText(
      `${el.className || ""} ${el.getAttribute?.("data-slate-editor") || ""} ${el.getAttribute?.("data-editor") || ""}`
    ).toLowerCase();
    const contentEditableAttr = String(el.getAttribute?.("contenteditable") || "").toLowerCase();

    let score = 0;
    if (hint.includes("message") || hint.includes("body") || hint.includes("email") || hint.includes("content")) score += 12;
    if (hint.includes("rich text") || hint.includes("editor")) score += 8;
    if (hint.includes("subject")) score -= 20;
    if (isRecipientFieldHint(hint)) score -= 24;
    if (hint.includes("search")) score -= 14;
    if (el.closest("[role='toolbar']")) score -= 16;
    if (classText.includes("prosemirror")) score += 18;
    if (classText.includes("ql-editor")) score += 16;
    if (classText.includes("slate")) score += 12;
    if (classText.includes("prosemirror__dom")) score -= 28;
    if (contentEditableAttr === "false") score -= 26;
    if (tag !== "iframe" && tag !== "textarea" && tag !== "input" && contentEditableAttr !== "true") {
      const hasEditableDescendant = !!el.querySelector?.("[contenteditable='true'], textarea, input, [role='textbox']");
      if (!hasEditableDescendant) score -= 14;
    }

    if (tag === "iframe") {
      if (getIframeEditorElement(el)) score += 12;
      else score -= 12;
    } else {
      if (el.getAttribute("contenteditable") === "true") score += 8;
      if (tag === "textarea") score += 4;
      if (tag === "div") score += 2;
    }

    const rect = el.getBoundingClientRect();
    if (rect.height >= 120) score += 8;
    if (rect.width >= 280) score += 2;
    return score;
  }

  function getBodyEditorCandidates(dialog) {
    const selector = "[contenteditable='true'], textarea, [role='textbox'], iframe, [data-slate-editor='true'], .ProseMirror, .ql-editor";
    const roots = [dialog, document].filter(Boolean);
    const seen = new Set();
    const candidates = [];

    for (const root of roots) {
      const nodes = Array.from(root.querySelectorAll(selector)).filter((el) => isVisible(el));
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        candidates.push(node);
      }
    }

    if (!candidates.length) return [];

    return candidates
      .map((el) => ({ el, score: scoreBodyEditorCandidate(el) }))
      .sort((a, b) => b.score - a.score)
      .filter((item) => item.score >= 8)
      .map((item) => item.el);
  }

  function findBodyEditor(dialog) {
    const candidates = getBodyEditorCandidates(dialog);
    if (!candidates?.length) return null;
    return candidates[0] || null;
  }

  function setInputValue(input, value) {
    const next = String(value || "");
    input.focus();

    if (input.tagName === "INPUT" || input.tagName === "TEXTAREA") {
      const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
      const setter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : null;
      if (typeof setter === "function") {
        setter.call(input, next);
      } else {
        input.value = next;
      }
    } else {
      input.textContent = next;
    }
    dispatchInputLikeEvents(input);
  }

  function dispatchInputLikeEvents(element) {
    if (!element) return;
    const ownerWin = element.ownerDocument?.defaultView || window;
    const EventCtor = ownerWin.Event || Event;
    const InputEventCtor = ownerWin.InputEvent;
    if (typeof InputEventCtor === "function") {
      element.dispatchEvent(new InputEventCtor("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText" }));
      element.dispatchEvent(new InputEventCtor("input", { bubbles: true, inputType: "insertText" }));
    } else {
      element.dispatchEvent(new EventCtor("input", { bubbles: true }));
    }
    element.dispatchEvent(new EventCtor("change", { bubbles: true }));
  }

  function htmlToPlainText(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (!/<[a-z][\s\S]*>/i.test(raw)) return cleanText(raw);
    const container = document.createElement("div");
    container.innerHTML = raw;
    return cleanText(container.textContent || "");
  }

  function sanitizeEditorHtml(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const template = document.createElement("template");
    template.innerHTML = raw;
    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return template.innerHTML.trim();
  }

  function toInsertableHtml(value) {
    const cleaned = sanitizeEditorHtml(value);
    if (!cleaned) return "";
    if (!/<[a-z][\s\S]*>/i.test(cleaned)) {
      return escapeHtml(cleaned).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
    }
    return cleaned;
  }

  function resolveEditorTarget(editor) {
    if (editor instanceof HTMLIFrameElement) return getIframeEditorElement(editor);
    if (!(editor instanceof Element)) return null;
    if (editor.matches("textarea, input") || editor.getAttribute("contenteditable") === "true") return editor;

    const ancestorEditable = editor.closest("[contenteditable='true'], textarea, input, [role='textbox']");
    if (ancestorEditable instanceof Element) return ancestorEditable;

    const nestedEditable = editor.querySelector("[contenteditable='true'], textarea, input, [role='textbox']");
    if (nestedEditable instanceof Element) return nestedEditable;
    return editor;
  }

  function prependInContentEditable(target, insertHtml) {
    if (!target) return false;

    if (!target.isContentEditable) {
      return false;
    }
    const ownerDoc = target.ownerDocument || document;
    const ownerWin = ownerDoc.defaultView || window;
    const before = cleanText(target.textContent || "");

    target.focus();

    const selection = ownerWin.getSelection?.();
    if (selection) {
      if (!selection.anchorNode || !target.contains(selection.anchorNode)) {
        const range = ownerDoc.createRange();
        range.selectNodeContents(target);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    let applied = false;
    if (insertHtml && typeof ownerDoc.execCommand === "function") {
      applied = ownerDoc.execCommand("insertHTML", false, `${insertHtml}<p><br></p>`);
    }
    if (!applied) {
      const currentHtml = String(target.innerHTML || "");
      target.innerHTML = currentHtml ? `${insertHtml}<p><br></p>${currentHtml}` : insertHtml;
      applied = true;
    }
    if (!applied) return false;

    const after = cleanText(target.textContent || "");
    dispatchInputLikeEvents(target);
    return after.length > before.length;
  }

  function activateBodyEditor(dialog) {
    const selector = "[class*='ProseMirror'], [data-slate-editor='true'], [role='textbox'], textarea, iframe";
    const elements = Array.from(dialog.querySelectorAll(selector)).filter((el) => isVisible(el));
    if (!elements.length) return false;

    const sorted = elements
      .map((el) => ({ el, score: scoreBodyEditorCandidate(el) }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.el);

    let clicked = false;
    for (const el of sorted.slice(0, 5)) {
      try {
        el.focus?.();
        el.click?.();
        clicked = true;
      } catch (_error) {
        // Keep trying.
      }
    }
    return clicked;
  }

  function prependEditorHtml(editor, html) {
    const value = toInsertableHtml(html);
    if (!value) return false;
    const target = resolveEditorTarget(editor);
    if (!target) return false;
    const plain = htmlToPlainText(value);

    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      if (!plain) return false;
      const current = String(target.value || "");
      target.value = current ? `${plain}\n\n${current}` : plain;
      dispatchInputLikeEvents(target);
      return true;
    }

    if (prependInContentEditable(target, value)) return true;
    return false;
  }

  function clearEditorContent(editor) {
    const target = resolveEditorTarget(editor);
    if (!target) return false;

    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      if (String(target.value || "").length === 0) return true;
      target.value = "";
      dispatchInputLikeEvents(target);
      return true;
    }

    const root = target.closest(".ProseMirror") || target;
    if (!(root instanceof Element)) return false;

    const signature = root.querySelector(".hs-signature");
    if (signature instanceof Element && root.contains(signature)) {
      while (root.firstChild && root.firstChild !== signature) {
        root.removeChild(root.firstChild);
      }
      dispatchInputLikeEvents(root);
      return true;
    }

    if (root.innerHTML) {
      root.innerHTML = "";
      dispatchInputLikeEvents(root);
    }
    return true;
  }

  async function applyEmailTemplateOnPage(subject, body, bodyHtml = "") {
    const dialog = findOpenEmailDialog();
    if (!dialog) {
      throw new Error("Open a HubSpot Email composer first.");
    }

    const subjectText = String(subject || "").trim();
    if (subjectText) {
      const subjectInput = findSubjectInput(dialog);
      if (!subjectInput) {
        throw new Error("Could not find the email Subject field.");
      }
      setInputValue(subjectInput, subjectText);
    }

    const bodyText = String(body || "").trim();
    const bodyRichHtml = String(bodyHtml || "").trim();
    const bodyInsertHtml = toInsertableHtml(bodyRichHtml || bodyText);
    if (bodyInsertHtml) {
      let bodyApplied = false;
      for (let attempt = 0; attempt < 6 && !bodyApplied; attempt += 1) {
        const bodyEditors = getBodyEditorCandidates(dialog);
        for (const bodyEditor of bodyEditors) {
          clearEditorContent(bodyEditor);
          if (prependEditorHtml(bodyEditor, bodyInsertHtml)) {
            bodyApplied = true;
            break;
          }
        }
        if (bodyApplied) break;

        activateBodyEditor(dialog);
        await sleep(180);
        if (attempt === 2) {
          const fallbackEditor = findBodyEditor(dialog);
          if (fallbackEditor) {
            clearEditorContent(fallbackEditor);
          }
          if (fallbackEditor && prependEditorHtml(fallbackEditor, bodyInsertHtml)) {
            bodyApplied = true;
            break;
          }
        }
      }

      if (!bodyApplied) {
        throw new Error("Could not write content into the email body field.");
      }
    }
  }

  function clickEmailComposerTrigger() {
    const triggers = Array.from(document.querySelectorAll("button, [role='button'], a")).filter((el) => {
      if (!isVisible(el)) return false;
      const text = elementText(el).toLowerCase();
      if (!text) return false;
      if (text.includes("send")) return false;
      if (text.includes("email")) return true;
      if (text.includes("compose")) return true;
      return false;
    });

    if (!triggers.length) return false;
    triggers[0].click();
    return true;
  }

  async function openEmailAndApplyTemplateOnPage(subject, body, bodyHtml = "") {
    for (let i = 0; i < TIMING.emailComposerOpenAttempts; i += 1) {
      const existing = findOpenEmailDialog();
      if (existing) break;
      clickEmailComposerTrigger();
      await sleep(TIMING.emailComposerOpenDelayMs);
    }

    await applyEmailTemplateOnPage(subject, body, bodyHtml);
  }

  const inlineQuickActionsState = {
    rootEl: null,
    panelEl: null,
    statusEl: null,
    activeKind: "",
    templates: {
      email: [],
      note: [],
      whatsapp: []
    },
    templateUsageByContact: {},
    noteTemplateUsageByContact: {},
    enabled: true,
    countryPrefix: DEFAULT_COUNTRY_CODE,
    position: null,
    busy: false,
    lastUrl: "",
    watcherTimerId: 0,
    dragging: {
      active: false,
      pointerId: null,
      offsetX: 0,
      offsetY: 0
    }
  };

  function normalizeInlineQuickActionsEnabled(value) {
    return value !== false;
  }

  function applyInlineQuickActionsSettings(settings, options = {}) {
    const source = settings && typeof settings === "object" ? settings : null;
    if (source) {
      if (Object.prototype.hasOwnProperty.call(source, "countryPrefix")) {
        inlineQuickActionsState.countryPrefix = String(source.countryPrefix || DEFAULT_COUNTRY_CODE);
      }
      if (Object.prototype.hasOwnProperty.call(source, "inlineQuickActionsEnabled")) {
        inlineQuickActionsState.enabled = normalizeInlineQuickActionsEnabled(source.inlineQuickActionsEnabled);
      }
    }
    if (options.sync !== false) {
      syncInlineQuickActionsForCurrentRoute(true);
    }
  }

  function normalizeInlineQuickActionsPosition(rawPosition) {
    if (!rawPosition || typeof rawPosition !== "object") return null;
    const left = Number(rawPosition.left);
    const top = Number(rawPosition.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function normalizeInlineUsageKind(kind) {
    const key = String(kind || "").toLowerCase();
    return key === "whatsapp" ? "whatsapp" : "email";
  }

  function normalizeInlineTemplateUsageMap(rawUsage) {
    if (!rawUsage || typeof rawUsage !== "object") return {};
    const normalized = {};

    for (const [contactKeyInput, usageInput] of Object.entries(rawUsage)) {
      const contactKey = String(contactKeyInput || "").trim();
      if (!contactKey) continue;
      const usage = usageInput && typeof usageInput === "object" ? usageInput : {};
      const emailRaw = usage.email && typeof usage.email === "object" ? usage.email : {};
      const whatsappRaw = usage.whatsapp && typeof usage.whatsapp === "object" ? usage.whatsapp : {};

      const email = {};
      for (const [templateIdInput, usedInput] of Object.entries(emailRaw)) {
        const templateId = String(templateIdInput || "").trim();
        if (!templateId || usedInput !== true) continue;
        email[templateId] = true;
      }

      const whatsapp = {};
      for (const [templateIdInput, usedInput] of Object.entries(whatsappRaw)) {
        const templateId = String(templateIdInput || "").trim();
        if (!templateId || usedInput !== true) continue;
        whatsapp[templateId] = true;
      }

      normalized[contactKey] = { email, whatsapp };
    }

    return normalized;
  }

  function normalizeInlineNoteTemplateUsageMap(rawUsage) {
    if (!rawUsage || typeof rawUsage !== "object") return {};
    const normalized = {};

    for (const [contactKeyInput, usageInput] of Object.entries(rawUsage)) {
      const contactKey = String(contactKeyInput || "").trim();
      if (!contactKey) continue;
      const usage = usageInput && typeof usageInput === "object" ? usageInput : {};
      const note = {};
      for (const [templateIdInput, usedInput] of Object.entries(usage)) {
        const templateId = String(templateIdInput || "").trim();
        if (!templateId || usedInput !== true) continue;
        note[templateId] = true;
      }
      normalized[contactKey] = note;
    }

    return normalized;
  }

  function normalizeInlineCloudAuthList(rawList, rawPrimary) {
    const source = [];
    if (Array.isArray(rawList)) source.push(...rawList);
    if (rawPrimary && typeof rawPrimary === "object") source.push(rawPrimary);

    const normalized = [];
    const seen = new Set();
    for (const item of source) {
      const organizationId = cleanText(item?.organizationId || "");
      if (!organizationId || seen.has(organizationId)) continue;
      seen.add(organizationId);
      normalized.push({ organizationId });
    }
    return normalized;
  }

  function getInlineCloudCacheKeys(organizationIdInput) {
    const organizationId = cleanText(organizationIdInput || "");
    if (!organizationId) return null;
    return {
      emailKey: `${CLOUD_EMAIL_CACHE_PREFIX}${organizationId}`,
      whatsappKey: `${CLOUD_WHATSAPP_CACHE_PREFIX}${organizationId}`,
      noteKey: `${CLOUD_NOTE_CACHE_PREFIX}${organizationId}`
    };
  }

  function buildInlineCloudTemplateId(item, organizationIdInput = "") {
    const directId = cleanText(item?.id || "");
    if (directId.startsWith(CLOUD_TEMPLATE_ID_PREFIX)) return directId;
    if (directId) {
      const orgId = cleanText(item?.organizationId || organizationIdInput || "");
      if (orgId) return `${CLOUD_TEMPLATE_ID_PREFIX}${orgId}_${directId}`;
      return `${CLOUD_TEMPLATE_ID_PREFIX}${directId}`;
    }

    const cloudId = cleanText(item?.cloudId || "");
    if (!cloudId) return "";
    const orgId = cleanText(item?.organizationId || organizationIdInput || "");
    if (orgId) return `${CLOUD_TEMPLATE_ID_PREFIX}${orgId}_${cloudId}`;
    return `${CLOUD_TEMPLATE_ID_PREFIX}${cloudId}`;
  }

  function normalizeInlineCloudEmailTemplates(rawTemplates, organizationIdInput = "") {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    const templates = [];
    const seen = new Set();

    for (const item of source) {
      const id = buildInlineCloudTemplateId(item, organizationIdInput);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      templates.push({
        id,
        name: cleanText(item?.name || "Untitled") || "Untitled",
        subject: String(item?.subject || ""),
        body: String(item?.body || ""),
        source: "cloud"
      });
    }

    return templates;
  }

  function normalizeInlineCloudWhatsappTemplates(rawTemplates, organizationIdInput = "") {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    const templates = [];
    const seen = new Set();

    for (const item of source) {
      const id = buildInlineCloudTemplateId(item, organizationIdInput);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      templates.push({
        id,
        name: cleanText(item?.name || "Untitled") || "Untitled",
        body: String(item?.body || ""),
        source: "cloud"
      });
    }

    return templates;
  }

  function normalizeInlineCloudNoteTemplates(rawTemplates, organizationIdInput = "") {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    const templates = [];
    const seen = new Set();

    for (const item of source) {
      const id = buildInlineCloudTemplateId(item, organizationIdInput);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      templates.push({
        id,
        name: cleanText(item?.name || "Untitled") || "Untitled",
        body: String(item?.body || ""),
        source: "cloud"
      });
    }

    return templates;
  }

  function mergeInlineTemplates(localTemplates, cloudTemplates) {
    const merged = [];
    const seen = new Set();
    const source = [...(Array.isArray(localTemplates) ? localTemplates : []), ...(Array.isArray(cloudTemplates) ? cloudTemplates : [])];

    for (const template of source) {
      const id = cleanText(template?.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(template);
    }

    return merged;
  }

  function readStorageArea(areaName, keys) {
    return new Promise((resolve) => {
      try {
        const area = chrome.storage?.[areaName];
        if (!area || typeof area.get !== "function") {
          resolve({});
          return;
        }
        area.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(result || {});
        });
      } catch (_error) {
        resolve({});
      }
    });
  }

  async function loadInlineQuickActionsPosition() {
    const local = await readStorageArea("local", [INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY]);
    inlineQuickActionsState.position = normalizeInlineQuickActionsPosition(local?.[INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY]);
  }

  function persistInlineQuickActionsPosition() {
    if (!inlineQuickActionsState.position) return;
    try {
      chrome.storage.local.set({
        [INLINE_QUICK_ACTIONS_POSITION_LOCAL_KEY]: {
          left: inlineQuickActionsState.position.left,
          top: inlineQuickActionsState.position.top
        }
      });
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function clampInlineQuickActionsPosition(position, width, height) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(maxLeft, Math.max(margin, Math.round(position.left))),
      top: Math.min(maxTop, Math.max(margin, Math.round(position.top)))
    };
  }

  function getInlineQuickActionsDefaultPosition(width, height) {
    const rightMargin = 30;
    const topGap = 18;
    const fallbackTop = 72;
    let navBottom = 0;

    const navCandidates = Array.from(
      document.querySelectorAll("header, [role='banner'], nav, [data-test-id*='global'], [data-selenium-test*='global']")
    );

    for (const node of navCandidates) {
      if (!(node instanceof Element)) continue;
      if (!isVisible(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0 || rect.height > 140) continue;
      if (rect.bottom <= 0) continue;
      if (rect.top > 40) continue;
      const style = window.getComputedStyle(node);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      navBottom = Math.max(navBottom, Math.round(rect.bottom));
    }

    const desiredTop = Math.max(fallbackTop, navBottom + topGap, Math.round(window.innerHeight * 0.58) - 100);
    const desiredLeft = window.innerWidth - width - rightMargin;
    return clampInlineQuickActionsPosition({ left: desiredLeft, top: desiredTop }, width, height);
  }

  function applyInlineQuickActionsPosition() {
    const rootEl = inlineQuickActionsState.rootEl;
    if (!rootEl) return;

    const rect = rootEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    if (!inlineQuickActionsState.position) {
      const anchored = getInlineQuickActionsDefaultPosition(width, height);
      rootEl.style.left = `${anchored.left}px`;
      rootEl.style.top = `${anchored.top}px`;
      rootEl.style.right = "auto";
      rootEl.style.bottom = "auto";
      return;
    }

    const next = clampInlineQuickActionsPosition(inlineQuickActionsState.position, width, height);
    inlineQuickActionsState.position = next;
    rootEl.style.left = `${next.left}px`;
    rootEl.style.top = `${next.top}px`;
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
  }

  function getInlineUsageContactKey() {
    const recordId = String(getRecordIdFromPath() || "").replace(/\D/g, "");
    if (!recordId) return "";
    return `record_${recordId}`;
  }

  function getInlineTemplateUsageForContact(contactKey) {
    const key = String(contactKey || "").trim();
    if (!key) return null;
    if (!inlineQuickActionsState.templateUsageByContact[key]) {
      inlineQuickActionsState.templateUsageByContact[key] = {
        email: Object.create(null),
        whatsapp: Object.create(null)
      };
    }
    return inlineQuickActionsState.templateUsageByContact[key];
  }

  function getInlineNoteTemplateUsageForContact(contactKey) {
    const key = String(contactKey || "").trim();
    if (!key) return null;
    if (!inlineQuickActionsState.noteTemplateUsageByContact[key]) {
      inlineQuickActionsState.noteTemplateUsageByContact[key] = Object.create(null);
    }
    return inlineQuickActionsState.noteTemplateUsageByContact[key];
  }

  function hasInlineTemplateBeenUsed(kind, templateIdInput) {
    const contactKey = getInlineUsageContactKey();
    const templateId = String(templateIdInput || "").trim();
    if (!contactKey || !templateId) return false;

    if (String(kind || "").toLowerCase() === "note") {
      const usage = getInlineNoteTemplateUsageForContact(contactKey);
      return !!usage && usage[templateId] === true;
    }

    const usage = getInlineTemplateUsageForContact(contactKey);
    if (!usage) return false;
    const usageKind = normalizeInlineUsageKind(kind);
    return usage[usageKind][templateId] === true;
  }

  function persistInlineTemplateUsage() {
    const payload = normalizeInlineTemplateUsageMap(inlineQuickActionsState.templateUsageByContact);
    inlineQuickActionsState.templateUsageByContact = payload;
    try {
      chrome.storage.local.set({ [TEMPLATE_USAGE_LOCAL_KEY]: payload });
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function persistInlineNoteTemplateUsage() {
    const payload = normalizeInlineNoteTemplateUsageMap(inlineQuickActionsState.noteTemplateUsageByContact);
    inlineQuickActionsState.noteTemplateUsageByContact = payload;
    try {
      chrome.storage.local.set({ [INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY]: payload });
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function markInlineTemplateUsed(kind, templateIdInput) {
    const contactKey = getInlineUsageContactKey();
    const templateId = String(templateIdInput || "").trim();
    if (!contactKey || !templateId) return;

    if (String(kind || "").toLowerCase() === "note") {
      const usage = getInlineNoteTemplateUsageForContact(contactKey);
      if (!usage) return;
      usage[templateId] = true;
      persistInlineNoteTemplateUsage();
      return;
    }

    const usage = getInlineTemplateUsageForContact(contactKey);
    if (!usage) return;
    const usageKind = normalizeInlineUsageKind(kind);
    usage[usageKind][templateId] = true;
    persistInlineTemplateUsage();
  }

  function inlineTokenKey(input) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function applyInlineTemplateTokens(text, tokens) {
    return String(text || "").replace(/\[([a-z0-9_]+)\]/gi, (_match, tokenName) => {
      const key = inlineTokenKey(tokenName);
      if (!Object.prototype.hasOwnProperty.call(tokens, key)) return "";
      return String(tokens[key] || "");
    });
  }

  function buildInlineTemplateTokens(context) {
    const values = context?.contact?.values || {};
    const name = cleanText(values.name || "");
    const firstName = name ? name.split(" ")[0] : "";
    const owner = cleanText(values.owner || context?.owner || "");
    const email = cleanText(values.email || "");
    const phone = cleanText(values.phone || "");
    const recordId = cleanText(context?.recordId || values.record_id || "");

    const tokens = {
      name,
      first_name: firstName,
      firstname: firstName,
      owner,
      email,
      phone,
      record_id: recordId,
      recordid: recordId
    };

    for (const [rawKey, rawValue] of Object.entries(values)) {
      const key = inlineTokenKey(rawKey);
      if (!key) continue;
      tokens[key] = cleanText(rawValue || "");
    }

    return tokens;
  }

  function escapeTokenValues(tokens) {
    const escaped = {};
    for (const [key, value] of Object.entries(tokens || {})) {
      escaped[key] = escapeHtml(String(value || ""));
    }
    return escaped;
  }

  function normalizeInlineEmailTemplates(rawTemplates) {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    return source
      .map((template, index) => ({
        id: cleanText(template?.id || `email_template_${index + 1}`),
        name: cleanText(template?.name || `Email ${index + 1}`) || `Email ${index + 1}`,
        subject: String(template?.subject || ""),
        body: String(template?.body || ""),
        source: "local"
      }))
      .filter((template) => !!template.id);
  }

  function normalizeInlineNoteTemplates(rawTemplates) {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    return source
      .map((template, index) => ({
        id: cleanText(template?.id || `note_template_${index + 1}`),
        name: cleanText(template?.name || `Note ${index + 1}`) || `Note ${index + 1}`,
        body: String(template?.body || ""),
        source: "local"
      }))
      .filter((template) => !!template.id);
  }

  function normalizeInlineWhatsappTemplates(rawTemplates) {
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];
    return source
      .map((template, index) => ({
        id: cleanText(template?.id || `wa_template_${index + 1}`),
        name: cleanText(template?.name || `WhatsApp ${index + 1}`) || `WhatsApp ${index + 1}`,
        body: String(template?.body || ""),
        source: "local"
      }))
      .filter((template) => !!template.id);
  }

  async function refreshInlineQuickActionsData() {
    const local = await readStorageArea("local", [
      EMAIL_TEMPLATES_LOCAL_KEY,
      NOTE_TEMPLATES_LOCAL_KEY,
      WHATSAPP_TEMPLATES_LOCAL_KEY,
      TEMPLATE_USAGE_LOCAL_KEY,
      INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY,
      CLOUD_AUTH_LIST_LOCAL_KEY,
      CLOUD_AUTH_LOCAL_KEY
    ]);
    const sync = await readStorageArea("sync", [SETTINGS_KEY]);

    const cloudAuthList = normalizeInlineCloudAuthList(local?.[CLOUD_AUTH_LIST_LOCAL_KEY], local?.[CLOUD_AUTH_LOCAL_KEY]);
    const cacheKeys = [];
    for (const auth of cloudAuthList) {
      const keys = getInlineCloudCacheKeys(auth.organizationId);
      if (!keys) continue;
      cacheKeys.push(keys.emailKey, keys.whatsappKey, keys.noteKey);
    }
    const cloudCache = cacheKeys.length ? await readStorageArea("local", cacheKeys) : {};

    const cloudEmailTemplates = [];
    const cloudWhatsappTemplates = [];
    const cloudNoteTemplates = [];
    for (const auth of cloudAuthList) {
      const keys = getInlineCloudCacheKeys(auth.organizationId);
      if (!keys) continue;
      cloudEmailTemplates.push(...normalizeInlineCloudEmailTemplates(cloudCache?.[keys.emailKey], auth.organizationId));
      cloudWhatsappTemplates.push(...normalizeInlineCloudWhatsappTemplates(cloudCache?.[keys.whatsappKey], auth.organizationId));
      cloudNoteTemplates.push(...normalizeInlineCloudNoteTemplates(cloudCache?.[keys.noteKey], auth.organizationId));
    }

    inlineQuickActionsState.templates.email = mergeInlineTemplates(
      normalizeInlineEmailTemplates(local?.[EMAIL_TEMPLATES_LOCAL_KEY]),
      cloudEmailTemplates
    );
    inlineQuickActionsState.templates.note = mergeInlineTemplates(
      normalizeInlineNoteTemplates(local?.[NOTE_TEMPLATES_LOCAL_KEY]),
      cloudNoteTemplates
    );
    inlineQuickActionsState.templates.whatsapp = mergeInlineTemplates(
      normalizeInlineWhatsappTemplates(local?.[WHATSAPP_TEMPLATES_LOCAL_KEY]),
      cloudWhatsappTemplates
    );
    inlineQuickActionsState.templateUsageByContact = normalizeInlineTemplateUsageMap(local?.[TEMPLATE_USAGE_LOCAL_KEY]);
    inlineQuickActionsState.noteTemplateUsageByContact = normalizeInlineNoteTemplateUsageMap(
      local?.[INLINE_NOTE_TEMPLATE_USAGE_LOCAL_KEY]
    );
    applyInlineQuickActionsSettings(sync?.[SETTINGS_KEY], { sync: false });
  }

  function ensureInlineQuickActionsStyles() {
    if (document.getElementById(INLINE_QUICK_ACTIONS_STYLE_ID)) return;
    const styleEl = document.createElement("style");
    styleEl.id = INLINE_QUICK_ACTIONS_STYLE_ID;
    styleEl.textContent = `
      #${INLINE_QUICK_ACTIONS_ROOT_ID} {
        position: fixed;
        right: 30px;
        top: calc(58vh - 100px);
        z-index: 2147483000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-card {
        min-width: 228px;
        max-width: 280px;
        border: 1px solid #c8d5e5;
        background: #f7fbff;
        border-radius: 10px;
        box-shadow: 0 6px 18px rgba(15, 40, 70, 0.18);
        color: #29435e;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-head {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.04em;
        padding: 9px 10px 5px;
        cursor: grab;
        user-select: none;
        color: #173656;
        background: linear-gradient(180deg, #eef6ff 0%, #f7fbff 100%);
        border-bottom: 1px solid #d8e4f2;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-brand-name {
        line-height: 1;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID}[data-dragging="1"] .cp-inline-head {
        cursor: grabbing;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-actions-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 10px 9px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-divider {
        color: #8aa2be;
        font-size: 12px;
        line-height: 1;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #2f4f6f;
        cursor: pointer;
        padding: 0;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn:hover {
        background: rgba(83, 136, 194, 0.14);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn.active {
        background: rgba(83, 136, 194, 0.18);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID}[data-busy="1"] .cp-inline-action-btn {
        opacity: 0.65;
        cursor: wait;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel {
        border-top: 1px solid #d8e4f2;
        padding: 8px 8px 6px;
        max-height: 220px;
        overflow: auto;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: inherit;
        text-align: left;
        font-size: 12px;
        padding: 6px 7px;
        cursor: pointer;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-cloud {
        font-size: 12px;
        line-height: 1;
        color: #4b6f94;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-check {
        font-size: 12px;
        font-weight: 700;
        color: transparent;
        flex-shrink: 0;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-check.is-used {
        color: #19733d;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-btn:hover {
        background: rgba(83, 136, 194, 0.14);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-empty {
        font-size: 12px;
        color: #6d839a;
        padding: 6px 7px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status {
        min-height: 16px;
        font-size: 11px;
        color: #5f7994;
        padding: 0 10px 8px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status[data-tone="error"] {
        color: #af2f2f;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status[data-tone="success"] {
        color: #19733d;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-card {
        background: #2a425b !important;
        border-color: #7f9bb8 !important;
        color: #e7f0fb !important;
        box-shadow: 0 8px 24px rgba(4, 14, 28, 0.42) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-head {
        color: #f0f6ff !important;
        background: linear-gradient(180deg, #3a5674 0%, #2f4966 100%) !important;
        border-bottom-color: #6f8aa8 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-divider {
        color: #c3d6eb !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn {
        color: #e3eefb !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn:hover {
        background: rgba(173, 205, 238, 0.2) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn.active {
        background: rgba(173, 205, 238, 0.26) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel {
        border-top-color: #6f8aa8 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-btn:hover {
        background: rgba(173, 205, 238, 0.18) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-cloud {
        color: #bad4ef !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-check.is-used {
        color: #8ee0a6 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-empty,
      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status {
        color: #d2e2f3 !important;
      }
    `;
    document.documentElement.appendChild(styleEl);
  }

  function inlineActionIcon(kind) {
    if (kind === "email") {
      return "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='3.5' y='6.5' width='17' height='11' rx='2'></rect><path d='M4 8l8 5 8-5'></path></svg>";
    }
    if (kind === "note") {
      return "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 20h4l10-10-4-4L4 16v4z'></path><path d='M13 7l4 4'></path></svg>";
    }
    return "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 4c4.7 0 8.5 3.4 8.5 7.5S16.7 19 12 19c-1 0-2-.2-2.9-.5L4 20l1.4-3.8C4.5 14.9 4 13.2 4 11.5 4 7.4 7.8 4 12 4z'></path><circle cx='9' cy='11.5' r='0.9'></circle><circle cx='12' cy='11.5' r='0.9'></circle><circle cx='15' cy='11.5' r='0.9'></circle></svg>";
  }

  function setInlineQuickActionsStatus(message, tone = "") {
    if (!inlineQuickActionsState.statusEl) return;
    inlineQuickActionsState.statusEl.textContent = String(message || "");
    inlineQuickActionsState.statusEl.dataset.tone = tone;
  }

  function setInlineQuickActionsBusy(busy) {
    inlineQuickActionsState.busy = !!busy;
    if (!inlineQuickActionsState.rootEl) return;
    inlineQuickActionsState.rootEl.dataset.busy = busy ? "1" : "0";
    renderInlineQuickActionButtons();
    inlineQuickActionsState.rootEl.querySelectorAll(".cp-inline-template-btn").forEach((button) => {
      button.disabled = inlineQuickActionsState.busy;
    });
  }

  function renderInlineQuickActionButtons() {
    if (!inlineQuickActionsState.rootEl) return;
    inlineQuickActionsState.rootEl.querySelectorAll(".cp-inline-action-btn").forEach((button) => {
      const kind = String(button.getAttribute("data-kind") || "");
      button.classList.toggle("active", kind === inlineQuickActionsState.activeKind);
      button.disabled = inlineQuickActionsState.busy;
    });
  }

  function renderInlineQuickActionsPanel(kind = "") {
    if (!inlineQuickActionsState.panelEl) return;
    inlineQuickActionsState.activeKind = String(kind || "");
    renderInlineQuickActionButtons();

    if (!inlineQuickActionsState.activeKind) {
      inlineQuickActionsState.panelEl.hidden = true;
      inlineQuickActionsState.panelEl.innerHTML = "";
      return;
    }

    const templates = inlineQuickActionsState.templates?.[inlineQuickActionsState.activeKind] || [];
    inlineQuickActionsState.panelEl.hidden = false;
    if (!templates.length) {
      const label = inlineQuickActionsState.activeKind === "whatsapp" ? "WhatsApp" : inlineQuickActionsState.activeKind[0].toUpperCase() + inlineQuickActionsState.activeKind.slice(1);
      inlineQuickActionsState.panelEl.innerHTML = `<div class='cp-inline-empty'>No ${escapeHtml(label)} templates.</div>`;
      return;
    }

    inlineQuickActionsState.panelEl.innerHTML = templates
      .map((template) => {
        const isUsed = hasInlineTemplateBeenUsed(inlineQuickActionsState.activeKind, template.id);
        const isCloud = String(template?.source || "").toLowerCase() === "cloud";
        return (
          `<button type='button' class='cp-inline-template-btn' data-template-kind='${escapeHtml(
            inlineQuickActionsState.activeKind
          )}' data-template-id='${escapeHtml(template.id)}'>` +
          `<span class='cp-inline-template-label'>${escapeHtml(template.name || "Untitled")}</span>` +
          "<span class='cp-inline-template-meta'>" +
          `${isCloud ? "<span class='cp-inline-template-cloud' aria-hidden='true' title='Cloud template'>☁</span>" : ""}` +
          `<span class='cp-inline-template-check ${isUsed ? "is-used" : ""}' aria-hidden='true'>✓</span>` +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function isInlineQuickActionsEligiblePage() {
    return inferObjectKindFromPath() === "contact" && !!getRecordIdFromPath();
  }

  function getInlineContactContextOrThrow() {
    const context = getActiveTabContext(inlineQuickActionsState.countryPrefix, "");
    if (context?.kind !== "contact" || !context?.recordId) {
      throw new Error("Open a HubSpot contact record page first.");
    }
    return context;
  }

  async function applyInlineEmailTemplate(template) {
    const context = getInlineContactContextOrThrow();
    const tokens = buildInlineTemplateTokens(context);
    const escapedTokens = escapeTokenValues(tokens);
    const subject = applyInlineTemplateTokens(template?.subject || "", tokens).trim();
    const bodyHtml = applyInlineTemplateTokens(template?.body || "", escapedTokens).trim();
    const bodyText = applyInlineTemplateTokens(template?.body || "", tokens).trim();
    await openEmailAndApplyTemplateOnPage(subject, htmlToPlainText(bodyText), bodyHtml);
  }

  async function applyInlineNoteTemplate(template) {
    const context = getInlineContactContextOrThrow();
    const tokens = buildInlineTemplateTokens(context);
    const filledBody = applyInlineTemplateTokens(template?.body || "", tokens).trim();
    const noteBody = htmlToPlainText(filledBody) || filledBody;
    if (!noteBody) throw new Error("Selected note template is empty.");
    await createNoteOnPage(noteBody);
  }

  function applyInlineWhatsappTemplate(template) {
    const context = getInlineContactContextOrThrow();
    const tokens = buildInlineTemplateTokens(context);
    const phoneDigits =
      String(context?.contact?.phoneDigits || "").replace(/\D/g, "") ||
      String(normalizePhone(context?.contact?.values?.phone || "", inlineQuickActionsState.countryPrefix) || "").replace(/\D/g, "");
    if (!phoneDigits) throw new Error("No phone number found on this contact.");

    const filledMessage = applyInlineTemplateTokens(template?.body || "", tokens).trim();
    let url = `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number`;
    if (filledMessage) {
      url += `&text=${encodeURIComponent(filledMessage)}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleInlineTemplateSelection(kind, templateId) {
    if (inlineQuickActionsState.busy) return;
    const templates = inlineQuickActionsState.templates?.[kind] || [];
    const template = templates.find((item) => String(item?.id || "") === String(templateId || ""));
    if (!template) {
      setInlineQuickActionsStatus("Template not found.", "error");
      return;
    }

    setInlineQuickActionsBusy(true);
    setInlineQuickActionsStatus("Working...");
    try {
      if (kind === "email") {
        await applyInlineEmailTemplate(template);
        markInlineTemplateUsed("email", template.id);
        setInlineQuickActionsStatus(`Email applied: ${template.name}`, "success");
      } else if (kind === "note") {
        await applyInlineNoteTemplate(template);
        markInlineTemplateUsed("note", template.id);
        setInlineQuickActionsStatus(`Note created: ${template.name}`, "success");
      } else if (kind === "whatsapp") {
        applyInlineWhatsappTemplate(template);
        markInlineTemplateUsed("whatsapp", template.id);
        setInlineQuickActionsStatus(`WhatsApp opened: ${template.name}`, "success");
      }
      renderInlineQuickActionsPanel("");
    } catch (error) {
      const reason = cleanText(String(error?.message || error || "Action failed."));
      setInlineQuickActionsStatus(reason || "Action failed.", "error");
    } finally {
      setInlineQuickActionsBusy(false);
    }
  }

  async function handleInlineActionButtonToggle(kind) {
    if (inlineQuickActionsState.busy) return;
    const selectedKind = String(kind || "");
    if (!selectedKind) return;

    await refreshInlineQuickActionsData();

    if (inlineQuickActionsState.activeKind === selectedKind) {
      renderInlineQuickActionsPanel("");
      return;
    }
    renderInlineQuickActionsPanel(selectedKind);
  }

  function handleInlineRootClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionButton = target.closest(".cp-inline-action-btn");
    if (actionButton) {
      const kind = String(actionButton.getAttribute("data-kind") || "");
      void handleInlineActionButtonToggle(kind);
      return;
    }

    const templateButton = target.closest(".cp-inline-template-btn");
    if (templateButton) {
      const kind = String(templateButton.getAttribute("data-template-kind") || "");
      const templateId = String(templateButton.getAttribute("data-template-id") || "");
      if (!kind || !templateId) return;
      void handleInlineTemplateSelection(kind, templateId);
    }
  }

  function finishInlineQuickActionsDrag() {
    if (!inlineQuickActionsState.dragging.active) return;
    inlineQuickActionsState.dragging.active = false;
    inlineQuickActionsState.dragging.pointerId = null;
    if (inlineQuickActionsState.rootEl) {
      inlineQuickActionsState.rootEl.dataset.dragging = "0";
    }
    document.removeEventListener("pointermove", handleInlineQuickActionsPointerMove, true);
    document.removeEventListener("pointerup", handleInlineQuickActionsPointerUp, true);
    document.removeEventListener("pointercancel", handleInlineQuickActionsPointerUp, true);
    persistInlineQuickActionsPosition();
  }

  function handleInlineQuickActionsPointerMove(event) {
    if (!inlineQuickActionsState.dragging.active || !inlineQuickActionsState.rootEl) return;
    if (inlineQuickActionsState.dragging.pointerId !== null && event.pointerId !== inlineQuickActionsState.dragging.pointerId) return;

    const rootEl = inlineQuickActionsState.rootEl;
    const rect = rootEl.getBoundingClientRect();
    const next = clampInlineQuickActionsPosition(
      {
        left: event.clientX - inlineQuickActionsState.dragging.offsetX,
        top: event.clientY - inlineQuickActionsState.dragging.offsetY
      },
      Math.max(1, Math.round(rect.width)),
      Math.max(1, Math.round(rect.height))
    );

    inlineQuickActionsState.position = next;
    rootEl.style.left = `${next.left}px`;
    rootEl.style.top = `${next.top}px`;
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
    event.preventDefault();
  }

  function handleInlineQuickActionsPointerUp(event) {
    if (inlineQuickActionsState.dragging.pointerId !== null && event.pointerId !== inlineQuickActionsState.dragging.pointerId) return;
    finishInlineQuickActionsDrag();
  }

  function handleInlineQuickActionsPointerDown(event) {
    if (inlineQuickActionsState.busy) return;
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const handle = target.closest(".cp-inline-head");
    if (!handle || !inlineQuickActionsState.rootEl) return;

    const rect = inlineQuickActionsState.rootEl.getBoundingClientRect();
    inlineQuickActionsState.dragging.active = true;
    inlineQuickActionsState.dragging.pointerId = event.pointerId;
    inlineQuickActionsState.dragging.offsetX = event.clientX - rect.left;
    inlineQuickActionsState.dragging.offsetY = event.clientY - rect.top;
    inlineQuickActionsState.rootEl.dataset.dragging = "1";

    document.addEventListener("pointermove", handleInlineQuickActionsPointerMove, true);
    document.addEventListener("pointerup", handleInlineQuickActionsPointerUp, true);
    document.addEventListener("pointercancel", handleInlineQuickActionsPointerUp, true);
    event.preventDefault();
  }

  function closeInlinePanelWhenClickingOutside(event) {
    if (!inlineQuickActionsState.rootEl) return;
    if (!inlineQuickActionsState.activeKind) return;
    const target = event.target instanceof Node ? event.target : null;
    if (!target) return;
    if (inlineQuickActionsState.rootEl.contains(target)) return;
    renderInlineQuickActionsPanel("");
  }

  function mountInlineQuickActions() {
    if (inlineQuickActionsState.rootEl || !document.body) return;
    ensureInlineQuickActionsStyles();

    const rootEl = document.createElement("div");
    rootEl.id = INLINE_QUICK_ACTIONS_ROOT_ID;
    rootEl.dataset.busy = "0";
    rootEl.dataset.dragging = "0";
    rootEl.innerHTML = `
      <div class='cp-inline-card'>
        <div class='cp-inline-head'><span class='cp-inline-brand-name'>Contact Point</span></div>
        <div class='cp-inline-actions-row'>
          <button type='button' class='cp-inline-action-btn' data-kind='email' aria-label='Email templates' title='Email templates'>${inlineActionIcon("email")}</button>
          <span class='cp-inline-divider'>|</span>
          <button type='button' class='cp-inline-action-btn' data-kind='note' aria-label='Note templates' title='Note templates'>${inlineActionIcon("note")}</button>
          <span class='cp-inline-divider'>|</span>
          <button type='button' class='cp-inline-action-btn' data-kind='whatsapp' aria-label='WhatsApp templates' title='WhatsApp templates'>${inlineActionIcon("whatsapp")}</button>
        </div>
        <div class='cp-inline-panel' hidden></div>
        <div class='cp-inline-status' aria-live='polite'></div>
      </div>
    `;

    rootEl.addEventListener("click", handleInlineRootClick);
    rootEl.addEventListener("pointerdown", handleInlineQuickActionsPointerDown);
    document.body.appendChild(rootEl);
    inlineQuickActionsState.rootEl = rootEl;
    inlineQuickActionsState.panelEl = rootEl.querySelector(".cp-inline-panel");
    inlineQuickActionsState.statusEl = rootEl.querySelector(".cp-inline-status");
    applyInlineQuickActionsPosition();
    renderInlineQuickActionButtons();
  }

  function unmountInlineQuickActions() {
    if (!inlineQuickActionsState.rootEl) return;
    finishInlineQuickActionsDrag();
    inlineQuickActionsState.rootEl.removeEventListener("click", handleInlineRootClick);
    inlineQuickActionsState.rootEl.removeEventListener("pointerdown", handleInlineQuickActionsPointerDown);
    inlineQuickActionsState.rootEl.remove();
    inlineQuickActionsState.rootEl = null;
    inlineQuickActionsState.panelEl = null;
    inlineQuickActionsState.statusEl = null;
    inlineQuickActionsState.activeKind = "";
    inlineQuickActionsState.busy = false;
  }

  function syncInlineQuickActionsForCurrentRoute(force = false) {
    const href = String(location.href || "");
    if (!force && href === inlineQuickActionsState.lastUrl) return;
    inlineQuickActionsState.lastUrl = href;

    if (!inlineQuickActionsState.enabled || !isInlineQuickActionsEligiblePage()) {
      unmountInlineQuickActions();
      return;
    }

    mountInlineQuickActions();
    setInlineQuickActionsStatus("");
    void refreshInlineQuickActionsData();
  }

  function handleInlineQuickActionsViewportResize() {
    applyInlineQuickActionsPosition();
  }

  function startInlineQuickActionsWatcher() {
    if (inlineQuickActionsState.watcherTimerId) return;
    inlineQuickActionsState.lastUrl = "";
    void Promise.all([refreshInlineQuickActionsData(), loadInlineQuickActionsPosition()]).then(() => {
      syncInlineQuickActionsForCurrentRoute(true);
    });
    inlineQuickActionsState.watcherTimerId = window.setInterval(
      syncInlineQuickActionsForCurrentRoute,
      INLINE_QUICK_ACTIONS_CHECK_INTERVAL_MS
    );
    document.addEventListener("pointerdown", closeInlinePanelWhenClickingOutside, true);
    window.addEventListener("resize", handleInlineQuickActionsViewportResize);
  }

  applyHubSpotThemeFromSettingsStorage();
  subscribeHubSpotThemeChanges();
  startInlineQuickActionsWatcher();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === MESSAGE_TYPES.GET_CONTACTS) {
      const countryPrefix = String(message.countryPrefix || DEFAULT_COUNTRY_CODE);
      const messageText = String(message.messageText || "");
      const loadAll = !!message.loadAll;

      const run = loadAll ? extractTableContactsWithAutoScroll(countryPrefix, messageText) : Promise.resolve(extractTableContacts(countryPrefix, messageText));
      run
        .then((payload) => sendResponse({ ok: true, ...payload }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === MESSAGE_TYPES.GET_ACTIVE_TAB_CONTEXT) {
      const countryPrefix = String(message.countryPrefix || DEFAULT_COUNTRY_CODE);
      const messageText = String(message.messageText || "");
      try {
        const payload = getActiveTabContext(countryPrefix, messageText);
        sendResponse({ ok: true, ...payload });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return;
    }

    if (message.type === MESSAGE_TYPES.GET_PORTAL_ID) {
      sendResponse({ ok: true, portalId: getPortalIdFromPath() });
      return;
    }

    if (message.type === MESSAGE_TYPES.CREATE_NOTE_ON_PAGE) {
      const noteBody = String(message.noteBody || "");
      createNoteOnPage(noteBody)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === MESSAGE_TYPES.GET_NOTES_ON_PAGE) {
      const limit = Number(message.limit || 25);
      getNotesOnPage(limit)
        .then((notes) => sendResponse({ ok: true, notes }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === MESSAGE_TYPES.APPLY_EMAIL_TEMPLATE_ON_PAGE) {
      const subject = String(message.subject || "");
      const body = String(message.body || "");
      const bodyHtml = String(message.bodyHtml || "");
      applyEmailTemplateOnPage(subject, body, bodyHtml)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === MESSAGE_TYPES.OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE) {
      const subject = String(message.subject || "");
      const body = String(message.body || "");
      const bodyHtml = String(message.bodyHtml || "");
      openEmailAndApplyTemplateOnPage(subject, body, bodyHtml)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
  });
})();
