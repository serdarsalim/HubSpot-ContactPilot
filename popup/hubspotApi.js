(() => {
  const App = window.PopupApp;
  const MT = App.messageTypes;
  const timing = App.timing.popup;

  async function findHubSpotTab() {
    const tabs = await chrome.tabs.query({ url: ["https://app.hubspot.com/*"] });
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

  async function sendCreateNoteMessage(tabId, noteBody) {
    let lastError = "";
    for (let attempt = 0; attempt < timing.messageRetryAttempts; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: MT.CREATE_NOTE_ON_PAGE,
          noteBody
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

    const tabs = await chrome.tabs.query({ url: ["https://app.hubspot.com/*"] });
    const matchingTabs = tabs.filter((tab) => {
      const tabRecordId = extractContactRecordIdFromUrl(tab?.url || "");
      if (tabRecordId !== cleanId) return false;
      if (!cleanPortalId) return true;
      const tabPortalId = extractPortalIdFromContactUrl(tab?.url || "");
      return tabPortalId === cleanPortalId;
    });

    if (!matchingTabs.length) return null;
    matchingTabs.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
    return matchingTabs[0] || null;
  }

  async function withContactTab(recordId, portalId, work) {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    if (!cleanId) {
      throw new Error("Invalid Record ID.");
    }

    const openFreshContactTabAndWork = async () => {
      const url = `https://app.hubspot.com/contacts/${portalId}/record/0-1/${cleanId}?interaction=note`;
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
      await waitForTabComplete(existingTab.id);
      await sleep(timing.contactTabPostLoadDelayMs);
      try {
        return await work(existingTab.id);
      } catch (error) {
        if (!isMissingReceiverError(error)) {
          throw error;
        }
        // Existing tab can miss content-script receiver (e.g. stale tab). Retry on a fresh contact tab.
        return openFreshContactTabAndWork();
      }
    }

    return openFreshContactTabAndWork();
  }

  async function createSingleHubSpotNote(recordId, noteBody, portalId) {
    return withContactTab(recordId, portalId, async (tabId) => {
      await sendCreateNoteMessage(tabId, noteBody);
      return { ok: true };
    });
  }

  async function readSingleHubSpotNotes(recordId, portalId) {
    return withContactTab(recordId, portalId, async (tabId) => {
      const response = await sendGetNotesMessage(tabId);
      return Array.isArray(response?.notes) ? response.notes : [];
    });
  }

  async function createHubSpotNotes(recordIds, noteBody) {
    const hubSpotTab = await findHubSpotTab();
    if (!hubSpotTab || typeof hubSpotTab.id !== "number") {
      return { ok: false, error: "Open a HubSpot tab (app.hubspot.com), refresh it, and try again." };
    }

    const portalId = await getPortalId(hubSpotTab);
    if (!portalId) {
      return { ok: false, error: "Could not detect HubSpot portal ID." };
    }

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
        await createSingleHubSpotNote(recordId, noteBody, portalId);
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

    const hubSpotTab = await findHubSpotTab();
    if (!hubSpotTab || typeof hubSpotTab.id !== "number") {
      throw new Error("Open a HubSpot tab (app.hubspot.com), refresh it, and try again.");
    }

    const portalId = await getPortalId(hubSpotTab);
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
    extractPortalIdFromUrl,
    sleep,
    waitForTabComplete,
    getPortalId,
    sendCreateNoteMessage,
    sendGetNotesMessage,
    findExistingContactTab,
    withContactTab,
    createSingleHubSpotNote,
    readSingleHubSpotNotes,
    createHubSpotNotes,
    getHubSpotNotesForRecord,
    copyTextToClipboard
  });
})();
