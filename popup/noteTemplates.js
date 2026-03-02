(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const AUTOSAVE_DELAY_MS = 900;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";

  function setNoteTemplateSaveState(stateKey, text) {
    if (!dom.noteTemplateSaveStateEl) return;
    dom.noteTemplateSaveStateEl.dataset.state = String(stateKey || "saved");
    dom.noteTemplateSaveStateEl.textContent = String(text || "Saved");
  }

  function getNoteTemplateDraftSignature() {
    return JSON.stringify(App.normalizeNoteTemplates(state.noteTemplatesDraft));
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

  async function saveNoteTemplateDraftNow(force = false) {
    if (autosaveInFlight) {
      autosaveQueued = true;
      return false;
    }

    const signatureBefore = getNoteTemplateDraftSignature();
    if (!force && signatureBefore === lastSavedDraftSignature) {
      setNoteTemplateSaveState("saved", "Saved");
      return true;
    }

    autosaveInFlight = true;
    setNoteTemplateSaveState("saving", "Saving...");

    try {
      await App.saveNoteTemplateSettings({ showToast: false });
      lastSavedDraftSignature = getNoteTemplateDraftSignature();
      setNoteTemplateSaveState("saved", "Saved");
      return true;
    } catch (error) {
      const reason = getErrorMessage(error).replace(/\s+/g, " ").trim();
      setNoteTemplateSaveState("error", "Save failed");
      App.setStatus(`Note template save failed: ${reason || "Unknown error."}`);
      if (typeof App.showToast === "function") {
        App.showToast(`Save failed: ${reason || "Unknown error."}`, 3200);
      }
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("Note template autosave failed", error);
      }
      return false;
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        void saveNoteTemplateDraftNow();
      }
    }
  }

  function scheduleNoteTemplateAutosave() {
    const signature = getNoteTemplateDraftSignature();
    if (signature === lastSavedDraftSignature) {
      setNoteTemplateSaveState("saved", "Saved");
      return;
    }

    setNoteTemplateSaveState("saving", "Saving...");
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      void saveNoteTemplateDraftNow();
    }, AUTOSAVE_DELAY_MS);
  }

  async function flushNoteTemplateAutosave(_options = {}) {
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    return saveNoteTemplateDraftNow(true);
  }

  function loadNoteTemplatesDraftFromSettings() {
    const normalized = App.normalizeNoteTemplates(state.settings.noteTemplates);
    state.noteTemplatesDraft = normalized.map((template) => ({ ...template }));
    state.activeNoteTemplateId = state.noteTemplatesDraft[0]?.id || "";
    lastSavedDraftSignature = getNoteTemplateDraftSignature();
    setNoteTemplateSaveState("saved", "Saved");
  }

  function getMergedNoteTemplates() {
    if (typeof App.getMergedNoteTemplates === "function") {
      return App.getMergedNoteTemplates();
    }
    return App.normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "NOTE"
    }));
  }

  function getActiveNoteTemplateDraft() {
    return state.noteTemplatesDraft.find((template) => template.id === state.activeNoteTemplateId) || null;
  }

  function getActiveNoteTemplateAny() {
    const templates = getMergedNoteTemplates();
    return templates.find((template) => template.id === state.activeNoteTemplateId) || null;
  }

  function isCloudTemplate(template) {
    if (!template) return false;
    if (template.readOnly === true || template.source === "cloud") return true;
    if (typeof App.isCloudTemplateId === "function") return App.isCloudTemplateId(template.id);
    return false;
  }

  function setNoteEditorReadOnly(readOnly) {
    const nextReadOnly = !!readOnly;
    if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.disabled = nextReadOnly;
    if (dom.noteTemplateBodyInput) {
      dom.noteTemplateBodyInput.readOnly = nextReadOnly;
      dom.noteTemplateBodyInput.disabled = nextReadOnly;
    }
    if (dom.deleteNoteTemplateBtn) dom.deleteNoteTemplateBtn.hidden = nextReadOnly;
    setNoteTemplateSaveState("saved", nextReadOnly ? ("Managed by " + String(state.cloud?.auth?.organizationName || state.cloud?.auth?.organizationSlug || state.cloud?.auth?.organizationId || "Cloud")) : "Saved");
  }

  function renderNoteTemplatesList() {
    const templates = getMergedNoteTemplates();
    if (!dom.noteTemplatesListEl) return;
    if (!templates.length) {
      dom.noteTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }

    if (!templates.some((template) => template.id === state.activeNoteTemplateId)) {
      state.activeNoteTemplateId = templates[0]?.id || "";
    }

    dom.noteTemplatesListEl.innerHTML = templates
      .map((template) => {
        const activeClass = template.id === state.activeNoteTemplateId ? "active" : "";
        const sourceClass = template.source === "cloud" ? "cloud" : "local";
        const sourceLabel = template.source === "cloud" ? "Cloud" : "Local";
        return `
        <button type='button' class='email-template-list-btn ${activeClass}' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-list-head'>
            <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
            <span class='template-source-pill ${sourceClass}'>${sourceLabel}</span>
          </span>
        </button>
      `;
      })
      .join("");
  }

  function renderActiveNoteTemplateEditor() {
    const active = getActiveNoteTemplateAny();
    const hasActive = !!active;
    const activeIsCloud = isCloudTemplate(active);

    if (dom.noteTemplateEmptyEl) dom.noteTemplateEmptyEl.hidden = hasActive;
    if (dom.noteTemplateEditorEl) dom.noteTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) {
      setNoteEditorReadOnly(false);
      return;
    }

    state.syncingNoteTemplateForm = true;
    if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.value = active.name || "";
    if (dom.noteTemplateBodyInput) dom.noteTemplateBodyInput.value = active.body || "";
    state.syncingNoteTemplateForm = false;
    setNoteEditorReadOnly(activeIsCloud);
  }

  function renderNoteTemplatesPage() {
    renderNoteTemplatesList();
    renderActiveNoteTemplateEditor();
  }

  function upsertActiveNoteTemplateFromForm() {
    if (state.syncingNoteTemplateForm) return;
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeNoteTemplateId)) return;
    const active = getActiveNoteTemplateDraft();
    if (!active) return;

    active.name = String(dom.noteTemplateNameInput?.value || "").trim() || "Untitled";
    active.body = String(dom.noteTemplateBodyInput?.value || "").trim();
    renderNoteTemplatesList();
    scheduleNoteTemplateAutosave();
  }

  function addNoteTemplateDraft() {
    const nextTemplate = {
      id: App.makeTemplateId(),
      name: `Template ${state.noteTemplatesDraft.length + 1}`,
      body: ""
    };
    state.noteTemplatesDraft = [...state.noteTemplatesDraft, nextTemplate];
    state.activeNoteTemplateId = nextTemplate.id;
    renderNoteTemplatesPage();
    scheduleNoteTemplateAutosave();
    if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.focus();
  }

  function deleteActiveNoteTemplateDraft() {
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeNoteTemplateId)) return;
    if (!state.activeNoteTemplateId) return;

    const active = getActiveNoteTemplateDraft();
    const templateName = String(active?.name || "this template");
    const confirmed = window.confirm("Delete " + templateName + "?");
    if (!confirmed) return;

    state.noteTemplatesDraft = state.noteTemplatesDraft.filter((template) => template.id !== state.activeNoteTemplateId);
    if (!state.noteTemplatesDraft.length) {
      state.noteTemplatesDraft = [{ ...constants.DEFAULT_NOTE_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeNoteTemplateId = state.noteTemplatesDraft[0].id;
    renderNoteTemplatesPage();
    scheduleNoteTemplateAutosave();

    if (typeof App.showToast === "function") {
      App.showToast("Template deleted.");
    }
  }

  function renderNotesTemplateSelectOptions(selectedId = "") {
    if (!dom.notesTemplateSelect) return;
    const templates = getMergedNoteTemplates();
    const selected = String(selectedId || "");

    const options = ["<option value=''>Custom note</option>"];
    for (const template of templates) {
      const isSelected = template.id === selected ? "selected" : "";
      const suffix = template.source === "cloud" ? " (Cloud)" : "";
      options.push(
        `<option value='${App.escapeHtml(template.id)}' ${isSelected}>${App.escapeHtml(template.name || "Untitled")}${suffix}</option>`
      );
    }
    dom.notesTemplateSelect.innerHTML = options.join("");
  }

  function applySelectedNoteTemplateToInput() {
    if (!dom.notesTemplateSelect || !dom.notesTextInput) return;
    const selectedId = String(dom.notesTemplateSelect.value || "").trim();
    const templates = getMergedNoteTemplates();
    const selectedTemplate = templates.find((template) => template.id === selectedId) || null;
    if (!selectedTemplate) return;
    dom.notesTextInput.value = String(selectedTemplate.body || "").trim();
  }

  Object.assign(App, {
    loadNoteTemplatesDraftFromSettings,
    getActiveNoteTemplateDraft,
    renderNoteTemplatesList,
    renderActiveNoteTemplateEditor,
    renderNoteTemplatesPage,
    upsertActiveNoteTemplateFromForm,
    addNoteTemplateDraft,
    deleteActiveNoteTemplateDraft,
    flushNoteTemplateAutosave,
    renderNotesTemplateSelectOptions,
    applySelectedNoteTemplateToInput
  });
})();
