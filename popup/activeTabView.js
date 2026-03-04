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

  async function requestActiveTabContext(tab) {
    const attempts = Number(App.timing?.popup?.messageRetryAttempts || 3);
    const delayMs = Number(App.timing?.popup?.messageRetryDelayMs || 500);
    let lastError = "";

    try {
      await App.waitForTabComplete(tab.id);
    } catch (_error) {
      // Best-effort only; retry loop below still handles transient states.
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: MT.GET_ACTIVE_TAB_CONTEXT,
          countryPrefix: state.settings.countryPrefix,
          messageText: state.settings.messageTemplate
        });
        if (response?.ok) return response;
        lastError = String(response?.error || "Context inspection failed.");
      } catch (error) {
        lastError = String(error || "");
      }
      if (attempt < attempts - 1) {
        await App.sleep(delayMs);
      }
    }

    throw new Error(lastError || "Could not reach active contact context.");
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

  function setMultilineText(el, value, fallback = "-") {
    if (!el) return;
    const next = String(value || "").trim();
    if (!next) {
      el.textContent = fallback;
      return;
    }
    el.innerHTML = App.escapeHtml(next).replace(/\n/g, "<br>");
  }

  function normalizePhoneDisplay(value) {
    return String(value || "")
      .replace(/^tel:/i, "")
      .trim();
  }

  function getPhoneDigitsForContact(contact, phoneRawValue) {
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

    return "";
  }

  function buildBlankWhatsappUrl(contact, phoneRawValue) {
    const phoneDigits = getPhoneDigitsForContact(contact, phoneRawValue);
    if (!phoneDigits) return "";
    return `https://web.whatsapp.com/send/?phone=${phoneDigits}&type=phone_number`;
  }

  function getActiveContactContext() {
    const context = state.activeTabContext;
    const isContact = String(context?.kind || "") === "contact" && !!context?.contact;
    return isContact ? context : null;
  }

  function wireActiveTabQuickActions() {
    if (!dom.activeTabPageEl || dom.activeTabPageEl.dataset.quickActionsBound === "1") return;
    dom.activeTabPageEl.dataset.quickActionsBound = "1";

    dom.activeTabPageEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const emailTrigger = target.closest("[data-active-tab-email-template]");
      if (emailTrigger) {
        event.preventDefault();
        const context = getActiveContactContext();
        if (!context) return;
        App.openEmailTemplatePicker(context.contact, activeTabKey(context));
        return;
      }

      const notesTrigger = target.closest("[data-active-tab-open-notes]");
      if (notesTrigger) {
        event.preventDefault();
        const context = getActiveContactContext();
        if (!context) return;
        const recordId = String(context.recordId || "").replace(/\D/g, "");
        if (!recordId) return;
        App.openNotesDialog(context.contact, recordId);
        return;
      }

      const whatsappTrigger = target.closest("[data-active-tab-whatsapp-template]");
      if (whatsappTrigger) {
        event.preventDefault();
        const context = getActiveContactContext();
        if (!context) return;
        App.openWhatsappTemplatePicker(context.contact, activeTabKey(context));
        return;
      }

      const phoneWhatsappTrigger = target.closest("[data-active-tab-open-whatsapp]");
      if (phoneWhatsappTrigger) {
        event.preventDefault();
        const context = getActiveContactContext();
        if (!context) return;
        void App.openDirectWhatsappForContact(context.contact);
      }
    });
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
    const hasPhoneValue = !!phoneValue && phoneValue !== "-";

    if (dom.activeTabPhoneEl) {
      if (kind === "contact" && contact) {
        dom.activeTabPhoneEl.innerHTML = `
          <span class="active-tab-phone-wrap">
            ${
              hasPhoneValue
                ? `<button type="button" class="active-tab-inline-link active-tab-phone-link" data-active-tab-open-whatsapp="1" title="Open WhatsApp">${App.escapeHtml(
                    phoneValue
                  )}</button>`
                : `<span>${App.escapeHtml(phoneValue || "-")}</span>`
            }
            <button type="button" class="active-tab-whatsapp-link" data-active-tab-whatsapp-template="1" aria-label="WhatsApp templates" title="WhatsApp templates">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4c4.7 0 8.5 3.4 8.5 7.5S16.7 19 12 19c-1 0-2-.2-2.9-.5L4 20l1.4-3.8C4.5 14.9 4 13.2 4 11.5 4 7.4 7.8 4 12 4z"></path>
                <circle cx="9" cy="11.5" r="0.9"></circle>
                <circle cx="12" cy="11.5" r="0.9"></circle>
                <circle cx="15" cy="11.5" r="0.9"></circle>
              </svg>
            </button>
          </span>
        `;
      } else {
        dom.activeTabPhoneEl.textContent = phoneValue || "-";
      }
    }
    if (dom.activeTabEmailEl) {
      if (emailValue) {
        if (kind === "contact" && contact) {
          dom.activeTabEmailEl.innerHTML = `<button type="button" class="active-tab-inline-link" data-active-tab-email-template="1">${App.escapeHtml(
            emailValue
          )}</button>`;
        } else {
          dom.activeTabEmailEl.textContent = emailValue;
        }
      } else if (kind === "contact" && contact) {
        dom.activeTabEmailEl.innerHTML = `<button type="button" class="active-tab-inline-link" data-active-tab-email-template="1">Use Email Template</button>`;
      } else {
        dom.activeTabEmailEl.textContent = "-";
      }
    }
    if (dom.activeTabLatestNoteEl) {
      const linkLabel = latestNote || "Open Notes";
      if (kind === "contact" && contact) {
        dom.activeTabLatestNoteEl.innerHTML = `<button type="button" class="active-tab-inline-link" data-active-tab-open-notes="1">${App.escapeHtml(
          linkLabel
        )}</button>`;
      } else {
        dom.activeTabLatestNoteEl.textContent = latestNote || "No recent notes";
      }
    }
    setMultilineText(dom.activeTabLatestTaskEl, latestTask, "No recent tasks");
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
      const response = await requestActiveTabContext(tab);

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
        setActiveTabStatus("Loaded contact from URL fallback only. Refresh the contact tab and click Refresh.");
      } else {
        setActiveTabStatus("Selected tab is not a contact record. Open a contact record to use Email/WhatsApp/Notes actions.");
      }
    }
  }

  Object.assign(App, {
    renderActiveTabContext,
    loadActiveTabContext
  });

  wireActiveTabQuickActions();
})();
