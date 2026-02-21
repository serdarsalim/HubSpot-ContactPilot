(() => {
  const App = (window.PopupApp = window.PopupApp || {});
  const shared = globalThis.ContactPilotShared || {};
  const MESSAGE_TYPES = shared.MESSAGE_TYPES || Object.freeze({
    GET_CONTACTS: "GET_CONTACTS",
    GET_PORTAL_ID: "GET_PORTAL_ID",
    CREATE_NOTE_ON_PAGE: "CREATE_NOTE_ON_PAGE",
    GET_NOTES_ON_PAGE: "GET_NOTES_ON_PAGE",
    APPLY_EMAIL_TEMPLATE_ON_PAGE: "APPLY_EMAIL_TEMPLATE_ON_PAGE",
    OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE: "OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE"
  });
  const TIMING = shared.TIMING || Object.freeze({
    popup: Object.freeze({
      waitForTabCompleteTimeoutMs: 30000,
      messageRetryAttempts: 5,
      messageRetryDelayMs: 700,
      contactTabPostLoadDelayMs: 1200,
      emailComposerReadyDelayMs: 900
    }),
    content: Object.freeze({
      tableScrollDelayMs: 240,
      noteComposerOpenAttempts: 20,
      noteComposerOpenDelayMs: 400,
      noteEditorSettleDelayMs: 250,
      noteSaveSettleDelayMs: 1200,
      noteReadRetryAttempts: 14,
      noteReadRetryDelayMs: 450,
      emailComposerOpenAttempts: 20,
      emailComposerOpenDelayMs: 300
    })
  });

  const dom = {
    statusEl: document.getElementById("status"),
    statusTextEl: document.getElementById("statusText"),
    statusActionsEl: document.getElementById("statusActions"),
    mainPageEl: document.getElementById("mainPage"),
    emailTemplatesPageEl: document.getElementById("emailTemplatesPage"),
    stickyHeadEl: document.getElementById("stickyHead"),
    listEl: document.getElementById("list"),

    settingsBtn: document.getElementById("settingsBtn"),
    emailSettingsBtn: document.getElementById("emailSettingsBtn"),
    cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    columnChecks: document.getElementById("columnChecks"),
    notesOverlay: document.getElementById("notesOverlay"),
    emailTemplatePickOverlay: document.getElementById("emailTemplatePickOverlay"),
    notesTitleEl: document.getElementById("notesTitle"),
    notesListEl: document.getElementById("notesList"),
    notesTextInput: document.getElementById("notesTextInput"),
    closeNotesBtn: document.getElementById("closeNotesBtn"),
    cancelNotesBtn: document.getElementById("cancelNotesBtn"),
    saveNoteBtn: document.getElementById("saveNoteBtn"),
    emailTemplatePickTitle: document.getElementById("emailTemplatePickTitle"),
    emailTemplatePickList: document.getElementById("emailTemplatePickList"),
    cancelEmailTemplatePickBtn: document.getElementById("cancelEmailTemplatePickBtn"),

    refreshBtn: document.getElementById("refreshBtn"),
    csvSelectedBtn: document.getElementById("csvSelectedBtn"),
    vcfSelectedBtn: document.getElementById("vcfSelectedBtn"),
    copyEmailBtn: document.getElementById("copyEmailBtn"),

    countryPrefixInput: document.getElementById("countryPrefixInput"),
    messageTemplateInput: document.getElementById("messageTemplateInput"),
    noteTemplateInput: document.getElementById("noteTemplateInput"),
    rowFilterInput: document.getElementById("rowFilterInput"),
    emailTemplatesListEl: document.getElementById("emailTemplatesList"),
    addEmailTemplateBtn: document.getElementById("addEmailTemplateBtn"),
    closeEmailTemplatesPageBtn: document.getElementById("closeEmailTemplatesPageBtn"),
    saveEmailTemplatesPageBtn: document.getElementById("saveEmailTemplatesPageBtn"),
    emailTemplateEmptyEl: document.getElementById("emailTemplateEmpty"),
    emailTemplateEditorEl: document.getElementById("emailTemplateEditor"),
    emailTemplateNameInput: document.getElementById("emailTemplateNameInput"),
    emailTemplateSubjectInput: document.getElementById("emailTemplateSubjectInput"),
    emailTemplateBodyInput: document.getElementById("emailTemplateBodyInput"),
    deleteEmailTemplateBtn: document.getElementById("deleteEmailTemplateBtn")
  };

  const SETTINGS_KEY = "popupSettings";
  const LEGACY_NOTE_TEXT = "Reached out on WhatsApp";
  const DEFAULT_EMAIL_TEMPLATE = {
    id: "template_default",
    name: "Template 1",
    subject: "",
    body: "Hi [name],"
  };
  const DEFAULT_SETTINGS = {
    countryPrefix: "60",
    messageTemplate: "",
    noteTemplate: "",
    rowFilterWord: "",
    visibleColumns: {},
    emailTemplates: [DEFAULT_EMAIL_TEMPLATE]
  };

  const state = {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    currentColumns: [],
    currentContacts: [],
    displayedContacts: [],
    phoneColumnId: null,
    selectedKeys: new Set(),
    sortState: { field: null, direction: "asc" },
    currentPortalId: "",
    notesDialogState: {
      recordId: "",
      contactName: "",
      notes: [],
      loading: false
    },
    notesLoadToken: 0,
    contactsLoading: false,
    emailTemplatesDraft: [],
    activeEmailTemplateId: "",
    syncingEmailTemplateForm: false,
    emailTemplatePickState: {
      key: "",
      contact: null
    }
  };

  function columnType(col) {
    if (col.id === state.phoneColumnId) return "phone";
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
    if (state.sortState.field !== field) return "none";
    return state.sortState.direction === "asc" ? "ascending" : "descending";
  }

  function toggleSort(field) {
    if (!field) return;
    if (state.sortState.field === field) {
      state.sortState.direction = state.sortState.direction === "asc" ? "desc" : "asc";
    } else {
      state.sortState.field = field;
      state.sortState.direction = "asc";
    }
    if (typeof App.renderContacts === "function") {
      App.renderContacts();
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function makeTemplateId() {
    return `template_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeEmailTemplates(rawTemplates) {
    const templates = [];
    const seen = new Set();
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];

    for (const item of source) {
      const id = String(item?.id || "").trim() || makeTemplateId();
      if (seen.has(id)) continue;
      seen.add(id);

      templates.push({
        id,
        name: String(item?.name || "").trim() || "Untitled",
        subject: String(item?.subject || "").trim(),
        body: String(item?.body || "").trim()
      });
    }

    if (!templates.length) {
      templates.push({ ...DEFAULT_EMAIL_TEMPLATE });
    }
    return templates;
  }

  function templateTokenKey(input) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function applyTokens(text, tokens) {
    return String(text || "").replace(/\[([a-z0-9_]+)\]/gi, (_match, tokenName) => {
      const key = templateTokenKey(tokenName);
      return Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key] || "") : "";
    });
  }

  function updateStickyHeadOffset() {
    if (!dom.stickyHeadEl || !document?.documentElement?.style) return;
    const stickyHeight = Math.ceil(dom.stickyHeadEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--sticky-head-h", `${stickyHeight + 6}px`);
  }

  function setStatus(message) {
    if (dom.statusTextEl) {
      dom.statusTextEl.textContent = message;
      updateStickyHeadOffset();
      return;
    }
    if (dom.statusEl) {
      dom.statusEl.textContent = message;
    }
    updateStickyHeadOffset();
  }

  function setContactsLoadingState(isLoading) {
    if (dom.refreshBtn) dom.refreshBtn.disabled = !!isLoading;
  }

  function contactKey(contact) {
    return contact.key || state.currentColumns.map((col) => contact.values?.[col.id] || "").join("|");
  }

  function getFilterWord() {
    return String(state.settings.rowFilterWord || "").trim().toLowerCase();
  }

  function getFilteredContacts(source = state.currentContacts) {
    const filterWord = getFilterWord();
    if (!filterWord) return [...source];

    return source.filter((contact) => {
      const rowText = Object.values(contact.values || {}).join(" ").toLowerCase();
      return !rowText.includes(filterWord);
    });
  }

  function getVisibleColumns() {
    return state.currentColumns.filter((col) => state.settings.visibleColumns[col.id] !== false);
  }

  function mergeColumnSettings() {
    let changed = false;
    for (const col of state.currentColumns) {
      if (typeof state.settings.visibleColumns[col.id] !== "boolean") {
        state.settings.visibleColumns[col.id] = true;
        changed = true;
      }
    }
    return changed;
  }

  function getSortedContacts(source) {
    if (!state.sortState.field) return [...source];

    return [...source].sort((a, b) => {
      const result = compareValues(a, b, state.sortState.field);
      return state.sortState.direction === "asc" ? result : -result;
    });
  }

  function sortIndicator(field) {
    if (state.sortState.field !== field) return "";
    return state.sortState.direction === "asc" ? " ▲" : " ▼";
  }

  function compareValues(a, b, field) {
    const valueA = String(a.values?.[field] || "").trim();
    const valueB = String(b.values?.[field] || "").trim();

    if (field === state.phoneColumnId) {
      const numA = Number(valueA.replace(/\D/g, "")) || 0;
      const numB = Number(valueB.replace(/\D/g, "")) || 0;
      return numA - numB;
    }

    return valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
  }

  function findEmailColumn() {
    return state.currentColumns.find((c) => /email/i.test(c.label) || /^email(_\d+)?$/i.test(c.id)) || null;
  }

  function findNameColumn() {
    return state.currentColumns.find((c) => /name/i.test(c.label) || /^name(_\d+)?$/i.test(c.id)) || null;
  }

  function findRecordIdColumn() {
    return (
      state.currentColumns.find((c) => /record\s*id/i.test(c.label) || /^(record_id|recordid|hs_object_id|hs_objectid)$/i.test(c.id)) || null
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

  function getFirstNameFromContact(contact) {
    const full = getContactDisplayName(contact);
    const first = String(full || "")
      .trim()
      .split(/\s+/)[0];
    return first || full || "";
  }

  function getContactTokenMap(contact) {
    const tokens = {
      name: getContactDisplayName(contact),
      first_name: getFirstNameFromContact(contact),
      phone: String(contact?.phoneDisplay || "").trim(),
      possibility: ""
    };

    const emailColumn = findEmailColumn();
    if (emailColumn) {
      tokens.email = String(contact?.values?.[emailColumn.id] || "").trim();
    } else {
      tokens.email = "";
    }

    for (const column of state.currentColumns) {
      const value = String(contact?.values?.[column.id] || "").trim();
      const keyById = templateTokenKey(column.id);
      if (keyById) tokens[keyById] = value;

      const keyByLabel = templateTokenKey(column.label);
      if (keyByLabel && !Object.prototype.hasOwnProperty.call(tokens, keyByLabel)) {
        tokens[keyByLabel] = value;
      }
    }

    if (!tokens.possibility) {
      const possibilityColumn = state.currentColumns.find((c) => /possibility/i.test(c.label) || /^possibility(_\d+)?$/i.test(c.id));
      if (possibilityColumn) {
        tokens.possibility = String(contact?.values?.[possibilityColumn.id] || "").trim();
      }
    }

    return tokens;
  }

  function buildContactUrl(recordId, portalId) {
    const cleanRecordId = String(recordId || "").replace(/\D/g, "");
    const cleanPortalId = String(portalId || "").replace(/\D/g, "");
    if (!cleanRecordId || !cleanPortalId) return "";
    return `https://app.hubspot.com/contacts/${cleanPortalId}/record/0-1/${cleanRecordId}`;
  }

  function getSelectedContacts() {
    return getFilteredContacts().filter((c) => state.selectedKeys.has(contactKey(c)));
  }

  function updateExportActionsVisibility() {
    const hasSelection = getSelectedContacts().length > 0;
    if (dom.statusActionsEl) dom.statusActionsEl.hidden = !hasSelection;
    updateStickyHeadOffset();
  }

  App.dom = dom;
  App.constants = {
    SETTINGS_KEY,
    LEGACY_NOTE_TEXT,
    DEFAULT_EMAIL_TEMPLATE,
    DEFAULT_SETTINGS
  };
  App.messageTypes = MESSAGE_TYPES;
  App.timing = TIMING;
  App.state = state;

  Object.assign(App, {
    columnType,
    columnClasses,
    sortAria,
    toggleSort,
    escapeHtml,
    makeTemplateId,
    normalizeEmailTemplates,
    templateTokenKey,
    applyTokens,
    updateStickyHeadOffset,
    setStatus,
    setContactsLoadingState,
    contactKey,
    getFilterWord,
    getFilteredContacts,
    getVisibleColumns,
    mergeColumnSettings,
    getSortedContacts,
    sortIndicator,
    compareValues,
    findEmailColumn,
    findNameColumn,
    findRecordIdColumn,
    getContactDisplayName,
    getRecordIdForContact,
    getFirstNameFromContact,
    getContactTokenMap,
    buildContactUrl,
    getSelectedContacts,
    updateExportActionsVisibility
  });
})();
