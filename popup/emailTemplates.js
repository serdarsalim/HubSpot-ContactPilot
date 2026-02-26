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
    "cp_addlink cp_openlink cp_unlink",
    "forecolor backcolor",
    "alignleft aligncenter alignright",
    "removeformat",
    "undo redo"
  ].join(" | ");
  const AUTOSAVE_DELAY_MS = 1000;
  const FORM_SYNC_RELEASE_DELAY_MS = 140;
  let emailBodyEditorInitPromise = null;
  let tinyEditorUnavailable = false;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";
  let formSyncReleaseTimerId = null;

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

  function escapeHtmlAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getAnchorFromNode(node) {
    const element = node && typeof node === "object" && node.nodeType === 1 ? node : null;
    if (!element || typeof element.closest !== "function") return null;
    const anchor = element.closest("a[href]");
    return anchor && anchor.nodeType === 1 ? anchor : null;
  }

  function getSelectedAnchor(editor) {
    const selectedNode = editor?.selection?.getNode?.();
    return getAnchorFromNode(selectedNode);
  }

  function normalizeLinkHref(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return "";
    if (/^(https?:|mailto:|tel:|sms:)/i.test(value)) return value;
    if (/^\/|^#|^\?/i.test(value)) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return `https://${value}`;
  }

  function removeLinkAtSelection(editor) {
    const anchor = getSelectedAnchor(editor);
    if (!anchor) return false;
    editor.undoManager.transact(() => {
      const parent = anchor.parentNode;
      if (!parent) return;
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
      parent.removeChild(anchor);
    });
    return true;
  }

  function upsertLinkAtSelection(editor) {
    const anchor = getSelectedAnchor(editor);
    const currentHref = String(anchor?.getAttribute("href") || "").trim();
    const rawHref = window.prompt("Enter link URL", currentHref || "https://");
    if (rawHref === null) return;
    const href = normalizeLinkHref(rawHref);
    if (!href) {
      removeLinkAtSelection(editor);
      return;
    }

    editor.undoManager.transact(() => {
      if (anchor) {
        anchor.setAttribute("href", href);
        return;
      }

      const selectionHtml = String(editor.selection?.getContent({ format: "html" }) || "").trim();
      const selectionText = String(editor.selection?.getContent({ format: "text" }) || "").trim();
      if (selectionHtml) {
        editor.selection.setContent(`<a href="${escapeHtmlAttr(href)}">${selectionHtml}</a>`);
        return;
      }

      const fallbackText = selectionText || href;
      const rawText = window.prompt("Enter link text", fallbackText);
      if (rawText === null) return;
      const text = String(rawText || "").trim() || href;
      editor.insertContent(`<a href="${escapeHtmlAttr(href)}">${App.escapeHtml(text)}</a>`);
    });
  }

  function openSelectedLink(editor) {
    const anchor = getSelectedAnchor(editor);
    if (!anchor) return false;
    const href = normalizeLinkHref(anchor.getAttribute("href"));
    if (!href) return false;
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
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

  function beginTemplateFormSync() {
    state.syncingEmailTemplateForm = true;
    if (formSyncReleaseTimerId) {
      clearTimeout(formSyncReleaseTimerId);
      formSyncReleaseTimerId = null;
    }
  }

  function endTemplateFormSyncDeferred(delayMs = FORM_SYNC_RELEASE_DELAY_MS) {
    if (formSyncReleaseTimerId) {
      clearTimeout(formSyncReleaseTimerId);
      formSyncReleaseTimerId = null;
    }
    formSyncReleaseTimerId = setTimeout(() => {
      state.syncingEmailTemplateForm = false;
      formSyncReleaseTimerId = null;
    }, Math.max(0, Number(delayMs) || 0));
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
        content_style: "a[href] { cursor: pointer; }",
        setup(editor) {
          editor.ui.registry.addButton("cp_addlink", {
            icon: "link",
            tooltip: "Add/Edit Link",
            onAction: () => upsertLinkAtSelection(editor)
          });
          editor.ui.registry.addButton("cp_unlink", {
            icon: "unlink",
            tooltip: "Remove Link",
            onAction: () => {
              removeLinkAtSelection(editor);
            }
          });
          editor.ui.registry.addButton("cp_openlink", {
            icon: "new-tab",
            tooltip: "Open Link",
            onAction: () => {
              if (!openSelectedLink(editor)) {
                App.setStatus("Place cursor on a link to open it.");
              }
            }
          });
          editor.on("change input undo redo keyup", () => {
            if (state.syncingEmailTemplateForm) return;
            upsertActiveTemplateFromForm();
          });
          editor.on("click", (event) => {
            const anchor = getAnchorFromNode(event.target);
            if (!anchor) return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
              openSelectedLink(editor);
              return;
            }
            upsertLinkAtSelection(editor);
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
        return `
        <button type='button' class='email-template-list-btn ${activeClass}' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
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

    beginTemplateFormSync();
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.value = active.name || "";
    if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.value = active.subject || "";
    writeEmailBodyValueToForm(active.body || "");
    endTemplateFormSyncDeferred();
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
    const query = String(state.emailTemplatePickState?.query || "")
      .trim()
      .toLowerCase();
    const matchingTemplates = query
      ? templates.filter((template) => {
          const name = String(template?.name || "").toLowerCase();
          const subject = String(template?.subject || "").toLowerCase();
          return name.includes(query) || subject.includes(query);
        })
      : templates;
    if (!templates.length) {
      dom.emailTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates found. Add one via the email icon.</div>";
      return;
    }
    if (!matchingTemplates.length) {
      dom.emailTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates match that title.</div>";
      return;
    }

    dom.emailTemplatePickList.innerHTML = matchingTemplates
      .map((template) => {
        const preview = templatePreviewText(template);
        const isAppliedForContact = App.hasTemplateApplied("email", state.emailTemplatePickState.key, template.id);
        return `
        <button type='button' class='email-template-pick-item' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-pick-head'>
            <span class='email-template-pick-name'>${App.escapeHtml(template.name || "Untitled")}</span>
            <span class='email-template-pick-used ${isAppliedForContact ? "is-used" : ""}' aria-hidden='true'>${
              isAppliedForContact ? "✓" : ""
            }</span>
          </span>
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
      contact: contact || null,
      query: ""
    };
    if (dom.emailTemplatePickTitle) {
      dom.emailTemplatePickTitle.textContent = `Choose Template for ${App.getContactDisplayName(contact)}`;
    }
    if (dom.emailTemplatePickSearchInput) {
      dom.emailTemplatePickSearchInput.value = "";
    }
    renderEmailTemplatePickerOptions();
    dom.emailTemplatePickOverlay.classList.add("open");
    dom.emailTemplatePickSearchInput?.focus();
  }

  function closeEmailTemplatePicker() {
    if (dom.emailTemplatePickOverlay) {
      App.blurFocusedElementWithin(dom.emailTemplatePickOverlay);
      App.preserveScrollPosition(() => {
        dom.emailTemplatePickOverlay.classList.remove("open");
      });
    }
    state.emailTemplatePickState = { key: "", contact: null, query: "" };
    if (dom.emailTemplatePickSearchInput) dom.emailTemplatePickSearchInput.value = "";
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
        if (typeof App.trackEvent === "function") {
          App.trackEvent("template_apply_failed", { reason: "hubspot_response_not_ok" });
        }
        return;
      }

      App.markTemplateApplied("email", resolvedKey, template.id);
      App.setStatus(`Applied "${template.name}" for ${App.getContactDisplayName(contact)}.`);
      if (typeof App.trackEvent === "function") {
        App.trackEvent("template_applied", {
          template_id: String(template.id || ""),
          subject_length: subject.length,
          body_length: bodyHtml.length
        });
      }
    } catch (_error) {
      App.setStatus("Could not apply email template on HubSpot tab.");
      if (typeof App.trackEvent === "function") {
        App.trackEvent("template_apply_failed", { reason: "exception" });
      }
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
