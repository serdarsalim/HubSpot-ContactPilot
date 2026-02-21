(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const MT = App.messageTypes;
  const timing = App.timing.popup;
  const BODY_EDITOR_ID = "emailTemplateBodyInput";
  const TINYMCE_TOOLBAR_ORDER = [
    "blocks",
    "bold italic underline strikethrough",
    "bullist numlist",
    "forecolor backcolor",
    "alignleft aligncenter alignright",
    "removeformat",
    "undo redo"
  ].join(" | ");
  const AUTOSAVE_DELAY_MS = 1000;
  let emailBodyEditorInitPromise = null;
  let tinyEditorUnavailable = false;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";

  function htmlToPlainText(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (!/<[a-z][\s\S]*>/i.test(raw)) {
      return raw
        .replace(/\r\n/g, "\n")
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n")
        .trim();
    }

    const node = document.createElement("div");
    node.innerHTML = raw;
    return String(node.textContent || "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
  }

  function templatePreviewText(template) {
    return String(template?.subject || "").trim() || htmlToPlainText(template?.body);
  }

  function toEditorHtml(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return App.escapeHtml(raw).replace(/\n/g, "<br>");
  }

  function getTinyEmailBodyEditor() {
    const tiny = window.tinymce;
    if (!tiny || typeof tiny.get !== "function") return null;
    return tiny.get(BODY_EDITOR_ID) || null;
  }

  function setEmailTemplateSaveState(stateKey, text) {
    if (!dom.emailTemplateSaveStateEl) return;
    dom.emailTemplateSaveStateEl.dataset.state = String(stateKey || "saved");
    dom.emailTemplateSaveStateEl.textContent = String(text || "Saved");
  }

  function getEmailTemplateDraftSignature() {
    return JSON.stringify(App.normalizeEmailTemplates(state.emailTemplatesDraft));
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
    try {
      return JSON.stringify(error);
    } catch (_stringifyError) {
      return String(error);
    }
  }

  async function saveEmailTemplateDraftNow(force = false) {
    if (autosaveInFlight) {
      autosaveQueued = true;
      return false;
    }

    const signatureBefore = getEmailTemplateDraftSignature();
    if (!force && signatureBefore === lastSavedDraftSignature) {
      setEmailTemplateSaveState("saved", "Saved");
      return true;
    }

    autosaveInFlight = true;
    setEmailTemplateSaveState("saving", "Saving...");

    try {
      await App.saveEmailSettings({ showToast: false });
      lastSavedDraftSignature = getEmailTemplateDraftSignature();
      setEmailTemplateSaveState("saved", "Saved");
      return true;
    } catch (error) {
      const reason = getErrorMessage(error).replace(/\s+/g, " ").trim();
      setEmailTemplateSaveState("error", "Save failed");
      App.setStatus(`Template save failed: ${reason || "Unknown error."}`);
      if (typeof App.showToast === "function") {
        App.showToast(`Save failed: ${reason || "Unknown error."}`, 3200);
      }
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("Template autosave failed", error);
      }
      return false;
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        void saveEmailTemplateDraftNow();
      }
    }
  }

  function scheduleEmailTemplateAutosave() {
    const signature = getEmailTemplateDraftSignature();
    if (signature === lastSavedDraftSignature) {
      setEmailTemplateSaveState("saved", "Saved");
      return;
    }

    setEmailTemplateSaveState("saving", "Saving...");
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      void saveEmailTemplateDraftNow();
    }, AUTOSAVE_DELAY_MS);
  }

  async function flushEmailTemplateAutosave(_options = {}) {
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    return saveEmailTemplateDraftNow(true);
  }

  function readEmailBodyValueFromForm() {
    const editor = getTinyEmailBodyEditor();
    if (editor) {
      const text = String(editor.getContent({ format: "text" }) || "").trim();
      if (!text) return "";
      const html = String(editor.getContent({ format: "html" }) || "").trim();
      return html;
    }
    return String(dom.emailTemplateBodyInput?.value || "").trim();
  }

  function writeEmailBodyValueToForm(value) {
    const next = String(value || "");
    const editor = getTinyEmailBodyEditor();
    if (editor) {
      const nextHtml = toEditorHtml(next);
      const currentHtml = String(editor.getContent({ format: "html" }) || "").trim();
      if (currentHtml !== nextHtml.trim()) {
        editor.setContent(nextHtml);
      }
      return;
    }
    if (dom.emailTemplateBodyInput) {
      dom.emailTemplateBodyInput.value = next;
    }
  }

  function ensureEmailBodyEditor() {
    if (tinyEditorUnavailable) return Promise.resolve(null);
    const tiny = window.tinymce;
    if (!tiny || typeof tiny.init !== "function") {
      tinyEditorUnavailable = true;
      App.setStatus("TinyMCE is unavailable. Falling back to plain text body editor.");
      return Promise.resolve(null);
    }

    const existing = getTinyEmailBodyEditor();
    if (existing) return Promise.resolve(existing);
    if (emailBodyEditorInitPromise) return emailBodyEditorInitPromise;

    emailBodyEditorInitPromise = tiny
      .init({
        selector: `#${BODY_EDITOR_ID}`,
        license_key: "gpl",
        menubar: false,
        statusbar: false,
        branding: false,
        promotion: false,
        resize: false,
        plugins: "lists",
        toolbar: TINYMCE_TOOLBAR_ORDER,
        skin: "oxide",
        content_css: "default",
        setup(editor) {
          editor.on("change input undo redo keyup", () => {
            if (state.syncingEmailTemplateForm) return;
            upsertActiveTemplateFromForm();
          });
          editor.on("blur", () => {
            void flushEmailTemplateAutosave({ showToast: false });
          });
        }
      })
      .then((editors) => {
        const editor = Array.isArray(editors) ? editors[0] || null : null;
        emailBodyEditorInitPromise = null;
        return editor;
      })
      .catch(() => {
        tinyEditorUnavailable = true;
        emailBodyEditorInitPromise = null;
        App.setStatus("Could not initialize TinyMCE. Falling back to plain text body editor.");
        return null;
      });

    return emailBodyEditorInitPromise;
  }

  function loadEmailTemplatesDraftFromSettings() {
    const normalized = App.normalizeEmailTemplates(state.settings.emailTemplates);
    state.emailTemplatesDraft = normalized.map((template) => ({ ...template }));
    state.activeEmailTemplateId = state.emailTemplatesDraft[0]?.id || "";
    lastSavedDraftSignature = getEmailTemplateDraftSignature();
    setEmailTemplateSaveState("saved", "Saved");
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
        const summary = templatePreviewText(template);
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
    writeEmailBodyValueToForm(active.body || "");
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
    active.body = readEmailBodyValueFromForm();
    renderEmailTemplatesList();
    scheduleEmailTemplateAutosave();
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
    scheduleEmailTemplateAutosave();
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
    scheduleEmailTemplateAutosave();
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
        const preview = templatePreviewText(template);
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
    const escapedHtmlTokens = Object.fromEntries(Object.entries(tokens).map(([tokenKey, tokenValue]) => [tokenKey, App.escapeHtml(tokenValue)]));
    const subject = App.applyTokens(template.subject, tokens).trim();
    const bodyHtml = App.applyTokens(template.body, escapedHtmlTokens).trim();
    const body = htmlToPlainText(bodyHtml);
    if (!subject && !body && !bodyHtml) {
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
        body,
        bodyHtml
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
    ensureEmailBodyEditor,
    flushEmailTemplateAutosave,
    renderEmailTemplatePickerOptions,
    openEmailTemplatePicker,
    closeEmailTemplatePicker,
    applyEmailTemplateToContact
  });
})();
