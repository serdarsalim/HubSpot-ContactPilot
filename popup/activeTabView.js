(() => {
  const App = window.PopupApp;
  const { dom, state } = App;
  const MT = App.messageTypes;

  function parseRecordIdFromUrl(url) {
    const match = String(url || "").match(/\/record\/0-1\/(\d+)/i);
    return match ? String(match[1]) : "";
  }

  function parseObjectKindFromUrl(url) {
    const match = String(url || "").match(/\/record\/0-(\d+)\//i);
    if (!match) return "unknown";
    const objectType = match[1];
    if (objectType === "1") return "contact";
    if (objectType === "2") return "company";
    if (objectType === "3") return "deal";
    return "record";
  }

  function sanitizeTitleName(title) {
    const raw = String(title || "").trim();
    if (!raw) return "";
    const left = raw.split("|")[0] || raw;
    return left.replace(/\s*-\s*HubSpot\s*$/i, "").trim();
  }

  async function getPreferredContactRecordTab() {
    const tab = await App.findBestContactRecordTab();
    if (tab && typeof tab.id === "number") return tab;
    return null;
  }

  function activeTabKey(context) {
    const recordId = String(context?.recordId || "").replace(/\D/g, "");
    if (recordId) return `record_${recordId}`;
    const tabId = Number(context?.tabId || 0);
    return tabId > 0 ? `active_tab_${tabId}` : "active_tab";
  }

  function setActiveTabStatus(text) {
    if (dom.activeTabStatusEl) {
      dom.activeTabStatusEl.textContent = String(text || "");
    }
  }

  function setText(el, value) {
    if (!el) return;
    const next = String(value || "").trim();
    el.textContent = next || "-";
  }

  function normalizePhoneDisplay(value) {
    return String(value || "")
      .replace(/^tel:/i, "")
      .trim();
  }

  function bindContactCardLinks(context) {
    const isContact = String(context?.kind || "") === "contact" && !!context?.contact;
    if (dom.activeTabEmailEl) {
      const emailTemplateLink = dom.activeTabEmailEl.querySelector("[data-active-tab-email-template]");
      if (emailTemplateLink instanceof HTMLElement) {
        emailTemplateLink.addEventListener("click", (event) => {
          event.preventDefault();
          if (!isContact) return;
          const key = activeTabKey(context);
          App.openEmailTemplatePicker(context.contact, key);
        });
      }
    }

    if (dom.activeTabLatestNoteEl) {
      const notesLink = dom.activeTabLatestNoteEl.querySelector("[data-active-tab-open-notes]");
      if (notesLink instanceof HTMLElement) {
        notesLink.addEventListener("click", (event) => {
          event.preventDefault();
          if (!isContact) return;
          const recordId = String(context?.recordId || "").replace(/\D/g, "");
          if (!recordId) return;
          App.openNotesDialog(context.contact, recordId);
        });
      }
    }
  }

  function renderActiveTabContext() {
    const context = state.activeTabContext;
    const contact = context?.contact || null;
    const kind = String(context?.kind || "unknown");

    setText(dom.activeTabNameEl, contact ? App.getContactDisplayName(contact) : "");
    setText(dom.activeTabOwnerEl, context?.owner || contact?.values?.owner || "");
    const emailValue = contact ? String(contact.values?.email || "").trim() : "";
    const latestNote = String(context?.latestNote || context?.recentNotes?.[0] || "").trim();
    const latestTask = String(context?.latestTask || context?.recentTasks?.[0] || "").trim();
    const phoneRawValue = contact ? String(contact.values?.[state.phoneColumnId || "phone"] || contact.values?.phone || "") : "";
    const phoneValue = normalizePhoneDisplay(phoneRawValue);

    if (dom.activeTabPhoneEl) {
      if (contact?.waUrl) {
        dom.activeTabPhoneEl.innerHTML = `<a class='active-tab-phone-link' href='${App.escapeHtml(contact.waUrl)}' target='_blank' rel='noopener noreferrer'>${App.escapeHtml(
          phoneValue || "Open WhatsApp"
        )}</a>`;
      } else {
        dom.activeTabPhoneEl.textContent = phoneValue || "-";
      }
    }
    if (dom.activeTabEmailEl) {
      if (emailValue) {
        dom.activeTabEmailEl.innerHTML = `${App.escapeHtml(emailValue)}<br><a href="#" class="active-tab-inline-link" data-active-tab-email-template="1">Use Email Template</a>`;
      } else if (kind === "contact" && contact) {
        dom.activeTabEmailEl.innerHTML = `<a href="#" class="active-tab-inline-link" data-active-tab-email-template="1">Use Email Template</a>`;
      } else {
        dom.activeTabEmailEl.textContent = "-";
      }
    }
    if (dom.activeTabLatestNoteEl) {
      const linkLabel = latestNote || "Open Notes";
      if (kind === "contact" && contact) {
        dom.activeTabLatestNoteEl.innerHTML = `<a href="#" class="active-tab-inline-link" data-active-tab-open-notes="1">${App.escapeHtml(linkLabel)}</a>`;
      } else {
        dom.activeTabLatestNoteEl.textContent = latestNote || "No recent notes";
      }
    }
    setText(dom.activeTabLatestTaskEl, latestTask || "No recent tasks");
    bindContactCardLinks(context);
  }

  async function loadActiveTabContext() {
    setActiveTabStatus("Detecting contact tab...");

    const tab = await getPreferredContactRecordTab();
    if (!tab || typeof tab.id !== "number") {
      state.activeTabContext = null;
      renderActiveTabContext();
      setActiveTabStatus("Open a HubSpot contact record tab to use Contact Card actions.");
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: MT.GET_ACTIVE_TAB_CONTEXT,
        countryPrefix: state.settings.countryPrefix,
        messageText: state.settings.messageTemplate
      });

      if (!response?.ok) {
        throw new Error(String(response?.error || "Context inspection failed."));
      }

      const recordId = String(response.recordId || parseRecordIdFromUrl(tab.url || "")).replace(/\D/g, "");
      const portalId = String(response.portalId || App.extractPortalIdFromUrl(tab.url || "") || "").replace(/\D/g, "");
      const contact = response.contact || null;
      const kind = String(response.kind || (recordId ? "contact" : "unknown"));

      state.activeTabContext = {
        tabId: tab.id,
        kind,
        portalId,
        recordId,
        contact,
        owner: String(response.owner || contact?.values?.owner || "").trim(),
        latestNote: String(response.latestNote || response.recentNotes?.[0] || "").trim(),
        latestTask: String(response.latestTask || response.recentTasks?.[0] || "").trim(),
        recentNotes: Array.isArray(response.recentNotes) ? response.recentNotes : [],
        recentTasks: Array.isArray(response.recentTasks) ? response.recentTasks : []
      };

      if (portalId) {
        state.currentPortalId = portalId;
      }

      renderActiveTabContext();
      if (kind === "contact") {
        setActiveTabStatus("Active contact loaded. Use the links in this card.");
      } else {
        setActiveTabStatus("Selected tab is not a contact record. Open a contact record to use Email/WhatsApp/Notes actions.");
      }
    } catch (_error) {
      const kind = parseObjectKindFromUrl(tab.url || "");
      const recordId = String(parseRecordIdFromUrl(tab.url || "")).replace(/\D/g, "");
      const portalId = String(App.extractPortalIdFromUrl(tab.url || "") || "").replace(/\D/g, "");

      state.activeTabContext = {
        tabId: tab.id,
        kind,
        portalId,
        recordId,
        contact:
          kind === "contact" && recordId
            ? {
                key: `record_${recordId}`,
                recordId,
                values: {
                  name: sanitizeTitleName(tab.title || ""),
                  owner: "",
                  email: "",
                  phone: "",
                  record_id: recordId
                },
                phoneDigits: "",
                waUrl: ""
              }
            : null,
        owner: "",
        latestNote: "",
        latestTask: "",
        recentNotes: [],
        recentTasks: []
      };
      if (portalId) {
        state.currentPortalId = portalId;
      }
      renderActiveTabContext();
      if (kind === "contact" && recordId) {
        setActiveTabStatus("Loaded active contact from URL fallback. Email/Notes are ready; refresh contact page for full field detection.");
      } else {
        setActiveTabStatus("Selected tab is not a contact record. Open a contact record to use Email/WhatsApp/Notes actions.");
      }
    }
  }

  Object.assign(App, {
    renderActiveTabContext,
    loadActiveTabContext
  });
})();
