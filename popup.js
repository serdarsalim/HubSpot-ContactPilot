(() => {
  const App = window.PopupApp;
  const { dom, state } = App;

  dom.settingsBtn.addEventListener("click", App.toggleSettings);
  if (dom.themeToggleBtn) dom.themeToggleBtn.addEventListener("click", App.toggleTheme);
  if (dom.popOutBtn) {
    dom.popOutBtn.addEventListener("click", () => {
      void App.openDetachedPopupWindow();
    });
  }
  if (dom.contactViewBtn) dom.contactViewBtn.addEventListener("click", App.openContactsView);
  if (dom.emailSettingsBtn) dom.emailSettingsBtn.addEventListener("click", App.toggleEmailSettings);
  if (dom.whatsappSettingsBtn) dom.whatsappSettingsBtn.addEventListener("click", App.toggleWhatsappSettings);
  if (dom.noteSettingsBtn) dom.noteSettingsBtn.addEventListener("click", App.toggleNoteSettings);
  if (typeof App.bindSettingsAutosave === "function") App.bindSettingsAutosave();
  if (dom.addCloudAuthBtn) dom.addCloudAuthBtn.addEventListener("click", App.addCloudAuthRow);
  if (dom.cloudAuthCardsEl) {
    dom.cloudAuthCardsEl.addEventListener("click", (event) => {
      void App.onCloudAuthCardsClick(event);
    });
    dom.cloudAuthCardsEl.addEventListener("input", App.onCloudAuthCardsInput);
  }
  if (dom.cloudTokenInfoBtn) dom.cloudTokenInfoBtn.addEventListener("click", App.openCloudTokenInfoDialog);

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
  if (dom.countryPrefixPromptOverlay) {
    dom.countryPrefixPromptOverlay.addEventListener("click", (event) => {
      if (event.target === dom.countryPrefixPromptOverlay) App.closeCountryPrefixPromptDialog(null);
    });
  }

  if (dom.templateImportOverlay) {
    dom.templateImportOverlay.addEventListener("click", (event) => {
      if (event.target === dom.templateImportOverlay) App.closeTemplateImportReview();
    });
  }
  if (dom.cloudTokenInfoOverlay) {
    dom.cloudTokenInfoOverlay.addEventListener("click", (event) => {
      if (event.target === dom.cloudTokenInfoOverlay) App.closeCloudTokenInfoDialog();
    });
  }

  if (dom.cancelEmailTemplatePickBtn) dom.cancelEmailTemplatePickBtn.addEventListener("click", App.closeEmailTemplatePicker);
  if (dom.cancelWhatsappTemplatePickBtn) dom.cancelWhatsappTemplatePickBtn.addEventListener("click", App.closeWhatsappTemplatePicker);
  if (dom.recordIdRequiredCloseBtn) dom.recordIdRequiredCloseBtn.addEventListener("click", App.closeRecordIdRequiredDialog);
  if (dom.countryPrefixPromptCancelBtn) dom.countryPrefixPromptCancelBtn.addEventListener("click", () => App.closeCountryPrefixPromptDialog(null));
  if (dom.countryPrefixPromptSaveBtn) dom.countryPrefixPromptSaveBtn.addEventListener("click", App.submitCountryPrefixPromptDialog);
  if (dom.emailTemplatePickSearchInput) {
    dom.emailTemplatePickSearchInput.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.emailTemplatePickState.query = String(target.value || "");
      App.renderEmailTemplatePickerOptions();
    });
  }
  if (dom.cancelTemplateImportBtn) dom.cancelTemplateImportBtn.addEventListener("click", App.closeTemplateImportReview);
  if (dom.cloudTokenInfoCloseBtn) dom.cloudTokenInfoCloseBtn.addEventListener("click", App.closeCloudTokenInfoDialog);
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
      const templateSource =
        typeof App.getMergedEmailTemplates === "function"
          ? App.getMergedEmailTemplates()
          : App.normalizeEmailTemplates(state.settings.emailTemplates);
      const template = templateSource.find((item) => item.id === templateId) || null;
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
      const templateSource =
        typeof App.getMergedWhatsappTemplates === "function"
          ? App.getMergedWhatsappTemplates()
          : App.normalizeWhatsappTemplates(state.settings.whatsappTemplates);
      const template = templateSource.find((item) => item.id === templateId) || null;
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

  dom.refreshBtn.addEventListener("click", async () => {
    const state = App.state || {};
    const settings = state.settings || {};

    try {
      const resolved = await App.findBestContactsTab({
        countryPrefix: settings.countryPrefix,
        messageText: settings.messageTemplate
      });

      if (resolved?.tab && App.isValidContactsPayload(resolved?.probeResponse)) {
        await App.loadContacts({ loadAll: true, sourceTab: resolved.tab });
        return;
      }

      App.setStatus("Refreshing HubSpot contacts tab...");
      const refreshedTab = await App.refreshHubSpotContactsSourceTab({
        countryPrefix: settings.countryPrefix,
        messageText: settings.messageTemplate
      });
      if (!refreshedTab || typeof refreshedTab.id !== "number") {
        App.setStatus("Open a HubSpot contacts tab, refresh the page, and try again.");
        return;
      }

      await App.loadContacts({ loadAll: true, sourceTab: refreshedTab });
    } catch (_error) {
      App.setStatus("Refreshing HubSpot contacts tab...");
      const refreshedTab = await App.refreshHubSpotContactsSourceTab({
        countryPrefix: settings.countryPrefix,
        messageText: settings.messageTemplate
      });
      if (!refreshedTab || typeof refreshedTab.id !== "number") {
        App.setStatus("Open a HubSpot contacts tab, refresh the page, and try again.");
        return;
      }
      await App.loadContacts({ loadAll: true, sourceTab: refreshedTab });
    }
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
    if (typeof App.restoreSelectedKeysFromSession === "function") {
      await App.restoreSelectedKeysFromSession();
    }
    await App.loadSettings();
    if (typeof App.refreshCloudTemplatesSessionCheck === "function") {
      void App.refreshCloudTemplatesSessionCheck();
    }
    await App.loadContacts({ loadAll: true });
    App.updateStickyHeadOffset();
  }

  void init();
})();
