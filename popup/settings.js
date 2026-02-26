(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  let pendingImportTemplates = [];

  function buildSyncSettingsPayload(settingsInput = state.settings) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
    const {
      emailTemplates: _ignoreEmailTemplates,
      whatsappTemplates: _ignoreWhatsappTemplates,
      noteTemplates: _ignoreNoteTemplates,
      ...syncSafeSettings
    } = source;
    return syncSafeSettings;
  }

  async function persistSyncSettings(settingsInput = state.settings) {
    const syncSafeSettings = buildSyncSettingsPayload(settingsInput);
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: syncSafeSettings });
  }

  function isEmailTemplatesOpen() {
    return !!dom.emailTemplatesPageEl && !dom.emailTemplatesPageEl.hidden;
  }

  function isActiveTabOpen() {
    return !!dom.activeTabPageEl && !dom.activeTabPageEl.hidden;
  }

  function isWhatsappTemplatesOpen() {
    return !!dom.whatsappTemplatesPageEl && !dom.whatsappTemplatesPageEl.hidden;
  }

  function isNoteTemplatesOpen() {
    return !!dom.noteTemplatesPageEl && !dom.noteTemplatesPageEl.hidden;
  }

  function isSettingsPageOpen() {
    return !!dom.settingsPageEl && !dom.settingsPageEl.hidden;
  }

  function syncTopLevelViewState() {
    const activeTabOpen = isActiveTabOpen();
    const emailOpen = isEmailTemplatesOpen();
    const whatsappOpen = isWhatsappTemplatesOpen();
    const noteOpen = isNoteTemplatesOpen();
    const settingsOpen = isSettingsPageOpen();

    if (dom.activeTabBtn) dom.activeTabBtn.classList.toggle("active", activeTabOpen);
    if (dom.emailSettingsBtn) dom.emailSettingsBtn.classList.toggle("active", emailOpen);
    if (dom.whatsappSettingsBtn) dom.whatsappSettingsBtn.classList.toggle("active", whatsappOpen);
    if (dom.noteSettingsBtn) dom.noteSettingsBtn.classList.toggle("active", noteOpen);
    if (dom.settingsBtn) dom.settingsBtn.classList.toggle("active", settingsOpen);
    if (dom.contactViewBtn) dom.contactViewBtn.classList.toggle("active", !activeTabOpen && !emailOpen && !whatsappOpen && !noteOpen && !settingsOpen);
    if (dom.mainPageEl) dom.mainPageEl.classList.toggle("header-only", activeTabOpen || emailOpen || whatsappOpen || noteOpen || settingsOpen);
    App.updateStickyHeadOffset();
  }

  function setSettingsMode(isOpen) {
    if (dom.settingsPageEl) dom.settingsPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setEmailTemplatesMode(isOpen) {
    if (dom.emailTemplatesPageEl) dom.emailTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setActiveTabMode(isOpen) {
    if (dom.activeTabPageEl) dom.activeTabPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setWhatsappTemplatesMode(isOpen) {
    if (dom.whatsappTemplatesPageEl) dom.whatsappTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setNoteTemplatesMode(isOpen) {
    if (dom.noteTemplatesPageEl) dom.noteTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function renderColumnChecks() {
    if (!dom.columnChecks) return;

    if (!state.currentColumns.length) {
      dom.columnChecks.innerHTML = "<div class='check'>No columns detected yet.</div>";
      return;
    }

    const html = state.currentColumns
      .map((col) => {
        const checked = state.settings.visibleColumns[col.id] !== false ? "checked" : "";
        return `<label class='check'><input type='checkbox' data-col-id='${App.escapeHtml(col.id)}' ${checked} /> ${App.escapeHtml(col.label)}</label>`;
      })
      .join("");

    dom.columnChecks.innerHTML = html;
  }

  function settingsFromForm() {
    const visibleColumns = {};
    dom.columnChecks.querySelectorAll("input[data-col-id]").forEach((input) => {
      const colId = input.getAttribute("data-col-id");
      if (colId) visibleColumns[colId] = input.checked;
    });

    return {
      countryPrefix: (dom.countryPrefixInput.value || "").replace(/\D/g, "") || "60",
      messageTemplate: String(dom.messageTemplateInput?.value || "").trim(),
      noteTemplate: String(dom.noteTemplateInput?.value || "").trim(),
      rowFilterWord: String(dom.rowFilterInput?.value || "")
        .replace(/\s+/g, " ")
        .trim(),
      visibleColumns
    };
  }

  function fillSettingsForm() {
    dom.countryPrefixInput.value = state.settings.countryPrefix;
    if (dom.messageTemplateInput) dom.messageTemplateInput.value = "";
    if (dom.noteTemplateInput) dom.noteTemplateInput.value = "";
    if (dom.rowFilterInput) dom.rowFilterInput.value = state.settings.rowFilterWord || "";
    renderColumnChecks();
  }

  function openSettings() {
    if (!dom.settingsPageEl || !dom.settingsPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    fillSettingsForm();
    setSettingsMode(true);
  }

  function closeSettings() {
    if (!isSettingsPageOpen()) return;
    setSettingsMode(false);
  }

  function toggleSettings() {
    if (dom.settingsPageEl?.hidden) {
      openSettings();
      return;
    }
    closeSettings();
  }

  function openEmailSettings() {
    if (!dom.emailTemplatesPageEl || !dom.emailTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    setEmailTemplatesMode(true);
    App.loadEmailTemplatesDraftFromSettings();
    App.renderEmailTemplatesPage();
    if (typeof App.ensureEmailBodyEditor === "function") {
      void App.ensureEmailBodyEditor().then(() => {
        App.renderActiveEmailTemplateEditor();
      });
    }
  }

  function closeEmailSettings() {
    if (!isEmailTemplatesOpen()) return;
    if (typeof App.flushEmailTemplateAutosave === "function") {
      void App.flushEmailTemplateAutosave({ showToast: false });
    }
    setEmailTemplatesMode(false);
  }

  function openWhatsappSettings() {
    if (!dom.whatsappTemplatesPageEl || !dom.whatsappTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    setWhatsappTemplatesMode(true);
    App.loadWhatsappTemplatesDraftFromSettings();
    App.renderWhatsappTemplatesPage();
  }

  function closeWhatsappSettings() {
    if (!isWhatsappTemplatesOpen()) return;
    if (typeof App.flushWhatsappTemplateAutosave === "function") {
      void App.flushWhatsappTemplateAutosave({ showToast: false });
    }
    setWhatsappTemplatesMode(false);
  }

  function toggleEmailSettings() {
    if (dom.emailTemplatesPageEl?.hidden) {
      openEmailSettings();
      return;
    }
    closeEmailSettings();
  }

  function toggleWhatsappSettings() {
    if (dom.whatsappTemplatesPageEl?.hidden) {
      openWhatsappSettings();
      return;
    }
    closeWhatsappSettings();
  }

  function openNoteSettings() {
    if (!dom.noteTemplatesPageEl || !dom.noteTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    setNoteTemplatesMode(true);
    App.loadNoteTemplatesDraftFromSettings();
    App.renderNoteTemplatesPage();
  }

  function closeNoteSettings() {
    if (!isNoteTemplatesOpen()) return;
    if (typeof App.flushNoteTemplateAutosave === "function") {
      void App.flushNoteTemplateAutosave({ showToast: false });
    }
    setNoteTemplatesMode(false);
  }

  function toggleNoteSettings() {
    if (dom.noteTemplatesPageEl?.hidden) {
      openNoteSettings();
      return;
    }
    closeNoteSettings();
  }

  function openContactsView() {
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    closeActiveTab();
    closeEmailSettings();
    closeWhatsappSettings();
    closeNoteSettings();
    closeSettings();
  }

  function openActiveTab() {
    if (!dom.activeTabPageEl || !dom.activeTabPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) setSettingsMode(false);
    closeEmailSettings();
    closeWhatsappSettings();
    closeNoteSettings();
    setActiveTabMode(true);
    if (typeof App.loadActiveTabContext === "function") {
      void App.loadActiveTabContext();
    }
  }

  function closeActiveTab() {
    if (!isActiveTabOpen()) return;
    setActiveTabMode(false);
  }

  function toggleActiveTab() {
    if (dom.activeTabPageEl?.hidden) {
      openActiveTab();
      return;
    }
    closeActiveTab();
  }

  async function saveEmailSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "Template saved.");
    const next = App.normalizeEmailTemplates(state.emailTemplatesDraft);
    state.settings = {
      ...state.settings,
      emailTemplates: next
    };
    await chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  async function saveWhatsappSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "WhatsApp template saved.");
    const next = App.normalizeWhatsappTemplates(state.whatsappTemplatesDraft);
    state.settings = {
      ...state.settings,
      whatsappTemplates: next
    };
    await chrome.storage.local.set({ [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  async function saveNoteTemplateSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "Note template saved.");
    const next = App.normalizeNoteTemplates(state.noteTemplatesDraft);
    state.settings = {
      ...state.settings,
      noteTemplates: next
    };
    await chrome.storage.local.set({ [constants.NOTE_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  function normalizeImportedEmailTemplate(item) {
    if (!item || typeof item !== "object") return null;
    const rawName = String(item.name || "").trim();
    const rawSubject = String(item.subject || "").trim();
    const rawBody = String(item.body || "").trim();
    if (!rawName && !rawSubject && !rawBody) return null;
    return {
      name: rawName || "Untitled",
      subject: rawSubject,
      body: rawBody
    };
  }

  function normalizeImportedBasicTemplate(item) {
    if (!item || typeof item !== "object") return null;
    const rawName = String(item.name || "").trim();
    const rawBody = String(item.body || "").trim();
    if (!rawName && !rawBody) return null;
    return {
      name: rawName || "Untitled",
      body: rawBody
    };
  }

  function parseImportedTemplates(text) {
    let payload;
    try {
      payload = JSON.parse(String(text || ""));
    } catch (_error) {
      throw new Error("Invalid JSON file.");
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid import format. Expected an object with emailTemplates, whatsappTemplates, and noteTemplates arrays.");
    }

    if (!Array.isArray(payload.emailTemplates) || !Array.isArray(payload.whatsappTemplates) || !Array.isArray(payload.noteTemplates)) {
      throw new Error("Invalid import format. Expected emailTemplates, whatsappTemplates, and noteTemplates arrays.");
    }

    const entries = [];

    payload.emailTemplates.map(normalizeImportedEmailTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "email", ...template });
    });

    payload.whatsappTemplates.map(normalizeImportedBasicTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "whatsapp", ...template });
    });

    payload.noteTemplates.map(normalizeImportedBasicTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "note", ...template });
    });

    if (!entries.length) {
      throw new Error("No valid templates found in the selected file.");
    }

    return entries;
  }


  function renderTemplateImportList() {
    if (!dom.templateImportListEl) return;
    if (!pendingImportTemplates.length) {
      dom.templateImportListEl.innerHTML = "<div class='notes-empty'>No templates to import.</div>";
      return;
    }

    dom.templateImportListEl.innerHTML = pendingImportTemplates
      .map((template, index) => {
        const kindLabel = template.kind === "email" ? "Email" : template.kind === "whatsapp" ? "WhatsApp" : "Note";
        const preview = template.kind === "email" ? template.subject || "No subject" : template.body || "No content";
        return `
          <label class='template-import-item'>
            <input type='checkbox' data-import-index='${index}' checked />
            <span class='template-import-item-title'>${App.escapeHtml(kindLabel)} - ${App.escapeHtml(template.name)}</span>
            <span class='template-import-item-meta'>${App.escapeHtml(preview.slice(0, 90))}</span>
          </label>
        `;
      })
      .join("");
  }

  function openTemplateImportReview(sourceLabel = "") {
    if (dom.templateImportModeAddInput) dom.templateImportModeAddInput.checked = true;
    if (dom.templateImportSummaryEl) {
      const suffix = sourceLabel ? ` from ${sourceLabel}` : "";
      dom.templateImportSummaryEl.textContent = `Found ${pendingImportTemplates.length} template(s)${suffix}. Select what to import.`;
    }
    renderTemplateImportList();
    if (dom.templateImportOverlay) dom.templateImportOverlay.classList.add("open");
  }

  function closeTemplateImportReview() {
    if (dom.templateImportOverlay) {
      App.blurFocusedElementWithin(dom.templateImportOverlay);
      App.preserveScrollPosition(() => {
        dom.templateImportOverlay.classList.remove("open");
      });
    }
    pendingImportTemplates = [];
    if (dom.templateImportListEl) dom.templateImportListEl.innerHTML = "";
    if (dom.templateImportSummaryEl) dom.templateImportSummaryEl.textContent = "";
  }

  function normalizeNameKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  async function applyTemplateImport() {
    if (!pendingImportTemplates.length) {
      App.setStatus("No templates selected for import.");
      return;
    }

    const selectedIndices = Array.from(dom.templateImportListEl?.querySelectorAll("input[data-import-index]") || [])
      .filter((input) => input.checked)
      .map((input) => Number(input.getAttribute("data-import-index")))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < pendingImportTemplates.length);

    if (!selectedIndices.length) {
      App.setStatus("Select at least one template to import.");
      return;
    }

    const mode = dom.templateImportModeReplaceInput?.checked ? "replace" : "add";

    const emailNext = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({ ...template }));
    const whatsappNext = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates).map((template) => ({ ...template }));
    const noteNext = App.normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({ ...template }));

    const emailNameToIndex = new Map(emailNext.map((template, index) => [normalizeNameKey(template.name), index]));
    const whatsappNameToIndex = new Map(whatsappNext.map((template, index) => [normalizeNameKey(template.name), index]));
    const noteNameToIndex = new Map(noteNext.map((template, index) => [normalizeNameKey(template.name), index]));

    const counts = {
      email: { added: 0, replaced: 0 },
      whatsapp: { added: 0, replaced: 0 },
      note: { added: 0, replaced: 0 },
      skipped: 0
    };

    for (const index of selectedIndices) {
      const incoming = pendingImportTemplates[index];
      if (!incoming) {
        counts.skipped += 1;
        continue;
      }

      const key = normalizeNameKey(incoming.name);

      if (incoming.kind === "email") {
        const matchIndex = mode === "replace" ? emailNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = emailNext[matchIndex];
          emailNext[matchIndex] = { ...current, name: incoming.name, subject: incoming.subject || "", body: incoming.body || "" };
          counts.email.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, subject: incoming.subject || "", body: incoming.body || "" };
          emailNext.push(created);
          emailNameToIndex.set(key, emailNext.length - 1);
          counts.email.added += 1;
        }
        continue;
      }

      if (incoming.kind === "whatsapp") {
        const matchIndex = mode === "replace" ? whatsappNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = whatsappNext[matchIndex];
          whatsappNext[matchIndex] = { ...current, name: incoming.name, body: incoming.body || "" };
          counts.whatsapp.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, body: incoming.body || "" };
          whatsappNext.push(created);
          whatsappNameToIndex.set(key, whatsappNext.length - 1);
          counts.whatsapp.added += 1;
        }
        continue;
      }

      if (incoming.kind === "note") {
        const matchIndex = mode === "replace" ? noteNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = noteNext[matchIndex];
          noteNext[matchIndex] = { ...current, name: incoming.name, body: incoming.body || "" };
          counts.note.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, body: incoming.body || "" };
          noteNext.push(created);
          noteNameToIndex.set(key, noteNext.length - 1);
          counts.note.added += 1;
        }
        continue;
      }

      counts.skipped += 1;
    }

    const emailNormalized = App.normalizeEmailTemplates(emailNext);
    const whatsappNormalized = App.normalizeWhatsappTemplates(whatsappNext);
    const noteNormalized = App.normalizeNoteTemplates(noteNext);

    state.settings = {
      ...state.settings,
      emailTemplates: emailNormalized,
      whatsappTemplates: whatsappNormalized,
      noteTemplates: noteNormalized
    };

    await chrome.storage.local.set({
      [constants.EMAIL_TEMPLATES_LOCAL_KEY]: emailNormalized,
      [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: whatsappNormalized,
      [constants.NOTE_TEMPLATES_LOCAL_KEY]: noteNormalized
    });

    if (!dom.emailTemplatesPageEl?.hidden) {
      App.loadEmailTemplatesDraftFromSettings();
      App.renderEmailTemplatesPage();
    }
    if (!dom.whatsappTemplatesPageEl?.hidden) {
      App.loadWhatsappTemplatesDraftFromSettings();
      App.renderWhatsappTemplatesPage();
    }
    if (!dom.noteTemplatesPageEl?.hidden) {
      App.loadNoteTemplatesDraftFromSettings();
      App.renderNoteTemplatesPage();
    }

    closeTemplateImportReview();
    const summary = `Imported templates: Email ${counts.email.added} added / ${counts.email.replaced} replaced, WhatsApp ${counts.whatsapp.added} added / ${counts.whatsapp.replaced} replaced, Note ${counts.note.added} added / ${counts.note.replaced} replaced, ${counts.skipped} skipped.`;
    if (typeof App.showToast === "function") App.showToast(summary, 3200);
    else App.setStatus(summary);
  }

  async function onImportTemplatesInputChange(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      pendingImportTemplates = parseImportedTemplates(text);
      openTemplateImportReview(file.name || "selected file");
    } catch (error) {
      const message = String(error?.message || "Could not import templates.");
      App.setStatus(message);
      if (typeof App.showToast === "function") App.showToast(message, 2800);
    } finally {
      if (dom.importTemplatesInput) dom.importTemplatesInput.value = "";
    }
  }

  function buildExportFileName() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `contact-point-personal-templates-${stamp}.json`;
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportPersonalTemplates() {
    const emailTemplates = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      subject: String(template.subject || "").trim(),
      body: String(template.body || "").trim()
    }));

    const whatsappTemplates = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      body: String(template.body || "").trim()
    }));

    const noteTemplates = App.normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      body: String(template.body || "").trim()
    }));

    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      emailTemplates,
      whatsappTemplates,
      noteTemplates
    };

    downloadJson(buildExportFileName(), payload);
    const total = emailTemplates.length + whatsappTemplates.length + noteTemplates.length;
    if (typeof App.showToast === "function") App.showToast(`Exported ${total} template(s).`);
  }

  function triggerImportTemplatesPicker() {
    if (!dom.importTemplatesInput) {
      App.setStatus("Import input is not available.");
      return;
    }
    dom.importTemplatesInput.click();
  }

  async function loadSettings() {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(constants.SETTINGS_KEY),
      chrome.storage.local.get([
        constants.EMAIL_TEMPLATES_LOCAL_KEY,
        constants.WHATSAPP_TEMPLATES_LOCAL_KEY,
        constants.NOTE_TEMPLATES_LOCAL_KEY,
        constants.TEMPLATE_USAGE_LOCAL_KEY
      ])
    ]);
    const saved = syncResult[constants.SETTINGS_KEY];
    const {
      defaultEmailTemplateId: _legacyDefaultId,
      emailTemplates: legacySyncTemplates,
      whatsappTemplates: legacySyncWhatsappTemplates,
      noteTemplates: legacySyncNoteTemplates,
      ...savedWithoutLegacy
    } = saved || {};
    const localEmailTemplates = localResult[constants.EMAIL_TEMPLATES_LOCAL_KEY];
    const localWhatsappTemplates = localResult[constants.WHATSAPP_TEMPLATES_LOCAL_KEY];
    const localNoteTemplates = localResult[constants.NOTE_TEMPLATES_LOCAL_KEY];
    const savedTemplateUsage = localResult[constants.TEMPLATE_USAGE_LOCAL_KEY];
    const hasLocalEmailTemplates = Array.isArray(localEmailTemplates);
    const hasLocalWhatsappTemplates = Array.isArray(localWhatsappTemplates);
    const hasLocalNoteTemplates = Array.isArray(localNoteTemplates);
    const emailTemplates = App.normalizeEmailTemplates(hasLocalEmailTemplates ? localEmailTemplates : legacySyncTemplates);
    const whatsappTemplates = App.normalizeWhatsappTemplates(
      hasLocalWhatsappTemplates ? localWhatsappTemplates : legacySyncWhatsappTemplates
    );
    const noteTemplates = App.normalizeNoteTemplates(hasLocalNoteTemplates ? localNoteTemplates : legacySyncNoteTemplates);
    state.templateUsageByContact = App.normalizeTemplateUsageMap(savedTemplateUsage);
    state.settings = {
      ...constants.DEFAULT_SETTINGS,
      ...savedWithoutLegacy,
      visibleColumns: {
        ...constants.DEFAULT_SETTINGS.visibleColumns,
        ...(savedWithoutLegacy.visibleColumns || {})
      },
      emailTemplates,
      whatsappTemplates,
      noteTemplates
    };
    state.settings.messageTemplate = "";
    state.settings.noteTemplate = "";
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);
    App.applyTheme(state.settings.themeMode);

    const needsSyncCleanup =
      (saved &&
        (Object.prototype.hasOwnProperty.call(saved, "emailTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "whatsappTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "noteTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "defaultEmailTemplateId"))) ||
      state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT;
    const writes = [];

    if (!hasLocalEmailTemplates && Array.isArray(legacySyncTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: emailTemplates }));
    }

    if (!hasLocalWhatsappTemplates && Array.isArray(legacySyncWhatsappTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: whatsappTemplates }));
    }

    if (!hasLocalNoteTemplates && Array.isArray(legacySyncNoteTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.NOTE_TEMPLATES_LOCAL_KEY]: noteTemplates }));
    }

    if (state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT) {
      state.settings.noteTemplate = "";
    }

    if (needsSyncCleanup) {
      writes.push(persistSyncSettings(state.settings));
    }

    if (writes.length) {
      await Promise.all(writes);
    }
  }

  async function saveSettings() {
    const next = settingsFromForm();

    // Only enforce this when we actually have detected columns.
    const hasDetectedColumns = state.currentColumns.length > 0;
    const hasVisibleDetectedColumn = hasDetectedColumns
      ? state.currentColumns.some((col) => next.visibleColumns[col.id] !== false)
      : true;

    if (!hasVisibleDetectedColumn) {
      const message = "Enable at least one column.";
      App.setStatus(message);
      if (typeof App.showToast === "function") App.showToast(message, 2600);
      return;
    }

    state.settings = { ...state.settings, ...next, messageTemplate: "", noteTemplate: "" };
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);

    try {
      await persistSyncSettings(state.settings);
      App.renderContacts();
      App.setStatus("Settings saved.");
      if (typeof App.showToast === "function") App.showToast("Settings saved.");
    } catch (error) {
      const reason = String(error?.message || error || "Unknown error.");
      App.setStatus("Could not save settings: " + reason);
      if (typeof App.showToast === "function") App.showToast("Save failed: " + reason, 3200);
    }
  }

  Object.assign(App, {
    renderColumnChecks,
    settingsFromForm,
    fillSettingsForm,
    openSettings,
    closeSettings,
    toggleSettings,
    setSettingsMode,
    setEmailTemplatesMode,
    setActiveTabMode,
    setWhatsappTemplatesMode,
    setNoteTemplatesMode,
    syncTopLevelViewState,
    openEmailSettings,
    closeEmailSettings,
    toggleEmailSettings,
    openWhatsappSettings,
    closeWhatsappSettings,
    toggleWhatsappSettings,
    openNoteSettings,
    closeNoteSettings,
    toggleNoteSettings,
    openActiveTab,
    closeActiveTab,
    toggleActiveTab,
    openContactsView,
    buildSyncSettingsPayload,
    persistSyncSettings,
    saveEmailSettings,
    saveWhatsappSettings,
    saveNoteTemplateSettings,
    exportPersonalTemplates,
    triggerImportTemplatesPicker,
    onImportTemplatesInputChange,
    openTemplateImportReview,
    closeTemplateImportReview,
    applyTemplateImport,
    loadSettings,
    saveSettings
  });
})();
