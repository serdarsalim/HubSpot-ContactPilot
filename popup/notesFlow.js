(() => {
  const App = window.PopupApp;
  const { dom, state } = App;

  function renderNotesHistory() {
    if (!dom.notesListEl) return;

    if (state.notesDialogState.loading) {
      dom.notesListEl.innerHTML = "<div class='notes-empty'>Loading notes...</div>";
      return;
    }

    if (!state.notesDialogState.notes.length) {
      dom.notesListEl.innerHTML = "<div class='notes-empty'>No notes found yet for this contact.</div>";
      return;
    }

    dom.notesListEl.innerHTML = state.notesDialogState.notes
      .map((note) => `<div class='note-item'>${App.escapeHtml(note)}</div>`)
      .join("");
  }

  function setNotesDialogBusy(busy, options = {}) {
    const isBusy = !!busy;
    const busyLabel = String(options.busyLabel || "Sending...");

    if (dom.saveNoteBtn) {
      if (!dom.saveNoteBtn.dataset.defaultLabel) {
        dom.saveNoteBtn.dataset.defaultLabel = cleanButtonText(dom.saveNoteBtn.textContent) || "Save Note";
      }
      dom.saveNoteBtn.disabled = isBusy;
      dom.saveNoteBtn.classList.toggle("is-busy", isBusy);
      dom.saveNoteBtn.textContent = isBusy ? busyLabel : dom.saveNoteBtn.dataset.defaultLabel;
      if (isBusy) {
        dom.saveNoteBtn.setAttribute("aria-busy", "true");
      } else {
        dom.saveNoteBtn.removeAttribute("aria-busy");
      }
    }

    if (dom.notesTextInput) dom.notesTextInput.disabled = isBusy;
    if (dom.notesTemplateSelect) dom.notesTemplateSelect.disabled = isBusy;
    if (dom.cancelNotesBtn) dom.cancelNotesBtn.disabled = isBusy;
    if (dom.closeNotesBtn) dom.closeNotesBtn.disabled = isBusy;
  }

  function cleanButtonText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function openNotesDialog(contact, recordId) {
    if (!dom.notesOverlay) return;

    state.notesDialogState = {
      recordId: String(recordId || ""),
      contactName: App.getContactDisplayName(contact),
      notes: [],
      loading: true
    };

    if (dom.notesTitleEl) dom.notesTitleEl.textContent = `Notes - ${state.notesDialogState.contactName}`;
    if (dom.notesTextInput) dom.notesTextInput.value = state.settings.noteTemplate || "";
    if (typeof App.renderNotesTemplateSelectOptions === "function") {
      App.renderNotesTemplateSelectOptions("");
    }

    setNotesDialogBusy(false);
    renderNotesHistory();
    dom.notesOverlay.classList.add("open");
    void loadNotesForDialog();
  }

  function closeNotesDialog() {
    if (!dom.notesOverlay) return;
    dom.notesOverlay.classList.remove("open");
    state.notesLoadToken += 1;
  }

  async function loadNotesForDialog() {
    const currentToken = ++state.notesLoadToken;
    state.notesDialogState.loading = true;
    renderNotesHistory();

    try {
      const notes = await App.getHubSpotNotesForRecord(state.notesDialogState.recordId);
      if (currentToken !== state.notesLoadToken) return;
      state.notesDialogState.notes = notes;
      state.notesDialogState.loading = false;
      renderNotesHistory();
    } catch (error) {
      if (currentToken !== state.notesLoadToken) return;
      state.notesDialogState.notes = [];
      state.notesDialogState.loading = false;
      if (dom.notesListEl) {
        dom.notesListEl.innerHTML = `<div class='notes-empty'>Could not load notes. ${App.escapeHtml(String(error || ""))}</div>`;
      }
    }
  }

  async function saveNoteFromDialog() {
    const recordId = String(state.notesDialogState.recordId || "").replace(/\D/g, "");
    if (!recordId) {
      App.setStatus("Could not find Record ID for this row.");
      return;
    }

    const text = String(dom.notesTextInput?.value || "").trim();
    if (!text) {
      App.setStatus("Note text cannot be empty.");
      return;
    }

    if (dom.saveNoteBtn?.disabled) return;

    setNotesDialogBusy(true, { busyLabel: "Sending..." });
    App.setStatus(`Sending note for ${state.notesDialogState.contactName || "contact"}...`);

    let result = null;
    try {
      result = await App.createHubSpotNotes([recordId], text);
    } finally {
      setNotesDialogBusy(false);
    }

    if (!result?.ok) {
      App.setStatus(result?.error || "Could not create note.");
      return;
    }

    state.notesDialogState.notes = [text, ...state.notesDialogState.notes];
    renderNotesHistory();
    if (dom.notesTextInput) dom.notesTextInput.value = state.settings.noteTemplate || "";
    if (dom.notesTemplateSelect) dom.notesTemplateSelect.value = "";
    App.setStatus("Note sent and logged.");
    if (typeof App.trackEvent === "function") {
      App.trackEvent("note_created", {
        note_length: text.length
      });
    }
  }

  Object.assign(App, {
    renderNotesHistory,
    setNotesDialogBusy,
    openNotesDialog,
    closeNotesDialog,
    loadNotesForDialog,
    saveNoteFromDialog
  });
})();
