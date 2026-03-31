(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const AUTOSAVE_DELAY_MS = 1000;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";
  let draggedWhatsappTemplateId = "";

  function templatePreviewText(template) {
    return String(template?.body || "").trim();
  }

  function renderTemplateSourceBadge(template) {
    if (template?.source !== "cloud") return "";
    return `<span class='template-source-pill cloud' aria-label='Cloud template' title='Cloud template'>☁</span>`;
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

  function getMergedWhatsappTemplates() {
    const localSource =
      Array.isArray(state.whatsappTemplatesDraft) && state.whatsappTemplatesDraft.length
        ? state.whatsappTemplatesDraft
        : state.settings.whatsappTemplates;
    const localTemplates = App.normalizeWhatsappTemplates(localSource).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "WHATSAPP"
    }));
    const cloudTemplates = Array.isArray(state.cloud?.whatsappTemplates) ? state.cloud.whatsappTemplates : [];
    return [...localTemplates, ...cloudTemplates];
  }

  function getActiveWhatsappTemplateDraft() {
    return state.whatsappTemplatesDraft.find((template) => template.id === state.activeWhatsappTemplateId) || null;
  }

  function getActiveWhatsappTemplateAny() {
    const templates = getMergedWhatsappTemplates();
    return templates.find((template) => template.id === state.activeWhatsappTemplateId) || null;
  }

  function isCloudTemplate(template) {
    if (!template) return false;
    if (template.readOnly === true || template.source === "cloud") return true;
    if (typeof App.isCloudTemplateId === "function") return App.isCloudTemplateId(template.id);
    return false;
  }

  function setWhatsappEditorReadOnly(readOnly) {
    const nextReadOnly = !!readOnly;
    if (dom.whatsappTemplateNameInput) dom.whatsappTemplateNameInput.disabled = nextReadOnly;
    if (dom.whatsappTemplateBodyInput) {
      dom.whatsappTemplateBodyInput.readOnly = nextReadOnly;
      dom.whatsappTemplateBodyInput.disabled = nextReadOnly;
    }
    if (dom.deleteWhatsappTemplateBtn) dom.deleteWhatsappTemplateBtn.hidden = nextReadOnly;
    setWhatsappTemplateSaveState("saved", nextReadOnly ? ("Managed by " + String(state.cloud?.auth?.organizationName || state.cloud?.auth?.organizationSlug || state.cloud?.auth?.organizationId || "Cloud")) : "Saved");
  }

  function renderWhatsappTemplatesList() {
    const templates = getMergedWhatsappTemplates();
    if (!dom.whatsappTemplatesListEl) return;
    if (!templates.length) {
      dom.whatsappTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }

    if (!templates.some((template) => template.id === state.activeWhatsappTemplateId)) {
      state.activeWhatsappTemplateId = templates[0]?.id || "";
    }

    dom.whatsappTemplatesListEl.innerHTML = templates
      .map((template) => {
        const activeClass = template.id === state.activeWhatsappTemplateId ? "active" : "";
        const isLocalTemplate = template.source !== "cloud";
        const sourceBadge = renderTemplateSourceBadge(template);
        return `
        <button
          type='button'
          class='email-template-list-btn ${activeClass} ${isLocalTemplate ? "is-draggable" : ""}'
          data-template-id='${App.escapeHtml(template.id)}'
          ${isLocalTemplate ? "draggable='true'" : ""}
        >
          <span class='email-template-list-head'>
            <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
            ${sourceBadge}
          </span>
        </button>
      `;
      })
      .join("");

    dom.whatsappTemplatesListEl.querySelectorAll(".email-template-list-btn.is-draggable").forEach((button) => {
      button.addEventListener("dragstart", (event) => {
        draggedWhatsappTemplateId = String(button.getAttribute("data-template-id") || "");
        button.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", draggedWhatsappTemplateId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });

      button.addEventListener("dragend", () => {
        draggedWhatsappTemplateId = "";
        button.classList.remove("is-dragging");
        dom.whatsappTemplatesListEl
          ?.querySelectorAll(".email-template-list-btn.drag-over")
          .forEach((element) => element.classList.remove("drag-over"));
      });

      button.addEventListener("dragover", (event) => {
        const targetId = String(button.getAttribute("data-template-id") || "");
        if (!draggedWhatsappTemplateId || draggedWhatsappTemplateId === targetId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        button.classList.add("drag-over");
      });

      button.addEventListener("dragleave", () => {
        button.classList.remove("drag-over");
      });

      button.addEventListener("drop", (event) => {
        const targetId = String(button.getAttribute("data-template-id") || "");
        button.classList.remove("drag-over");
        if (!draggedWhatsappTemplateId || !targetId || draggedWhatsappTemplateId === targetId) return;
        event.preventDefault();
        const fromIndex = state.whatsappTemplatesDraft.findIndex((template) => template.id === draggedWhatsappTemplateId);
        const toIndex = state.whatsappTemplatesDraft.findIndex((template) => template.id === targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        const next = [...state.whatsappTemplatesDraft];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        state.whatsappTemplatesDraft = next;
        state.activeWhatsappTemplateId = moved.id;
        renderWhatsappTemplatesPage();
        scheduleWhatsappTemplateAutosave();
      });
    });
  }

  function renderActiveWhatsappTemplateEditor() {
    const active = getActiveWhatsappTemplateAny();
    const hasActive = !!active;
    const activeIsCloud = isCloudTemplate(active);

    if (dom.whatsappTemplateEmptyEl) dom.whatsappTemplateEmptyEl.hidden = hasActive;
    if (dom.whatsappTemplateEditorEl) dom.whatsappTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) {
      setWhatsappEditorReadOnly(false);
      return;
    }

    state.syncingWhatsappTemplateForm = true;
    if (dom.whatsappTemplateNameInput) dom.whatsappTemplateNameInput.value = active.name || "";
    if (dom.whatsappTemplateBodyInput) dom.whatsappTemplateBodyInput.value = active.body || "";
    state.syncingWhatsappTemplateForm = false;
    setWhatsappEditorReadOnly(activeIsCloud);
  }

  function renderWhatsappTemplatesPage() {
    renderWhatsappTemplatesList();
    renderActiveWhatsappTemplateEditor();
  }

  function upsertActiveWhatsappTemplateFromForm() {
    if (state.syncingWhatsappTemplateForm) return;
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeWhatsappTemplateId)) return;
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
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeWhatsappTemplateId)) return;
    if (!state.activeWhatsappTemplateId) return;

    const active = getActiveWhatsappTemplateDraft();
    const templateName = String(active?.name || "this template");
    const confirmed = window.confirm("Delete " + templateName + "?");
    if (!confirmed) return;

    state.whatsappTemplatesDraft = state.whatsappTemplatesDraft.filter((template) => template.id !== state.activeWhatsappTemplateId);
    if (!state.whatsappTemplatesDraft.length) {
      state.whatsappTemplatesDraft = [{ ...constants.DEFAULT_WHATSAPP_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeWhatsappTemplateId = state.whatsappTemplatesDraft[0].id;
    renderWhatsappTemplatesPage();
    scheduleWhatsappTemplateAutosave();

    if (typeof App.showToast === "function") {
      App.showToast("Template deleted.");
    }
  }

  function renderWhatsappTemplatePickerOptions() {
    if (!dom.whatsappTemplatePickList) return;
    const templates = getMergedWhatsappTemplates();
    const query = App.normalizeSearchText(state.whatsappTemplatePickState?.query || "");
    const matchingTemplates = query
      ? templates.filter((template) => {
          const name = App.normalizeSearchText(template?.name || "");
          return name.includes(query);
        })
      : templates;
    if (!templates.length) {
      dom.whatsappTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates found.</div>";
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
        const sourceBadge = renderTemplateSourceBadge(template);
        return `
        <button type='button' class='email-template-pick-item' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-pick-head'>
            <span class='email-template-pick-title-wrap'>
              <span class='email-template-pick-name'>${App.escapeHtml(template.name || "Untitled")}</span>
              ${sourceBadge}
            </span>
            <span class='email-template-pick-used ${isAppliedForContact ? "is-used" : ""}' aria-hidden='true'>${isAppliedForContact ? "✓" : ""}</span>
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

  function getRawPhoneValueForContact(contact) {
    const phoneDisplay = String(contact?.phoneDisplay || "").trim();
    if (phoneDisplay) return phoneDisplay;

    const values = contact?.values && typeof contact.values === "object" ? contact.values : {};
    const directCandidates = [values.phone, values.mobile, values.whatsapp, values.phone_number];
    for (const candidate of directCandidates) {
      const text = String(candidate || "").trim();
      if (text) return text;
    }

    for (const [field, value] of Object.entries(values)) {
      if (!/(phone|mobile|whatsapp)/i.test(String(field || ""))) continue;
      const text = String(value || "").trim();
      if (text) return text;
    }
    return "";
  }

  function normalizePhoneDigits(rawPhone, countryPrefixInput = "") {
    const raw = String(rawPhone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";

    if (raw.startsWith("+")) return digits;
    if (digits.startsWith("00")) return digits.slice(2);

    const countryPrefix = String(countryPrefixInput || "").replace(/\D/g, "");
    if (countryPrefix && digits.startsWith(countryPrefix)) return digits;
    if (countryPrefix) {
      if (digits.startsWith("0")) return `${countryPrefix}${digits.slice(1)}`;
      if (digits.length <= 9) return `${countryPrefix}${digits}`;
    } else if (digits.startsWith("0")) {
      return "";
    }

    return digits;
  }

  function shouldAskForDefaultCountryCode(rawPhone, countryPrefixInput = "") {
    const countryPrefix = String(countryPrefixInput || "").replace(/\D/g, "");
    if (countryPrefix) return false;

    const raw = String(rawPhone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return false;
    if (raw.startsWith("+")) return false;
    if (digits.startsWith("00")) return false;

    return digits.startsWith("0") || digits.length <= 10;
  }

  async function ensureCountryPrefixForContact(contact) {
    const rawPhone = getRawPhoneValueForContact(contact);
    const currentPrefix = String(state.settings.countryPrefix || "").replace(/\D/g, "");
    if (!shouldAskForDefaultCountryCode(rawPhone, currentPrefix)) {
      return currentPrefix;
    }

    const selectedPrefix = await App.openCountryPrefixPromptDialog({
      initialCode: currentPrefix,
      message: "This phone number looks local and has no country code. Choose a default country code to continue."
    });
    if (selectedPrefix === null) {
      App.setStatus("WhatsApp canceled. No default country code was set.");
      return null;
    }

    const nextPrefix = String(selectedPrefix || "").replace(/\D/g, "");
    if (!nextPrefix) {
      App.setStatus("Please select a country code. You can also set it from Settings.");
      return null;
    }

    state.settings = { ...state.settings, countryPrefix: nextPrefix };
    if (typeof App.ensureCountryPrefixOptionExists === "function") {
      App.ensureCountryPrefixOptionExists(nextPrefix);
    }
    if (dom.countryPrefixInput) dom.countryPrefixInput.value = nextPrefix;

    try {
      if (typeof App.persistSyncSettings === "function") {
        await App.persistSyncSettings(state.settings);
      }
    } catch (error) {
      const reason = String(error?.message || error || "Unknown error.");
      App.setStatus(`Could not save default country code: ${reason}`);
      return null;
    }

    const savedMessage = `Default country code set to +${nextPrefix}. You can change this in Settings.`;
    App.setStatus(savedMessage);
    if (typeof App.showToast === "function") App.showToast(savedMessage, 3400);
    return nextPrefix;
  }

  function getPhoneDigitsForContact(contact, countryPrefixInput = "") {
    const directDigits = String(contact?.phoneDigits || "").replace(/\D/g, "");
    if (directDigits) return directDigits;

    const waUrl = String(contact?.waUrl || "");
    if (waUrl) {
      try {
        const parsed = new URL(waUrl);
        const fromParam = String(parsed.searchParams.get("phone") || "").replace(/\D/g, "");
        if (fromParam) return fromParam;
      } catch (_error) {}
    }

    const rawPhone = getRawPhoneValueForContact(contact);
    return normalizePhoneDigits(rawPhone, countryPrefixInput);
  }

  function buildWhatsappUrl(contact, template, countryPrefixInput = "") {
    const phoneDigits = getPhoneDigitsForContact(contact, countryPrefixInput);
    if (!phoneDigits) return "";

    let text = "";
    if (template) {
      const tokens = App.getContactTokenMap(contact);
      text = App.applyTokens(template.body, tokens).trim();
    }
    const baseUrl = `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number`;
    return text ? `${baseUrl}&text=${encodeURIComponent(text)}` : baseUrl;
  }

  async function openOrReuseWhatsappTab(url) {
    const messageType = App.messageTypes?.OPEN_OR_REUSE_WHATSAPP_TAB || "OPEN_OR_REUSE_WHATSAPP_TAB";
    const response = await chrome.runtime.sendMessage({ type: messageType, url });
    if (!response?.ok) {
      throw new Error(String(response?.error || "Could not open WhatsApp tab."));
    }
    return true;
  }

  async function openDirectWhatsappForContact(contact) {
    if (!contact) return false;
    const countryPrefix = await ensureCountryPrefixForContact(contact);
    if (countryPrefix === null) return false;

    const waUrl = buildWhatsappUrl(contact, null, countryPrefix || state.settings.countryPrefix);
    if (!waUrl) {
      App.setStatus("Could not build WhatsApp link. Missing phone number.");
      return false;
    }

    try {
      await openOrReuseWhatsappTab(waUrl);
      App.setStatus(`Opened WhatsApp for ${App.getContactDisplayName(contact)}.`);
      return true;
    } catch (_error) {
      App.setStatus("Could not open WhatsApp link.");
      return false;
    }
  }

  async function applyWhatsappTemplateToContact(contact, key, template) {
    if (!contact) return;
    if (!template) {
      App.setStatus("No WhatsApp template found. Add one via the WhatsApp icon.");
      return;
    }

    const countryPrefix = await ensureCountryPrefixForContact(contact);
    if (countryPrefix === null) return;

    const waUrl = buildWhatsappUrl(contact, template, countryPrefix || state.settings.countryPrefix);
    if (!waUrl) {
      App.setStatus("Could not build WhatsApp link. Missing phone number.");
      return;
    }

    const resolvedKey = String(key || App.contactKey(contact));
    App.setStatus(`Opening WhatsApp for ${App.getContactDisplayName(contact)} with \"${template.name}\"...`);

    try {
      await openOrReuseWhatsappTab(waUrl);
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
    applyWhatsappTemplateToContact,
    openDirectWhatsappForContact
  });
})();
