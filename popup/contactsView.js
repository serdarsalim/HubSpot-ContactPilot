(() => {
  const App = window.PopupApp;
  const { dom, state } = App;
  const MT = App.messageTypes;
  const RECORD_ID_COLUMN_PATTERN = /^(record_id|recordid|hs_object_id|hs_objectid)$/i;

  function findRecordIdColumn(columns) {
    return columns.find((col) => /record\s*id/i.test(col.label) || RECORD_ID_COLUMN_PATTERN.test(col.id)) || null;
  }

  function dedupeContactsByRecordId(contacts, columns) {
    const source = Array.isArray(contacts) ? contacts : [];
    if (!source.length) return [];

    const recordIdColumn = findRecordIdColumn(Array.isArray(columns) ? columns : []);
    if (!recordIdColumn) {
      return source;
    }

    const seenRecordIds = new Set();
    const deduped = [];

    for (const contact of source) {
      const recordId = String(contact?.values?.[recordIdColumn.id] || contact?.recordId || "").replace(/\D/g, "");
      if (!recordId) {
        deduped.push(contact);
        continue;
      }
      if (seenRecordIds.has(recordId)) continue;
      seenRecordIds.add(recordId);
      deduped.push(contact);
    }

    return deduped;
  }

  function countNewContacts(contacts) {
    const possibilityColumn = App.findPossibilityColumn();
    if (!possibilityColumn) return 0;
    return contacts.reduce((count, contact) => {
      const value = String(contact?.values?.[possibilityColumn.id] || "").trim();
      return count + (value === "--" ? 1 : 0);
    }, 0);
  }

  function setContactsStatus(filteredContacts) {
    const total = Array.isArray(filteredContacts) ? filteredContacts.length : 0;
    const selected = state.selectedKeys.size;
    const newCount = countNewContacts(filteredContacts || []);
    App.setStatus(`Found ${total} contact(s). Selected ${selected}. ${newCount} new.`);
  }

  function renderContacts() {
    dom.listEl.innerHTML = "";
    const filteredContacts = App.getFilteredContacts();
    const visibleKeys = new Set(filteredContacts.map((c) => App.contactKey(c)));
    state.selectedKeys = new Set([...state.selectedKeys].filter((key) => visibleKeys.has(key)));
    App.updateExportActionsVisibility();

    if (!filteredContacts.length) {
      if (state.currentContacts.length && App.getFilterWord()) {
        App.setStatus("No contacts match the current filter word.");
        return;
      }
      App.setStatus("No contacts with phone numbers found on this view.");
      return;
    }

    const visibleColumns = App.getVisibleColumns();
    if (!visibleColumns.length) {
      setContactsStatus(filteredContacts);
      dom.listEl.innerHTML = "<div class='status'>Enable at least one column in Settings.</div>";
      return;
    }

    state.displayedContacts = App.getSortedContacts(filteredContacts);
    setContactsStatus(filteredContacts);

    const allShownSelected =
      state.displayedContacts.length > 0 && state.displayedContacts.every((c) => state.selectedKeys.has(App.contactKey(c)));

    const compactColumnLayout = visibleColumns.length <= 3;
    const displayedByKey = new Map(state.displayedContacts.map((c) => [App.contactKey(c), c]));

    const headerHtml = visibleColumns
      .map((col, index) => {
        const sizeClass = compactColumnLayout
          ? index === visibleColumns.length - 1
            ? "col-elastic"
            : "col-fixed"
          : "col-fluid";

        return `<th class='sortable ${App.columnClasses(col)} ${sizeClass}' data-sort-field='${App.escapeHtml(col.id)}' tabindex='0' aria-sort='${App.sortAria(col.id)}'>${App.escapeHtml(col.label)}${App.sortIndicator(col.id)}</th>`;
      })
      .join("");

    const rowsHtml = state.displayedContacts
      .map((contact) => {
        const key = App.contactKey(contact);
        const checked = state.selectedKeys.has(key) ? "checked" : "";

        const cellsHtml = visibleColumns
          .map((col, index) => {
            const value = contact.values?.[col.id] || "-";
            const sizeClass = compactColumnLayout
              ? index === visibleColumns.length - 1
                ? "col-elastic"
                : "col-fixed"
              : "col-fluid";
            const css = `${App.columnClasses(col)} ${sizeClass}`;

            if (col.id === state.phoneColumnId && contact.waUrl) {
              return `<td class='${css}'><a href='${App.escapeHtml(contact.waUrl)}' target='_blank' rel='noopener noreferrer'>${App.escapeHtml(value)}</a></td>`;
            }

            if (App.columnType(col) === "name") {
              const recordId = App.getRecordIdForContact(contact);
              const contactUrl = App.buildContactUrl(recordId, state.currentPortalId);
              if (contactUrl) {
                return `<td class='${css}'><a href='${App.escapeHtml(contactUrl)}' target='_blank' rel='noopener noreferrer'>${App.escapeHtml(value)}</a></td>`;
              }
            }

            return `<td class='${css}'>${App.escapeHtml(value)}</td>`;
          })
          .join("");

        return `
        <tr>
          <td class='sel'><input type='checkbox' class='row-select' data-key='${App.escapeHtml(key)}' ${checked} /></td>
          ${cellsHtml}
          <td class='actions'>
            <span class='row-actions-wrap'>
              <button type='button' class='row-action-btn row-email-btn' data-key='${App.escapeHtml(key)}'>Email</button>
              <button type='button' class='row-action-btn row-notes-btn' data-key='${App.escapeHtml(key)}'>Notes</button>
            </span>
          </td>
        </tr>
      `;
      })
      .join("");

    dom.listEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class='sel'><input type='checkbox' id='selectAllShown' ${allShownSelected ? "checked" : ""} /></th>
          ${headerHtml}
          <th class='actions'>Actions</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

    dom.listEl.querySelectorAll("th.sortable").forEach((header) => {
      header.addEventListener("click", () => {
        const field = header.getAttribute("data-sort-field");
        App.toggleSort(field);
      });
      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const field = header.getAttribute("data-sort-field");
        App.toggleSort(field);
      });
    });

    dom.listEl.querySelectorAll(".row-select").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-key");
        if (!key) return;
        if (input.checked) state.selectedKeys.add(key);
        else state.selectedKeys.delete(key);
        App.updateExportActionsVisibility();
        setContactsStatus(filteredContacts);
      });
    });

    dom.listEl.querySelectorAll(".row-notes-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.getAttribute("data-key");
        if (!key) return;
        const contact = displayedByKey.get(key);
        const recordId = App.getRecordIdForContact(contact);
        if (!recordId) {
          App.setStatus("Could not find Record ID for this row.");
          return;
        }
        App.openNotesDialog(contact, recordId);
      });
    });

    dom.listEl.querySelectorAll(".row-email-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.getAttribute("data-key");
        if (!key) return;
        const contact = displayedByKey.get(key);
        if (!contact) return;

        App.openEmailTemplatePicker(contact, key);
      });
    });

    const selectAllShown = document.getElementById("selectAllShown");
    if (selectAllShown) {
      selectAllShown.addEventListener("change", () => {
        state.displayedContacts.forEach((c) => {
          const key = App.contactKey(c);
          if (selectAllShown.checked) state.selectedKeys.add(key);
          else state.selectedKeys.delete(key);
        });
        renderContacts();
      });
    }
  }

  async function loadContacts(options = {}) {
    if (state.contactsLoading) return;
    state.contactsLoading = true;
    App.setContactsLoadingState(true);

    try {
      const loadAll = !!options.loadAll;
      const tab = await App.findHubSpotTab();
      if (!tab || typeof tab.id !== "number") {
        App.setStatus("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
        return;
      }

      if (loadAll) {
        App.setStatus("Loading all visible contacts from HubSpot table...");
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: MT.GET_CONTACTS,
        countryPrefix: state.settings.countryPrefix,
        messageText: state.settings.messageTemplate,
        loadAll
      });

      if (!response || !response.ok) {
        App.setStatus("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
        return;
      }

      state.currentColumns = response.columns || [];
      state.currentContacts = dedupeContactsByRecordId(response.contacts || [], state.currentColumns);
      state.phoneColumnId = response.phoneColumnId || null;
      state.currentPortalId = (await App.getPortalId(tab)) || "";

      const settingsChanged = App.mergeColumnSettings();
      if (settingsChanged) {
        await App.persistSyncSettings(state.settings);
      }

      state.selectedKeys = new Set();
      state.sortState = { field: null, direction: "asc" };
      renderContacts();
    } catch (_error) {
      App.setStatus("Could not load contacts. Refresh HubSpot tab and retry.");
    } finally {
      state.contactsLoading = false;
      App.setContactsLoadingState(false);
    }
  }

  Object.assign(App, {
    renderContacts,
    loadContacts
  });
})();
