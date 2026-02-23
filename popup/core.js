(() => {
  const App = (window.PopupApp = window.PopupApp || {});
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
    activeTabPageEl: document.getElementById("activeTabPage"),
    emailTemplatesPageEl: document.getElementById("emailTemplatesPage"),
    whatsappTemplatesPageEl: document.getElementById("whatsappTemplatesPage"),
    noteTemplatesPageEl: document.getElementById("noteTemplatesPage"),
    stickyHeadEl: document.getElementById("stickyHead"),
    listEl: document.getElementById("list"),

    settingsBtn: document.getElementById("settingsBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    contactViewBtn: document.getElementById("contactViewBtn"),
    activeTabBtn: document.getElementById("activeTabBtn"),
    emailSettingsBtn: document.getElementById("emailSettingsBtn"),
    whatsappSettingsBtn: document.getElementById("whatsappSettingsBtn"),
    noteSettingsBtn: document.getElementById("noteSettingsBtn"),
    cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    settingsPageEl: document.getElementById("settingsPage"),
    columnChecks: document.getElementById("columnChecks"),
    exportTemplatesBtn: document.getElementById("exportTemplatesBtn"),
    importTemplatesBtn: document.getElementById("importTemplatesBtn"),
    importTemplatesInput: document.getElementById("importTemplatesInput"),
    templateImportOverlay: document.getElementById("templateImportOverlay"),
    templateImportSummaryEl: document.getElementById("templateImportSummary"),
    templateImportListEl: document.getElementById("templateImportList"),
    templateImportModeAddInput: document.getElementById("templateImportModeAdd"),
    templateImportModeReplaceInput: document.getElementById("templateImportModeReplace"),
    cancelTemplateImportBtn: document.getElementById("cancelTemplateImportBtn"),
    applyTemplateImportBtn: document.getElementById("applyTemplateImportBtn"),
    notesOverlay: document.getElementById("notesOverlay"),
    emailTemplatePickOverlay: document.getElementById("emailTemplatePickOverlay"),
    whatsappTemplatePickOverlay: document.getElementById("whatsappTemplatePickOverlay"),
    recordIdRequiredOverlay: document.getElementById("recordIdRequiredOverlay"),
    notesTitleEl: document.getElementById("notesTitle"),
    notesListEl: document.getElementById("notesList"),
    notesTemplateSelect: document.getElementById("notesTemplateSelect"),
    notesTextInput: document.getElementById("notesTextInput"),
    closeNotesBtn: document.getElementById("closeNotesBtn"),
    cancelNotesBtn: document.getElementById("cancelNotesBtn"),
    saveNoteBtn: document.getElementById("saveNoteBtn"),
    emailTemplatePickTitle: document.getElementById("emailTemplatePickTitle"),
    emailTemplatePickSearchInput: document.getElementById("emailTemplatePickSearchInput"),
    emailTemplatePickList: document.getElementById("emailTemplatePickList"),
    cancelEmailTemplatePickBtn: document.getElementById("cancelEmailTemplatePickBtn"),
    whatsappTemplatePickTitle: document.getElementById("whatsappTemplatePickTitle"),
    whatsappTemplatePickSearchInput: document.getElementById("whatsappTemplatePickSearchInput"),
    whatsappTemplatePickList: document.getElementById("whatsappTemplatePickList"),
    cancelWhatsappTemplatePickBtn: document.getElementById("cancelWhatsappTemplatePickBtn"),
    recordIdRequiredMessageEl: document.getElementById("recordIdRequiredMessage"),
    recordIdRequiredCloseBtn: document.getElementById("recordIdRequiredCloseBtn"),

    refreshBtn: document.getElementById("refreshBtn"),
    csvSelectedBtn: document.getElementById("csvSelectedBtn"),
    vcfSelectedBtn: document.getElementById("vcfSelectedBtn"),
    copyEmailBtn: document.getElementById("copyEmailBtn"),
    activeTabRefreshBtn: document.getElementById("activeTabRefreshBtn"),
    activeTabStatusEl: document.getElementById("activeTabStatus"),
    activeTabNameEl: document.getElementById("activeTabName"),
    activeTabKindEl: document.getElementById("activeTabKind"),
    activeTabRecordIdEl: document.getElementById("activeTabRecordId"),
    activeTabPortalIdEl: document.getElementById("activeTabPortalId"),
    activeTabEmailEl: document.getElementById("activeTabEmail"),
    activeTabPhoneEl: document.getElementById("activeTabPhone"),
    activeTabEmailActionBtn: document.getElementById("activeTabEmailActionBtn"),
    activeTabWhatsappActionBtn: document.getElementById("activeTabWhatsappActionBtn"),
    activeTabNotesActionBtn: document.getElementById("activeTabNotesActionBtn"),

    countryPrefixInput: document.getElementById("countryPrefixInput"),
    messageTemplateInput: document.getElementById("messageTemplateInput"),
    noteTemplateInput: document.getElementById("noteTemplateInput"),
    rowFilterInput: document.getElementById("rowFilterInput"),
    emailTemplatesListEl: document.getElementById("emailTemplatesList"),
    addEmailTemplateBtn: document.getElementById("addEmailTemplateBtn"),
    emailTemplateEmptyEl: document.getElementById("emailTemplateEmpty"),
    emailTemplateEditorEl: document.getElementById("emailTemplateEditor"),
    emailTemplateNameInput: document.getElementById("emailTemplateNameInput"),
    emailTemplateSubjectInput: document.getElementById("emailTemplateSubjectInput"),
    emailTemplateBodyInput: document.getElementById("emailTemplateBodyInput"),
    emailTemplateSaveStateEl: document.getElementById("emailTemplateSaveState"),
    deleteEmailTemplateBtn: document.getElementById("deleteEmailTemplateBtn"),
    whatsappTemplatesListEl: document.getElementById("whatsappTemplatesList"),
    addWhatsappTemplateBtn: document.getElementById("addWhatsappTemplateBtn"),
    whatsappTemplateEmptyEl: document.getElementById("whatsappTemplateEmpty"),
    whatsappTemplateEditorEl: document.getElementById("whatsappTemplateEditor"),
    whatsappTemplateNameInput: document.getElementById("whatsappTemplateNameInput"),
    whatsappTemplateBodyInput: document.getElementById("whatsappTemplateBodyInput"),
    whatsappTemplateSaveStateEl: document.getElementById("whatsappTemplateSaveState"),
    deleteWhatsappTemplateBtn: document.getElementById("deleteWhatsappTemplateBtn"),
    noteTemplatesListEl: document.getElementById("noteTemplatesList"),
    addNoteTemplateBtn: document.getElementById("addNoteTemplateBtn"),
    noteTemplateEmptyEl: document.getElementById("noteTemplateEmpty"),
    noteTemplateEditorEl: document.getElementById("noteTemplateEditor"),
    noteTemplateNameInput: document.getElementById("noteTemplateNameInput"),
    noteTemplateBodyInput: document.getElementById("noteTemplateBodyInput"),
    noteTemplateSaveStateEl: document.getElementById("noteTemplateSaveState"),
    deleteNoteTemplateBtn: document.getElementById("deleteNoteTemplateBtn"),
    appToastEl: document.getElementById("appToast")
  };
  let toastTimerId = null;

  const SETTINGS_KEY = "popupSettings";
  const EMAIL_TEMPLATES_LOCAL_KEY = "popupEmailTemplates";
  const TEMPLATE_USAGE_LOCAL_KEY = "popupTemplateUsageByContact";
  const LEGACY_NOTE_TEXT = "Reached out on WhatsApp";
  const DEFAULT_EMAIL_TEMPLATE = {
    id: "template_default",
    name: "Template 1",
    subject: "",
    body: "Hi [name],"
  };
  const DEFAULT_WHATSAPP_TEMPLATE = {
    id: "wa_template_default",
    name: "Template 1",
    body: "Hi [name],"
  };
  const DEFAULT_NOTE_TEMPLATE = {
    id: "note_template_default",
    name: "Template 1",
    body: ""
  };
  const DEFAULT_SETTINGS = {
    themeMode: "light",
    countryPrefix: "60",
    messageTemplate: "",
    noteTemplate: "",
    rowFilterWord: "",
    visibleColumns: {},
    emailTemplates: [DEFAULT_EMAIL_TEMPLATE],
    whatsappTemplates: [DEFAULT_WHATSAPP_TEMPLATE],
    noteTemplates: [DEFAULT_NOTE_TEMPLATE]
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
    whatsappTemplatesDraft: [],
    activeWhatsappTemplateId: "",
    syncingWhatsappTemplateForm: false,
    noteTemplatesDraft: [],
    activeNoteTemplateId: "",
    syncingNoteTemplateForm: false,
    activeTabContext: null,
    emailTemplatePickState: {
      key: "",
      contact: null,
      query: ""
    },
    whatsappTemplatePickState: {
      key: "",
      contact: null,
      query: ""
    },
    templateUsageByContact: {}
  };
  let templateUsageSaveTimerId = null;

  function columnType(col) {
    if (col.id === state.phoneColumnId) return "phone";
    if (/name/i.test(col.label) || /^name(_\d+)?$/.test(col.id)) return "name";
    if (/email/i.test(col.label) || /^email(_\d+)?$/.test(col.id)) return "email";
    if (/(possibility|possiblity|probability)/i.test(col.label) || /^(possibility|possiblity|probability)(_\d+)?$/.test(col.id)) {
      return "possibility";
    }
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

  function normalizeWhatsappTemplates(rawTemplates) {
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
        body: String(item?.body || "").trim()
      });
    }

    if (!templates.length) {
      templates.push({ ...DEFAULT_WHATSAPP_TEMPLATE });
    }
    return templates;
  }

  function normalizeNoteTemplates(rawTemplates) {
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
        body: String(item?.body || "").trim()
      });
    }

    if (!templates.length) {
      templates.push({ ...DEFAULT_NOTE_TEMPLATE });
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

  function normalizeThemeMode(value) {
    return String(value || "").toLowerCase() === "dark" ? "dark" : "light";
  }

  function applyTheme(themeMode) {
    const nextMode = normalizeThemeMode(themeMode);
    state.settings.themeMode = nextMode;
    if (document.body) {
      document.body.setAttribute("data-theme", nextMode);
    }
    if (dom.themeToggleBtn) {
      const nextLabel = nextMode === "dark" ? "Switch to light mode" : "Switch to dark mode";
      dom.themeToggleBtn.setAttribute("aria-label", nextLabel);
      dom.themeToggleBtn.setAttribute("title", nextLabel);
      dom.themeToggleBtn.classList.toggle("active", nextMode === "dark");
    }
  }

  function toggleTheme() {
    const nextMode = state.settings.themeMode === "dark" ? "light" : "dark";
    applyTheme(nextMode);
    if (typeof App.persistSyncSettings === "function") {
      void App.persistSyncSettings(state.settings);
    }
  }

  function updateStickyHeadOffset() {
    if (!dom.stickyHeadEl || !document?.documentElement?.style) return;
    const stickyHeight = Math.ceil(dom.stickyHeadEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--sticky-head-h", `${stickyHeight}px`);
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

  function showToast(message, durationMs = 2200) {
    if (!dom.appToastEl) {
      setStatus(message);
      return;
    }

    dom.appToastEl.textContent = String(message || "");
    dom.appToastEl.classList.add("show");
    if (toastTimerId) {
      clearTimeout(toastTimerId);
      toastTimerId = null;
    }
    const wait = Math.max(900, Number(durationMs) || 2200);
    toastTimerId = setTimeout(() => {
      dom.appToastEl.classList.remove("show");
      toastTimerId = null;
    }, wait);
  }

  function setContactsLoadingState(isLoading) {
    if (dom.refreshBtn) dom.refreshBtn.disabled = !!isLoading;
  }

  function contactKey(contact) {
    return contact.key || state.currentColumns.map((col) => contact.values?.[col.id] || "").join("|");
  }

  function getFilterWords() {
    return String(state.settings.rowFilterWord || "")
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 0);
  }

  function getFilterWord() {
    return getFilterWords()[0] || "";
  }

  function getFilteredContacts(source = state.currentContacts) {
    const filterWords = getFilterWords();
    if (!filterWords.length) return [...source];

    return source.filter((contact) => {
      const rowText = Object.values(contact.values || {}).join(" ").toLowerCase();
      return !filterWords.some((word) => rowText.includes(word));
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
    return state.currentColumns.find((c) => /email/i.test(c.label) || /^email(_\d+)?$/i.test(c.id)) || { id: "email", label: "Email" };
  }

  function findNameColumn() {
    return state.currentColumns.find((c) => /name/i.test(c.label) || /^name(_\d+)?$/i.test(c.id)) || null;
  }

  function findRecordIdColumn() {
    return (
      state.currentColumns.find((c) => /record\s*id/i.test(c.label) || /^(record_id|recordid|hs_object_id|hs_objectid)$/i.test(c.id)) || null
    );
  }

  function findPossibilityColumn() {
    return (
      state.currentColumns.find(
        (c) => /(possibility|possiblity|probability)/i.test(c.label) || /^(possibility|possiblity|probability)(_\d+)?$/i.test(c.id)
      ) || null
    );
  }

  function getContactDisplayName(contact) {
    const nameColumn = findNameColumn();
    const fallback = String(contact?.values?.name || "").trim();
    if (!nameColumn) return fallback || "Contact";
    const value = String(contact?.values?.[nameColumn.id] || fallback || "").trim();
    return value || "Contact";
  }

  function getRecordIdForContact(contact) {
    const recordIdColumn = findRecordIdColumn();
    const fromValues = recordIdColumn ? String(contact?.values?.[recordIdColumn.id] || "").replace(/\D/g, "") : "";
    if (fromValues) return fromValues;
    return String(contact?.recordId || contact?.values?.record_id || "").replace(/\D/g, "");
  }

  function getFirstNameFromContact(contact) {
    const nameColumn = findNameColumn();
    const rawName = nameColumn ? String(contact?.values?.[nameColumn.id] || contact?.values?.name || "").trim() : String(contact?.values?.name || "").trim();
    if (!rawName) return "";
    return rawName.split(/\s+/)[0] || "";
  }

  function getContactTokenMap(contact) {
    return {
      name: getFirstNameFromContact(contact)
    };
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

  function normalizeTemplateUsageKind(kind) {
    return String(kind || "").toLowerCase() === "whatsapp" ? "whatsapp" : "email";
  }

  function normalizeTemplateUsageMap(rawUsage) {
    if (!rawUsage || typeof rawUsage !== "object") return {};
    const normalized = {};

    for (const [contactKeyInput, usageInput] of Object.entries(rawUsage)) {
      const contactKeyClean = String(contactKeyInput || "").trim();
      if (!contactKeyClean) continue;
      const usage = usageInput && typeof usageInput === "object" ? usageInput : {};
      const emailUsage = usage.email && typeof usage.email === "object" ? usage.email : {};
      const whatsappUsage = usage.whatsapp && typeof usage.whatsapp === "object" ? usage.whatsapp : {};

      const cleanEmail = {};
      for (const [templateIdInput, usedInput] of Object.entries(emailUsage)) {
        const templateId = String(templateIdInput || "").trim();
        if (!templateId || usedInput !== true) continue;
        cleanEmail[templateId] = true;
      }

      const cleanWhatsapp = {};
      for (const [templateIdInput, usedInput] of Object.entries(whatsappUsage)) {
        const templateId = String(templateIdInput || "").trim();
        if (!templateId || usedInput !== true) continue;
        cleanWhatsapp[templateId] = true;
      }

      normalized[contactKeyClean] = {
        email: cleanEmail,
        whatsapp: cleanWhatsapp
      };
    }

    return normalized;
  }

  function scheduleTemplateUsagePersist() {
    if (templateUsageSaveTimerId) {
      clearTimeout(templateUsageSaveTimerId);
      templateUsageSaveTimerId = null;
    }
    templateUsageSaveTimerId = setTimeout(() => {
      templateUsageSaveTimerId = null;
      const payload = normalizeTemplateUsageMap(state.templateUsageByContact);
      state.templateUsageByContact = payload;
      void chrome.storage.local.set({ [TEMPLATE_USAGE_LOCAL_KEY]: payload });
    }, 180);
  }

  function getTemplateUsageForContact(contactKeyInput) {
    const key = String(contactKeyInput || "").trim();
    if (!key) return null;
    if (!state.templateUsageByContact[key]) {
      state.templateUsageByContact[key] = {
        email: Object.create(null),
        whatsapp: Object.create(null)
      };
    }
    return state.templateUsageByContact[key];
  }

  function markTemplateApplied(kind, contactKeyInput, templateIdInput) {
    const contactUsage = getTemplateUsageForContact(contactKeyInput);
    const templateId = String(templateIdInput || "").trim();
    if (!contactUsage || !templateId) return;
    const usageKind = normalizeTemplateUsageKind(kind);
    contactUsage[usageKind][templateId] = true;
    scheduleTemplateUsagePersist();
  }

  function hasTemplateApplied(kind, contactKeyInput, templateIdInput) {
    const contactUsage = getTemplateUsageForContact(contactKeyInput);
    const templateId = String(templateIdInput || "").trim();
    if (!contactUsage || !templateId) return false;
    const usageKind = normalizeTemplateUsageKind(kind);
    return contactUsage[usageKind][templateId] === true;
  }

  function updateExportActionsVisibility() {
    const hasSelection = getSelectedContacts().length > 0;
    if (dom.statusActionsEl) dom.statusActionsEl.hidden = !hasSelection;
    updateStickyHeadOffset();
  }

  function openRecordIdRequiredDialog() {
    if (dom.recordIdRequiredMessageEl) {
      dom.recordIdRequiredMessageEl.textContent =
        'Missing "Record ID" column. In HubSpot Contacts list view (not an individual contact page), add it to table columns, then refresh Contact Point.';
    }
    if (dom.recordIdRequiredOverlay) {
      dom.recordIdRequiredOverlay.classList.add("open");
    }
  }

  function closeRecordIdRequiredDialog() {
    if (dom.recordIdRequiredOverlay) {
      dom.recordIdRequiredOverlay.classList.remove("open");
    }
  }

  App.dom = dom;
  App.constants = {
    SETTINGS_KEY,
    EMAIL_TEMPLATES_LOCAL_KEY,
    TEMPLATE_USAGE_LOCAL_KEY,
    LEGACY_NOTE_TEXT,
    DEFAULT_EMAIL_TEMPLATE,
    DEFAULT_WHATSAPP_TEMPLATE,
    DEFAULT_NOTE_TEMPLATE,
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
    normalizeWhatsappTemplates,
    normalizeNoteTemplates,
    templateTokenKey,
    applyTokens,
    normalizeThemeMode,
    applyTheme,
    toggleTheme,
    updateStickyHeadOffset,
    setStatus,
    showToast,
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
    findPossibilityColumn,
    getContactDisplayName,
    getRecordIdForContact,
    getFirstNameFromContact,
    getContactTokenMap,
    buildContactUrl,
    getSelectedContacts,
    normalizeTemplateUsageMap,
    markTemplateApplied,
    hasTemplateApplied,
    updateExportActionsVisibility,
    openRecordIdRequiredDialog,
    closeRecordIdRequiredDialog
  });
})();
