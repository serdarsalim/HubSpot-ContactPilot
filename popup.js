const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("statusText");
const statusActionsEl = document.getElementById("statusActions");
const stickyHeadEl = document.getElementById("stickyHead");
const listEl = document.getElementById("list");

const settingsBtn = document.getElementById("settingsBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const columnChecks = document.getElementById("columnChecks");
const notesOverlay = document.getElementById("notesOverlay");
const notesTitleEl = document.getElementById("notesTitle");
const notesListEl = document.getElementById("notesList");
const notesTextInput = document.getElementById("notesTextInput");
const closeNotesBtn = document.getElementById("closeNotesBtn");
const cancelNotesBtn = document.getElementById("cancelNotesBtn");
const saveNoteBtn = document.getElementById("saveNoteBtn");

const refreshBtn = document.getElementById("refreshBtn");
const csvSelectedBtn = document.getElementById("csvSelectedBtn");
const vcfSelectedBtn = document.getElementById("vcfSelectedBtn");
const copyEmailBtn = document.getElementById("copyEmailBtn");
const logWhatsappBtn = document.getElementById("logWhatsappBtn");

const countryPrefixInput = document.getElementById("countryPrefixInput");
const messageTemplateInput = document.getElementById("messageTemplateInput");
const noteTemplateInput = document.getElementById("noteTemplateInput");
const rowFilterInput = document.getElementById("rowFilterInput");

const SETTINGS_KEY = "popupSettings";
const DEFAULT_NOTE_TEXT = "Reached out on WhatsApp";
const DEFAULT_SETTINGS = {
  countryPrefix: "60",
  messageTemplate: "",
  noteTemplate: DEFAULT_NOTE_TEXT,
  rowFilterWord: "",
  visibleColumns: {}
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let currentColumns = [];
let currentContacts = [];
let displayedContacts = [];
let phoneColumnId = null;
let selectedKeys = new Set();
let sortState = { field: null, direction: "asc" };
let currentPortalId = "";
let notesDialogState = {
  recordId: "",
  contactName: "",
  notes: [],
  loading: false
};
let notesLoadToken = 0;
let contactsLoading = false;

function columnType(col) {
  if (col.id === phoneColumnId) return "phone";
  if (/name/i.test(col.label) || /^name(_\d+)?$/.test(col.id)) return "name";
  if (/email/i.test(col.label) || /^email(_\d+)?$/.test(col.id)) return "email";
  if (/possibility/i.test(col.label) || /^possibility(_\d+)?$/.test(col.id)) return "possibility";
  return "plain";
}

function columnClasses(col) {
  const type = columnType(col);
  return type === "plain" ? "plain" : `plain ${type}`;
}

function sortAria(field) {
  if (sortState.field !== field) return "none";
  return sortState.direction === "asc" ? "ascending" : "descending";
}

function toggleSort(field) {
  if (!field) return;
  if (sortState.field === field) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.field = field;
    sortState.direction = "asc";
  }
  renderContacts();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  if (statusTextEl) {
    statusTextEl.textContent = message;
    updateStickyHeadOffset();
    return;
  }
  statusEl.textContent = message;
  updateStickyHeadOffset();
}

function updateStickyHeadOffset() {
  if (!stickyHeadEl || !document?.documentElement?.style) return;
  const stickyHeight = Math.ceil(stickyHeadEl.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--sticky-head-h", `${stickyHeight + 6}px`);
}

function setContactsLoadingState(isLoading) {
  if (refreshBtn) refreshBtn.disabled = !!isLoading;
}

function contactKey(contact) {
  return contact.key || currentColumns.map((col) => contact.values?.[col.id] || "").join("|");
}

function getFilterWord() {
  return String(settings.rowFilterWord || "").trim().toLowerCase();
}

function getFilteredContacts(source = currentContacts) {
  const filterWord = getFilterWord();
  if (!filterWord) return [...source];

  return source.filter((contact) => {
    const rowText = Object.values(contact.values || {}).join(" ").toLowerCase();
    return !rowText.includes(filterWord);
  });
}

function getVisibleColumns() {
  return currentColumns.filter((col) => settings.visibleColumns[col.id] !== false);
}

function mergeColumnSettings() {
  for (const col of currentColumns) {
    if (typeof settings.visibleColumns[col.id] !== "boolean") {
      settings.visibleColumns[col.id] = true;
    }
  }
}

function renderColumnChecks() {
  if (!columnChecks) return;

  if (!currentColumns.length) {
    columnChecks.innerHTML = "<div class='check'>No columns detected yet.</div>";
    return;
  }

  const html = currentColumns
    .map((col) => {
      const checked = settings.visibleColumns[col.id] !== false ? "checked" : "";
      return `<label class='check'><input type='checkbox' data-col-id='${escapeHtml(col.id)}' ${checked} /> ${escapeHtml(col.label)}</label>`;
    })
    .join("");

  columnChecks.innerHTML = html;
}

function getSortedContacts(source) {
  if (!sortState.field) return [...source];

  return [...source].sort((a, b) => {
    const result = compareValues(a, b, sortState.field);
    return sortState.direction === "asc" ? result : -result;
  });
}

function sortIndicator(field) {
  if (sortState.field !== field) return "";
  return sortState.direction === "asc" ? " ▲" : " ▼";
}

function compareValues(a, b, field) {
  const valueA = String(a.values?.[field] || "").trim();
  const valueB = String(b.values?.[field] || "").trim();

  if (field === phoneColumnId) {
    const numA = Number(valueA.replace(/\D/g, "")) || 0;
    const numB = Number(valueB.replace(/\D/g, "")) || 0;
    return numA - numB;
  }

  return valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
}

function renderContacts() {
  listEl.innerHTML = "";
  const filteredContacts = getFilteredContacts();
  const visibleKeys = new Set(filteredContacts.map((c) => contactKey(c)));
  selectedKeys = new Set([...selectedKeys].filter((key) => visibleKeys.has(key)));
  updateExportActionsVisibility();

  if (!filteredContacts.length) {
    if (currentContacts.length && getFilterWord()) {
      setStatus("No contacts match the current filter word.");
      return;
    }
    setStatus("No contacts with phone numbers found on this view.");
    return;
  }

  const visibleColumns = getVisibleColumns();
  if (!visibleColumns.length) {
    setStatus(`Found ${filteredContacts.length} contact(s). Selected ${selectedKeys.size}.`);
    listEl.innerHTML = "<div class='status'>Enable at least one column in Settings.</div>";
    return;
  }

  displayedContacts = getSortedContacts(filteredContacts);
  setStatus(`Found ${filteredContacts.length} contact(s). Selected ${selectedKeys.size}.`);

  const allShownSelected = displayedContacts.length > 0 && displayedContacts.every((c) => selectedKeys.has(contactKey(c)));
  const compactColumnLayout = visibleColumns.length <= 3;
  const displayedByKey = new Map(displayedContacts.map((c) => [contactKey(c), c]));

  const headerHtml = visibleColumns
    .map(
      (col, index) => {
        const sizeClass = compactColumnLayout ? (index === visibleColumns.length - 1 ? "col-elastic" : "col-fixed") : "col-fluid";
        return `<th class='sortable ${columnClasses(col)} ${sizeClass}' data-sort-field='${escapeHtml(col.id)}' tabindex='0' aria-sort='${sortAria(col.id)}'>${escapeHtml(col.label)}${sortIndicator(col.id)}</th>`;
      }
    )
    .join("");

  const rowsHtml = displayedContacts
    .map((contact) => {
      const key = contactKey(contact);
      const checked = selectedKeys.has(key) ? "checked" : "";

      const cellsHtml = visibleColumns
        .map((col, index) => {
          const value = contact.values?.[col.id] || "-";
          const sizeClass = compactColumnLayout ? (index === visibleColumns.length - 1 ? "col-elastic" : "col-fixed") : "col-fluid";
          const css = `${columnClasses(col)} ${sizeClass}`;

          if (col.id === phoneColumnId && contact.waUrl) {
            return `<td class='${css}'><a href='${escapeHtml(contact.waUrl)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(value)}</a></td>`;
          }

          if (columnType(col) === "name") {
            const recordId = getRecordIdForContact(contact);
            const contactUrl = buildContactUrl(recordId, currentPortalId);
            if (contactUrl) {
              return `<td class='${css}'><a href='${escapeHtml(contactUrl)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(value)}</a></td>`;
            }
          }

          return `<td class='${css}'>${escapeHtml(value)}</td>`;
        })
        .join("");

      return `
        <tr>
          <td class='sel'><input type='checkbox' class='row-select' data-key='${escapeHtml(key)}' ${checked} /></td>
          ${cellsHtml}
          <td class='actions'><button type='button' class='row-action-btn row-notes-btn' data-key='${escapeHtml(key)}'>Notes</button></td>
        </tr>
      `;
    })
    .join("");

  listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class='sel'><input type='checkbox' id='selectAllShown' ${allShownSelected ? "checked" : ""} /></th>
          ${headerHtml}
          <th class='actions'>Actions</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  listEl.querySelectorAll("th.sortable").forEach((header) => {
    header.addEventListener("click", () => {
      const field = header.getAttribute("data-sort-field");
      toggleSort(field);
    });
    header.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const field = header.getAttribute("data-sort-field");
      toggleSort(field);
    });
  });

  listEl.querySelectorAll(".row-select").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.getAttribute("data-key");
      if (!key) return;
      if (input.checked) selectedKeys.add(key);
      else selectedKeys.delete(key);
      updateExportActionsVisibility();
      setStatus(`Found ${filteredContacts.length} contact(s). Selected ${selectedKeys.size}.`);
    });
  });

  listEl.querySelectorAll(".row-notes-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.getAttribute("data-key");
      if (!key) return;
      const contact = displayedByKey.get(key);
      const recordId = getRecordIdForContact(contact);
      if (!recordId) {
        setStatus("Could not find Record ID for this row.");
        return;
      }
      openNotesDialog(contact, recordId);
    });
  });

  const selectAllShown = document.getElementById("selectAllShown");
  if (selectAllShown) {
    selectAllShown.addEventListener("change", () => {
      displayedContacts.forEach((c) => {
        const key = contactKey(c);
        if (selectAllShown.checked) selectedKeys.add(key);
        else selectedKeys.delete(key);
      });
      renderContacts();
    });
  }
}

function settingsFromForm() {
  const visibleColumns = {};
  columnChecks.querySelectorAll("input[data-col-id]").forEach((input) => {
    const colId = input.getAttribute("data-col-id");
    if (colId) visibleColumns[colId] = input.checked;
  });

  return {
    countryPrefix: (countryPrefixInput.value || "").replace(/\D/g, "") || "60",
    messageTemplate: String(messageTemplateInput?.value || "").trim(),
    noteTemplate: String(noteTemplateInput?.value || "").trim() || DEFAULT_NOTE_TEXT,
    rowFilterWord: String(rowFilterInput?.value || "")
      .replace(/\s+/g, " ")
      .trim(),
    visibleColumns
  };
}

function fillSettingsForm() {
  countryPrefixInput.value = settings.countryPrefix;
  if (messageTemplateInput) messageTemplateInput.value = settings.messageTemplate || "";
  if (noteTemplateInput) noteTemplateInput.value = settings.noteTemplate || DEFAULT_NOTE_TEXT;
  if (rowFilterInput) rowFilterInput.value = settings.rowFilterWord || "";
  renderColumnChecks();
}

function openSettings() {
  fillSettingsForm();
  settingsOverlay.classList.add("open");
}

function closeSettings() {
  settingsOverlay.classList.remove("open");
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const saved = result[SETTINGS_KEY];

  settings = {
    ...DEFAULT_SETTINGS,
    ...(saved || {}),
    visibleColumns: {
      ...DEFAULT_SETTINGS.visibleColumns,
      ...((saved && saved.visibleColumns) || {})
    }
  };
}

async function saveSettings() {
  const next = settingsFromForm();
  const hasVisible = Object.values(next.visibleColumns).some(Boolean);
  if (!hasVisible) {
    setStatus("Enable at least one column.");
    return;
  }

  settings = next;
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  closeSettings();
  renderContacts();
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getSelectedContacts() {
  return getFilteredContacts().filter((c) => selectedKeys.has(contactKey(c)));
}

function updateExportActionsVisibility() {
  const hasSelection = getSelectedContacts().length > 0;
  if (statusActionsEl) statusActionsEl.hidden = !hasSelection;
  updateStickyHeadOffset();
}

function renderNotesHistory() {
  if (!notesListEl) return;

  if (notesDialogState.loading) {
    notesListEl.innerHTML = "<div class='notes-empty'>Loading notes...</div>";
    return;
  }

  if (!notesDialogState.notes.length) {
    notesListEl.innerHTML = "<div class='notes-empty'>No notes found yet for this contact.</div>";
    return;
  }

  notesListEl.innerHTML = notesDialogState.notes.map((note) => `<div class='note-item'>${escapeHtml(note)}</div>`).join("");
}

function setNotesDialogBusy(busy) {
  if (saveNoteBtn) saveNoteBtn.disabled = !!busy;
  if (notesTextInput) notesTextInput.disabled = !!busy;
}

function openNotesDialog(contact, recordId) {
  if (!notesOverlay) return;

  notesDialogState = {
    recordId: String(recordId || ""),
    contactName: getContactDisplayName(contact),
    notes: [],
    loading: true
  };

  if (notesTitleEl) notesTitleEl.textContent = `Notes - ${notesDialogState.contactName}`;
  if (notesTextInput) notesTextInput.value = settings.noteTemplate || DEFAULT_NOTE_TEXT;

  setNotesDialogBusy(false);
  renderNotesHistory();
  notesOverlay.classList.add("open");
  void loadNotesForDialog();
}

function closeNotesDialog() {
  if (!notesOverlay) return;
  notesOverlay.classList.remove("open");
  notesLoadToken += 1;
}

async function loadNotesForDialog() {
  const currentToken = ++notesLoadToken;
  notesDialogState.loading = true;
  renderNotesHistory();

  try {
    const notes = await getHubSpotNotesForRecord(notesDialogState.recordId);
    if (currentToken !== notesLoadToken) return;
    notesDialogState.notes = notes;
    notesDialogState.loading = false;
    renderNotesHistory();
  } catch (error) {
    if (currentToken !== notesLoadToken) return;
    notesDialogState.notes = [];
    notesDialogState.loading = false;
    if (notesListEl) {
      notesListEl.innerHTML = `<div class='notes-empty'>Could not load notes. ${escapeHtml(String(error || ""))}</div>`;
    }
  }
}

async function saveNoteFromDialog() {
  const recordId = String(notesDialogState.recordId || "").replace(/\D/g, "");
  if (!recordId) {
    setStatus("Could not find Record ID for this row.");
    return;
  }

  const text = String(notesTextInput?.value || "").trim();
  if (!text) {
    setStatus("Note text cannot be empty.");
    return;
  }

  setNotesDialogBusy(true);
  const result = await createHubSpotNotes([recordId], text);
  setNotesDialogBusy(false);

  if (!result.ok) {
    setStatus(result.error || "Could not create note.");
    return;
  }

  notesDialogState.notes = [text, ...notesDialogState.notes];
  renderNotesHistory();
  if (notesTextInput) notesTextInput.value = settings.noteTemplate || DEFAULT_NOTE_TEXT;
  setStatus("Note logged.");
}

function buildCsvRows(contacts) {
  const visibleCols = getVisibleColumns();
  const headers = visibleCols.map((c) => c.label);
  const rows = contacts.map((c) => visibleCols.map((col) => c.values?.[col.id] || ""));
  return [headers, ...rows];
}

function toCsv(rows) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function sanitizeVcf(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function toVcf(contacts) {
  const nameColumn = currentColumns.find((c) => /name/i.test(c.label));
  const emailColumn = currentColumns.find((c) => /email/i.test(c.label));

  return contacts
    .map((c, idx) => {
      const name = (nameColumn && c.values?.[nameColumn.id]) || `Contact ${idx + 1}`;
      const email = (emailColumn && c.values?.[emailColumn.id]) || "";
      const phone = c.phoneDigits || "";

      const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${sanitizeVcf(name)}`, `N:${sanitizeVcf(name)};;;;`];
      if (phone) lines.push(`TEL;TYPE=CELL:+${sanitizeVcf(phone)}`);
      if (email) lines.push(`EMAIL;TYPE=INTERNET:${sanitizeVcf(email)}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    })
    .join("\n");
}

function findEmailColumn() {
  return currentColumns.find((c) => /email/i.test(c.label) || /^email(_\d+)?$/i.test(c.id)) || null;
}

function findNameColumn() {
  return currentColumns.find((c) => /name/i.test(c.label) || /^name(_\d+)?$/i.test(c.id)) || null;
}

function findRecordIdColumn() {
  return (
    currentColumns.find((c) => /record\s*id/i.test(c.label) || /^(record_id|recordid|hs_object_id|hs_objectid)$/i.test(c.id)) || null
  );
}

function getContactDisplayName(contact) {
  const nameColumn = findNameColumn();
  if (!nameColumn) return "Contact";
  const value = String(contact?.values?.[nameColumn.id] || "").trim();
  return value || "Contact";
}

function getRecordIdForContact(contact) {
  const recordIdColumn = findRecordIdColumn();
  if (!recordIdColumn) return "";
  return String(contact?.values?.[recordIdColumn.id] || "").replace(/\D/g, "");
}

function buildContactUrl(recordId, portalId) {
  const cleanRecordId = String(recordId || "").replace(/\D/g, "");
  const cleanPortalId = String(portalId || "").replace(/\D/g, "");
  if (!cleanRecordId || !cleanPortalId) return "";
  return `https://app.hubspot.com/contacts/${cleanPortalId}/record/0-1/${cleanRecordId}`;
}

function getSelectedRecordIds() {
  const contacts = getSelectedContacts();
  return [...new Set(contacts.map((c) => getRecordIdForContact(c)).filter(Boolean))];
}

async function findHubSpotTab() {
  const tabs = await chrome.tabs.query({ url: ["https://app.hubspot.com/*"] });
  if (!tabs.length) return null;

  const sorted = [...tabs].sort((a, b) => {
    const aLast = Number(a.lastAccessed || 0);
    const bLast = Number(b.lastAccessed || 0);
    return bLast - aLast;
  });

  return sorted[0] || null;
}

function extractPortalIdFromUrl(url) {
  const match = String(url || "").match(/\/contacts\/(\d+)\//i);
  return match ? match[1] : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error("Timed out waiting for HubSpot tab to load."));
    }, timeoutMs);

    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

async function getPortalId(hubSpotTab) {
  const fromUrl = extractPortalIdFromUrl(hubSpotTab?.url || "");
  if (fromUrl) return fromUrl;

  if (!hubSpotTab || typeof hubSpotTab.id !== "number") return "";
  try {
    const response = await chrome.tabs.sendMessage(hubSpotTab.id, { type: "GET_PORTAL_ID" });
    return String(response?.portalId || "");
  } catch (_error) {
    return "";
  }
}

async function sendCreateNoteMessage(tabId, noteBody) {
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "CREATE_NOTE_ON_PAGE",
        noteBody
      });
      if (response?.ok) return response;
      lastError = String(response?.error || "Unknown note creation error.");
    } catch (error) {
      lastError = String(error);
    }
    await sleep(700);
  }

  throw new Error(lastError || "Could not reach note automation on HubSpot tab.");
}

async function sendGetNotesMessage(tabId) {
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "GET_NOTES_ON_PAGE",
        limit: 25
      });
      if (response?.ok) return response;
      lastError = String(response?.error || "Unknown note read error.");
    } catch (error) {
      lastError = String(error);
    }
    await sleep(700);
  }

  throw new Error(lastError || "Could not read notes from HubSpot tab.");
}

async function withContactTab(recordId, portalId, work) {
  const cleanId = String(recordId || "").replace(/\D/g, "");
  if (!cleanId) {
    throw new Error("Invalid Record ID.");
  }

  const url = `https://app.hubspot.com/contacts/${portalId}/record/0-1/${cleanId}?interaction=note`;
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("Could not open HubSpot contact tab.");
  }

  try {
    await waitForTabComplete(tab.id);
    await sleep(1200);
    return await work(tab.id);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch (_error) {
      // Ignore tab close failures.
    }
  }
}

async function createSingleHubSpotNote(recordId, noteBody, portalId) {
  return withContactTab(recordId, portalId, async (tabId) => {
    await sendCreateNoteMessage(tabId, noteBody);
    return { ok: true };
  });
}

async function readSingleHubSpotNotes(recordId, portalId) {
  return withContactTab(recordId, portalId, async (tabId) => {
    const response = await sendGetNotesMessage(tabId);
    return Array.isArray(response?.notes) ? response.notes : [];
  });
}

async function createHubSpotNotes(recordIds, noteBody) {
  const hubSpotTab = await findHubSpotTab();
  if (!hubSpotTab || typeof hubSpotTab.id !== "number") {
    return { ok: false, error: "Open a HubSpot tab (app.hubspot.com), refresh it, and try again." };
  }

  const portalId = await getPortalId(hubSpotTab);
  if (!portalId) {
    return { ok: false, error: "Could not detect HubSpot portal ID." };
  }

  const uniqueRecordIds = [...new Set((Array.isArray(recordIds) ? recordIds : []).map((id) => String(id || "").replace(/\D/g, "")).filter(Boolean))];
  const failed = [];
  let created = 0;

  for (const recordId of uniqueRecordIds) {
    try {
      await createSingleHubSpotNote(recordId, noteBody, portalId);
      created += 1;
    } catch (error) {
      failed.push({ recordId, error: String(error) });
    }
  }

  return { ok: true, created, failed };
}

async function getHubSpotNotesForRecord(recordId) {
  const cleanId = String(recordId || "").replace(/\D/g, "");
  if (!cleanId) {
    throw new Error("Invalid Record ID.");
  }

  const hubSpotTab = await findHubSpotTab();
  if (!hubSpotTab || typeof hubSpotTab.id !== "number") {
    throw new Error("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
  }

  const portalId = await getPortalId(hubSpotTab);
  if (!portalId) {
    throw new Error("Could not detect HubSpot portal ID.");
  }

  return readSingleHubSpotNotes(cleanId, portalId);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function exportCsvSelected() {
  const contacts = getSelectedContacts();
  if (!contacts.length) {
    setStatus("No selected contacts to export.");
    return;
  }

  const csv = toCsv(buildCsvRows(contacts));
  downloadText("hubspot-contacts-selected.csv", csv, "text/csv;charset=utf-8");
}

function exportVcfSelected() {
  const contacts = getSelectedContacts();
  if (!contacts.length) {
    setStatus("No selected contacts to export.");
    return;
  }

  const vcf = toVcf(contacts);
  downloadText("hubspot-contacts-selected.vcf", vcf, "text/vcard;charset=utf-8");
}

async function copyEmailSelected() {
  const contacts = getSelectedContacts();
  if (!contacts.length) {
    setStatus("No selected contacts to copy emails from.");
    return;
  }

  const emailColumn = findEmailColumn();
  if (!emailColumn) {
    setStatus("No email column detected.");
    return;
  }

  const emails = [...new Set(contacts.map((c) => String(c.values?.[emailColumn.id] || "").trim()).filter(Boolean))];
  if (!emails.length) {
    setStatus("No email values found in selected rows.");
    return;
  }

  try {
    await copyTextToClipboard(emails.join(", "));
    setStatus(`Copied ${emails.length} email(s).`);
  } catch (_error) {
    setStatus("Could not copy emails to clipboard.");
  }
}

async function logWhatsappNoteSelected() {
  const recordIds = getSelectedRecordIds();
  if (!recordIds.length) {
    setStatus("No selected rows with Record ID found.");
    return;
  }

  const noteBody = settings.noteTemplate || DEFAULT_NOTE_TEXT;
  const result = await createHubSpotNotes(recordIds, noteBody);
  if (!result.ok) {
    setStatus(result.error || "Could not create notes.");
    return;
  }

  const created = Number(result.created || 0);
  const failed = Array.isArray(result.failed) ? result.failed.length : 0;
  if (failed > 0) {
    setStatus(`Logged ${created} note(s). Failed ${failed}.`);
  } else {
    setStatus(`Logged ${created} note(s).`);
  }
}

async function loadContacts(options = {}) {
  if (contactsLoading) return;
  contactsLoading = true;
  setContactsLoadingState(true);

  try {
    const loadAll = !!options.loadAll;
    const tab = await findHubSpotTab();
    if (!tab || typeof tab.id !== "number") {
      setStatus("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
      return;
    }

    if (loadAll) {
      setStatus("Loading all visible contacts from HubSpot table...");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_CONTACTS",
      countryPrefix: settings.countryPrefix,
      messageText: settings.messageTemplate,
      loadAll
    });

    if (!response || !response.ok) {
      setStatus("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
      return;
    }

    currentColumns = response.columns || [];
    currentContacts = response.contacts || [];
    phoneColumnId = response.phoneColumnId || null;
    currentPortalId = (await getPortalId(tab)) || "";

    mergeColumnSettings();
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });

    selectedKeys = new Set();
    sortState = { field: null, direction: "asc" };
    renderContacts();
  } catch (_error) {
    setStatus("Could not load contacts. Refresh HubSpot tab and retry.");
  } finally {
    contactsLoading = false;
    setContactsLoadingState(false);
  }
}

settingsBtn.addEventListener("click", openSettings);
cancelSettingsBtn.addEventListener("click", closeSettings);
saveSettingsBtn.addEventListener("click", saveSettings);
settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) closeSettings();
});
if (notesOverlay) {
  notesOverlay.addEventListener("click", (event) => {
    if (event.target === notesOverlay) closeNotesDialog();
  });
}
window.addEventListener("resize", updateStickyHeadOffset);
if (closeNotesBtn) closeNotesBtn.addEventListener("click", closeNotesDialog);
if (cancelNotesBtn) cancelNotesBtn.addEventListener("click", closeNotesDialog);
if (saveNoteBtn) {
  saveNoteBtn.addEventListener("click", () => {
    void saveNoteFromDialog();
  });
}

refreshBtn.addEventListener("click", () => {
  void loadContacts({ loadAll: true });
});
csvSelectedBtn.addEventListener("click", exportCsvSelected);
vcfSelectedBtn.addEventListener("click", exportVcfSelected);
copyEmailBtn.addEventListener("click", () => {
  void copyEmailSelected();
});
logWhatsappBtn.addEventListener("click", () => {
  void logWhatsappNoteSelected();
});

async function init() {
  await loadSettings();
  await loadContacts({ loadAll: true });
  updateStickyHeadOffset();
}

init();
