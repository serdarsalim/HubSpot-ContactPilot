const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("statusText");
const statusActionsEl = document.getElementById("statusActions");
const listEl = document.getElementById("list");

const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const columnChecks = document.getElementById("columnChecks");

const refreshBtn = document.getElementById("refreshBtn");
const csvSelectedBtn = document.getElementById("csvSelectedBtn");
const vcfSelectedBtn = document.getElementById("vcfSelectedBtn");
const copyEmailBtn = document.getElementById("copyEmailBtn");

const countryPrefixInput = document.getElementById("countryPrefixInput");
const rowFilterInput = document.getElementById("rowFilterInput");

const SETTINGS_KEY = "popupSettings";
const DEFAULT_SETTINGS = {
  countryPrefix: "60",
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
    return;
  }
  statusEl.textContent = message;
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

  const headerHtml = visibleColumns
    .map(
      (col) =>
        `<th class='sortable ${columnClasses(col)}' data-sort-field='${escapeHtml(col.id)}' tabindex='0' aria-sort='${sortAria(col.id)}'>${escapeHtml(col.label)}${sortIndicator(col.id)}</th>`
    )
    .join("");

  const rowsHtml = displayedContacts
    .map((contact) => {
      const key = contactKey(contact);
      const checked = selectedKeys.has(key) ? "checked" : "";

      const cellsHtml = visibleColumns
        .map((col) => {
          const value = contact.values?.[col.id] || "-";
          const css = columnClasses(col);

          if (col.id === phoneColumnId && contact.waUrl) {
            return `<td class='${css}'><a href='${escapeHtml(contact.waUrl)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(value)}</a></td>`;
          }

          return `<td class='${css}'>${escapeHtml(value)}</td>`;
        })
        .join("");

      return `
        <tr>
          <td class='sel'><input type='checkbox' class='row-select' data-key='${escapeHtml(key)}' ${checked} /></td>
          ${cellsHtml}
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
    rowFilterWord: String(rowFilterInput?.value || "")
      .replace(/\s+/g, " ")
      .trim(),
    visibleColumns
  };
}

function fillSettingsForm() {
  countryPrefixInput.value = settings.countryPrefix;
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

async function loadContacts() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab || typeof tab.id !== "number") {
      setStatus("No active tab found.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_CONTACTS",
      countryPrefix: settings.countryPrefix
    });

    if (!response || !response.ok) {
      setStatus("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
      return;
    }

    currentColumns = response.columns || [];
    currentContacts = response.contacts || [];
    phoneColumnId = response.phoneColumnId || null;

    mergeColumnSettings();
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });

    selectedKeys = new Set();
    sortState = { field: null, direction: "asc" };
    renderContacts();
  } catch (_error) {
    setStatus("Could not load contacts. Refresh HubSpot tab and retry.");
  }
}

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
cancelSettingsBtn.addEventListener("click", closeSettings);
saveSettingsBtn.addEventListener("click", saveSettings);
settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) closeSettings();
});

refreshBtn.addEventListener("click", loadContacts);
csvSelectedBtn.addEventListener("click", exportCsvSelected);
vcfSelectedBtn.addEventListener("click", exportVcfSelected);
copyEmailBtn.addEventListener("click", () => {
  void copyEmailSelected();
});

async function init() {
  await loadSettings();
  await loadContacts();
}

init();
