(() => {
  const DEFAULT_COUNTRY_CODE = "60";
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
      });
    } catch (_error) {
      // Ignore storage read failures.
    }
  }

  function subscribeHubSpotThemeChanges() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") return;
        if (!changes || !Object.prototype.hasOwnProperty.call(changes, SETTINGS_KEY)) return;
        const nextSettings = changes[SETTINGS_KEY]?.newValue;
        applyHubSpotThemeMode(nextSettings?.themeMode || "light");
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

    // Remove trailing short numeric fragments that can leak from adjacent date cells.
    text = text.replace(/\s+\d{1,3}$/, "");
    return cleanText(text);
  }

  function normalizePhone(raw, countryPrefix = DEFAULT_COUNTRY_CODE) {
    const trimmed = cleanPhoneCandidate(raw);
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    const prefix = String(countryPrefix || DEFAULT_COUNTRY_CODE).replace(/\D/g, "") || DEFAULT_COUNTRY_CODE;

    if (trimmed.startsWith("+")) return digits;
    if (digits.startsWith(prefix)) return digits;
    return `${prefix}${digits}`;
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
    const mailto = Array.from(document.querySelectorAll("a[href^='mailto:']"))
      .map((el) => cleanText(el.textContent || "").toLowerCase())
      .find((text) => /\S+@\S+\.\S+/.test(text));
    if (mailto) return mailto;

    const textEmail = cleanText(document.body?.innerText || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return textEmail ? String(textEmail[0]).toLowerCase() : "";
  }

  function findActiveContactPhone() {
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

  function getActiveTabContext(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const portalId = getPortalIdFromPath();
    const recordId = getRecordIdFromPath();
    const kind = inferObjectKindFromPath();

    if (kind !== "contact" || !recordId) {
      return { kind, portalId, recordId: "" };
    }

    const name = findActiveContactName();
    const email = findActiveContactEmail();
    const phone = findActiveContactPhone();
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
          email,
          phone,
          record_id: recordId
        },
        phoneDigits,
        waUrl
      }
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
    return cleanText(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "");
  }

  function findNoteEditor() {
    const candidates = Array.from(document.querySelectorAll("textarea, [contenteditable='true'], [role='textbox']")).filter((el) => {
      if (!isVisible(el)) return false;
      const hint = cleanText(
        el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("data-selenium-test") || ""
      ).toLowerCase();
      if (hint.includes("search")) return false;
      return true;
    });

    if (!candidates.length) return null;

    const scored = candidates
      .map((el) => {
        const hint = cleanText(
          el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("data-selenium-test") || ""
        ).toLowerCase();
        let score = 0;
        if (hint.includes("note")) score += 6;
        if (hint.includes("body")) score += 3;
        if (hint.includes("activity")) score += 2;
        if (el.closest("[role='dialog']")) score += 2;
        if (el.tagName === "TEXTAREA") score += 2;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0].el || null;
  }

  function clickNoteTrigger() {
    const triggers = Array.from(document.querySelectorAll("button, [role='button']")).filter((el) => {
      if (!isVisible(el)) return false;
      const text = elementText(el).toLowerCase();
      if (!text) return false;
      if (text.includes("cancel") || text.includes("close")) return false;
      return text === "note" || text.includes("add note") || text.includes("create note");
    });

    if (!triggers.length) return false;
    triggers[0].click();
    return true;
  }

  function setEditorText(editor, noteBody) {
    const text = String(noteBody || "").trim();
    if (!text) return;

    editor.focus();

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    editor.textContent = text;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findSaveButton(editor) {
    const roots = [editor?.closest("[role='dialog']"), editor?.closest("form"), document].filter(Boolean);
    const seen = new Set();
    let best = null;
    let bestScore = -Infinity;

    for (const root of roots) {
      const buttons = Array.from(root.querySelectorAll("button, [role='button']"));
      for (const button of buttons) {
        if (seen.has(button)) continue;
        seen.add(button);
        if (!isVisible(button)) continue;
        const text = elementText(button).toLowerCase();
        if (!text) continue;

        let score = 0;
        if (text === "save") score += 12;
        if (text.includes("save note")) score += 14;
        if (text.includes("save")) score += 8;
        if (text.includes("log activity")) score += 7;
        if (text.includes("create") && text.includes("note")) score += 6;
        if (text.includes("cancel") || text.includes("discard") || text.includes("close")) score -= 10;

        if (score > bestScore) {
          bestScore = score;
          best = button;
        }
      }
    }

    return bestScore > 0 ? best : null;
  }

  async function createNoteOnPage(noteBody) {
    const text = cleanText(noteBody || "");
    if (!text) throw new Error("Note text is empty.");

    let editor = null;
    for (let i = 0; i < TIMING.noteComposerOpenAttempts; i += 1) {
      editor = findNoteEditor();
      if (editor) break;
      clickNoteTrigger();
      await sleep(TIMING.noteComposerOpenDelayMs);
    }

    if (!editor) {
      throw new Error("Could not find note editor on contact page.");
    }

    setEditorText(editor, text);
    await sleep(TIMING.noteEditorSettleDelayMs);

    const saveButton = findSaveButton(editor);
    if (!saveButton) {
      throw new Error("Could not find note save button.");
    }

    saveButton.click();
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

  applyHubSpotThemeFromSettingsStorage();
  subscribeHubSpotThemeChanges();

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
