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

  function getActiveNoteTemplateDraft() {
    return state.noteTemplatesDraft.find((template) => template.id === state.activeNoteTemplateId) || null;
  }

  function renderNoteTemplatesList() {
    if (!dom.noteTemplatesListEl) return;
    if (!state.noteTemplatesDraft.length) {
      dom.noteTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }

    dom.noteTemplatesListEl.innerHTML = state.noteTemplatesDraft
      .map((template) => {
        const activeClass = template.id === state.activeNoteTemplateId ? "active" : "";
        return `
        <button type='button' class='email-template-list-btn ${activeClass}' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
        </button>
      `;
      })
      .join("");
  }

  function renderActiveNoteTemplateEditor() {
    const active = getActiveNoteTemplateDraft();
    const hasActive = !!active;

    if (dom.noteTemplateEmptyEl) dom.noteTemplateEmptyEl.hidden = hasActive;
    if (dom.noteTemplateEditorEl) dom.noteTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) return;

    state.syncingNoteTemplateForm = true;
    if (dom.noteTemplateNameInput) dom.noteTemplateNameInput.value = active.name || "";
    if (dom.noteTemplateBodyInput) dom.noteTemplateBodyInput.value = active.body || "";
    state.syncingNoteTemplateForm = false;
  }

  function renderNoteTemplatesPage() {
    renderNoteTemplatesList();
    renderActiveNoteTemplateEditor();
  }

  function upsertActiveNoteTemplateFromForm() {
    if (state.syncingNoteTemplateForm) return;
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
    if (!state.activeNoteTemplateId) return;
    state.noteTemplatesDraft = state.noteTemplatesDraft.filter((template) => template.id !== state.activeNoteTemplateId);
    if (!state.noteTemplatesDraft.length) {
      state.noteTemplatesDraft = [{ ...constants.DEFAULT_NOTE_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeNoteTemplateId = state.noteTemplatesDraft[0].id;
    renderNoteTemplatesPage();
    scheduleNoteTemplateAutosave();
  }

  function renderNotesTemplateSelectOptions(selectedId = "") {
    if (!dom.notesTemplateSelect) return;
    const templates = App.normalizeNoteTemplates(state.settings.noteTemplates);
    const selected = String(selectedId || "");

    const options = ["<option value=''>Custom note</option>"];
    for (const template of templates) {
      const isSelected = template.id === selected ? "selected" : "";
      options.push(`<option value='${App.escapeHtml(template.id)}' ${isSelected}>${App.escapeHtml(template.name || "Untitled")}</option>`);
    }
    dom.notesTemplateSelect.innerHTML = options.join("");
  }

  function applySelectedNoteTemplateToInput() {
    if (!dom.notesTemplateSelect || !dom.notesTextInput) return;
    const selectedId = String(dom.notesTemplateSelect.value || "").trim();
    const templates = App.normalizeNoteTemplates(state.settings.noteTemplates);
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
