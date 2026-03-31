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
    OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE: "OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE",
    OPEN_OR_REUSE_WHATSAPP_TAB: "OPEN_OR_REUSE_WHATSAPP_TAB"
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
  const CONTACT_INDEX_NEW_TAB_STYLE_ID = "cpContactIndexNewTabStyle";
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

  function normalizeSearchText(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[İIı]/g, "i")
      .replace(/[Şş]/g, "s")
      .replace(/[Çç]/g, "c")
      .replace(/[Ğğ]/g, "g")
      .replace(/[Üü]/g, "u")
      .replace(/[Öö]/g, "o")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
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

  function resolveGenderValue(values) {
    const source = values && typeof values === "object" ? values : {};
    const keyMatchers = [
      (key) => key === "gender" || key.includes("gender"),
      (key) => key === "salutation" || key.includes("salutation"),
      (key) => key === "sex" || /(?:^|_)sex(?:_|$)/.test(key),
      (key) => key === "title" || key.includes("title")
    ];

    for (const matchesKey of keyMatchers) {
      for (const [rawKey, rawValue] of Object.entries(source)) {
        const normalizedKey = String(rawKey || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        if (!normalizedKey || !matchesKey(normalizedKey)) continue;
        const value = cleanText(rawValue || "");
        if (value) return value;
      }
    }

    return "";
  }

  function applyMessageTemplate(template, values, nameColumnId) {
    const rawName = cleanText(values?.[nameColumnId || ""] || "");
    const firstName = rawName ? rawName.split(" ")[0] : "";
    const gender = resolveGenderValue(values);
    return String(template || "")
      .replace(/\[name\]/gi, firstName)
      .replace(/\[gender\]/gi, gender);
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

  function extractContactRecordIdFromHref(hrefInput) {
    const href = String(hrefInput || "").trim();
    if (!href) return "";
    const match = href.match(/\/record\/0-1\/(\d+)/i);
    return match ? String(match[1]) : "";
  }

  function extractRecordIdFromRow(row) {
    if (!(row instanceof Element)) return "";

    const linkCandidates = Array.from(row.querySelectorAll("a[href], [data-href], [data-url], [href]"));
    for (const element of linkCandidates) {
      if (!(element instanceof Element)) continue;
      const href = element.getAttribute("href") || element.getAttribute("data-href") || element.getAttribute("data-url") || "";
      const recordId = extractContactRecordIdFromHref(href);
      if (recordId) return recordId;
    }

    const rowHtml = String(row.innerHTML || "");
    const fallbackRecordId = extractContactRecordIdFromHref(rowHtml);
    return fallbackRecordId || "";
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

  function isContactIndexPage() {
    const path = String(location.pathname || "");
    if (!/\/contacts\/\d+\//i.test(path)) return false;
    if (/\/record\/0-1\/\d+/i.test(path)) return false;
    return /\/objects\/0-1(?:\/|$)/i.test(path);
  }

  function isContactIndexRecordLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    const href = String(anchor.href || anchor.getAttribute("href") || "").trim();
    if (!extractContactRecordIdFromHref(href)) return false;

    const row = anchor.closest("tr, [role='row'], li, article, section, div");
    if (!(row instanceof Element)) return false;
    return !!extractRecordIdFromRow(row);
  }

  function ensureContactIndexNewTabStyles() {
    if (document.getElementById(CONTACT_INDEX_NEW_TAB_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = CONTACT_INDEX_NEW_TAB_STYLE_ID;
    style.textContent = `
      .cp-contact-index-avatar-action {
        position: relative;
        cursor: pointer;
      }

      .cp-contact-index-avatar-action::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 28px;
        height: 28px;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        opacity: 0;
        pointer-events: none;
        background-color: #7c3aed;
        background-repeat: no-repeat;
        background-position: center;
        background-size: 12px 12px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M6 3.5H3.75A1.25 1.25 0 0 0 2.5 4.75v7.5A1.25 1.25 0 0 0 3.75 13.5h7.5a1.25 1.25 0 0 0 1.25-1.25V10' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M8.5 2.5h5v5' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M13.25 2.75 7 9' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
        transition: opacity 120ms ease;
      }

      tr:hover .cp-contact-index-avatar-action,
      [role='row']:hover .cp-contact-index-avatar-action,
      .cp-contact-index-avatar-action:focus-visible {
        color: transparent !important;
        font-size: 0 !important;
        text-shadow: none !important;
      }

      tr:hover .cp-contact-index-avatar-action::after,
      [role='row']:hover .cp-contact-index-avatar-action::after,
      .cp-contact-index-avatar-action:focus-visible::after {
        opacity: 1;
      }

      .cp-contact-index-avatar-action:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(11, 114, 133, 0.18);
      }

      .cp-contact-index-phone-action-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .cp-contact-index-whatsapp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 1px solid rgba(18, 140, 76, 0.22);
        border-radius: 999px;
        background: #25d366;
        color: #ffffff;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(37, 211, 102, 0.28);
        transition: opacity 120ms ease, background-color 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
      }

      tr:hover .cp-contact-index-whatsapp-btn,
      [role='row']:hover .cp-contact-index-whatsapp-btn,
      .cp-contact-index-whatsapp-btn:focus-visible {
        opacity: 1;
        pointer-events: auto;
      }

      .cp-contact-index-whatsapp-btn:hover,
      .cp-contact-index-whatsapp-btn:focus-visible {
        background: #1fbe5d;
        border-color: rgba(18, 140, 76, 0.38);
        box-shadow: 0 4px 12px rgba(31, 190, 93, 0.34);
        transform: translateY(-1px);
        outline: none;
      }

      .cp-contact-index-whatsapp-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.7;
      }
    `;
    document.head.appendChild(style);
  }

  function openContactIndexLinkInNewTab(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = String(anchor.href || anchor.getAttribute("href") || "").trim();
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function openOrReuseWhatsappTab(url) {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) return;

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OPEN_OR_REUSE_WHATSAPP_TAB,
      url: targetUrl
    });
    if (response?.ok) return;
    throw new Error(String(response?.error || "Could not open WhatsApp tab."));
  }

  function buildContactIndexWhatsappUrl(rawPhone) {
    const phoneDigits = normalizePhone(rawPhone, inlineQuickActionsState.countryPrefix) || "";
    if (!phoneDigits) return "";
    return `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number`;
  }

  function findContactIndexAnchorInScope(scope) {
    if (!(scope instanceof Element)) return null;
    const anchors = scope instanceof HTMLAnchorElement ? [scope, ...scope.querySelectorAll("a[href]")] : Array.from(scope.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      if (anchor instanceof HTMLAnchorElement && isContactIndexRecordLink(anchor)) {
        return anchor;
      }
    }
    return null;
  }

  function findContactIndexNameCell(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return null;
    return anchor.closest("td, [role='gridcell'], [role='cell']") || anchor.parentElement;
  }

  function isLikelyContactIndexAvatarNode(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20 || rect.width > 64 || rect.height > 64) return false;
    const text = cleanText(element.textContent || "");
    if (!text || text.length > 4) return false;
    return true;
  }

  function findContactIndexInlineContainer(anchor, nameCell) {
    const cell = nameCell instanceof Element ? nameCell : findContactIndexNameCell(anchor);
    if (!(cell instanceof Element) || !(anchor instanceof HTMLAnchorElement)) return cell;

    let current = anchor.parentElement;
    while (current && current !== cell) {
      const children = Array.from(current.children);
      const anchorChild = children.find((child) => child === anchor || child.contains(anchor));
      if (anchorChild && children.length >= 2) {
        const avatarSibling = children.find((child) => child !== anchorChild && isLikelyContactIndexAvatarNode(child));
        if (avatarSibling) return current;
      }
      current = current.parentElement;
    }

    return cell;
  }

  function findContactIndexAvatarNode(container, anchor) {
    if (!(container instanceof Element) || !(anchor instanceof HTMLAnchorElement)) return null;
    const children = Array.from(container.children);
    const anchorChild = children.find((child) => child === anchor || child.contains(anchor)) || anchor;
    return children.find((child) => child !== anchorChild && isLikelyContactIndexAvatarNode(child)) || null;
  }

  function decorateContactIndexAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.dataset.cpInlineNewTabEnhanced === "1") return;
    if (!isContactIndexRecordLink(anchor)) return;

    const nameCell = findContactIndexNameCell(anchor);
    if (!(nameCell instanceof Element)) return;

    const existingInCell = nameCell.querySelector(".cp-contact-index-inline-open-btn");
    if (existingInCell instanceof HTMLButtonElement) {
      anchor.dataset.cpInlineNewTabEnhanced = "1";
      return;
    }

    const container = findContactIndexInlineContainer(anchor, nameCell);
    if (!(container instanceof Element)) return;

    const avatarNode = findContactIndexAvatarNode(container, anchor);
    if (avatarNode instanceof Element) {
      avatarNode.classList.add("cp-contact-index-avatar-action");
      avatarNode.setAttribute("role", "button");
      avatarNode.setAttribute("tabindex", "0");
      avatarNode.setAttribute("aria-label", "Open contact in new tab");
      avatarNode.setAttribute("title", "Open in new tab");
      avatarNode.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openContactIndexLinkInNewTab(anchor);
      });
      avatarNode.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openContactIndexLinkInNewTab(anchor);
      });
      anchor.dataset.cpInlineNewTabEnhanced = "1";
    }
  }

  function getContactIndexPhoneColumn() {
    const headerInfo = findHeaderRow();
    if (!headerInfo) return null;
    const columns = buildColumns(headerInfo);
    if (!columns.length) return null;
    const phoneColumnId = findPhoneColumnId(columns);
    if (!phoneColumnId) return null;
    return columns.find((column) => column.id === phoneColumnId) || null;
  }

  function findContactIndexPhoneContentElement(phoneCell) {
    if (!(phoneCell instanceof Element)) return null;
    const candidates = Array.from(phoneCell.querySelectorAll("*")).filter((element) => {
      if (!(element instanceof Element)) return false;
      if (element.classList.contains("cp-contact-index-whatsapp-btn")) return false;
      const text = cleanText(element.textContent || "");
      return !!text && PHONE_PATTERN.test(text);
    });
    candidates.sort((a, b) => cleanText(a.textContent || "").length - cleanText(b.textContent || "").length);
    return candidates[0] || phoneCell.firstElementChild || null;
  }

  function createContactIndexWhatsappButton(waUrl) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cp-contact-index-whatsapp-btn";
    button.setAttribute("aria-label", "Open number in WhatsApp");
    button.setAttribute("title", "Open in WhatsApp");
    button.innerHTML = inlineActionIcon("whatsapp");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openOrReuseWhatsappTab(waUrl);
    });
    return button;
  }

  function decorateContactIndexPhoneCell(phoneCell) {
    if (!(phoneCell instanceof Element)) return;
    if (phoneCell.querySelector(".cp-contact-index-whatsapp-btn")) return;

    const rawPhone = cleanPhoneCandidate(phoneCell.textContent || "");
    const waUrl = buildContactIndexWhatsappUrl(rawPhone);
    if (!waUrl) return;

    const contentElement = findContactIndexPhoneContentElement(phoneCell);
    const button = createContactIndexWhatsappButton(waUrl);

    if (contentElement instanceof Element && !contentElement.classList.contains("cp-contact-index-phone-action-wrap")) {
      const wrapper = document.createElement("span");
      wrapper.className = "cp-contact-index-phone-action-wrap";
      contentElement.parentNode?.insertBefore(wrapper, contentElement);
      wrapper.appendChild(contentElement);
      wrapper.appendChild(button);
      return;
    }

    phoneCell.appendChild(button);
  }

  function enhanceContactIndexInlineButtons() {
    if (!isContactIndexPage()) return;
    ensureContactIndexNewTabStyles();
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      decorateContactIndexAnchor(anchor);
    }

    const phoneColumn = getContactIndexPhoneColumn();
    const headerInfo = findHeaderRow();
    if (!phoneColumn || !headerInfo) return;
    const rows = getDataRows(headerInfo);
    for (const row of rows) {
      if (!(row instanceof Element)) continue;
      const cells = Array.from(row.querySelectorAll("td, [role='gridcell']"));
      const phoneCell = cells[phoneColumn.sourceIndex] || null;
      decorateContactIndexPhoneCell(phoneCell);
    }
  }

  function startContactIndexEnhancerWatcher() {
    ensureContactIndexNewTabStyles();
    enhanceContactIndexInlineButtons();
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      enhanceContactIndexInlineButtons();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
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

  function findStrictActiveFieldValue(labelRegex, maxLen = 40) {
    const labels = Array.from(document.querySelectorAll("label, dt, th, span, div, p, strong, h4, h5"));
    const blockedValueRegex = /^(?:--|-|n\/a|details)$/i;
    const blockedLabelLikeRegex =
      /\b(create date|contact owner|owner|phone(?: number)?|email|city|country|office|record id|next activity date|changes saved|save|saving)\b/i;

    function isPlausibleFieldValue(value) {
      const text = cleanText(value || "");
      if (!text) return false;
      if (blockedValueRegex.test(text)) return false;
      if (blockedLabelLikeRegex.test(text)) return false;
      if (text.length > 24) return false;
      if (/\d/.test(text)) return false;
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length > 2) return false;
      return true;
    }

    for (const node of labels) {
      if (!isVisible(node)) continue;
      const labelText = cleanText(node.textContent || "");
      if (!labelText || labelText.length > 60 || !labelRegex.test(labelText)) continue;

      const siblingText = cleanText(node.nextElementSibling?.textContent || "");
      if (siblingText && !labelRegex.test(siblingText) && isPlausibleFieldValue(siblingText)) {
        return cleanSummaryText(siblingText, maxLen);
      }

      const row = node.closest("li, tr, [role='row'], section, article, div");
      const rowLines = String(row?.innerText || "")
        .split(/\n+/)
        .map((line) => cleanText(line))
        .filter(Boolean);
      const labelIndex = rowLines.findIndex((line) => labelRegex.test(line));
      if (labelIndex >= 0) {
        const immediateNext = cleanText(rowLines[labelIndex + 1] || "");
        if (immediateNext && !labelRegex.test(immediateNext) && isPlausibleFieldValue(immediateNext)) {
          return cleanSummaryText(immediateNext, maxLen);
        }
      }
    }

    return "";
  }

  function findActiveContactGender() {
    function normalizeDisplayedFieldValue(value, maxLen = 40) {
      const text = cleanText(String(value || "").replace(/[▾▿▼▼▲△]/g, " "));
      if (!text) return "";
      if (/^(?:--|-|n\/a|details|undo)$/i.test(text)) return "";
      if (/\b(changes saved|create date|contact owner|owner|phone(?: number)?|email|city|country|office|record id|next activity date)\b/i.test(text)) {
        return "";
      }
      if (text.length > 24) return "";
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length > 2) return "";
      return cleanSummaryText(text, maxLen);
    }

    function readFieldValueFromLabel(labelRegex, maxLen = 40) {
      const labels = Array.from(document.querySelectorAll("label, dt, th, span, div, p, strong, h4, h5"));
      for (const node of labels) {
        if (!isVisible(node)) continue;
        const labelText = cleanText(node.textContent || "");
        if (!labelText || !labelRegex.test(labelText)) continue;

        const directCandidates = [
          node.nextElementSibling,
          node.parentElement?.querySelector("[role='combobox']"),
          node.parentElement?.querySelector("[aria-haspopup='listbox']"),
          node.parentElement?.querySelector("button"),
          node.parentElement?.querySelector("[data-test-id]"),
          node.parentElement?.querySelector("[data-testid]")
        ].filter(Boolean);

        for (const candidate of directCandidates) {
          if (!(candidate instanceof Element) || !isVisible(candidate)) continue;
          const firstLine = cleanText(String(candidate.innerText || candidate.textContent || "").split(/\n+/)[0] || "");
          const normalized = normalizeDisplayedFieldValue(firstLine, maxLen);
          if (normalized) return normalized;
        }

        const parentLines = String(node.parentElement?.innerText || "")
          .split(/\n+/)
          .map((line) => cleanText(line))
          .filter(Boolean);
        const labelIndex = parentLines.findIndex((line) => labelRegex.test(line));
        if (labelIndex >= 0) {
          for (let i = labelIndex + 1; i < Math.min(parentLines.length, labelIndex + 4); i += 1) {
            const normalized = normalizeDisplayedFieldValue(parentLines[i], maxLen);
            if (normalized) return normalized;
          }
        }
      }
      return "";
    }

    return (
      readFieldValueFromLabel(/^\s*gender\s*$/i, 40) ||
      readFieldValueFromLabel(/^\s*salutation\s*$/i, 40) ||
      findStrictActiveFieldValue(/\bgender\b/i, 40) ||
      findStrictActiveFieldValue(/\bsalutation\b/i, 40) ||
      ""
    );
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
    const gender = findActiveContactGender();
    const recentActivity = collectRecentActivity(1);
    const phoneDigits = normalizePhone(phone, countryPrefix) || "";
    const baseWaUrl = phoneDigits ? `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number` : "";
    const messageBody = String(messageText || "")
      .replace(/\[name\]/gi, name ? name.split(" ")[0] : "")
      .replace(/\[gender\]/gi, gender)
      .trim();
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
          gender,
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

  function clickTaskActivityTab() {
    const labels = ["tasks", "task", "to-dos", "to do", "todo"];
    for (const label of labels) {
      const tab = findHubSpotCenterTabControl(label);
      if (!tab) continue;
      tab.click();
      return true;
    }
    return false;
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
    searchQuery: "",
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
    const fullName = cleanText(values.name || "");
    const firstName = fullName ? fullName.split(" ")[0] : "";
    const resolvedName = firstName || fullName;
    const gender = resolveGenderValue(values);
    const owner = cleanText(values.owner || context?.owner || "");
    const email = cleanText(values.email || "");
    const phone = cleanText(values.phone || "");
    const recordId = cleanText(context?.recordId || values.record_id || "");

    const tokens = {
      name: resolvedName,
      gender,
      first_name: resolvedName,
      firstname: resolvedName,
      full_name: fullName,
      fullname: fullName,
      owner,
      email,
      phone,
      record_id: recordId,
      recordid: recordId
    };

    for (const [rawKey, rawValue] of Object.entries(values)) {
      const key = inlineTokenKey(rawKey);
      if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(tokens, key)) continue;
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
        width: 296px;
        min-width: 296px;
        max-width: 296px;
        border: 1px solid #d7c8ef;
        background: #fcfaff;
        border-radius: 10px;
        box-shadow: 0 10px 28px rgba(45, 22, 79, 0.16);
        color: #47386a;
        overflow: hidden;
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
        color: #402a68;
        background: #f3ebff;
        box-shadow:
          0 1px 0 rgba(100, 67, 154, 0.08);
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
        padding: 2px 10px 9px;
        background: #f3ebff;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-divider {
        color: #a48dbf;
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
        color: #5a437d;
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
        background: rgba(137, 96, 196, 0.14);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn.active {
        background: rgba(137, 96, 196, 0.2);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID}[data-busy="1"] .cp-inline-action-btn {
        opacity: 0.65;
        cursor: wait;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel {
        border-top: 1px solid #e1d2f3;
        padding: 5px 12px 4px 6px;
        max-height: 220px;
        overflow: auto;
        scrollbar-gutter: stable;
        scrollbar-width: thin;
        scrollbar-color: rgba(145, 113, 186, 0.52) transparent;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar {
        width: 7px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar-track {
        background: transparent;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar-thumb {
        background: rgba(145, 113, 186, 0.48);
        border-radius: 999px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar-thumb:hover {
        background: rgba(128, 92, 173, 0.66);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-search {
        padding: 8px 8px 4px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-search-input {
        width: 100%;
        border: 1px solid rgba(123, 99, 161, 0.26);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
        color: #402866;
        font: inherit;
        font-size: 12px;
        line-height: 1.3;
        padding: 7px 9px;
        outline: none;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-search-input:focus {
        border-color: rgba(123, 99, 161, 0.48);
        box-shadow: 0 0 0 3px rgba(137, 96, 196, 0.12);
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
        padding: 4px 6px;
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
        color: #7b63a1;
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
        background: rgba(137, 96, 196, 0.12);
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-empty {
        font-size: 12px;
        color: #88759f;
        padding: 6px 7px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status {
        font-size: 11px;
        color: #7e6a99;
        padding: 0 10px 8px;
        display: none;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status:not(:empty) {
        display: block;
        min-height: 16px;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status[data-tone="error"] {
        color: #af2f2f;
      }

      #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status[data-tone="success"] {
        color: #19733d;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-card {
        background: #33284a !important;
        border-color: #8f79b6 !important;
        color: #f2ecfb !important;
        box-shadow: 0 8px 24px rgba(18, 8, 32, 0.42) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-head {
        color: #f7f1ff !important;
        background: #473668 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-actions-row {
        background: #473668 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-divider {
        color: #cebce6 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn {
        color: #efe6fb !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn:hover {
        background: rgba(179, 145, 226, 0.2) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-action-btn.active {
        background: rgba(179, 145, 226, 0.28) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel {
        border-top-color: #846bab !important;
        scrollbar-color: rgba(198, 173, 232, 0.42) transparent;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-search-input {
        background: rgba(43, 31, 63, 0.92) !important;
        border-color: rgba(198, 173, 232, 0.26) !important;
        color: #f2ecfb !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-search-input:focus {
        border-color: rgba(198, 173, 232, 0.46) !important;
        box-shadow: 0 0 0 3px rgba(179, 145, 226, 0.14) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar-thumb {
        background: rgba(198, 173, 232, 0.42) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-panel::-webkit-scrollbar-thumb:hover {
        background: rgba(198, 173, 232, 0.58) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-btn:hover {
        background: rgba(179, 145, 226, 0.18) !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-cloud {
        color: #d4c0f0 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-template-check.is-used {
        color: #8ee0a6 !important;
      }

      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-empty,
      html[data-darkreader-scheme="dark"] #${INLINE_QUICK_ACTIONS_ROOT_ID} .cp-inline-status {
        color: #dacdf0 !important;
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
    if (kind === "task") {
      return "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='4' y='4' width='16' height='16' rx='2'></rect><path d='M8 12l2.5 2.5L16 9'></path></svg>";
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
    const query = normalizeSearchText(inlineQuickActionsState.searchQuery || "");
    const matchingTemplates = query
      ? templates.filter((template) => normalizeSearchText(template?.name || "").includes(query))
      : templates;
    inlineQuickActionsState.panelEl.hidden = false;
    if (!templates.length) {
      const label = inlineQuickActionsState.activeKind === "whatsapp" ? "WhatsApp" : inlineQuickActionsState.activeKind[0].toUpperCase() + inlineQuickActionsState.activeKind.slice(1);
      inlineQuickActionsState.panelEl.innerHTML = `<div class='cp-inline-empty'>No ${escapeHtml(label)} templates.</div>`;
      return;
    }
    if (!matchingTemplates.length) {
      inlineQuickActionsState.panelEl.innerHTML =
        `<div class='cp-inline-search'><input type='text' class='cp-inline-search-input' placeholder='Search titles...' autocomplete='off' value='${escapeHtml(
          inlineQuickActionsState.searchQuery || ""
        )}'></div>` + "<div class='cp-inline-empty'>No templates match that title.</div>";
      return;
    }

    inlineQuickActionsState.panelEl.innerHTML =
      `<div class='cp-inline-search'><input type='text' class='cp-inline-search-input' placeholder='Search titles...' autocomplete='off' value='${escapeHtml(
        inlineQuickActionsState.searchQuery || ""
      )}'></div>` +
      matchingTemplates
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

  async function applyInlineWhatsappTemplate(template) {
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
    await openOrReuseWhatsappTab(url);
  }

  function getTaskComposerMarkerScore(root) {
    if (!(root instanceof Element) || !isVisible(root)) return false;
    const text = elementText(root).toLowerCase();
    if (!text) return 0;

    let score = 0;
    if (text.includes("enter your task")) score += 30;
    if (text.includes("task title")) score += 26;
    if (text.includes("activity date")) score += 10;
    if (text.includes("send reminder")) score += 10;
    if (text.includes("set to repeat")) score += 8;
    if (text.includes("task type")) score += 8;
    if (text.includes("activity assigned to")) score += 8;
    if (text.includes("associated with")) score += 6;
    if (text.includes("task due date")) score += 10;
    if (text.includes("queue")) score += 4;
    if (text.includes("mark task as complete")) score += 4;
    if (root.querySelector("textarea, input, [contenteditable='true'], [role='textbox']")) score += 4;
    return score;
  }

  function isTaskComposerDialog(dialog) {
    if (!(dialog instanceof Element) || !isVisible(dialog) || dialog.getAttribute("role") !== "dialog") return false;
    return getTaskComposerMarkerScore(dialog) >= 28;
  }

  function isTaskComposerRoot(root) {
    if (!(root instanceof Element) || !isVisible(root)) return false;
    if (root.getAttribute("role") === "dialog") return isTaskComposerDialog(root);
    return getTaskComposerMarkerScore(root) >= 36;
  }

  function getTaskContextText(element) {
    const scopes = [
      element?.closest("[role='dialog']"),
      element?.closest("[role='menu']"),
      element?.closest("[role='toolbar']"),
      element?.closest("[role='tablist']"),
      element?.closest("section"),
      element?.closest("article"),
      element?.closest("main"),
      element?.parentElement
    ].filter(Boolean);

    const seen = new Set();
    const parts = [];
    for (const scope of scopes) {
      if (!(scope instanceof Element)) continue;
      if (seen.has(scope)) continue;
      seen.add(scope);
      parts.push(elementText(scope).toLowerCase());
    }
    return cleanText(parts.join(" ")).toLowerCase();
  }

  function hasTaskComposerOpen() {
    const dialogOpen = Array.from(document.querySelectorAll("[role='dialog']")).some((dialog) => isTaskComposerDialog(dialog));
    if (dialogOpen) return true;

    const candidateRoots = Array.from(
      document.querySelectorAll("form, section, article, [role='region'], [data-test-id], [data-testid], [data-selenium-test]")
    );
    return candidateRoots.some((root) => isTaskComposerRoot(root));
  }

  function findTaskComposerRoot() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog']")).filter((dialog) => isTaskComposerDialog(dialog));
    if (dialogs.length) return dialogs[0];

    const candidateRoots = Array.from(
      document.querySelectorAll("form, section, article, [role='region'], [data-test-id], [data-testid], [data-selenium-test]")
    ).filter((root) => isTaskComposerRoot(root));
    return candidateRoots[0] || null;
  }

  function scoreTaskTitleFieldCandidate(element) {
    if (!(element instanceof Element) || !isVisible(element)) return -Infinity;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return -Infinity;
    if (element.getAttribute("readonly") === "true") return -Infinity;

    const hint = getElementHint(element);
    const placeholder = cleanText(element.getAttribute?.("placeholder") || "").toLowerCase();
    const text = `${hint} ${placeholder}`.trim();
    let score = 0;

    if (text.includes("enter your task")) score += 40;
    if (text.includes("task title")) score += 34;
    if (text === "task") score += 12;
    if (text.includes("notes")) score -= 28;
    if (text.includes("reminder")) score -= 20;
    if (text.includes("queue")) score -= 18;
    if (text.includes("assigned")) score -= 18;
    if (text.includes("date")) score -= 20;

    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "textarea") score += 8;
    if (tag === "input") score += 6;
    if (element.getAttribute("contenteditable") === "true") score += 10;

    const rect = element.getBoundingClientRect();
    if (rect.width >= 220) score += 4;
    if (rect.height >= 32 && rect.height <= 96) score += 4;

    return score;
  }

  function findTaskTitleField(root) {
    if (!(root instanceof Element)) return null;
    const candidates = Array.from(root.querySelectorAll("textarea, input, [contenteditable='true'], [role='textbox']"));
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const score = scoreTaskTitleFieldCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return bestScore >= 16 ? best : null;
  }

  function focusTaskTitleField() {
    const composerRoot = findTaskComposerRoot();
    if (!(composerRoot instanceof Element)) return false;
    const field = findTaskTitleField(composerRoot);
    if (!(field instanceof Element)) return false;

    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      try {
        field.setSelectionRange(field.value.length, field.value.length);
      } catch (_error) {
        // Ignore selection failures.
      }
    }
    return true;
  }

  function getCreateTaskTriggers() {
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], a")).filter((el) => isVisible(el));
    const matches = [];

    for (const el of candidates) {
      const text = elementText(el).toLowerCase();
      const aria = cleanText(el.getAttribute?.("aria-label") || "").toLowerCase();
      const testId = cleanText(
        el.getAttribute?.("data-test-id") || el.getAttribute?.("data-testid") || el.getAttribute?.("data-selenium-test") || ""
      ).toLowerCase();
      const title = cleanText(el.getAttribute?.("title") || "").toLowerCase();
      const hint = `${text} ${aria} ${testId} ${title}`.trim();
      const compactHint = hint.replace(/\s+/g, " ").trim();
      if (!compactHint) continue;
      const taskContextText = getTaskContextText(el);
      const opensTaskComposer =
        compactHint.includes("create task") ||
        compactHint.includes("create tasks") ||
        compactHint.includes("add task") ||
        compactHint.includes("new task") ||
        compactHint.includes("task title") ||
        compactHint.includes("to-do") ||
        compactHint.includes("todo") ||
        compactHint.includes("log task") ||
        ((compactHint === "add" || compactHint === "+ add" || compactHint === "create" || compactHint === "+") &&
          (taskContextText.includes("tasks") || taskContextText.includes("task") || taskContextText.includes("to-do")));
      if (!opensTaskComposer) continue;

      let score = 0;
      if (compactHint.includes("create task")) score += 46;
      if (compactHint.includes("create tasks")) score += 46;
      if (compactHint.includes("add task")) score += 32;
      if (compactHint.includes("new task")) score += 32;
      if (compactHint.includes("log task")) score += 24;
      if (compactHint.includes("task title")) score += 20;
      if (compactHint.includes("to-do") || compactHint.includes("todo")) score += 12;
      if (compactHint === "add" || compactHint === "+ add" || compactHint === "+") score += 26;
      if (compactHint === "create") score += 18;
      if (compactHint.includes("mark") && compactHint.includes("complete")) score -= 24;
      if (compactHint.includes("assigned")) score -= 18;
      if (compactHint.includes("filter")) score -= 22;
      if (compactHint.includes("recent")) score -= 14;
      if (compactHint.includes("close")) score -= 40;

      const classText = String(el.className || "").toLowerCase();
      if (classText.includes("private-button")) score += 3;
      if (classText.includes("primary")) score += 2;
      if (classText.includes("add")) score += 3;

      const root = el.closest("[role='dialog'], [role='menu'], [role='toolbar'], [role='tablist'], section, article, li, div") || el;
      const rootText = elementText(root).toLowerCase();
      if (rootText.includes("task is incomplete")) score -= 28;
      if (rootText.includes("activity")) score += 4;
      if (rootText.includes("notes") && rootText.includes("emails")) score += 8;
      if (rootText.includes("about this contact")) score -= 28;
      if (el.getAttribute("role") === "tab") score -= 40;
      if (taskContextText.includes("tasks")) score += 12;
      if (taskContextText.includes("to-do") || taskContextText.includes("todo")) score += 8;
      if (taskContextText.includes("activity date")) score += 4;
      if (taskContextText.includes("associated with")) score -= 10;

      if (score < 14) continue;
      matches.push({ el, score });
    }

    return matches.sort((a, b) => b.score - a.score).map((item) => item.el);
  }

  async function openTaskComposerOnPage() {
    if (hasTaskComposerOpen()) {
      return { ok: true };
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt === 0 || attempt % 3 === 0) clickActivitiesTab();
      if (attempt === 1 || attempt % 3 === 1) clickTaskActivityTab();
      await sleep(180);
      const triggers = getCreateTaskTriggers();
      for (const trigger of triggers.slice(0, 4)) {
        trigger.click();
        await sleep(180);
        if (hasTaskComposerOpen()) {
          focusTaskTitleField();
          return { ok: true };
        }
      }
      await sleep(220);
    }

    throw new Error("Could not open the HubSpot task composer.");
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
        setInlineQuickActionsStatus("");
      } else if (kind === "note") {
        await applyInlineNoteTemplate(template);
        markInlineTemplateUsed("note", template.id);
        setInlineQuickActionsStatus("");
      } else if (kind === "whatsapp") {
        await applyInlineWhatsappTemplate(template);
        markInlineTemplateUsed("whatsapp", template.id);
        setInlineQuickActionsStatus("");
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

    if (selectedKind === "task") {
      setInlineQuickActionsBusy(true);
      setInlineQuickActionsStatus("");
      try {
        await openTaskComposerOnPage();
        renderInlineQuickActionsPanel("");
        setInlineQuickActionsStatus("");
      } catch (error) {
        const reason = cleanText(String(error?.message || error || "Could not open task composer."));
        setInlineQuickActionsStatus(reason || "Could not open task composer.", "error");
      } finally {
        setInlineQuickActionsBusy(false);
      }
      return;
    }

    await refreshInlineQuickActionsData();

    if (inlineQuickActionsState.activeKind === selectedKind) {
      inlineQuickActionsState.searchQuery = "";
      renderInlineQuickActionsPanel("");
      return;
    }
    inlineQuickActionsState.searchQuery = "";
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

  function handleInlineRootInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("cp-inline-search-input")) return;

    const nextQuery = String(target.value || "");
    const caret = Number.isFinite(target.selectionStart) ? target.selectionStart : nextQuery.length;
    inlineQuickActionsState.searchQuery = nextQuery;
    if (inlineQuickActionsState.activeKind) {
      renderInlineQuickActionsPanel(inlineQuickActionsState.activeKind);
      const nextInput = inlineQuickActionsState.panelEl?.querySelector(".cp-inline-search-input");
      if (nextInput instanceof HTMLInputElement) {
        nextInput.focus();
        const nextCaret = Math.min(caret, nextInput.value.length);
        nextInput.setSelectionRange(nextCaret, nextCaret);
      }
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
          <button type='button' class='cp-inline-action-btn' data-kind='whatsapp' aria-label='WhatsApp templates' title='WhatsApp templates'>${inlineActionIcon("whatsapp")}</button>
          <span class='cp-inline-divider'>|</span>
          <button type='button' class='cp-inline-action-btn' data-kind='email' aria-label='Email templates' title='Email templates'>${inlineActionIcon("email")}</button>
          <span class='cp-inline-divider'>|</span>
          <button type='button' class='cp-inline-action-btn' data-kind='note' aria-label='Note templates' title='Note templates'>${inlineActionIcon("note")}</button>
          <span class='cp-inline-divider'>|</span>
          <button type='button' class='cp-inline-action-btn' data-kind='task' aria-label='Create task' title='Create task'>${inlineActionIcon("task")}</button>
        </div>
        <div class='cp-inline-panel' hidden></div>
        <div class='cp-inline-status' aria-live='polite'></div>
      </div>
    `;

    rootEl.addEventListener("click", handleInlineRootClick);
    rootEl.addEventListener("input", handleInlineRootInput);
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
    inlineQuickActionsState.rootEl.removeEventListener("input", handleInlineRootInput);
    inlineQuickActionsState.rootEl.removeEventListener("pointerdown", handleInlineQuickActionsPointerDown);
    inlineQuickActionsState.rootEl.remove();
    inlineQuickActionsState.rootEl = null;
    inlineQuickActionsState.panelEl = null;
    inlineQuickActionsState.statusEl = null;
    inlineQuickActionsState.activeKind = "";
    inlineQuickActionsState.searchQuery = "";
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
  startContactIndexEnhancerWatcher();
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
