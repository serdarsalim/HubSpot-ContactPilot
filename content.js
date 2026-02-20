(() => {
  const DEFAULT_COUNTRY_CODE = "60";
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
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

  function extractTableContacts(countryPrefix = DEFAULT_COUNTRY_CODE, messageText = "") {
    const headerInfo = findHeaderRow();
    if (!headerInfo) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const columns = buildColumns(headerInfo);
    if (!columns.length) {
      return { columns: [], contacts: [], phoneColumnId: null };
    }

    const rows = getDataRows(headerInfo);
    const phoneColumnId = findPhoneColumnId(columns);
    const nameColumnId = findNameColumnId(columns);

    const contacts = [];
    const seen = new Set();

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td, [role='gridcell']"));
      if (!cells.length) continue;

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

      const hasAny = Object.values(values).some(Boolean);
      if (!hasAny) continue;

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

      const key = columns.map((c) => values[c.id] || "").join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      contacts.push({
        key,
        values,
        phoneDisplay: phoneRaw || values[phoneColumnId || ""] || "",
        phoneDigits,
        waUrl
      });
    }

    return { columns, contacts, phoneColumnId };
  }

  function getPortalIdFromPath() {
    const match = String(location.pathname || "").match(/\/contacts\/(\d+)\//i);
    return match ? match[1] : "";
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
    for (let i = 0; i < 20; i += 1) {
      editor = findNoteEditor();
      if (editor) break;
      clickNoteTrigger();
      await sleep(400);
    }

    if (!editor) {
      throw new Error("Could not find note editor on contact page.");
    }

    setEditorText(editor, text);
    await sleep(250);

    const saveButton = findSaveButton(editor);
    if (!saveButton) {
      throw new Error("Could not find note save button.");
    }

    saveButton.click();
    await sleep(1200);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "GET_CONTACTS") {
      try {
        const countryPrefix = String(message.countryPrefix || DEFAULT_COUNTRY_CODE);
        const messageText = String(message.messageText || "");
        const payload = extractTableContacts(countryPrefix, messageText);
        sendResponse({ ok: true, ...payload });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return;
    }

    if (message.type === "GET_PORTAL_ID") {
      sendResponse({ ok: true, portalId: getPortalIdFromPath() });
      return;
    }

    if (message.type === "CREATE_NOTE_ON_PAGE") {
      const noteBody = String(message.noteBody || "");
      createNoteOnPage(noteBody)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
  });
})();
