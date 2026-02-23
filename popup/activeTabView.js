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

  function isHubSpotUrl(url) {
    return /^https:\/\/app\.hubspot\.com\//i.test(String(url || ""));
  }

  async function getActiveHubSpotTab() {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const active = activeTabs.find((tab) => isHubSpotUrl(tab?.url || ""));
    if (active && typeof active.id === "number") return active;
    return App.findHubSpotTab();
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

  function renderActiveTabContext() {
    const context = state.activeTabContext;
    const contact = context?.contact || null;
    const kind = String(context?.kind || "unknown");

    setText(dom.activeTabKindEl, kind);
    setText(dom.activeTabNameEl, contact ? App.getContactDisplayName(contact) : "");
    setText(dom.activeTabRecordIdEl, context?.recordId || "");
    setText(dom.activeTabPortalIdEl, context?.portalId || "");

    const emailCol = App.findEmailColumn();
    const emailValue = contact ? String(contact.values?.[emailCol?.id || "email"] || contact.values?.email || "") : "";
    const phoneValue = contact ? String(contact.values?.[state.phoneColumnId || "phone"] || contact.values?.phone || "") : "";

    setText(dom.activeTabEmailEl, emailValue);
    setText(dom.activeTabPhoneEl, phoneValue);

    const isContact = kind === "contact" && !!contact;
    if (dom.activeTabEmailActionBtn) dom.activeTabEmailActionBtn.disabled = !isContact;
    if (dom.activeTabWhatsappActionBtn) dom.activeTabWhatsappActionBtn.disabled = !isContact;
    if (dom.activeTabNotesActionBtn) dom.activeTabNotesActionBtn.disabled = !isContact || !String(context?.recordId || "").trim();
  }

  async function loadActiveTabContext() {
    setActiveTabStatus("Detecting active HubSpot tab...");

    const tab = await getActiveHubSpotTab();
    if (!tab || typeof tab.id !== "number") {
      state.activeTabContext = null;
      renderActiveTabContext();
      setActiveTabStatus("Open a HubSpot tab and select a contact record to use Active Tab actions.");
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
        contact
      };

      if (portalId) {
        state.currentPortalId = portalId;
      }

      renderActiveTabContext();
      if (kind === "contact") {
        setActiveTabStatus("Active contact loaded. Choose an action below.");
      } else {
        setActiveTabStatus("Active tab is not a contact record. Open a contact record to use Email/WhatsApp/Notes actions.");
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
                  email: "",
                  phone: "",
                  record_id: recordId
                },
                phoneDigits: "",
                waUrl: ""
              }
            : null
      };
      if (portalId) {
        state.currentPortalId = portalId;
      }
      renderActiveTabContext();
      if (kind === "contact" && recordId) {
        setActiveTabStatus("Loaded active contact from URL fallback. Email/Notes are ready; refresh contact page for full field detection.");
      } else {
        setActiveTabStatus("Active tab is not a contact record. Open a contact record to use Email/WhatsApp/Notes actions.");
      }
    }
  }

  function openActiveTabEmailAction() {
    const context = state.activeTabContext;
    if (!context?.contact) return;
    const key = activeTabKey(context);
    App.openEmailTemplatePicker(context.contact, key);
  }

  function openActiveTabWhatsappAction() {
    const context = state.activeTabContext;
    if (!context?.contact) return;
    const key = activeTabKey(context);
    App.openWhatsappTemplatePicker(context.contact, key);
  }

  function openActiveTabNotesAction() {
    const context = state.activeTabContext;
    if (!context?.contact) return;
    const recordId = String(context.recordId || "").replace(/\D/g, "");
    if (!recordId) {
      App.setStatus("Could not detect Record ID from active tab.");
      return;
    }
    App.openNotesDialog(context.contact, recordId);
  }

  Object.assign(App, {
    renderActiveTabContext,
    loadActiveTabContext,
    openActiveTabEmailAction,
    openActiveTabWhatsappAction,
    openActiveTabNotesAction
  });
})();
