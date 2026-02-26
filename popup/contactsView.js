(() => {
  const App = window.PopupApp;
  const { dom, state } = App;
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
    const selectedPart = selected > 0 ? ` Selected ${selected}.` : "";
    App.setStatus(`Found ${total} contact(s).${selectedPart} ${newCount} new.`);
  }

  function renderContacts() {
    dom.listEl.innerHTML = "";
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
              const recordId = App.getRecordIdForContact(contact);
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
              <button
                type='button'
                class='row-action-btn row-notes-btn'
                data-key='${App.escapeHtml(key)}'
                aria-label='Notes'
                title='Notes'
              >
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path d='M4 3h12l4 4v14H4z'></path>
                  <path d='M16 3v4h4'></path>
                  <path d='M8 12h8'></path>
                  <path d='M8 16h8'></path>
                </svg>
              </button>
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
        void App.persistSelectedKeysToSession();
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
          App.openRecordIdRequiredDialog();
          App.setStatus('Missing "Record ID" column. Add it in HubSpot Contacts list columns, then refresh Contact Point.');
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
        App.setStatus("Open a HubSpot contacts table tab (app.hubspot.com), refresh it, and try again.");
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
