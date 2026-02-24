(() => {
  const App = window.PopupApp;
  const { dom, state } = App;

  dom.settingsBtn.addEventListener("click", App.toggleSettings);
  if (dom.themeToggleBtn) dom.themeToggleBtn.addEventListener("click", App.toggleTheme);
  if (dom.contactViewBtn) dom.contactViewBtn.addEventListener("click", App.openContactsView);
  if (dom.activeTabBtn) dom.activeTabBtn.addEventListener("click", App.toggleActiveTab);
  if (dom.emailSettingsBtn) dom.emailSettingsBtn.addEventListener("click", App.toggleEmailSettings);
  if (dom.whatsappSettingsBtn) dom.whatsappSettingsBtn.addEventListener("click", App.toggleWhatsappSettings);
  if (dom.noteSettingsBtn) dom.noteSettingsBtn.addEventListener("click", App.toggleNoteSettings);
  dom.cancelSettingsBtn.addEventListener("click", App.closeSettings);
  dom.saveSettingsBtn.addEventListener("click", App.saveSettings);

  if (dom.addEmailTemplateBtn) {
    dom.addEmailTemplateBtn.addEventListener("click", App.addEmailTemplateDraft);
  }

  if (dom.emailTemplatesListEl) {
    dom.emailTemplatesListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowButton = target.closest("[data-template-id]");
      if (!(rowButton instanceof HTMLElement)) return;
      const templateId = String(rowButton.getAttribute("data-template-id") || "");
      if (!templateId) return;
      state.activeEmailTemplateId = templateId;
      App.renderEmailTemplatesPage();
    });
  }

  if (dom.addWhatsappTemplateBtn) {
    dom.addWhatsappTemplateBtn.addEventListener("click", App.addWhatsappTemplateDraft);
  }

  if (dom.whatsappTemplatesListEl) {
    dom.whatsappTemplatesListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowButton = target.closest("[data-template-id]");
      if (!(rowButton instanceof HTMLElement)) return;
      const templateId = String(rowButton.getAttribute("data-template-id") || "");
      if (!templateId) return;
      state.activeWhatsappTemplateId = templateId;
      App.renderWhatsappTemplatesPage();
    });
  }

  if (dom.addNoteTemplateBtn) {
    dom.addNoteTemplateBtn.addEventListener("click", App.addNoteTemplateDraft);
  }

  if (dom.noteTemplatesListEl) {
    dom.noteTemplatesListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowButton = target.closest("[data-template-id]");
      if (!(rowButton instanceof HTMLElement)) return;
      const templateId = String(rowButton.getAttribute("data-template-id") || "");
      if (!templateId) return;
      state.activeNoteTemplateId = templateId;
      App.renderNoteTemplatesPage();
    });
  }

  if (dom.exportTemplatesBtn) dom.exportTemplatesBtn.addEventListener("click", App.exportPersonalTemplates);
  if (dom.importTemplatesBtn) dom.importTemplatesBtn.addEventListener("click", App.triggerImportTemplatesPicker);
  if (dom.importTemplatesInput) dom.importTemplatesInput.addEventListener("change", (event) => void App.onImportTemplatesInputChange(event));

  if (dom.emailTemplatePickOverlay) {
    dom.emailTemplatePickOverlay.addEventListener("click", (event) => {
      if (event.target === dom.emailTemplatePickOverlay) App.closeEmailTemplatePicker();
    });
  }

  if (dom.whatsappTemplatePickOverlay) {
    dom.whatsappTemplatePickOverlay.addEventListener("click", (event) => {
      if (event.target === dom.whatsappTemplatePickOverlay) App.closeWhatsappTemplatePicker();
    });
  }

  if (dom.recordIdRequiredOverlay) {
    dom.recordIdRequiredOverlay.addEventListener("click", (event) => {
      if (event.target === dom.recordIdRequiredOverlay) App.closeRecordIdRequiredDialog();
    });
  }

  if (dom.templateImportOverlay) {
    dom.templateImportOverlay.addEventListener("click", (event) => {
      if (event.target === dom.templateImportOverlay) App.closeTemplateImportReview();
    });
  }

  if (dom.cancelEmailTemplatePickBtn) dom.cancelEmailTemplatePickBtn.addEventListener("click", App.closeEmailTemplatePicker);
  if (dom.cancelWhatsappTemplatePickBtn) dom.cancelWhatsappTemplatePickBtn.addEventListener("click", App.closeWhatsappTemplatePicker);
  if (dom.recordIdRequiredCloseBtn) dom.recordIdRequiredCloseBtn.addEventListener("click", App.closeRecordIdRequiredDialog);
  if (dom.emailTemplatePickSearchInput) {
    dom.emailTemplatePickSearchInput.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.emailTemplatePickState.query = String(target.value || "");
      App.renderEmailTemplatePickerOptions();
    });
  }
  if (dom.cancelTemplateImportBtn) dom.cancelTemplateImportBtn.addEventListener("click", App.closeTemplateImportReview);
  if (dom.applyTemplateImportBtn) dom.applyTemplateImportBtn.addEventListener("click", () => void App.applyTemplateImport());
  if (dom.whatsappTemplatePickSearchInput) {
    dom.whatsappTemplatePickSearchInput.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.whatsappTemplatePickState.query = String(target.value || "");
      App.renderWhatsappTemplatePickerOptions();
    });
  }
  if (dom.contactsSearchInput) {
    dom.contactsSearchInput.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.contactsSearchQuery = String(target.value || "");
      App.renderContacts();
    });
  }

  if (dom.emailTemplatePickList) {
    dom.emailTemplatePickList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-template-id]");
      if (!(button instanceof HTMLElement)) return;

      const templateId = String(button.getAttribute("data-template-id") || "");
      if (!templateId) return;
      const template = App.normalizeEmailTemplates(state.settings.emailTemplates).find((item) => item.id === templateId) || null;
      const contact = state.emailTemplatePickState.contact;
      const key = state.emailTemplatePickState.key;
      App.closeEmailTemplatePicker();
      void App.applyEmailTemplateToContact(contact, key, template);
    });
  }

  if (dom.whatsappTemplatePickList) {
    dom.whatsappTemplatePickList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-template-id]");
      if (!(button instanceof HTMLElement)) return;

      const templateId = String(button.getAttribute("data-template-id") || "");
      if (!templateId) return;
      const template = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates).find((item) => item.id === templateId) || null;
      const contact = state.whatsappTemplatePickState.contact;
      const key = state.whatsappTemplatePickState.key;
      App.closeWhatsappTemplatePicker();
      void App.applyWhatsappTemplateToContact(contact, key, template);
    });
  }

  if (dom.deleteEmailTemplateBtn) dom.deleteEmailTemplateBtn.addEventListener("click", App.deleteActiveEmailTemplateDraft);
  if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.addEventListener("input", App.upsertActiveTemplateFromForm);
  if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.addEventListener("input", App.upsertActiveTemplateFromForm);
  if (dom.emailTemplateBodyInput) dom.emailTemplateBodyInput.addEventListener("input", App.upsertActiveTemplateFromForm);
  if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.addEventListener("blur", () => void App.flushEmailTemplateAutosave({ showToast: false }));
  if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.addEventListener("blur", () => void App.flushEmailTemplateAutosave({ showToast: false }));
  if (dom.deleteWhatsappTemplateBtn) dom.deleteWhatsappTemplateBtn.addEventListener("click", App.deleteActiveWhatsappTemplateDraft);
  if (dom.whatsappTemplateNameInput) dom.whatsappTemplateNameInput.addEventListener("input", App.upsertActiveWhatsappTemplateFromForm);
  if (dom.whatsappTemplateBodyInput) dom.whatsappTemplateBodyInput.addEventListener("input", App.upsertActiveWhatsappTemplateFromForm);
  if (dom.whatsappTemplateNameInput)
    dom.whatsappTemplateNameInput.addEventListener("blur", () => void App.flushWhatsappTemplateAutosave({ showToast: false }));
  if (dom.whatsappTemplateBodyInput)
    dom.whatsappTemplateBodyInput.addEventListener("blur", () => void App.flushWhatsappTemplateAutosave({ showToast: false }));
  if (dom.deleteNoteTemplateBtn) dom.deleteNoteTemplateBtn.addEventListener("click", App.deleteActiveNoteTemplateDraft);
  if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.addEventListener("input", App.upsertActiveNoteTemplateFromForm);
  if (dom.noteTemplateBodyInput) dom.noteTemplateBodyInput.addEventListener("input", App.upsertActiveNoteTemplateFromForm);
  if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.addEventListener("blur", () => void App.flushNoteTemplateAutosave({ showToast: false }));
  if (dom.noteTemplateBodyInput) dom.noteTemplateBodyInput.addEventListener("blur", () => void App.flushNoteTemplateAutosave({ showToast: false }));

  if (dom.notesOverlay) {
    dom.notesOverlay.addEventListener("click", (event) => {
      if (event.target === dom.notesOverlay) App.closeNotesDialog();
    });
  }
  if (dom.notesTemplateSelect) {
    dom.notesTemplateSelect.addEventListener("change", App.applySelectedNoteTemplateToInput);
  }

  window.addEventListener("resize", App.updateStickyHeadOffset);
  if (dom.closeNotesBtn) dom.closeNotesBtn.addEventListener("click", App.closeNotesDialog);
  if (dom.cancelNotesBtn) dom.cancelNotesBtn.addEventListener("click", App.closeNotesDialog);
  if (dom.saveNoteBtn) {
    dom.saveNoteBtn.addEventListener("click", () => {
      void App.saveNoteFromDialog();
    });
  }

  dom.refreshBtn.addEventListener("click", () => {
    void App.loadContacts({ loadAll: true });
  });
  if (dom.copyEmailBtn) {
    dom.copyEmailBtn.addEventListener("click", () => {
      void App.copyEmailSelected();
    });
  }
  if (dom.activeTabRefreshBtn) {
    dom.activeTabRefreshBtn.addEventListener("click", () => {
      void App.loadActiveTabContext();
    });
  }

  async function init() {
    if (typeof App.initAnalytics === "function") {
      await App.initAnalytics();
    }
    await App.loadSettings();
    await App.loadContacts({ loadAll: true });
    App.updateStickyHeadOffset();
  }

  void init();
})();
