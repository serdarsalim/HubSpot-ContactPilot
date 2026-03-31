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
      .map((note) => renderNoteItem(note))
      .join("");
  }

  function renderNoteItem(note) {
    const parsed = parseHubSpotNote(note);
    if (!parsed) {
      const cleaned = cleanHubSpotNoteBody(note);
      if (!cleaned) return "";
      return `<div class='note-item'><div class='note-item-body'>${App.escapeHtml(cleaned)}</div></div>`;
    }

    const bodyHtml = App.escapeHtml(parsed.body || "");
    const metaHtml = App.escapeHtml(`${parsed.whenText} by ${parsed.authorShort}`);
    return `<div class='note-item'><div class='note-item-body'>${bodyHtml}</div><div class='note-item-meta'>${metaHtml}</div></div>`;
  }

  function parseHubSpotNote(rawNote) {
    const normalized = String(rawNote || "").replace(/\s+/g, " ").trim();
    const noteMatch = normalized.match(
      /^note by\s+(.+?)\s+(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\s+at\s+(\d{1,2}:\d{2})(?:\s*([ap]m))?(?:\s+gmt[+-]\d{1,2})?\s*(.*)$/i
    );
    if (!noteMatch) return null;

    const author = String(noteMatch[1] || "").trim();
    const day = String(noteMatch[2] || "").trim();
    const month = String(noteMatch[3] || "").trim();
    const year = String(noteMatch[4] || "").trim();
    const time = String(noteMatch[5] || "").trim();
    const meridiem = String(noteMatch[6] || "").trim().toUpperCase();
    const body = cleanHubSpotNoteBody(String(noteMatch[7] || "").trim());
    if (!body) return null;

    return {
      body,
      whenText: formatNoteDate(day, month, year, time, meridiem),
      authorShort: compactAuthorName(author)
    };
  }

  function cleanHubSpotNoteBody(bodyText) {
    let cleaned = String(bodyText || "").replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/^note description\s*/i, "");
    cleaned = cleaned.replace(
      /\s*this activity is collapsed, meaning some of its details are hidden\. click to expand this activity\.\s*/i,
      ""
    );
    const contactName = String(state?.notesDialogState?.contactName || "").trim();
    if (contactName) {
      const escapedName = escapeRegExp(contactName);
      cleaned = cleaned.replace(new RegExp(`\\bfor\\s+${escapedName}\\b`, "ig"), "");
    }
    cleaned = cleaned.replace(/\bcreate a note\b/ig, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned.trim();
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatNoteDate(day, month, year, time, meridiem) {
    const shortYear = String(year || "").slice(-2);
    const padDay = String(day || "").padStart(2, "0");
    const meridiemText = meridiem ? ` ${meridiem}` : "";
    return `${padDay} ${month} ${shortYear}, ${time}${meridiemText}`;
  }

  function compactAuthorName(fullName) {
    const parts = String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "Unknown";
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}.`;
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
    App.blurFocusedElementWithin(dom.notesOverlay);
    App.preserveScrollPosition(() => {
      dom.notesOverlay.classList.remove("open");
    });
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
    const selectedTemplateId = String(dom.notesTemplateSelect?.value || "").trim();
    const selectedTemplate =
      selectedTemplateId && typeof App.getMergedNoteTemplates === "function"
        ? (App.getMergedNoteTemplates().find((template) => template.id === selectedTemplateId) || null)
        : null;
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
    void App.trackCloudTemplateUse(selectedTemplate);
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
