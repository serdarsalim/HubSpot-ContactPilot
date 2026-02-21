(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;

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

  function openEmailSettings() {
    App.closeEmailTemplatePicker();
    if (dom.mainPageEl) dom.mainPageEl.hidden = true;
    if (dom.emailTemplatesPageEl) dom.emailTemplatesPageEl.hidden = false;
    App.loadEmailTemplatesDraftFromSettings();
    App.renderEmailTemplatesPage();
    if (typeof App.ensureEmailBodyEditor === "function") {
      void App.ensureEmailBodyEditor().then(() => {
        App.renderActiveEmailTemplateEditor();
      });
    }
  }

  function closeEmailSettings() {
    if (dom.emailTemplatesPageEl) dom.emailTemplatesPageEl.hidden = true;
    if (dom.mainPageEl) dom.mainPageEl.hidden = false;
    App.updateStickyHeadOffset();
  }

  async function saveEmailSettings() {
    const next = App.normalizeEmailTemplates(state.emailTemplatesDraft);
    state.settings = {
      ...state.settings,
      emailTemplates: next
    };
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: state.settings });
    closeEmailSettings();
    App.setStatus("Email templates saved.");
  }

  async function loadSettings() {
    const result = await chrome.storage.sync.get(constants.SETTINGS_KEY);
    const saved = result[constants.SETTINGS_KEY];
    const { defaultEmailTemplateId: _legacyDefaultId, ...savedWithoutLegacyDefault } = saved || {};

    const emailTemplates = App.normalizeEmailTemplates(savedWithoutLegacyDefault?.emailTemplates);
    state.settings = {
      ...constants.DEFAULT_SETTINGS,
      ...savedWithoutLegacyDefault,
      visibleColumns: {
        ...constants.DEFAULT_SETTINGS.visibleColumns,
        ...(savedWithoutLegacyDefault.visibleColumns || {})
      },
      emailTemplates
    };

    if (state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT) {
      state.settings.noteTemplate = "";
      await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: state.settings });
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
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: state.settings });
    closeSettings();
    App.renderContacts();
  }

  Object.assign(App, {
    renderColumnChecks,
    settingsFromForm,
    fillSettingsForm,
    openSettings,
    closeSettings,
    openEmailSettings,
    closeEmailSettings,
    saveEmailSettings,
    loadSettings,
    saveSettings
  });
})();
