(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  let pendingImportTemplates = [];

  function buildSyncSettingsPayload(settingsInput = state.settings) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
    const { emailTemplates: _ignoreTemplates, ...syncSafeSettings } = source;
    return syncSafeSettings;
  }

  async function persistSyncSettings(settingsInput = state.settings) {
    const syncSafeSettings = buildSyncSettingsPayload(settingsInput);
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: syncSafeSettings });
  }

  function isEmailTemplatesOpen() {
    return !!dom.emailTemplatesPageEl && !dom.emailTemplatesPageEl.hidden;
  }

  function isSettingsPageOpen() {
    return !!dom.settingsPageEl && !dom.settingsPageEl.hidden;
  }

  function syncTopLevelViewState() {
    const emailOpen = isEmailTemplatesOpen();
    const settingsOpen = isSettingsPageOpen();

    if (dom.emailSettingsBtn) dom.emailSettingsBtn.classList.toggle("active", emailOpen);
    if (dom.settingsBtn) dom.settingsBtn.classList.toggle("active", settingsOpen);
    if (dom.contactViewBtn) dom.contactViewBtn.classList.toggle("active", !emailOpen && !settingsOpen);
    if (dom.mainPageEl) dom.mainPageEl.classList.toggle("header-only", emailOpen || settingsOpen);
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
    if (dom.messageTemplateInput) dom.messageTemplateInput.value = state.settings.messageTemplate || "";
    if (dom.noteTemplateInput) dom.noteTemplateInput.value = state.settings.noteTemplate || "";
    if (dom.rowFilterInput) dom.rowFilterInput.value = state.settings.rowFilterWord || "";
    renderColumnChecks();
  }

  function openSettings() {
    if (!dom.settingsPageEl || !dom.settingsPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
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
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
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

  function toggleEmailSettings() {
    if (dom.emailTemplatesPageEl?.hidden) {
      openEmailSettings();
      return;
    }
    closeEmailSettings();
  }

  function openContactsView() {
    closeEmailSettings();
    closeSettings();
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

  function normalizeImportedTemplate(item) {
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

  function parseImportedTemplates(text) {
    let payload;
    try {
      payload = JSON.parse(String(text || ""));
    } catch (_error) {
      throw new Error("Invalid JSON file.");
    }

    const source = Array.isArray(payload) ? payload : Array.isArray(payload?.templates) ? payload.templates : null;
    if (!source) {
      throw new Error("Invalid import format. Expected a templates array.");
    }

    const templates = source.map(normalizeImportedTemplate).filter(Boolean);
    if (!templates.length) {
      throw new Error("No valid templates found in the selected file.");
    }

    return templates;
  }

  function renderTemplateImportList() {
    if (!dom.templateImportListEl) return;
    if (!pendingImportTemplates.length) {
      dom.templateImportListEl.innerHTML = "<div class='notes-empty'>No templates to import.</div>";
      return;
    }

    dom.templateImportListEl.innerHTML = pendingImportTemplates
      .map((template, index) => {
        const subjectPreview = template.subject || "No subject";
        return `
          <label class='template-import-item'>
            <input type='checkbox' data-import-index='${index}' checked />
            <span class='template-import-item-title'>${App.escapeHtml(template.name)}</span>
            <span class='template-import-item-meta'>${App.escapeHtml(subjectPreview.slice(0, 90))}</span>
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
    if (dom.templateImportOverlay) dom.templateImportOverlay.classList.remove("open");
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
    const next = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({ ...template }));
    const nameToIndex = new Map(next.map((template, index) => [normalizeNameKey(template.name), index]));

    let added = 0;
    let replaced = 0;
    let skipped = 0;

    for (const index of selectedIndices) {
      const incoming = pendingImportTemplates[index];
      if (!incoming) {
        skipped += 1;
        continue;
      }

      const key = normalizeNameKey(incoming.name);
      const matchIndex = mode === "replace" ? nameToIndex.get(key) : undefined;
      if (mode === "replace" && Number.isInteger(matchIndex)) {
        const current = next[matchIndex];
        next[matchIndex] = {
          ...current,
          name: incoming.name,
          subject: incoming.subject,
          body: incoming.body
        };
        replaced += 1;
        continue;
      }

      const created = {
        id: App.makeTemplateId(),
        name: incoming.name,
        subject: incoming.subject,
        body: incoming.body
      };
      next.push(created);
      nameToIndex.set(key, next.length - 1);
      added += 1;
    }

    const normalized = App.normalizeEmailTemplates(next);
    state.settings = {
      ...state.settings,
      emailTemplates: normalized
    };
    await chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: normalized });

    if (!dom.emailTemplatesPageEl?.hidden) {
      App.loadEmailTemplatesDraftFromSettings();
      App.renderEmailTemplatesPage();
    }

    closeTemplateImportReview();
    const summary = `Imported templates: ${added} added, ${replaced} replaced, ${skipped} skipped.`;
    if (typeof App.showToast === "function") App.showToast(summary, 2800);
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
    const templates = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      subject: String(template.subject || "").trim(),
      body: String(template.body || "").trim()
    }));

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      templates
    };

    downloadJson(buildExportFileName(), payload);
    if (typeof App.showToast === "function") App.showToast(`Exported ${templates.length} template(s).`);
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
      chrome.storage.local.get(constants.EMAIL_TEMPLATES_LOCAL_KEY)
    ]);
    const saved = syncResult[constants.SETTINGS_KEY];
    const {
      defaultEmailTemplateId: _legacyDefaultId,
      emailTemplates: legacySyncTemplates,
      ...savedWithoutLegacy
    } = saved || {};
    const localTemplates = localResult[constants.EMAIL_TEMPLATES_LOCAL_KEY];
    const hasLocalTemplates = Array.isArray(localTemplates);
    const emailTemplates = App.normalizeEmailTemplates(hasLocalTemplates ? localTemplates : legacySyncTemplates);
    state.settings = {
      ...constants.DEFAULT_SETTINGS,
      ...savedWithoutLegacy,
      visibleColumns: {
        ...constants.DEFAULT_SETTINGS.visibleColumns,
        ...(savedWithoutLegacy.visibleColumns || {})
      },
      emailTemplates
    };
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);
    App.applyTheme(state.settings.themeMode);

    const needsSyncCleanup =
      (saved && (Object.prototype.hasOwnProperty.call(saved, "emailTemplates") || Object.prototype.hasOwnProperty.call(saved, "defaultEmailTemplateId"))) ||
      state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT;
    const writes = [];

    if (!hasLocalTemplates && Array.isArray(legacySyncTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: emailTemplates }));
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
    const hasVisible = Object.values(next.visibleColumns).some(Boolean);
    if (!hasVisible) {
      App.setStatus("Enable at least one column.");
      return;
    }

    state.settings = { ...state.settings, ...next };
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);
    await persistSyncSettings(state.settings);
    closeSettings();
    App.renderContacts();
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
    syncTopLevelViewState,
    openEmailSettings,
    closeEmailSettings,
    toggleEmailSettings,
    openContactsView,
    buildSyncSettingsPayload,
    persistSyncSettings,
    saveEmailSettings,
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
