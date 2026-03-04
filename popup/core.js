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
    statusWarningEl: document.getElementById("statusWarning"),
    statusActionsEl: document.getElementById("statusActions"),
    contactsSearchInput: document.getElementById("contactsSearchInput"),
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
    countryPrefixPromptOverlay: document.getElementById("countryPrefixPromptOverlay"),
    countryPrefixPromptMessageEl: document.getElementById("countryPrefixPromptMessage"),
    countryPrefixPromptSelect: document.getElementById("countryPrefixPromptSelect"),
    countryPrefixPromptDropdown: document.getElementById("countryPrefixPromptDropdown"),
    countryPrefixPromptDropdownBtn: document.getElementById("countryPrefixPromptDropdownBtn"),
    countryPrefixPromptDropdownPanel: document.getElementById("countryPrefixPromptDropdownPanel"),
    countryPrefixPromptDropdownSearch: document.getElementById("countryPrefixPromptDropdownSearch"),
    countryPrefixPromptDropdownList: document.getElementById("countryPrefixPromptDropdownList"),
    countryPrefixPromptCancelBtn: document.getElementById("countryPrefixPromptCancelBtn"),
    countryPrefixPromptSaveBtn: document.getElementById("countryPrefixPromptSaveBtn"),

    refreshBtn: document.getElementById("refreshBtn"),
    csvSelectedBtn: document.getElementById("csvSelectedBtn"),
    vcfSelectedBtn: document.getElementById("vcfSelectedBtn"),
    copyEmailBtn: document.getElementById("copyEmailBtn"),
    activeTabRefreshBtn: document.getElementById("activeTabRefreshBtn"),
    activeTabStatusEl: document.getElementById("activeTabStatus"),
    activeTabNameEl: document.getElementById("activeTabName"),
    activeTabOwnerEl: document.getElementById("activeTabOwner"),
    activeTabPhoneEl: document.getElementById("activeTabPhone"),
    activeTabEmailEl: document.getElementById("activeTabEmail"),
    activeTabLatestNoteEl: document.getElementById("activeTabLatestNote"),
    activeTabLatestTaskEl: document.getElementById("activeTabLatestTask"),

    countryPrefixInput: document.getElementById("countryPrefixInput"),
    countryPrefixDropdown: document.getElementById("countryPrefixDropdown"),
    countryPrefixDropdownBtn: document.getElementById("countryPrefixDropdownBtn"),
    countryPrefixDropdownPanel: document.getElementById("countryPrefixDropdownPanel"),
    countryPrefixDropdownSearch: document.getElementById("countryPrefixDropdownSearch"),
    countryPrefixDropdownList: document.getElementById("countryPrefixDropdownList"),
    messageTemplateInput: document.getElementById("messageTemplateInput"),
    noteTemplateInput: document.getElementById("noteTemplateInput"),
    rowFilterInput: document.getElementById("rowFilterInput"),
    cloudApiBaseUrlInput: document.getElementById("cloudApiBaseUrlInput"),
    cloudAuthCardsEl: document.getElementById("cloudAuthCards"),
    addCloudAuthBtn: document.getElementById("addCloudAuthBtn"),
    cloudConnectionStatusEl: document.getElementById("cloudConnectionStatus"),
    cloudTokenInfoBtn: document.getElementById("cloudTokenInfoBtn"),
    cloudTokenInfoOverlay: document.getElementById("cloudTokenInfoOverlay"),
    cloudTokenInfoCloseBtn: document.getElementById("cloudTokenInfoCloseBtn"),
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
  let countryPrefixPromptResolver = null;
  let countryPrefixPromptDropdownBound = false;

  const SETTINGS_KEY = "popupSettings";
  const EMAIL_TEMPLATES_LOCAL_KEY = "popupEmailTemplates";
  const WHATSAPP_TEMPLATES_LOCAL_KEY = "popupWhatsappTemplates";
  const NOTE_TEMPLATES_LOCAL_KEY = "popupNoteTemplates";
  const TEMPLATE_USAGE_LOCAL_KEY = "popupTemplateUsageByContact";
  const QUICK_NOTES_LOCAL_KEY = "popupQuickNotesByRecordId";
  const CLOUD_AUTH_LOCAL_KEY = "popupCloudAuth";
  const CLOUD_AUTH_LIST_LOCAL_KEY = "popupCloudAuthList";
  const CLOUD_ACTIVE_ORG_ID_LOCAL_KEY = "popupCloudActiveOrganizationId";
  const CLOUD_EMAIL_CACHE_PREFIX = "popupCloudEmailTemplates::";
  const CLOUD_WHATSAPP_CACHE_PREFIX = "popupCloudWhatsappTemplates::";
  const CLOUD_NOTE_CACHE_PREFIX = "popupCloudNoteTemplates::";
  const CLOUD_META_CACHE_PREFIX = "popupCloudTemplatesMeta::";
  const CLOUD_TEMPLATE_ID_PREFIX = "cloud_";
  const CLOUD_API_BASE_URL = "https://contactpoint.vercel.app";
  const CLOUD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_CLOUD_ORG_CONNECTIONS = 5;
  const SELECTED_KEYS_SESSION_KEY = "popupSelectedContactKeys";
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
    countryPrefix: "",
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
    contactsSearchQuery: "",
    templateUsageByContact: {},
    quickNotesByRecordId: {},
    cloud: {
      auth: null,
      authList: [],
      activeOrganizationId: "",
      emailTemplates: [],
      whatsappTemplates: [],
      noteTemplates: [],
      meta: null,
      status: ""
    }
  };
  let templateUsageSaveTimerId = null;
  let quickNotesSaveTimerId = null;

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

  function isCloudTemplateId(templateIdInput) {
    return String(templateIdInput || "").startsWith(CLOUD_TEMPLATE_ID_PREFIX);
  }

  function stripCloudTemplatePrefix(templateIdInput) {
    return String(templateIdInput || "").replace(new RegExp(`^${CLOUD_TEMPLATE_ID_PREFIX}`), "");
  }

  function normalizeCloudApiBaseUrl(value) {
    const raw = String(value || "")
      .trim()
      .replace(/\/+$/g, "");
    if (!raw) return CLOUD_API_BASE_URL;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      return `https://${raw}`;
    }
    return raw;
  }

  function normalizeCloudAuth(raw) {
    if (!raw || typeof raw !== "object") return null;
    const apiToken = String(raw.apiToken || "").trim();
    const organizationId = String(raw.organizationId || "").trim();
    if (!apiToken || !organizationId) return null;
    return {
      apiToken,
      apiBaseUrl: normalizeCloudApiBaseUrl(raw.apiBaseUrl),
      organizationId,
      organizationName: String(raw.organizationName || "").trim(),
      organizationSlug: String(raw.organizationSlug || "").trim(),
      tokenPrefix: String(raw.tokenPrefix || "").trim(),
      updatedAt: String(raw.updatedAt || "").trim() || new Date().toISOString()
    };
  }

  function normalizeCloudTemplateArray(rawTemplates, expectedType, organizationIdInput = "") {
    const templates = [];
    const seen = new Set();
    const source = Array.isArray(rawTemplates) ? rawTemplates : [];

    for (const item of source) {
      const baseId = String(item?.id || "").trim();
      if (!baseId) continue;
      const organizationId = String(item?.organizationId || organizationIdInput || state.cloud?.auth?.organizationId || "").trim();
      const compositeId = organizationId ? `${organizationId}_${baseId}` : baseId;
      const id = `${CLOUD_TEMPLATE_ID_PREFIX}${compositeId}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const type = String(item?.type || expectedType || "").toUpperCase();
      if (!type) continue;

      templates.push({
        id,
        cloudId: baseId,
        organizationId,
        type,
        source: "cloud",
        readOnly: true,
        name: String(item?.name || "").trim() || "Untitled",
        subject: String(item?.subject || "").trim(),
        body: String(item?.body || "").trim(),
        createdAt: String(item?.createdAt || "").trim() || null,
        updatedAt: String(item?.updatedAt || "").trim() || null
      });
    }

    return templates;
  }

  function getMergedEmailTemplates() {
    const localTemplates = normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "EMAIL"
    }));
    return [...localTemplates, ...state.cloud.emailTemplates];
  }

  function getMergedWhatsappTemplates() {
    const localTemplates = normalizeWhatsappTemplates(state.settings.whatsappTemplates).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "WHATSAPP"
    }));
    return [...localTemplates, ...state.cloud.whatsappTemplates];
  }

  function getMergedNoteTemplates() {
    const localTemplates = normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "NOTE"
    }));
    return [...localTemplates, ...state.cloud.noteTemplates];
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

  function setStatusWarning(message = "") {
    if (!dom.statusWarningEl) return;
    const text = String(message || "").trim();
    dom.statusWarningEl.textContent = text;
    dom.statusWarningEl.hidden = !text;
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

  function getContactSearchQuery() {
    return String(state.contactsSearchQuery || "").trim().toLowerCase();
  }

  function getFilteredContacts(source = state.currentContacts) {
    const filterWords = getFilterWords();
    const searchQuery = getContactSearchQuery();
    if (!filterWords.length && !searchQuery) return [...source];

    return source.filter((contact) => {
      const rowText = Object.values(contact.values || {}).join(" ").toLowerCase();
      if (filterWords.some((word) => rowText.includes(word))) return false;
      if (!searchQuery) return true;
      return rowText.includes(searchQuery);
    });
  }

  function getVisibleColumns() {
    return state.currentColumns.filter((col) => state.settings.visibleColumns[col.id] !== false);
  }

  function isNameColumn(col) {
    return /name/i.test(col?.label || "") || /^name(_\d+)?$/i.test(col?.id || "");
  }

  function isPossibilityColumn(col) {
    return /(possibility|possiblity|probability)/i.test(col?.label || "") || /^(possibility|possiblity|probability)(_\d+)?$/i.test(col?.id || "");
  }

  function isPhoneColumn(col) {
    if (!col) return false;
    if (col.id === state.phoneColumnId) return true;
    return /(phone(\s*number)?|mobile|whatsapp)/i.test(col.label || "") || /(phone(\s*number)?|mobile|whatsapp)/i.test(col.id || "");
  }

  function isNextActivityDateColumn(col) {
    if (!col) return false;
    return /next\s*activity\s*date/i.test(col.label || "") || /next[_\s]*activity[_\s]*date/i.test(col.id || "");
  }

  function mergeColumnSettings() {
    let changed = false;
    const hasPossibilityColumn = state.currentColumns.some((col) => isPossibilityColumn(col));
    const hasExplicitCurrentColumnSettings = state.currentColumns.some((col) => typeof state.settings.visibleColumns[col.id] === "boolean");

    if (hasPossibilityColumn && !hasExplicitCurrentColumnSettings) {
      for (const col of state.currentColumns) {
        const shouldShow = isNameColumn(col) || isPossibilityColumn(col) || isPhoneColumn(col) || isNextActivityDateColumn(col);
        if (state.settings.visibleColumns[col.id] !== shouldShow) {
          state.settings.visibleColumns[col.id] = shouldShow;
          changed = true;
        }
      }
      return changed;
    }

    for (const col of state.currentColumns) {
      if (typeof state.settings.visibleColumns[col.id] === "boolean") continue;
      state.settings.visibleColumns[col.id] = true;
      changed = true;
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

  function normalizeQuickNotesMap(rawQuickNotes) {
    if (!rawQuickNotes || typeof rawQuickNotes !== "object") return {};
    const normalized = {};

    for (const [recordIdInput, noteInput] of Object.entries(rawQuickNotes)) {
      const recordId = String(recordIdInput || "").replace(/\D/g, "");
      if (!recordId) continue;
      const note = String(noteInput || "").trim();
      if (!note) continue;
      normalized[recordId] = note;
    }

    return normalized;
  }

  function scheduleQuickNotesPersist() {
    if (quickNotesSaveTimerId) {
      clearTimeout(quickNotesSaveTimerId);
      quickNotesSaveTimerId = null;
    }
    quickNotesSaveTimerId = setTimeout(() => {
      quickNotesSaveTimerId = null;
      const payload = normalizeQuickNotesMap(state.quickNotesByRecordId);
      state.quickNotesByRecordId = payload;
      void chrome.storage.local.set({ [QUICK_NOTES_LOCAL_KEY]: payload });
    }, 220);
  }

  function getQuickNoteForRecordId(recordIdInput) {
    const recordId = String(recordIdInput || "").replace(/\D/g, "");
    if (!recordId) return "";
    return String(state.quickNotesByRecordId?.[recordId] || "");
  }

  function setQuickNoteForRecordId(recordIdInput, noteInput) {
    const recordId = String(recordIdInput || "").replace(/\D/g, "");
    if (!recordId) return;
    const note = String(noteInput || "").trim();
    if (!note) {
      if (!Object.prototype.hasOwnProperty.call(state.quickNotesByRecordId, recordId)) return;
      delete state.quickNotesByRecordId[recordId];
      scheduleQuickNotesPersist();
      return;
    }
    if (state.quickNotesByRecordId[recordId] === note) return;
    state.quickNotesByRecordId[recordId] = note;
    scheduleQuickNotesPersist();
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

  async function persistSelectedKeysToSession() {
    const keys = [...state.selectedKeys].map((key) => String(key || "").trim()).filter(Boolean);
    try {
      if (chrome?.storage?.session && typeof chrome.storage.session.set === "function") {
        await chrome.storage.session.set({ [SELECTED_KEYS_SESSION_KEY]: keys });
      }
    } catch (_error) {}
  }

  async function restoreSelectedKeysFromSession() {
    try {
      if (chrome?.storage?.session && typeof chrome.storage.session.get === "function") {
        const raw = await chrome.storage.session.get(SELECTED_KEYS_SESSION_KEY);
        const next = Array.isArray(raw?.[SELECTED_KEYS_SESSION_KEY]) ? raw[SELECTED_KEYS_SESSION_KEY] : [];
        state.selectedKeys = new Set(next.map((key) => String(key || "").trim()).filter(Boolean));
      }
    } catch (_error) {}
  }

  function blurFocusedElementWithin(container) {
    if (!container) return;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (container.contains(activeElement)) {
      activeElement.blur();
    }
  }

  function preserveScrollPosition(callback) {
    const fn = typeof callback === "function" ? callback : () => {};
    const scrollingElement = document.scrollingElement || document.documentElement;
    const scrollLeft = Number(scrollingElement?.scrollLeft || window.scrollX || 0);
    const scrollTop = Number(scrollingElement?.scrollTop || window.scrollY || 0);

    fn();

    const restoreScroll = () => {
      if (scrollingElement) {
        scrollingElement.scrollLeft = scrollLeft;
        scrollingElement.scrollTop = scrollTop;
      }
      window.scrollTo(scrollLeft, scrollTop);
    };

    restoreScroll();
    setTimeout(restoreScroll, 0);
    requestAnimationFrame(restoreScroll);
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
      blurFocusedElementWithin(dom.recordIdRequiredOverlay);
      preserveScrollPosition(() => {
        dom.recordIdRequiredOverlay.classList.remove("open");
      });
    }
  }

  function resolveCountryPrefixPrompt(value = null) {
    if (typeof countryPrefixPromptResolver !== "function") return;
    const resolver = countryPrefixPromptResolver;
    countryPrefixPromptResolver = null;
    resolver(value);
  }

  function closeCountryPrefixPromptDropdown() {
    if (!dom.countryPrefixPromptDropdown) return;
    dom.countryPrefixPromptDropdown.classList.remove("open");
  }

  function updateCountryPrefixPromptDropdownButton() {
    if (!dom.countryPrefixPromptDropdownBtn || !dom.countryPrefixPromptSelect) return;
    const selectedOption = dom.countryPrefixPromptSelect.options[dom.countryPrefixPromptSelect.selectedIndex] || null;
    const label = String(selectedOption?.textContent || "").trim();
    dom.countryPrefixPromptDropdownBtn.textContent = label || "Select country code";
  }

  function renderCountryPrefixPromptDropdownList() {
    if (!dom.countryPrefixPromptDropdownList || !dom.countryPrefixPromptSelect) return;
    const query = String(dom.countryPrefixPromptDropdownSearch?.value || "")
      .trim()
      .toLowerCase();
    const selectedCode = String(dom.countryPrefixPromptSelect.value || "").replace(/\D/g, "");

    const options = Array.from(dom.countryPrefixPromptSelect.options || []).filter((option) => {
      const code = String(option?.value || "").replace(/\D/g, "");
      return !!code;
    });

    const filtered = query
      ? options.filter((option) => {
          const code = String(option?.value || "").replace(/\D/g, "");
          const label = String(option?.textContent || "").toLowerCase();
          return label.includes(query) || code.includes(query);
        })
      : options;

    if (!filtered.length) {
      dom.countryPrefixPromptDropdownList.innerHTML = "<div class='email-template-empty'>No countries found.</div>";
      return;
    }

    dom.countryPrefixPromptDropdownList.innerHTML = filtered
      .map((option) => {
        const code = String(option?.value || "").replace(/\D/g, "");
        const label = String(option?.textContent || "").trim() || `+${code}`;
        const selectedClass = code === selectedCode ? "is-selected" : "";
        return `<button type='button' class='country-prefix-dropdown-item ${selectedClass}' data-country-code='${escapeHtml(code)}'>${escapeHtml(
          label
        )}</button>`;
      })
      .join("");
  }

  function openCountryPrefixPromptDropdown() {
    if (!dom.countryPrefixPromptDropdown) return;
    dom.countryPrefixPromptDropdown.classList.add("open");
    if (dom.countryPrefixPromptDropdownSearch) {
      dom.countryPrefixPromptDropdownSearch.value = "";
      renderCountryPrefixPromptDropdownList();
      dom.countryPrefixPromptDropdownSearch.focus();
      return;
    }
    renderCountryPrefixPromptDropdownList();
  }

  function bindCountryPrefixPromptDropdown() {
    if (countryPrefixPromptDropdownBound) return;
    if (!dom.countryPrefixPromptDropdown || !dom.countryPrefixPromptDropdownBtn || !dom.countryPrefixPromptDropdownList) return;
    countryPrefixPromptDropdownBound = true;

    dom.countryPrefixPromptDropdownBtn.addEventListener("click", () => {
      const isOpen = dom.countryPrefixPromptDropdown?.classList.contains("open");
      if (isOpen) closeCountryPrefixPromptDropdown();
      else openCountryPrefixPromptDropdown();
    });

    if (dom.countryPrefixPromptDropdownSearch) {
      dom.countryPrefixPromptDropdownSearch.addEventListener("input", () => {
        renderCountryPrefixPromptDropdownList();
      });
      dom.countryPrefixPromptDropdownSearch.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const first = dom.countryPrefixPromptDropdownList?.querySelector("[data-country-code]");
          if (first instanceof HTMLElement) first.click();
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeCountryPrefixPromptDropdown();
        }
      });
    }

    dom.countryPrefixPromptDropdownList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const option = target.closest("[data-country-code]");
      if (!(option instanceof HTMLElement)) return;
      const code = String(option.getAttribute("data-country-code") || "").replace(/\D/g, "");
      if (!code || !dom.countryPrefixPromptSelect) return;
      dom.countryPrefixPromptSelect.value = code;
      updateCountryPrefixPromptDropdownButton();
      closeCountryPrefixPromptDropdown();
    });

    document.addEventListener("click", (event) => {
      if (!dom.countryPrefixPromptDropdown) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dom.countryPrefixPromptDropdown.contains(target)) return;
      closeCountryPrefixPromptDropdown();
    });
  }

  function openCountryPrefixPromptDialog(options = {}) {
    if (!dom.countryPrefixPromptOverlay || !dom.countryPrefixPromptSelect) {
      return Promise.resolve(null);
    }

    resolveCountryPrefixPrompt(null);

    const initialCode = String(options.initialCode || state.settings.countryPrefix || "").replace(/\D/g, "");
    const promptMessage =
      String(options.message || "").trim() ||
      "This phone number appears to be local. Choose a default country code to continue. You can change this later in Settings.";

    if (typeof App.renderCountryPrefixOptions === "function") {
      App.renderCountryPrefixOptions(initialCode);
    }

    const select = dom.countryPrefixPromptSelect;
    select.textContent = "";
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Select country code";
    select.append(placeholderOption);

    const sourceOptions = Array.from(dom.countryPrefixInput?.options || []);
    for (const option of sourceOptions) {
      const code = String(option?.value || "").replace(/\D/g, "");
      if (!code) continue;
      const nextOption = document.createElement("option");
      nextOption.value = code;
      nextOption.textContent = String(option.textContent || `+${code}`);
      select.append(nextOption);
    }

    if (dom.countryPrefixPromptMessageEl) {
      dom.countryPrefixPromptMessageEl.textContent = promptMessage;
    }
    select.value = initialCode;
    if (select.value !== initialCode) {
      select.value = "";
    }

    bindCountryPrefixPromptDropdown();
    updateCountryPrefixPromptDropdownButton();
    renderCountryPrefixPromptDropdownList();
    closeCountryPrefixPromptDropdown();

    dom.countryPrefixPromptOverlay.classList.add("open");
    setTimeout(() => {
      dom.countryPrefixPromptDropdownBtn?.focus();
    }, 0);

    return new Promise((resolve) => {
      countryPrefixPromptResolver = resolve;
    });
  }

  function closeCountryPrefixPromptDialog(value = null) {
    resolveCountryPrefixPrompt(value);
    closeCountryPrefixPromptDropdown();
    if (dom.countryPrefixPromptOverlay) {
      blurFocusedElementWithin(dom.countryPrefixPromptOverlay);
      preserveScrollPosition(() => {
        dom.countryPrefixPromptOverlay.classList.remove("open");
      });
    }
  }

  function submitCountryPrefixPromptDialog() {
    const nextPrefix = String(dom.countryPrefixPromptSelect?.value || "").replace(/\D/g, "");
    if (!nextPrefix) {
      setStatus("Please select a country code to continue. You can also set it in Settings.");
      if (typeof showToast === "function") showToast("Select a country code.");
      openCountryPrefixPromptDropdown();
      return;
    }
    closeCountryPrefixPromptDialog(nextPrefix);
  }

  App.dom = dom;
  App.constants = {
    SETTINGS_KEY,
    EMAIL_TEMPLATES_LOCAL_KEY,
    WHATSAPP_TEMPLATES_LOCAL_KEY,
    NOTE_TEMPLATES_LOCAL_KEY,
    TEMPLATE_USAGE_LOCAL_KEY,
    QUICK_NOTES_LOCAL_KEY,
    CLOUD_AUTH_LOCAL_KEY,
    CLOUD_AUTH_LIST_LOCAL_KEY,
    CLOUD_ACTIVE_ORG_ID_LOCAL_KEY,
    CLOUD_EMAIL_CACHE_PREFIX,
    CLOUD_WHATSAPP_CACHE_PREFIX,
    CLOUD_NOTE_CACHE_PREFIX,
    CLOUD_META_CACHE_PREFIX,
    CLOUD_TEMPLATE_ID_PREFIX,
    CLOUD_API_BASE_URL,
    CLOUD_CACHE_TTL_MS,
    MAX_CLOUD_ORG_CONNECTIONS,
    SELECTED_KEYS_SESSION_KEY,
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
    normalizeCloudAuth,
    normalizeCloudApiBaseUrl,
    normalizeCloudTemplateArray,
    isCloudTemplateId,
    stripCloudTemplatePrefix,
    getMergedEmailTemplates,
    getMergedWhatsappTemplates,
    getMergedNoteTemplates,
    templateTokenKey,
    applyTokens,
    normalizeThemeMode,
    applyTheme,
    toggleTheme,
    updateStickyHeadOffset,
    setStatus,
    setStatusWarning,
    showToast,
    setContactsLoadingState,
    contactKey,
    getFilterWord,
    getContactSearchQuery,
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
    normalizeQuickNotesMap,
    getQuickNoteForRecordId,
    setQuickNoteForRecordId,
    updateExportActionsVisibility,
    persistSelectedKeysToSession,
    restoreSelectedKeysFromSession,
    blurFocusedElementWithin,
    preserveScrollPosition,
    openRecordIdRequiredDialog,
    closeRecordIdRequiredDialog,
    openCountryPrefixPromptDialog,
    closeCountryPrefixPromptDialog,
    submitCountryPrefixPromptDialog
  });
})();
