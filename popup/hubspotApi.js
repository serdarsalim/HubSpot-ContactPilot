(() => {
  const App = window.PopupApp;
  const MT = App.messageTypes;
  const timing = App.timing.popup;
  const hubSpotUrlPatterns = App.constants.HUBSPOT_URL_PATTERNS || ["https://*.hubspot.com/*"];

  async function findHubSpotTab() {
    const tabs = await chrome.tabs.query({ url: hubSpotUrlPatterns });
    if (!tabs.length) return null;

    const sorted = [...tabs].sort((a, b) => {
      const aLast = Number(a.lastAccessed || 0);
      const bLast = Number(b.lastAccessed || 0);
      return bLast - aLast;
    });

    return sorted[0] || null;
  }

  function extractPortalIdFromUrl(url) {
    const match = String(url || "").match(/\/contacts\/(\d+)\//i);
    return match ? match[1] : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function compareTabsByRecency(a, b) {
    const aLast = Number(a?.lastAccessed || 0);
    const bLast = Number(b?.lastAccessed || 0);
    if (aLast !== bLast) return bLast - aLast;
    return Number(b?.id || 0) - Number(a?.id || 0);
  }

  async function focusTab(tab) {
    const tabId = Number(tab?.id || 0);
    if (!tabId) return;

    const windowId = Number(tab?.windowId || 0);
    if (windowId) {
      try {
        await chrome.windows.update(windowId, { focused: true });
      } catch (_error) {
        // Ignore focus failures and still try to activate the tab.
      }
    }

    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (_error) {
      // Ignore activation failures; caller will surface invalid-tab errors later.
    }
  }

  async function findActiveHubSpotTab() {
    const activeTabs = await chrome.tabs.query({ active: true });
    const candidates = activeTabs.filter((tab) => App.isHubSpotUrl(tab?.url || ""));
    if (!candidates.length) return null;
    candidates.sort(compareTabsByRecency);
    return candidates[0] || null;
  }

  function isValidContactsPayload(response) {
    if (!response || response.ok !== true) return false;
    if (!Array.isArray(response.columns) || !response.columns.length) return false;
    return true;
  }

  function isContactRecordTab(tab) {
    const recordId = extractContactRecordIdFromUrl(tab?.url || "");
    return !!recordId;
  }

  function isLikelyContactsListTab(tab) {
    const url = String(tab?.url || "");
    if (!App.isHubSpotUrl(url)) return false;
    if (/\/record\/0-\d+\//i.test(url)) return false;
    return /\/contacts\//i.test(url);
  }

  async function sendGetContactsMessage(tabId, { countryPrefix = "", messageText = "", loadAll = false } = {}) {
    return chrome.tabs.sendMessage(tabId, {
      type: MT.GET_CONTACTS,
      countryPrefix: String(countryPrefix || ""),
      messageText: String(messageText || ""),
      loadAll: !!loadAll
    });
  }

  async function findBestContactsTab({ countryPrefix = "", messageText = "" } = {}) {
    const activeTab = await findActiveHubSpotTab();
    const hubSpotTabs = await chrome.tabs.query({ url: hubSpotUrlPatterns });
    if (!hubSpotTabs.length) return null;

    const orderedCandidates = [];
    if (activeTab && typeof activeTab.id === "number" && App.isHubSpotUrl(activeTab?.url || "")) {
      orderedCandidates.push(activeTab);
    }

    const remaining = hubSpotTabs
      .filter((tab) => tab?.id !== activeTab?.id)
      .sort(compareTabsByRecency);
    orderedCandidates.push(...remaining);

    for (const tab of orderedCandidates) {
      if (!tab || typeof tab.id !== "number") continue;
      try {
        const response = await sendGetContactsMessage(tab.id, { countryPrefix, messageText, loadAll: false });
        if (!isValidContactsPayload(response)) continue;
        return { tab, probeResponse: response };
      } catch (_error) {
        // Ignore tabs without an active content-script receiver and continue searching.
      }
    }

    return null;
  }

  async function refreshHubSpotContactsSourceTab({ countryPrefix = "", messageText = "" } = {}) {
    const resolvedContactsTab = await findBestContactsTab({ countryPrefix, messageText });
    let tabToRefresh = resolvedContactsTab?.tab || null;

    if (!tabToRefresh || typeof tabToRefresh.id !== "number") {
      const hubSpotTabs = await chrome.tabs.query({ url: hubSpotUrlPatterns });
      const likelyContactsTabs = hubSpotTabs.filter(isLikelyContactsListTab).sort(compareTabsByRecency);
      tabToRefresh = likelyContactsTabs[0] || null;
    }

    if (!tabToRefresh || typeof tabToRefresh.id !== "number") {
      const activeHubSpotTab = await findActiveHubSpotTab();
      tabToRefresh =
        activeHubSpotTab && typeof activeHubSpotTab.id === "number"
          ? activeHubSpotTab
          : await findHubSpotTab();
    }

    if (!tabToRefresh || typeof tabToRefresh.id !== "number") return null;

    await chrome.tabs.reload(tabToRefresh.id);
    await waitForTabComplete(tabToRefresh.id);
    await sleep(timing.contactTabPostLoadDelayMs);
    try {
      return await chrome.tabs.get(tabToRefresh.id);
    } catch (_error) {
      return tabToRefresh;
    }
  }

  async function findBestContactRecordTab() {
    const activeTab = await findActiveHubSpotTab();
    const hubSpotTabs = await chrome.tabs.query({ url: hubSpotUrlPatterns });
    if (!hubSpotTabs.length) return null;

    if (activeTab && typeof activeTab.id === "number" && isContactRecordTab(activeTab)) {
      return activeTab;
    }

    const remaining = hubSpotTabs.filter((tab) => tab?.id !== activeTab?.id && isContactRecordTab(tab)).sort(compareTabsByRecency);
    return remaining[0] || null;
  }

  async function waitForTabComplete(tabId, timeoutMs = timing.waitForTabCompleteTimeoutMs) {
    try {
      const existingTab = await chrome.tabs.get(tabId);
      if (existingTab?.status === "complete") {
        return;
      }
    } catch (_error) {
      // Fall through to listener path; a later call will surface invalid tab errors.
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        reject(new Error("Timed out waiting for HubSpot tab to load."));
      }, timeoutMs);

      const handleUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId) return;
        if (changeInfo.status !== "complete") return;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        resolve();
      };

      chrome.tabs.onUpdated.addListener(handleUpdated);
    });
  }

  async function getPortalId(hubSpotTab) {
    const fromUrl = extractPortalIdFromUrl(hubSpotTab?.url || "");
    if (fromUrl) return fromUrl;

    if (!hubSpotTab || typeof hubSpotTab.id !== "number") return "";
    try {
      const response = await chrome.tabs.sendMessage(hubSpotTab.id, { type: MT.GET_PORTAL_ID });
      return String(response?.portalId || "");
    } catch (_error) {
      return "";
    }
  }

  async function sendCreateNoteMessage(tabId, noteBody, noteHtml = "") {
    let lastError = "";
    for (let attempt = 0; attempt < timing.messageRetryAttempts; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: MT.CREATE_NOTE_ON_PAGE,
          noteBody,
          noteHtml
        });
        if (response?.ok) return response;
        lastError = String(response?.error || "Unknown note creation error.");
      } catch (error) {
        lastError = String(error);
      }
      await sleep(timing.messageRetryDelayMs);
    }

    throw new Error(lastError || "Could not reach note automation on HubSpot tab.");
  }

  async function sendGetNotesMessage(tabId) {
    let lastError = "";
    for (let attempt = 0; attempt < timing.messageRetryAttempts; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: MT.GET_NOTES_ON_PAGE,
          limit: 25
        });
        if (response?.ok) return response;
        lastError = String(response?.error || "Unknown note read error.");
      } catch (error) {
        lastError = String(error);
      }
      await sleep(timing.messageRetryDelayMs);
    }

    throw new Error(lastError || "Could not read notes from HubSpot tab.");
  }

  function isMissingReceiverError(error) {
    const text = String(error || "").toLowerCase();
    return text.includes("receiving end does not exist") || text.includes("could not establish connection");
  }


  function extractContactRecordIdFromUrl(url) {
    const match = String(url || "").match(/\/record\/0-1\/(\d+)/i);
    return match ? match[1] : "";
  }

  function extractPortalIdFromContactUrl(url) {
    const match = String(url || "").match(/\/contacts\/(\d+)\/record\/0-1\//i);
    return match ? match[1] : "";
  }

  async function findExistingContactTab(recordId, portalId = "") {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    const cleanPortalId = String(portalId || "").replace(/\D/g, "");
    if (!cleanId) return null;

    const tabs = await chrome.tabs.query({ url: hubSpotUrlPatterns });
    const matchingTabs = tabs.filter((tab) => {
      const tabRecordId = extractContactRecordIdFromUrl(tab?.url || "");
      if (tabRecordId !== cleanId) return false;
      if (!cleanPortalId) return true;
      const tabPortalId = extractPortalIdFromContactUrl(tab?.url || "");
      return tabPortalId === cleanPortalId;
    });

    if (!matchingTabs.length) return null;
    const activeHubSpotTab = await findActiveHubSpotTab();
    if (activeHubSpotTab && matchingTabs.some((tab) => tab.id === activeHubSpotTab.id)) {
      return activeHubSpotTab;
    }
    matchingTabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
    return matchingTabs[0] || null;
  }

  async function resolveHubSpotOriginForRecord(recordId, portalId = "") {
    const existingTab = await findExistingContactTab(recordId, portalId);
    if (existingTab?.url) return App.getHubSpotOrigin(existingTab.url);

    const activeHubSpotTab = await findActiveHubSpotTab();
    if (activeHubSpotTab?.url) return App.getHubSpotOrigin(activeHubSpotTab.url);

    const fallbackHubSpotTab = await findHubSpotTab();
    if (fallbackHubSpotTab?.url) return App.getHubSpotOrigin(fallbackHubSpotTab.url);

    return App.getHubSpotOrigin(App.state?.currentHubSpotOrigin || "");
  }

  async function openOrFocusContactTab(recordId, portalId = "") {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    const cleanPortalId = String(portalId || "").replace(/\D/g, "");
    if (!cleanId) {
      throw new Error("Invalid Record ID.");
    }

    const existingTab = await findExistingContactTab(cleanId, cleanPortalId);
    if (existingTab && typeof existingTab.id === "number") {
      await focusTab(existingTab);
      return existingTab;
    }

    if (!cleanPortalId) {
      throw new Error("Could not detect HubSpot portal ID for this contact.");
    }

    const url = App.buildHubSpotContactUrl(cleanId, cleanPortalId, await resolveHubSpotOriginForRecord(cleanId, cleanPortalId));
    const openedTab = await chrome.tabs.create({ url, active: true });
    if (!openedTab || typeof openedTab.id !== "number") {
      throw new Error("Could not open HubSpot contact tab.");
    }
    return openedTab;
  }

  async function withContactTab(recordId, portalId, work, options = {}) {
    const allowOpenFresh = options.allowOpenFresh !== false;
    const interaction = String(options.interaction || "").trim().toLowerCase();
    const cleanId = String(recordId || "").replace(/\D/g, "");
    const cleanPortalId = String(portalId || "").replace(/\D/g, "");
    if (!cleanId) {
      throw new Error("Invalid Record ID.");
    }

    const openFreshContactTabAndWork = async () => {
      if (!allowOpenFresh) {
        throw new Error("Open the contact tab and try again.");
      }
      if (!portalId) {
        throw new Error("Could not detect HubSpot portal ID for this contact.");
      }
      const baseUrl = App.buildHubSpotContactUrl(cleanId, portalId, await resolveHubSpotOriginForRecord(cleanId, portalId));
      const url = interaction ? `${baseUrl}?interaction=${encodeURIComponent(interaction)}` : baseUrl;
      const openedTab = await chrome.tabs.create({ url, active: false });
      if (!openedTab || typeof openedTab.id !== "number") {
        throw new Error("Could not open HubSpot contact tab.");
      }

      await waitForTabComplete(openedTab.id);
      await sleep(timing.contactTabPostLoadDelayMs);
      return work(openedTab.id);
    };

    const existingTab = await findExistingContactTab(cleanId, portalId);
    if (existingTab && typeof existingTab.id === "number") {
      await focusTab(existingTab);
      await waitForTabComplete(existingTab.id);
      await sleep(timing.contactTabPostLoadDelayMs);
      try {
        return await work(existingTab.id);
      } catch (error) {
        if (!isMissingReceiverError(error)) {
          throw error;
        }
        if (!allowOpenFresh) {
          throw new Error("Could not read notes from the current contact tab. Refresh that tab and try again.");
        }
        const retryPortalId = cleanPortalId || extractPortalIdFromContactUrl(existingTab?.url || "");
        const retryBaseUrl = retryPortalId
          ? App.buildHubSpotContactUrl(cleanId, retryPortalId, App.getHubSpotOrigin(existingTab?.url || ""))
          : "";
        const retryUrl = retryBaseUrl
          ? interaction
            ? `${retryBaseUrl}?interaction=${encodeURIComponent(interaction)}`
            : retryBaseUrl
          : existingTab?.url || "";

        if (retryUrl) {
          await chrome.tabs.update(existingTab.id, { url: retryUrl, active: true });
          await focusTab(existingTab);
          await waitForTabComplete(existingTab.id);
          await sleep(timing.contactTabPostLoadDelayMs);
          return work(existingTab.id);
        }

        // Fall back to a fresh tab only if we cannot safely reuse the existing one.
        return openFreshContactTabAndWork();
      }
    }

    if (!allowOpenFresh) {
      throw new Error("Open the contact tab and try again.");
    }
    return openFreshContactTabAndWork();
  }

  async function resolvePortalIdForRecord(recordId = "") {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    if (!cleanId) return "";

    const existingContactTab = await findExistingContactTab(cleanId);
    const existingPortalId = extractPortalIdFromContactUrl(existingContactTab?.url || "");
    if (existingPortalId) return existingPortalId;

    const bestContactTab = await findBestContactRecordTab();
    const bestPortalId = extractPortalIdFromContactUrl(bestContactTab?.url || "");
    if (bestPortalId) return bestPortalId;

    const hubSpotTab = await findHubSpotTab();
    if (!hubSpotTab || typeof hubSpotTab.id !== "number") return "";
    return getPortalId(hubSpotTab);
  }

  async function createSingleHubSpotNote(recordId, noteBody, portalId, noteHtml = "") {
    return withContactTab(recordId, portalId, async (tabId) => {
      await sendCreateNoteMessage(tabId, noteBody, noteHtml);
      return { ok: true };
    }, { allowOpenFresh: true, interaction: "note" });
  }

  async function readSingleHubSpotNotes(recordId, portalId) {
    return withContactTab(recordId, portalId, async (tabId) => {
      const response = await sendGetNotesMessage(tabId);
      return Array.isArray(response?.notes) ? response.notes : [];
    }, { allowOpenFresh: false });
  }

  async function createHubSpotNotes(recordIds, noteBody, noteHtml = "") {
    const uniqueRecordIds = [
      ...new Set(
        (Array.isArray(recordIds) ? recordIds : [])
          .map((id) => String(id || "").replace(/\D/g, ""))
          .filter(Boolean)
      )
    ];

    const failed = [];
    let created = 0;

    for (const recordId of uniqueRecordIds) {
      try {
        const portalId = await resolvePortalIdForRecord(recordId);
        if (!portalId) {
          throw new Error("Could not detect HubSpot portal ID.");
        }
        await createSingleHubSpotNote(recordId, noteBody, portalId, noteHtml);
        created += 1;
      } catch (error) {
        failed.push({ recordId, error: String(error) });
      }
    }

    return { ok: true, created, failed };
  }

  async function getHubSpotNotesForRecord(recordId) {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    if (!cleanId) {
      throw new Error("Invalid Record ID.");
    }

    const portalId = await resolvePortalIdForRecord(cleanId);
    if (!portalId) {
      throw new Error("Could not detect HubSpot portal ID.");
    }

    return readSingleHubSpotNotes(cleanId, portalId);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  Object.assign(App, {
    findHubSpotTab,
    findBestContactsTab,
    refreshHubSpotContactsSourceTab,
    findBestContactRecordTab,
    extractPortalIdFromUrl,
    focusTab,
    isValidContactsPayload,
    sleep,
    waitForTabComplete,
    getPortalId,
    sendGetContactsMessage,
    sendCreateNoteMessage,
    sendGetNotesMessage,
    findExistingContactTab,
    openOrFocusContactTab,
    withContactTab,
    createSingleHubSpotNote,
    readSingleHubSpotNotes,
    resolvePortalIdForRecord,
    createHubSpotNotes,
    getHubSpotNotesForRecord,
    copyTextToClipboard
  });
})();
