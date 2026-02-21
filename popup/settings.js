(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;

  function buildSyncSettingsPayload(settingsInput = state.settings) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
    const { emailTemplates: _ignoreTemplates, ...syncSafeSettings } = source;
    return syncSafeSettings;
  }

  async function persistSyncSettings(settingsInput = state.settings) {
    const syncSafeSettings = buildSyncSettingsPayload(settingsInput);
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: syncSafeSettings });
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
    fillSettingsForm();
    dom.settingsOverlay.classList.add("open");
  }

  function closeSettings() {
    dom.settingsOverlay.classList.remove("open");
  }

  function setEmailTemplatesMode(isOpen) {
    if (dom.emailSettingsBtn) dom.emailSettingsBtn.classList.toggle("active", !!isOpen);
    if (dom.contactViewBtn) dom.contactViewBtn.classList.toggle("active", !isOpen);
    if (dom.mainPageEl) dom.mainPageEl.classList.toggle("header-only", !!isOpen);
    if (dom.emailTemplatesPageEl) dom.emailTemplatesPageEl.hidden = !isOpen;
    App.updateStickyHeadOffset();
  }

  function openEmailSettings() {
    if (!dom.emailTemplatesPageEl || !dom.emailTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
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
    if (!dom.emailTemplatesPageEl || dom.emailTemplatesPageEl.hidden) return;
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
    setEmailTemplatesMode,
    openEmailSettings,
    closeEmailSettings,
    toggleEmailSettings,
    buildSyncSettingsPayload,
    persistSyncSettings,
    saveEmailSettings,
    loadSettings,
    saveSettings
  });
})();
