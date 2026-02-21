(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const MT = App.messageTypes;
  const timing = App.timing.popup;

  function loadEmailTemplatesDraftFromSettings() {
    const normalized = App.normalizeEmailTemplates(state.settings.emailTemplates);
    state.emailTemplatesDraft = normalized.map((template) => ({ ...template }));
    state.activeEmailTemplateId = state.emailTemplatesDraft[0]?.id || "";
  }

  function getActiveEmailTemplateDraft() {
    return state.emailTemplatesDraft.find((template) => template.id === state.activeEmailTemplateId) || null;
  }

  function renderEmailTemplatesList() {
    if (!dom.emailTemplatesListEl) return;
    if (!state.emailTemplatesDraft.length) {
      dom.emailTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }

    dom.emailTemplatesListEl.innerHTML = state.emailTemplatesDraft
      .map((template) => {
        const activeClass = template.id === state.activeEmailTemplateId ? "active" : "";
        const summary = String(template.subject || template.body || "").trim();
        return `
        <button type='button' class='email-template-list-btn ${activeClass}' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
          <span class='email-template-list-meta'>${App.escapeHtml(summary.slice(0, 52) || "No subject/body yet")}</span>
        </button>
      `;
      })
      .join("");
  }

  function renderActiveEmailTemplateEditor() {
    const active = getActiveEmailTemplateDraft();
    const hasActive = !!active;

    if (dom.emailTemplateEmptyEl) dom.emailTemplateEmptyEl.hidden = hasActive;
    if (dom.emailTemplateEditorEl) dom.emailTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) return;

    state.syncingEmailTemplateForm = true;
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.value = active.name || "";
    if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.value = active.subject || "";
    if (dom.emailTemplateBodyInput) dom.emailTemplateBodyInput.value = active.body || "";
    state.syncingEmailTemplateForm = false;
  }

  function renderEmailTemplatesPage() {
    renderEmailTemplatesList();
    renderActiveEmailTemplateEditor();
  }

  function upsertActiveTemplateFromForm() {
    if (state.syncingEmailTemplateForm) return;
    const active = getActiveEmailTemplateDraft();
    if (!active) return;

    active.name = String(dom.emailTemplateNameInput?.value || "").trim() || "Untitled";
    active.subject = String(dom.emailTemplateSubjectInput?.value || "").trim();
    active.body = String(dom.emailTemplateBodyInput?.value || "").trim();
    renderEmailTemplatesList();
  }

  function addEmailTemplateDraft() {
    const nextTemplate = {
      id: App.makeTemplateId(),
      name: `Template ${state.emailTemplatesDraft.length + 1}`,
      subject: "",
      body: ""
    };
    state.emailTemplatesDraft = [...state.emailTemplatesDraft, nextTemplate];
    state.activeEmailTemplateId = nextTemplate.id;
    renderEmailTemplatesPage();
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.focus();
  }

  function deleteActiveEmailTemplateDraft() {
    if (!state.activeEmailTemplateId) return;
    state.emailTemplatesDraft = state.emailTemplatesDraft.filter((template) => template.id !== state.activeEmailTemplateId);
    if (!state.emailTemplatesDraft.length) {
      state.emailTemplatesDraft = [{ ...constants.DEFAULT_EMAIL_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeEmailTemplateId = state.emailTemplatesDraft[0].id;
    renderEmailTemplatesPage();
  }

  function renderEmailTemplatePickerOptions() {
    if (!dom.emailTemplatePickList) return;
    const templates = App.normalizeEmailTemplates(state.settings.emailTemplates);
    if (!templates.length) {
      dom.emailTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates found. Add one via the email icon.</div>";
      return;
    }

    dom.emailTemplatePickList.innerHTML = templates
      .map((template) => {
        const preview = String(template.subject || template.body || "").trim();
        return `
        <button type='button' class='email-template-pick-item' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-pick-name'>${App.escapeHtml(template.name || "Untitled")}</span>
          <span class='email-template-pick-preview'>${App.escapeHtml(preview.slice(0, 90) || "No subject/body yet")}</span>
        </button>
      `;
      })
      .join("");
  }

  function openEmailTemplatePicker(contact, key) {
    if (!dom.emailTemplatePickOverlay) return;
    state.emailTemplatePickState = {
      key: String(key || ""),
      contact: contact || null
    };
    if (dom.emailTemplatePickTitle) {
      dom.emailTemplatePickTitle.textContent = `Select Template - ${App.getContactDisplayName(contact)}`;
    }
    renderEmailTemplatePickerOptions();
    dom.emailTemplatePickOverlay.classList.add("open");
  }

  function closeEmailTemplatePicker() {
    if (dom.emailTemplatePickOverlay) dom.emailTemplatePickOverlay.classList.remove("open");
    state.emailTemplatePickState = { key: "", contact: null };
  }

  async function applyEmailTemplateToContact(contact, key, template) {
    if (!contact) return;
    if (!template) {
      App.setStatus("No email template found. Add one via the email icon.");
      return;
    }

    const recordId = App.getRecordIdForContact(contact);
    const contactUrl = App.buildContactUrl(recordId, state.currentPortalId);
    if (!contactUrl) {
      App.setStatus("Could not open contact. Missing Record ID or Portal ID.");
      return;
    }

    const tokens = App.getContactTokenMap(contact);
    const subject = App.applyTokens(template.subject, tokens).trim();
    const body = App.applyTokens(template.body, tokens).trim();
    if (!subject && !body) {
      App.setStatus(`Template "${template.name}" is empty.`);
      return;
    }

    const resolvedKey = String(key || App.contactKey(contact));
    state.selectedKeys = new Set([resolvedKey]);
    App.renderContacts();
    App.setStatus(`Opening ${App.getContactDisplayName(contact)} and applying "${template.name}"...`);

    try {
      const tab = await chrome.tabs.create({ url: contactUrl, active: true });
      if (!tab || typeof tab.id !== "number") {
        App.setStatus("Could not open HubSpot contact tab.");
        return;
      }

      await App.waitForTabComplete(tab.id);
      await App.sleep(timing.emailComposerReadyDelayMs);

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: MT.OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE,
        subject,
        body
      });

      if (!response?.ok) {
        App.setStatus(response?.error || "Opened contact, but could not apply email template.");
        return;
      }

      App.setStatus(`Applied "${template.name}" for ${App.getContactDisplayName(contact)}.`);
    } catch (_error) {
      App.setStatus("Could not apply email template on HubSpot tab.");
    }
  }

  Object.assign(App, {
    loadEmailTemplatesDraftFromSettings,
    getActiveEmailTemplateDraft,
    renderEmailTemplatesList,
    renderActiveEmailTemplateEditor,
    renderEmailTemplatesPage,
    upsertActiveTemplateFromForm,
    addEmailTemplateDraft,
    deleteActiveEmailTemplateDraft,
    renderEmailTemplatePickerOptions,
    openEmailTemplatePicker,
    closeEmailTemplatePicker,
    applyEmailTemplateToContact
  });
})();
