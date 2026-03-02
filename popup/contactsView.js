(() => {
  const App = window.PopupApp;
  const { dom, state } = App;
  const RECORD_ID_COLUMN_PATTERN = /^(record_id|recordid|hs_object_id|hs_objectid)$/i;

  function findRecordIdColumn(columns) {
    return columns.find((col) => /record\s*id/i.test(col.label) || RECORD_ID_COLUMN_PATTERN.test(col.id)) || null;
  }

  function updateRecordIdColumnWarning(columns = state.currentColumns) {
    if (typeof App.setStatusWarning !== "function") return;
    const sourceColumns = Array.isArray(columns) ? columns : [];
    if (!sourceColumns.length) {
      App.setStatusWarning("");
      return;
    }
    const hasRecordIdColumn = !!findRecordIdColumn(sourceColumns);
    App.setStatusWarning(hasRecordIdColumn ? "" : "Record ID column missing. Required to match the correct contact.");
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

  function isPlaceholderValue(rawValue) {
    const value = String(rawValue || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase();
    if (!value) return true;
    return value === "-" || value === "--" || value === "—" || value === "n/a" || value === "na" || value === "null" || value === "undefined";
  }

  function hasAnyMeaningfulContactValue(contact, columns) {
    const values = contact?.values && typeof contact.values === "object" ? contact.values : {};
    const sourceColumns = Array.isArray(columns) ? columns : [];
    if (!sourceColumns.length) {
      return Object.values(values).some((value) => !isPlaceholderValue(value));
    }
    return sourceColumns.some((col) => !isPlaceholderValue(values[col.id]));
  }

  function filterOutEmptyContacts(contacts, columns) {
    const source = Array.isArray(contacts) ? contacts : [];
    if (!source.length) return [];
    return source.filter((contact) => hasAnyMeaningfulContactValue(contact, columns));
  }

  function setContactsStatus(filteredContacts) {
    const total = Array.isArray(state.currentContacts) ? state.currentContacts.length : 0;
    const processed = Array.isArray(filteredContacts) ? filteredContacts.length : 0;
    const filteredOut = Math.max(0, total - processed);
    const newCount = countNewContacts(filteredContacts || []);
    App.setStatus(`Found ${total} contacts, ${filteredOut} filtered, ${processed} processed, ${newCount} new.`);
  }

  function isNextActivityDateColumn(col) {
    const label = String(col?.label || "").trim();
    const id = String(col?.id || "").trim();
    return /next\s*activity\s*date/i.test(label) || /next[_\s]*activity[_\s]*date/i.test(id);
  }

  function formatColumnLabel(col) {
    const rawLabel = String(col?.label || "");
    if (!isNextActivityDateColumn(col)) return rawLabel;
    return rawLabel.replace(/\s*\(\s*(?:GMT|UTC)[^)]+\)\s*$/i, "").trim();
  }

  function formatColumnValue(col, rawValue) {
    const value = String(rawValue || "-");
    if (!isNextActivityDateColumn(col)) return value;
    return value.replace(/\s+(?:GMT|UTC)\s*[+-]?\s*\d{1,2}(?::?\d{2})?\s*$/i, "").trim() || "-";
  }

  function renderContacts() {
    dom.listEl.innerHTML = "";
    updateRecordIdColumnWarning(state.currentColumns);
    const filteredContacts = App.getFilteredContacts();
    App.updateExportActionsVisibility();

    if (!filteredContacts.length) {
      if (state.currentContacts.length && (App.getFilterWord() || App.getContactSearchQuery())) {
        App.setStatus("No contacts match the current filters.");
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

    const displayableContacts = filteredContacts.filter((contact) => hasAnyMeaningfulContactValue(contact, visibleColumns));
    if (!displayableContacts.length) {
      App.setStatus("No displayable contacts after filtering empty rows.");
      return;
    }

    state.displayedContacts = App.getSortedContacts(displayableContacts);
    setContactsStatus(displayableContacts);

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

        const displayLabel = formatColumnLabel(col);
        return `<th class='sortable ${App.columnClasses(col)} ${sizeClass}' data-sort-field='${App.escapeHtml(col.id)}' tabindex='0' aria-sort='${App.sortAria(col.id)}'>${App.escapeHtml(displayLabel)}${App.sortIndicator(col.id)}</th>`;
      })
      .join("");

    const rowsHtml = state.displayedContacts
      .map((contact) => {
        const key = App.contactKey(contact);
        const recordId = App.getRecordIdForContact(contact);
        const quickNoteValue = App.getQuickNoteForRecordId(recordId);
        const checked = state.selectedKeys.has(key) ? "checked" : "";

        const cellsHtml = visibleColumns
          .map((col, index) => {
            const rawValue = contact.values?.[col.id] || "-";
            const value = formatColumnValue(col, rawValue);
            const sizeClass = compactColumnLayout
              ? index === visibleColumns.length - 1
                ? "col-elastic"
                : "col-fixed"
              : "col-fluid";
            const css = `${App.columnClasses(col)} ${sizeClass}`;

            if (col.id === state.phoneColumnId) {
              const phoneText = String(contact.values?.[col.id] || "").trim();
              const copyButton = phoneText
                ? `<button type='button' class='phone-copy-btn row-copy-phone-btn' data-phone='${App.escapeHtml(phoneText)}' aria-label='Copy phone number' title='Copy phone number'>
                    <svg viewBox='0 0 24 24' aria-hidden='true'>
                      <rect x='9' y='9' width='11' height='11' rx='2'></rect>
                      <path d='M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1'></path>
                    </svg>
                  </button>`
                : "";

              const phoneContent = contact.waUrl
                ? `<a class='row-wa-link phone-value' href='${App.escapeHtml(contact.waUrl)}' target='_blank' rel='noopener noreferrer'>${App.escapeHtml(value)}</a>`
                : `<span class='phone-value'>${App.escapeHtml(value)}</span>`;

              return `<td class='${css}'><span class='phone-cell-wrap'>${phoneContent}${copyButton}</span></td>`;
            }

            if (App.columnType(col) === "name") {
              const contactUrl = App.buildContactUrl(recordId, state.currentPortalId);
              if (contactUrl) {
                return `<td class='${css}'><a href='${App.escapeHtml(contactUrl)}' target='_blank' rel='noopener noreferrer'>${App.escapeHtml(value)}</a></td>`;
              }
              return `<td class='${css}'><button type='button' class='name-link-btn row-missing-record-id-link' data-key='${App.escapeHtml(key)}'>${App.escapeHtml(value)}</button></td>`;
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
              <button
                type='button'
                class='row-action-btn row-whatsapp-btn'
                data-key='${App.escapeHtml(key)}'
                aria-label='WhatsApp'
                title='WhatsApp'
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path d='M12 4c4.7 0 8.5 3.4 8.5 7.5S16.7 19 12 19c-1 0-2-.2-2.9-.5L4 20l1.4-3.8C4.5 14.9 4 13.2 4 11.5 4 7.4 7.8 4 12 4z'></path>
                  <circle cx='9' cy='11.5' r='0.9'></circle>
                  <circle cx='12' cy='11.5' r='0.9'></circle>
                  <circle cx='15' cy='11.5' r='0.9'></circle>
                </svg>
              </button>
              <button
                type='button'
                class='row-action-btn row-email-btn'
                data-key='${App.escapeHtml(key)}'
                aria-label='Email'
                title='Email'
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <rect x='3.5' y='6.5' width='17' height='11' rx='2'></rect>
                  <path d='M4 8l8 5 8-5'></path>
                </svg>
              </button>
              <input
                type='text'
                class='row-quick-note-input'
                data-record-id='${App.escapeHtml(recordId)}'
                value='${App.escapeHtml(quickNoteValue)}'
                aria-label='Quick note'
                ${recordId ? "" : "disabled"}
              />
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
          <th class='actions'>ACTIONS</th>
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
        void App.persistSelectedKeysToSession();
        App.updateExportActionsVisibility();
        setContactsStatus(filteredContacts);
      });
    });

    dom.listEl.querySelectorAll(".row-email-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.getAttribute("data-key");
        if (!key) return;
        const contact = displayedByKey.get(key);
        if (!contact) return;
        const recordId = App.getRecordIdForContact(contact);
        if (!recordId) {
          App.openRecordIdRequiredDialog();
          App.setStatus('Missing "Record ID" column. Add it in HubSpot Contacts list columns, then refresh Contact Point.');
          return;
        }

        App.openEmailTemplatePicker(contact, key);
      });
    });

    dom.listEl.querySelectorAll(".row-whatsapp-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-key");
        if (!key) return;
        const contact = displayedByKey.get(key);
        if (!contact) return;
        App.openWhatsappTemplatePicker(contact, key);
      });
    });

    dom.listEl.querySelectorAll(".row-missing-record-id-link").forEach((button) => {
      button.addEventListener("click", () => {
        App.openRecordIdRequiredDialog();
        App.setStatus('Missing "Record ID" column. Add it in HubSpot Contacts list columns, then refresh Contact Point.');
      });
    });

    dom.listEl.querySelectorAll(".row-wa-link").forEach((link) => {
      link.addEventListener("click", () => {
        if (typeof App.trackEvent !== "function") return;
        App.trackEvent("whatsapp_clicked", {
          selected_count: state.selectedKeys.size
        });
      });
    });

    dom.listEl.querySelectorAll(".row-copy-phone-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const phoneText = String(button.getAttribute("data-phone") || "").trim();
        if (!phoneText) return;
        try {
          await App.copyTextToClipboard(phoneText);
          if (button.dataset.copyTimerId) {
            clearTimeout(Number(button.dataset.copyTimerId));
            delete button.dataset.copyTimerId;
          }
          button.classList.add("is-copied");
          button.setAttribute("title", "Copied");
          button.setAttribute("aria-label", "Copied");
          const timerId = setTimeout(() => {
            button.classList.remove("is-copied");
            button.setAttribute("title", "Copy phone number");
            button.setAttribute("aria-label", "Copy phone number");
            delete button.dataset.copyTimerId;
          }, 900);
          button.dataset.copyTimerId = String(timerId);
        } catch (_error) {
          App.setStatus("Could not copy phone number.");
        }
      });
    });

    dom.listEl.querySelectorAll(".row-quick-note-input").forEach((input) => {
      input.addEventListener("input", () => {
        const recordId = String(input.getAttribute("data-record-id") || "").trim();
        if (!recordId) return;
        App.setQuickNoteForRecordId(recordId, input.value);
      });
      input.addEventListener("blur", () => {
        const recordId = String(input.getAttribute("data-record-id") || "").trim();
        if (!recordId) return;
        App.setQuickNoteForRecordId(recordId, input.value);
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
        void App.persistSelectedKeysToSession();
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
      const resolved = await App.findBestContactsTab({
        countryPrefix: state.settings.countryPrefix,
        messageText: state.settings.messageTemplate
      });
      const tab = resolved?.tab || null;
      if (!tab || typeof tab.id !== "number") {
        App.setStatusWarning("");
        App.setStatus("Open a HubSpot contacts table tab (app.hubspot.com), refresh it, and try again.");
        return;
      }

      if (loadAll) {
        App.setStatus("Loading all visible contacts from HubSpot table...");
      }

      const response = loadAll
        ? await App.sendGetContactsMessage(tab.id, {
            countryPrefix: state.settings.countryPrefix,
            messageText: state.settings.messageTemplate,
            loadAll: true
          })
        : resolved.probeResponse;

      if (!App.isValidContactsPayload(response)) {
        App.setStatusWarning("");
        App.setStatus("Open a HubSpot contacts table tab (app.hubspot.com), refresh it, and try again.");
        return;
      }

      state.currentColumns = response.columns || [];
      const dedupedContacts = dedupeContactsByRecordId(response.contacts || [], state.currentColumns);
      state.currentContacts = filterOutEmptyContacts(dedupedContacts, state.currentColumns);
      state.phoneColumnId = response.phoneColumnId || null;
      state.currentPortalId = (await App.getPortalId(tab)) || "";

      const settingsChanged = App.mergeColumnSettings();
      if (settingsChanged) {
        await App.persistSyncSettings(state.settings);
      }

      state.sortState = { field: null, direction: "asc" };
      renderContacts();
      if (typeof App.trackEvent === "function") {
        const filteredContacts = App.getFilteredContacts();
        App.trackEvent("contacts_loaded", {
          total_contacts: state.currentContacts.length,
          visible_contacts: filteredContacts.length,
          new_contacts: countNewContacts(filteredContacts),
          column_count: state.currentColumns.length,
          load_all: loadAll
        });
      }
    } catch (_error) {
      App.setStatusWarning("");
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
