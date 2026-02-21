(() => {
  const App = window.PopupApp;

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

  async function waitForTabComplete(tabId, timeoutMs = 30000) {
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
      const response = await chrome.tabs.sendMessage(hubSpotTab.id, { type: "GET_PORTAL_ID" });
      return String(response?.portalId || "");
    } catch (_error) {
      return "";
    }
  }

  async function sendCreateNoteMessage(tabId, noteBody) {
    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "CREATE_NOTE_ON_PAGE",
          noteBody
        });
        if (response?.ok) return response;
        lastError = String(response?.error || "Unknown note creation error.");
      } catch (error) {
        lastError = String(error);
      }
      await sleep(700);
    }

    throw new Error(lastError || "Could not reach note automation on HubSpot tab.");
  }

  async function sendGetNotesMessage(tabId) {
    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "GET_NOTES_ON_PAGE",
          limit: 25
        });
        if (response?.ok) return response;
        lastError = String(response?.error || "Unknown note read error.");
      } catch (error) {
        lastError = String(error);
      }
      await sleep(700);
    }

    throw new Error(lastError || "Could not read notes from HubSpot tab.");
  }

  async function withContactTab(recordId, portalId, work) {
    const cleanId = String(recordId || "").replace(/\D/g, "");
    if (!cleanId) {
      throw new Error("Invalid Record ID.");
    }

    const url = `https://app.hubspot.com/contacts/${portalId}/record/0-1/${cleanId}?interaction=note`;
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab || typeof tab.id !== "number") {
      throw new Error("Could not open HubSpot contact tab.");
    }

    try {
      await waitForTabComplete(tab.id);
      await sleep(1200);
      return await work(tab.id);
    } finally {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (_error) {
        // Ignore tab close failures.
      }
    }
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
    withContactTab,
    createSingleHubSpotNote,
    readSingleHubSpotNotes,
    createHubSpotNotes,
    getHubSpotNotesForRecord,
    copyTextToClipboard
  });
})();
