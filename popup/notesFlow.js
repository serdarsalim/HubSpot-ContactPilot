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

  function setNotesDialogBusy(busy) {
    if (dom.saveNoteBtn) dom.saveNoteBtn.disabled = !!busy;
    if (dom.notesTextInput) dom.notesTextInput.disabled = !!busy;
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

    setNotesDialogBusy(true);
    const result = await App.createHubSpotNotes([recordId], text);
    setNotesDialogBusy(false);

    if (!result.ok) {
      App.setStatus(result.error || "Could not create note.");
      return;
    }

    state.notesDialogState.notes = [text, ...state.notesDialogState.notes];
    renderNotesHistory();
    if (dom.notesTextInput) dom.notesTextInput.value = state.settings.noteTemplate || "";
    App.setStatus("Note logged.");
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
