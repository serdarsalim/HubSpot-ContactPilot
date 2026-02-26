(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const AUTOSAVE_DELAY_MS = 1000;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";

  function templatePreviewText(template) {
    return String(template?.body || "").trim();
  }

  function setWhatsappTemplateSaveState(stateKey, text) {
    if (!dom.whatsappTemplateSaveStateEl) return;
    dom.whatsappTemplateSaveStateEl.dataset.state = String(stateKey || "saved");
    dom.whatsappTemplateSaveStateEl.textContent = String(text || "Saved");
  }

  function getWhatsappTemplateDraftSignature() {
    return JSON.stringify(App.normalizeWhatsappTemplates(state.whatsappTemplatesDraft));
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

  async function saveWhatsappTemplateDraftNow(force = false) {
    if (autosaveInFlight) {
      autosaveQueued = true;
      return false;
    }

    const signatureBefore = getWhatsappTemplateDraftSignature();
    if (!force && signatureBefore === lastSavedDraftSignature) {
      setWhatsappTemplateSaveState("saved", "Saved");
      return true;
    }

    autosaveInFlight = true;
    setWhatsappTemplateSaveState("saving", "Saving...");

    try {
      await App.saveWhatsappSettings({ showToast: false });
      lastSavedDraftSignature = getWhatsappTemplateDraftSignature();
      setWhatsappTemplateSaveState("saved", "Saved");
      return true;
    } catch (error) {
      const reason = getErrorMessage(error).replace(/\s+/g, " ").trim();
      setWhatsappTemplateSaveState("error", "Save failed");
      App.setStatus(`WhatsApp template save failed: ${reason || "Unknown error."}`);
      if (typeof App.showToast === "function") {
        App.showToast(`Save failed: ${reason || "Unknown error."}`, 3200);
      }
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("WhatsApp template autosave failed", error);
      }
      return false;
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        void saveWhatsappTemplateDraftNow();
      }
    }
  }

  function scheduleWhatsappTemplateAutosave() {
    const signature = getWhatsappTemplateDraftSignature();
    if (signature === lastSavedDraftSignature) {
      setWhatsappTemplateSaveState("saved", "Saved");
      return;
    }

    setWhatsappTemplateSaveState("saving", "Saving...");
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      void saveWhatsappTemplateDraftNow();
    }, AUTOSAVE_DELAY_MS);
  }

  async function flushWhatsappTemplateAutosave(_options = {}) {
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    return saveWhatsappTemplateDraftNow(true);
  }

  function loadWhatsappTemplatesDraftFromSettings() {
    const normalized = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates);
    state.whatsappTemplatesDraft = normalized.map((template) => ({ ...template }));
    state.activeWhatsappTemplateId = state.whatsappTemplatesDraft[0]?.id || "";
    lastSavedDraftSignature = getWhatsappTemplateDraftSignature();
    setWhatsappTemplateSaveState("saved", "Saved");
  }

  function getActiveWhatsappTemplateDraft() {
    return state.whatsappTemplatesDraft.find((template) => template.id === state.activeWhatsappTemplateId) || null;
  }

  function renderWhatsappTemplatesList() {
    if (!dom.whatsappTemplatesListEl) return;
    if (!state.whatsappTemplatesDraft.length) {
      dom.whatsappTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }

    dom.whatsappTemplatesListEl.innerHTML = state.whatsappTemplatesDraft
      .map((template) => {
        const activeClass = template.id === state.activeWhatsappTemplateId ? "active" : "";
        return `
        <button type='button' class='email-template-list-btn ${activeClass}' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
        </button>
      `;
      })
      .join("");
  }

  function renderActiveWhatsappTemplateEditor() {
    const active = getActiveWhatsappTemplateDraft();
    const hasActive = !!active;

    if (dom.whatsappTemplateEmptyEl) dom.whatsappTemplateEmptyEl.hidden = hasActive;
    if (dom.whatsappTemplateEditorEl) dom.whatsappTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) return;

    state.syncingWhatsappTemplateForm = true;
    if (dom.whatsappTemplateNameInput) dom.whatsappTemplateNameInput.value = active.name || "";
    if (dom.whatsappTemplateBodyInput) dom.whatsappTemplateBodyInput.value = active.body || "";
    state.syncingWhatsappTemplateForm = false;
  }

  function renderWhatsappTemplatesPage() {
    renderWhatsappTemplatesList();
    renderActiveWhatsappTemplateEditor();
  }

  function upsertActiveWhatsappTemplateFromForm() {
    if (state.syncingWhatsappTemplateForm) return;
    const active = getActiveWhatsappTemplateDraft();
    if (!active) return;

    active.name = String(dom.whatsappTemplateNameInput?.value || "").trim() || "Untitled";
    active.body = String(dom.whatsappTemplateBodyInput?.value || "").trim();
    renderWhatsappTemplatesList();
    scheduleWhatsappTemplateAutosave();
  }

  function addWhatsappTemplateDraft() {
    const nextTemplate = {
      id: App.makeTemplateId(),
      name: `Template ${state.whatsappTemplatesDraft.length + 1}`,
      body: ""
    };
    state.whatsappTemplatesDraft = [...state.whatsappTemplatesDraft, nextTemplate];
    state.activeWhatsappTemplateId = nextTemplate.id;
    renderWhatsappTemplatesPage();
    scheduleWhatsappTemplateAutosave();
    if (dom.whatsappTemplateNameInput) dom.whatsappTemplateNameInput.focus();
  }

  function deleteActiveWhatsappTemplateDraft() {
    if (!state.activeWhatsappTemplateId) return;
    state.whatsappTemplatesDraft = state.whatsappTemplatesDraft.filter((template) => template.id !== state.activeWhatsappTemplateId);
    if (!state.whatsappTemplatesDraft.length) {
      state.whatsappTemplatesDraft = [{ ...constants.DEFAULT_WHATSAPP_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeWhatsappTemplateId = state.whatsappTemplatesDraft[0].id;
    renderWhatsappTemplatesPage();
    scheduleWhatsappTemplateAutosave();
  }

  function renderWhatsappTemplatePickerOptions() {
    if (!dom.whatsappTemplatePickList) return;
    const templates = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates);
    const query = String(state.whatsappTemplatePickState?.query || "")
      .trim()
      .toLowerCase();
    const matchingTemplates = query
      ? templates.filter((template) => {
          const name = String(template?.name || "").toLowerCase();
          const body = String(template?.body || "").toLowerCase();
          return name.includes(query) || body.includes(query);
        })
      : templates;
    if (!templates.length) {
      dom.whatsappTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates found. Add one via the WhatsApp icon.</div>";
      return;
    }
    if (!matchingTemplates.length) {
      dom.whatsappTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates match that title.</div>";
      return;
    }

    dom.whatsappTemplatePickList.innerHTML = matchingTemplates
      .map((template) => {
        const preview = templatePreviewText(template);
        const isAppliedForContact = App.hasTemplateApplied("whatsapp", state.whatsappTemplatePickState.key, template.id);
        return `
        <button type='button' class='email-template-pick-item' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-pick-head'>
            <span class='email-template-pick-name'>${App.escapeHtml(template.name || "Untitled")}</span>
            <span class='email-template-pick-used ${isAppliedForContact ? "is-used" : ""}' aria-hidden='true'>${
              isAppliedForContact ? "✓" : ""
            }</span>
          </span>
          <span class='email-template-pick-preview'>${App.escapeHtml(preview.slice(0, 120) || "No message yet")}</span>
        </button>
      `;
      })
      .join("");
  }

  function openWhatsappTemplatePicker(contact, key) {
    if (!dom.whatsappTemplatePickOverlay) return;
    state.whatsappTemplatePickState = {
      key: String(key || ""),
      contact: contact || null,
      query: ""
    };
    if (dom.whatsappTemplatePickTitle) {
      dom.whatsappTemplatePickTitle.textContent = `Choose Template for ${App.getContactDisplayName(contact)}`;
    }
    if (dom.whatsappTemplatePickSearchInput) {
      dom.whatsappTemplatePickSearchInput.value = "";
    }
    renderWhatsappTemplatePickerOptions();
    dom.whatsappTemplatePickOverlay.classList.add("open");
    dom.whatsappTemplatePickSearchInput?.focus();
  }

  function closeWhatsappTemplatePicker() {
    if (dom.whatsappTemplatePickOverlay) {
      App.blurFocusedElementWithin(dom.whatsappTemplatePickOverlay);
      App.preserveScrollPosition(() => {
        dom.whatsappTemplatePickOverlay.classList.remove("open");
      });
    }
    state.whatsappTemplatePickState = { key: "", contact: null, query: "" };
    if (dom.whatsappTemplatePickSearchInput) dom.whatsappTemplatePickSearchInput.value = "";
  }

  function getPhoneDigitsForContact(contact) {
    const directDigits = String(contact?.phoneDigits || "").replace(/\D/g, "");
    if (directDigits) return directDigits;

    const waUrl = String(contact?.waUrl || "");
    if (!waUrl) return "";
    try {
      const parsed = new URL(waUrl);
      const fromParam = String(parsed.searchParams.get("phone") || "").replace(/\D/g, "");
      if (fromParam) return fromParam;
    } catch (_error) {
      return "";
    }
    return "";
  }

  function buildWhatsappUrl(contact, template) {
    const phoneDigits = getPhoneDigitsForContact(contact);
    if (!phoneDigits) return "";

    const tokens = App.getContactTokenMap(contact);
    const text = App.applyTokens(template.body, tokens).trim();
    const baseUrl = `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number`;
    return text ? `${baseUrl}&text=${encodeURIComponent(text)}` : baseUrl;
  }

  async function applyWhatsappTemplateToContact(contact, key, template) {
    if (!contact) return;
    if (!template) {
      App.setStatus("No WhatsApp template found. Add one via the WhatsApp icon.");
      return;
    }

    const waUrl = buildWhatsappUrl(contact, template);
    if (!waUrl) {
      App.setStatus("Could not build WhatsApp link. Missing phone number.");
      return;
    }

    const resolvedKey = String(key || App.contactKey(contact));
    App.setStatus(`Opening WhatsApp for ${App.getContactDisplayName(contact)} with \"${template.name}\"...`);

    try {
      await chrome.tabs.create({ url: waUrl, active: true });
      App.markTemplateApplied("whatsapp", resolvedKey, template.id);
      App.setStatus(`Opened WhatsApp for ${App.getContactDisplayName(contact)}.`);
      if (typeof App.trackEvent === "function") {
        App.trackEvent("whatsapp_template_applied", {
          template_id: String(template.id || ""),
          message_length: String(template.body || "").length
        });
      }
    } catch (_error) {
      App.setStatus("Could not open WhatsApp link.");
      if (typeof App.trackEvent === "function") {
        App.trackEvent("whatsapp_template_apply_failed", { reason: "exception" });
      }
    }
  }

  Object.assign(App, {
    loadWhatsappTemplatesDraftFromSettings,
    getActiveWhatsappTemplateDraft,
    renderWhatsappTemplatesList,
    renderActiveWhatsappTemplateEditor,
    renderWhatsappTemplatesPage,
    upsertActiveWhatsappTemplateFromForm,
    addWhatsappTemplateDraft,
    deleteActiveWhatsappTemplateDraft,
    flushWhatsappTemplateAutosave,
    renderWhatsappTemplatePickerOptions,
    openWhatsappTemplatePicker,
    closeWhatsappTemplatePicker,
    applyWhatsappTemplateToContact
  });
})();
