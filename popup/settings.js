(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  let pendingImportTemplates = [];
  let cloudPendingRowSeq = 0;
  let cloudPendingRows = [];
  const cloudPendingTokenDrafts = {};
  const cloudAuthTokenDrafts = {};
  let countryDropdownBound = false;
  let settingsAutosaveBound = false;
  let settingsAutosaveTimerId = null;
  let settingsAutosaveDirty = false;
  let settingsAutosaveInFlight = false;
  let settingsAutosaveQueued = false;
  const SETTINGS_AUTOSAVE_DEBOUNCE_MS = 420;
  const COUNTRY_PREFIX_OPTIONS = Object.freeze([
    { name: "Afghanistan", code: "93" },
    { name: "Albania", code: "355" },
    { name: "Algeria", code: "213" },
    { name: "Andorra", code: "376" },
    { name: "Angola", code: "244" },
    { name: "Antigua and Barbuda", code: "1268" },
    { name: "Argentina", code: "54" },
    { name: "Armenia", code: "374" },
    { name: "Australia", code: "61" },
    { name: "Austria", code: "43" },
    { name: "Azerbaijan", code: "994" },
    { name: "Bahamas", code: "1242" },
    { name: "Bahrain", code: "973" },
    { name: "Bangladesh", code: "880" },
    { name: "Barbados", code: "1246" },
    { name: "Belarus", code: "375" },
    { name: "Belgium", code: "32" },
    { name: "Belize", code: "501" },
    { name: "Benin", code: "229" },
    { name: "Bhutan", code: "975" },
    { name: "Bolivia", code: "591" },
    { name: "Bosnia and Herzegovina", code: "387" },
    { name: "Botswana", code: "267" },
    { name: "Brazil", code: "55" },
    { name: "Brunei", code: "673" },
    { name: "Bulgaria", code: "359" },
    { name: "Burkina Faso", code: "226" },
    { name: "Burundi", code: "257" },
    { name: "Cambodia", code: "855" },
    { name: "Cameroon", code: "237" },
    { name: "Canada", code: "1" },
    { name: "Cape Verde", code: "238" },
    { name: "Central African Republic", code: "236" },
    { name: "Chad", code: "235" },
    { name: "Chile", code: "56" },
    { name: "China", code: "86" },
    { name: "Colombia", code: "57" },
    { name: "Comoros", code: "269" },
    { name: "Congo (Republic)", code: "242" },
    { name: "Congo (DRC)", code: "243" },
    { name: "Costa Rica", code: "506" },
    { name: "Cote d'Ivoire", code: "225" },
    { name: "Croatia", code: "385" },
    { name: "Cuba", code: "53" },
    { name: "Cyprus", code: "357" },
    { name: "Czechia", code: "420" },
    { name: "Denmark", code: "45" },
    { name: "Djibouti", code: "253" },
    { name: "Dominica", code: "1767" },
    { name: "Dominican Republic", code: "1809" },
    { name: "Ecuador", code: "593" },
    { name: "Egypt", code: "20" },
    { name: "El Salvador", code: "503" },
    { name: "Equatorial Guinea", code: "240" },
    { name: "Eritrea", code: "291" },
    { name: "Estonia", code: "372" },
    { name: "Eswatini", code: "268" },
    { name: "Ethiopia", code: "251" },
    { name: "Fiji", code: "679" },
    { name: "Finland", code: "358" },
    { name: "France", code: "33" },
    { name: "Gabon", code: "241" },
    { name: "Gambia", code: "220" },
    { name: "Georgia", code: "995" },
    { name: "Germany", code: "49" },
    { name: "Ghana", code: "233" },
    { name: "Greece", code: "30" },
    { name: "Grenada", code: "1473" },
    { name: "Guatemala", code: "502" },
    { name: "Guinea", code: "224" },
    { name: "Guinea-Bissau", code: "245" },
    { name: "Guyana", code: "592" },
    { name: "Haiti", code: "509" },
    { name: "Honduras", code: "504" },
    { name: "Hungary", code: "36" },
    { name: "Iceland", code: "354" },
    { name: "India", code: "91" },
    { name: "Indonesia", code: "62" },
    { name: "Iran", code: "98" },
    { name: "Iraq", code: "964" },
    { name: "Ireland", code: "353" },
    { name: "Israel", code: "972" },
    { name: "Italy", code: "39" },
    { name: "Jamaica", code: "1876" },
    { name: "Japan", code: "81" },
    { name: "Jordan", code: "962" },
    { name: "Kazakhstan", code: "7" },
    { name: "Kenya", code: "254" },
    { name: "Kiribati", code: "686" },
    { name: "Kuwait", code: "965" },
    { name: "Kyrgyzstan", code: "996" },
    { name: "Laos", code: "856" },
    { name: "Latvia", code: "371" },
    { name: "Lebanon", code: "961" },
    { name: "Lesotho", code: "266" },
    { name: "Liberia", code: "231" },
    { name: "Libya", code: "218" },
    { name: "Liechtenstein", code: "423" },
    { name: "Lithuania", code: "370" },
    { name: "Luxembourg", code: "352" },
    { name: "Madagascar", code: "261" },
    { name: "Malawi", code: "265" },
    { name: "Malaysia", code: "60" },
    { name: "Maldives", code: "960" },
    { name: "Mali", code: "223" },
    { name: "Malta", code: "356" },
    { name: "Marshall Islands", code: "692" },
    { name: "Mauritania", code: "222" },
    { name: "Mauritius", code: "230" },
    { name: "Mexico", code: "52" },
    { name: "Micronesia", code: "691" },
    { name: "Moldova", code: "373" },
    { name: "Monaco", code: "377" },
    { name: "Mongolia", code: "976" },
    { name: "Montenegro", code: "382" },
    { name: "Morocco", code: "212" },
    { name: "Mozambique", code: "258" },
    { name: "Myanmar", code: "95" },
    { name: "Namibia", code: "264" },
    { name: "Nauru", code: "674" },
    { name: "Nepal", code: "977" },
    { name: "Netherlands", code: "31" },
    { name: "New Zealand", code: "64" },
    { name: "Nicaragua", code: "505" },
    { name: "Niger", code: "227" },
    { name: "Nigeria", code: "234" },
    { name: "North Korea", code: "850" },
    { name: "North Macedonia", code: "389" },
    { name: "Norway", code: "47" },
    { name: "Oman", code: "968" },
    { name: "Pakistan", code: "92" },
    { name: "Palau", code: "680" },
    { name: "Palestine", code: "970" },
    { name: "Panama", code: "507" },
    { name: "Papua New Guinea", code: "675" },
    { name: "Paraguay", code: "595" },
    { name: "Peru", code: "51" },
    { name: "Philippines", code: "63" },
    { name: "Poland", code: "48" },
    { name: "Portugal", code: "351" },
    { name: "Qatar", code: "974" },
    { name: "Romania", code: "40" },
    { name: "Russia", code: "7" },
    { name: "Rwanda", code: "250" },
    { name: "Saint Kitts and Nevis", code: "1869" },
    { name: "Saint Lucia", code: "1758" },
    { name: "Saint Vincent and the Grenadines", code: "1784" },
    { name: "Samoa", code: "685" },
    { name: "San Marino", code: "378" },
    { name: "Sao Tome and Principe", code: "239" },
    { name: "Saudi Arabia", code: "966" },
    { name: "Senegal", code: "221" },
    { name: "Serbia", code: "381" },
    { name: "Seychelles", code: "248" },
    { name: "Sierra Leone", code: "232" },
    { name: "Singapore", code: "65" },
    { name: "Slovakia", code: "421" },
    { name: "Slovenia", code: "386" },
    { name: "Solomon Islands", code: "677" },
    { name: "Somalia", code: "252" },
    { name: "South Africa", code: "27" },
    { name: "South Korea", code: "82" },
    { name: "South Sudan", code: "211" },
    { name: "Spain", code: "34" },
    { name: "Sri Lanka", code: "94" },
    { name: "Sudan", code: "249" },
    { name: "Suriname", code: "597" },
    { name: "Sweden", code: "46" },
    { name: "Switzerland", code: "41" },
    { name: "Syria", code: "963" },
    { name: "Taiwan", code: "886" },
    { name: "Tajikistan", code: "992" },
    { name: "Tanzania", code: "255" },
    { name: "Thailand", code: "66" },
    { name: "Timor-Leste", code: "670" },
    { name: "Togo", code: "228" },
    { name: "Tonga", code: "676" },
    { name: "Trinidad and Tobago", code: "1868" },
    { name: "Tunisia", code: "216" },
    { name: "Turkey", code: "90" },
    { name: "Turkmenistan", code: "993" },
    { name: "Tuvalu", code: "688" },
    { name: "Uganda", code: "256" },
    { name: "Ukraine", code: "380" },
    { name: "United Arab Emirates", code: "971" },
    { name: "United Kingdom", code: "44" },
    { name: "United States", code: "1" },
    { name: "Uruguay", code: "598" },
    { name: "Uzbekistan", code: "998" },
    { name: "Vanuatu", code: "678" },
    { name: "Vatican City", code: "379" },
    { name: "Venezuela", code: "58" },
    { name: "Vietnam", code: "84" },
    { name: "Yemen", code: "967" },
    { name: "Zambia", code: "260" },
    { name: "Zimbabwe", code: "263" }
  ]);

  function buildSyncSettingsPayload(settingsInput = state.settings) {
    const source = settingsInput && typeof settingsInput === "object" ? settingsInput : {};
    const {
      emailTemplates: _ignoreEmailTemplates,
      whatsappTemplates: _ignoreWhatsappTemplates,
      noteTemplates: _ignoreNoteTemplates,
      ...syncSafeSettings
    } = source;
    return syncSafeSettings;
  }

  async function persistSyncSettings(settingsInput = state.settings) {
    const syncSafeSettings = buildSyncSettingsPayload(settingsInput);
    await chrome.storage.sync.set({ [constants.SETTINGS_KEY]: syncSafeSettings });
  }

  function normalizeCloudAuthList(rawList) {
    const source = Array.isArray(rawList) ? rawList : [];
    const byOrgId = new Map();
    for (const item of source) {
      const normalized = App.normalizeCloudAuth(item);
      if (!normalized) continue;
      byOrgId.set(normalized.organizationId, normalized);
    }
    return Array.from(byOrgId.values());
  }

  function findCloudAuthByOrgId(organizationIdInput) {
    const organizationId = String(organizationIdInput || "").trim();
    if (!organizationId) return null;
    return state.cloud.authList.find((item) => item.organizationId === organizationId) || null;
  }

  function getCloudConnectionCount() {
    return Array.isArray(state.cloud.authList) ? state.cloud.authList.length : 0;
  }

  function canAddMoreCloudRows() {
    return getCloudConnectionCount() + cloudPendingRows.length < constants.MAX_CLOUD_ORG_CONNECTIONS;
  }

  function canShowAddMoreButton() {
    const connectedCount = getCloudConnectionCount();
    if (connectedCount <= 0) return false;
    if (cloudPendingRows.length > 0) return false;
    return canAddMoreCloudRows();
  }

  function createCloudPendingRow() {
    cloudPendingRowSeq += 1;
    return `pending_cloud_row_${Date.now()}_${cloudPendingRowSeq}`;
  }

  function ensureDefaultPendingCloudRow() {
    if (getCloudConnectionCount() === 0 && cloudPendingRows.length === 0) {
      cloudPendingRows.push(createCloudPendingRow());
    }
  }

  async function persistCloudAuthState() {
    const normalizedList = normalizeCloudAuthList(state.cloud.authList);
    state.cloud.authList = normalizedList;
    const primaryAuth = normalizedList[0] || null;
    state.cloud.activeOrganizationId = "";
    state.cloud.auth = primaryAuth;

    await chrome.storage.local.set({
      [constants.CLOUD_AUTH_LIST_LOCAL_KEY]: normalizedList,
      [constants.CLOUD_ACTIVE_ORG_ID_LOCAL_KEY]: "",
      [constants.CLOUD_AUTH_LOCAL_KEY]: primaryAuth
    });
  }

  function getCloudCacheKeys(organizationIdInput) {
    const organizationId = String(organizationIdInput || "").trim();
    if (!organizationId) return null;
    return {
      emailKey: `${constants.CLOUD_EMAIL_CACHE_PREFIX}${organizationId}`,
      whatsappKey: `${constants.CLOUD_WHATSAPP_CACHE_PREFIX}${organizationId}`,
      noteKey: `${constants.CLOUD_NOTE_CACHE_PREFIX}${organizationId}`,
      metaKey: `${constants.CLOUD_META_CACHE_PREFIX}${organizationId}`
    };
  }

  function splitCloudTemplatesByType(templates) {
    const email = [];
    const whatsapp = [];
    const note = [];
    const source = Array.isArray(templates) ? templates : [];

    for (const template of source) {
      const type = String(template?.type || "").toUpperCase();
      if (type === "EMAIL") {
        email.push(template);
      } else if (type === "WHATSAPP") {
        whatsapp.push(template);
      } else if (type === "NOTE") {
        note.push(template);
      }
    }

    return { email, whatsapp, note };
  }

  function formatCloudSyncLabel(metaInput) {
    const lastFullSyncAt = String(metaInput?.lastFullSyncAt || "").trim();
    if (!lastFullSyncAt) return "never";
    const date = new Date(lastFullSyncAt);
    if (Number.isNaN(date.getTime())) return "never";
    return date.toLocaleString();
  }

  function renderCloudConnectionStatus(customMessage = "") {
    if (!dom.cloudConnectionStatusEl) return;
    if (customMessage) {
      dom.cloudConnectionStatusEl.textContent = customMessage;
      return;
    }

    const authList = Array.isArray(state.cloud.authList) ? state.cloud.authList : [];
    if (!authList.length) {
      dom.cloudConnectionStatusEl.textContent = "Not connected";
      return;
    }

    dom.cloudConnectionStatusEl.textContent = "";
  }

  function findConnectedCloudAuthByOrgId(organizationIdInput) {
    const organizationId = String(organizationIdInput || "").trim();
    if (!organizationId) return null;
    return (state.cloud.authList || []).find((item) => item.organizationId === organizationId) || null;
  }

  function isCloudAuthTokenDirty(organizationIdInput) {
    const organizationId = String(organizationIdInput || "").trim();
    if (!organizationId) return false;
    const auth = findConnectedCloudAuthByOrgId(organizationId);
    if (!auth) return false;
    const draftValue = Object.prototype.hasOwnProperty.call(cloudAuthTokenDrafts, organizationId)
      ? String(cloudAuthTokenDrafts[organizationId] || "")
      : String(auth.apiToken || "");
    return draftValue.trim() !== String(auth.apiToken || "").trim();
  }

  function renderCloudAuthCards() {
    if (!dom.cloudAuthCardsEl) return;

    ensureDefaultPendingCloudRow();
    const authCards = (state.cloud.authList || []).map((auth) => {
      const orgName = auth.organizationName || auth.organizationSlug || auth.organizationId;
      const currentValue = Object.prototype.hasOwnProperty.call(cloudAuthTokenDrafts, auth.organizationId)
        ? String(cloudAuthTokenDrafts[auth.organizationId] || "")
        : String(auth.apiToken || "");
      const showSave = isCloudAuthTokenDirty(auth.organizationId);
      const syncedAt = formatCloudSyncLabel(state.cloud.meta);
      return `
        <div class="cloud-auth-card" data-cloud-auth-org-id="${App.escapeHtml(auth.organizationId)}">
          <div class="cloud-auth-card-head">
            <strong>${App.escapeHtml(orgName)}</strong>
            <div class="cloud-token-row">
              <input
                class="cloud-token-input"
                type="password"
                data-cloud-token-input="true"
                data-cloud-auth-org-id="${App.escapeHtml(auth.organizationId)}"
                value="${App.escapeHtml(currentValue)}"
                placeholder="Paste team access key"
                autocomplete="off"
              />
              <button class="btn" type="button" data-cloud-connect-btn="true" data-cloud-auth-org-id="${App.escapeHtml(auth.organizationId)}" ${showSave ? "" : "hidden"}>Save</button>
              <button class="btn cloud-refresh-btn" type="button" data-cloud-refresh-btn="true" data-cloud-auth-org-id="${App.escapeHtml(auth.organizationId)}" aria-label="Refresh templates" title="Refresh templates"><span class="cloud-refresh-icon" aria-hidden="true">↻</span></button>
              <button class="btn cloud-remove-btn" type="button" data-cloud-remove-btn="true" data-cloud-auth-org-id="${App.escapeHtml(auth.organizationId)}" aria-label="Remove org key" title="Remove org key">X</button>
              <span class="cloud-sync-label">Last sync: ${App.escapeHtml(syncedAt)}</span>
            </div>
          </div>
        </div>
      `;
    });

    const pendingCards = cloudPendingRows.map((rowId) => `
      <div class="cloud-auth-card pending" data-cloud-pending-row-id="${App.escapeHtml(rowId)}">
        <div class="cloud-auth-card-head">
          <strong>New team key</strong>
          <div class="cloud-token-row">
            <input
              class="cloud-token-input"
              type="password"
              data-cloud-token-input="true"
              data-cloud-pending-row-id="${App.escapeHtml(rowId)}"
              value="${App.escapeHtml(cloudPendingTokenDrafts[rowId] || "")}"
              placeholder="Paste team access key"
              autocomplete="off"
            />
            <button class="btn" type="button" data-cloud-connect-btn="true" data-cloud-pending-row-id="${App.escapeHtml(rowId)}">Save</button>
            <button class="btn cloud-remove-btn" type="button" data-cloud-remove-pending-btn="true" data-cloud-pending-row-id="${App.escapeHtml(rowId)}" aria-label="Remove new team key row" title="Remove new team key row">X</button>
          </div>
        </div>
      </div>
    `);

    dom.cloudAuthCardsEl.innerHTML = [...authCards, ...pendingCards].join("");
    if (dom.addCloudAuthBtn) {
      dom.addCloudAuthBtn.disabled = !canAddMoreCloudRows();
      dom.addCloudAuthBtn.textContent = canAddMoreCloudRows() ? "Add more" : "Max 5 org keys";
      dom.addCloudAuthBtn.hidden = !canShowAddMoreButton();
    }
  }

  function openCloudTokenInfoDialog() {
    if (!dom.cloudTokenInfoOverlay) return;
    dom.cloudTokenInfoOverlay.classList.add("open");
  }

  function closeCloudTokenInfoDialog() {
    if (!dom.cloudTokenInfoOverlay) return;
    App.blurFocusedElementWithin(dom.cloudTokenInfoOverlay);
    requestAnimationFrame(() => {
      dom.cloudTokenInfoOverlay.classList.remove("open");
    });
  }

  function rerenderTemplateViewsForCloudChange() {
    if (!dom.emailTemplatesPageEl?.hidden && typeof App.renderEmailTemplatesPage === "function") {
      App.renderEmailTemplatesPage();
    }
    if (!dom.whatsappTemplatesPageEl?.hidden && typeof App.renderWhatsappTemplatesPage === "function") {
      App.renderWhatsappTemplatesPage();
    }
    if (!dom.noteTemplatesPageEl?.hidden && typeof App.renderNoteTemplatesPage === "function") {
      App.renderNoteTemplatesPage();
    }
    if (typeof App.renderNotesTemplateSelectOptions === "function") {
      const selectedId = String(dom.notesTemplateSelect?.value || "");
      App.renderNotesTemplateSelectOptions(selectedId);
    }
  }

  async function fetchCloudJson(path, token, apiBaseUrlInput, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const apiBaseUrl = App.normalizeCloudApiBaseUrl(apiBaseUrlInput);
    const url = `${apiBaseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) || {};
      if (!response.ok) {
        const message = String(payload?.error || ("Cloud request failed (" + response.status + ") at " + apiBaseUrl)).trim();
        const requestError = new Error(message || "Cloud request failed.");
        requestError.status = Number(response.status || 0);
        requestError.code = String(payload?.code || "").trim();
        throw requestError;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Cloud request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function shouldDisconnectCloudAuth(error) {
    const status = Number(error?.status || 0);
    const code = String(error?.code || "").trim().toLowerCase();
    const message = String(error?.message || "").toLowerCase();

    if (status === 401 || status === 403) return true;

    if (code === "invalid_api_token" || code === "missing_authorization_header" || code === "invalid_authorization_scheme" || code === "empty_bearer_token") {
      return true;
    }

    return message.includes("invalid or revoked api token") || message.includes("revoked");
  }

  async function loadCloudCacheFromStorage() {
    const authList = normalizeCloudAuthList(state.cloud.authList);
    state.cloud.authList = authList;
    state.cloud.auth = authList[0] || null;
    state.cloud.activeOrganizationId = "";

    if (!authList.length) {
      state.cloud.emailTemplates = [];
      state.cloud.whatsappTemplates = [];
      state.cloud.noteTemplates = [];
      state.cloud.meta = null;
      renderCloudConnectionStatus();
      renderCloudAuthCards();
      return;
    }

    const keySet = new Set();
    for (const auth of authList) {
      const cacheKeys = getCloudCacheKeys(auth.organizationId);
      if (!cacheKeys) continue;
      keySet.add(cacheKeys.emailKey);
      keySet.add(cacheKeys.whatsappKey);
      keySet.add(cacheKeys.noteKey);
      keySet.add(cacheKeys.metaKey);
    }

    const cache = await chrome.storage.local.get(Array.from(keySet));
    const mergedEmail = [];
    const mergedWhatsapp = [];
    const mergedNote = [];
    const metaByOrg = {};
    let latestSyncAt = "";

    for (const auth of authList) {
      const cacheKeys = getCloudCacheKeys(auth.organizationId);
      if (!cacheKeys) continue;
      const orgLabel = auth.organizationName || auth.organizationSlug || auth.organizationId;
      const emailTemplates = App.normalizeCloudTemplateArray(cache[cacheKeys.emailKey], "EMAIL", auth.organizationId).map((item) => ({
        ...item,
        organizationName: orgLabel
      }));
      const whatsappTemplates = App.normalizeCloudTemplateArray(cache[cacheKeys.whatsappKey], "WHATSAPP", auth.organizationId).map((item) => ({
        ...item,
        organizationName: orgLabel
      }));
      const noteTemplates = App.normalizeCloudTemplateArray(cache[cacheKeys.noteKey], "NOTE", auth.organizationId).map((item) => ({
        ...item,
        organizationName: orgLabel
      }));
      const meta = cache[cacheKeys.metaKey] && typeof cache[cacheKeys.metaKey] === "object" ? cache[cacheKeys.metaKey] : null;
      mergedEmail.push(...emailTemplates);
      mergedWhatsapp.push(...whatsappTemplates);
      mergedNote.push(...noteTemplates);
      if (meta) {
        metaByOrg[auth.organizationId] = meta;
        const syncAt = String(meta?.lastFullSyncAt || "");
        if (syncAt && (!latestSyncAt || Date.parse(syncAt) > Date.parse(latestSyncAt))) {
          latestSyncAt = syncAt;
        }
      }
    }

    state.cloud.emailTemplates = mergedEmail;
    state.cloud.whatsappTemplates = mergedWhatsapp;
    state.cloud.noteTemplates = mergedNote;
    state.cloud.meta = {
      byOrg: metaByOrg,
      lastFullSyncAt: latestSyncAt || null
    };
    renderCloudConnectionStatus();
    renderCloudAuthCards();
  }

  function isEmailTemplatesOpen() {
    return !!dom.emailTemplatesPageEl && !dom.emailTemplatesPageEl.hidden;
  }

  function isActiveTabOpen() {
    return !!dom.activeTabPageEl && !dom.activeTabPageEl.hidden;
  }

  function isWhatsappTemplatesOpen() {
    return !!dom.whatsappTemplatesPageEl && !dom.whatsappTemplatesPageEl.hidden;
  }

  function isNoteTemplatesOpen() {
    return !!dom.noteTemplatesPageEl && !dom.noteTemplatesPageEl.hidden;
  }

  function isSettingsPageOpen() {
    return !!dom.settingsPageEl && !dom.settingsPageEl.hidden;
  }

  function syncTopLevelViewState() {
    const activeTabOpen = isActiveTabOpen();
    const emailOpen = isEmailTemplatesOpen();
    const whatsappOpen = isWhatsappTemplatesOpen();
    const noteOpen = isNoteTemplatesOpen();
    const settingsOpen = isSettingsPageOpen();

    if (dom.activeTabBtn) dom.activeTabBtn.classList.toggle("active", activeTabOpen);
    if (dom.emailSettingsBtn) dom.emailSettingsBtn.classList.toggle("active", emailOpen);
    if (dom.whatsappSettingsBtn) dom.whatsappSettingsBtn.classList.toggle("active", whatsappOpen);
    if (dom.noteSettingsBtn) dom.noteSettingsBtn.classList.toggle("active", noteOpen);
    if (dom.settingsBtn) dom.settingsBtn.classList.toggle("active", settingsOpen);
    if (dom.contactViewBtn) dom.contactViewBtn.classList.toggle("active", !activeTabOpen && !emailOpen && !whatsappOpen && !noteOpen && !settingsOpen);
    if (dom.mainPageEl) dom.mainPageEl.classList.toggle("header-only", activeTabOpen || emailOpen || whatsappOpen || noteOpen || settingsOpen);
    App.updateStickyHeadOffset();
  }

  async function runSettingsAutosave() {
    if (!settingsAutosaveDirty) return;
    if (settingsAutosaveInFlight) {
      settingsAutosaveQueued = true;
      return;
    }
    settingsAutosaveInFlight = true;
    settingsAutosaveDirty = false;
    try {
      await saveSettings({ silent: true });
    } finally {
      settingsAutosaveInFlight = false;
      if (settingsAutosaveQueued) {
        settingsAutosaveQueued = false;
        settingsAutosaveDirty = true;
        if (settingsAutosaveTimerId) {
          clearTimeout(settingsAutosaveTimerId);
          settingsAutosaveTimerId = null;
        }
        settingsAutosaveTimerId = setTimeout(() => {
          settingsAutosaveTimerId = null;
          void runSettingsAutosave();
        }, 80);
      }
    }
  }

  function queueSettingsAutosave(options = {}) {
    const immediate = options?.immediate === true;
    settingsAutosaveDirty = true;
    if (settingsAutosaveTimerId) {
      clearTimeout(settingsAutosaveTimerId);
      settingsAutosaveTimerId = null;
    }
    settingsAutosaveTimerId = setTimeout(() => {
      settingsAutosaveTimerId = null;
      void runSettingsAutosave();
    }, immediate ? 0 : SETTINGS_AUTOSAVE_DEBOUNCE_MS);
  }

  async function flushSettingsAutosave() {
    if (settingsAutosaveTimerId) {
      clearTimeout(settingsAutosaveTimerId);
      settingsAutosaveTimerId = null;
    }
    await runSettingsAutosave();
  }

  function bindSettingsAutosave() {
    if (settingsAutosaveBound) return;
    settingsAutosaveBound = true;
    if (dom.rowFilterInput) {
      dom.rowFilterInput.addEventListener("input", () => {
        queueSettingsAutosave();
      });
      dom.rowFilterInput.addEventListener("blur", () => {
        queueSettingsAutosave({ immediate: true });
      });
    }
    if (dom.countryPrefixInput) {
      dom.countryPrefixInput.addEventListener("change", () => {
        queueSettingsAutosave({ immediate: true });
      });
    }
    if (dom.inlineQuickActionsEnabledInput) {
      dom.inlineQuickActionsEnabledInput.addEventListener("change", () => {
        queueSettingsAutosave({ immediate: true });
      });
    }
    if (dom.columnChecks) {
      dom.columnChecks.addEventListener("change", () => {
        queueSettingsAutosave({ immediate: true });
      });
    }
  }

  function setSettingsMode(isOpen) {
    if (!isOpen) {
      void flushSettingsAutosave();
    }
    if (dom.settingsPageEl) dom.settingsPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setEmailTemplatesMode(isOpen) {
    if (dom.emailTemplatesPageEl) dom.emailTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setActiveTabMode(isOpen) {
    if (dom.activeTabPageEl) dom.activeTabPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setWhatsappTemplatesMode(isOpen) {
    if (dom.whatsappTemplatesPageEl) dom.whatsappTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function setNoteTemplatesMode(isOpen) {
    if (dom.noteTemplatesPageEl) dom.noteTemplatesPageEl.hidden = !isOpen;
    syncTopLevelViewState();
  }

  function renderColumnChecks() {
    if (!dom.columnChecks) return;

    if (!state.currentColumns.length) {
      dom.columnChecks.innerHTML = "<div class='check'>No columns detected yet.</div>";
      return;
    }

    const html = state.currentColumns
      .map((col) => {
        const checked = state.settings.visibleColumns[col.id] !== false ? "checked" : "";
        return `<label class='check'><input type='checkbox' data-col-id='${App.escapeHtml(col.id)}' ${checked} /> ${App.escapeHtml(col.label)}</label>`;
      })
      .join("");

    dom.columnChecks.innerHTML = html;
  }

  function ensureCountryPrefixOptionExists(countryPrefixInput) {
    if (!dom.countryPrefixInput) return;
    const code = String(countryPrefixInput || "").replace(/\D/g, "");
    if (!code) return;
    const exists = Array.from(dom.countryPrefixInput.options || []).some((option) => option.value === code);
    if (exists) return;
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `Custom (+${code})`;
    dom.countryPrefixInput.append(option);
  }

  function getCountryPrefixLabel(countryPrefixInput) {
    const code = String(countryPrefixInput || "").replace(/\D/g, "");
    if (!code) return "Not set";
    const matched = COUNTRY_PREFIX_OPTIONS.find((item) => item.code === code);
    if (matched) return `${matched.name} (+${matched.code})`;
    return `Custom (+${code})`;
  }

  function closeCountryPrefixDropdown() {
    if (!dom.countryPrefixDropdown) return;
    dom.countryPrefixDropdown.classList.remove("open");
  }

  function updateCountryPrefixDropdownButton() {
    if (!dom.countryPrefixDropdownBtn || !dom.countryPrefixInput) return;
    const code = String(dom.countryPrefixInput.value || "").replace(/\D/g, "");
    dom.countryPrefixDropdownBtn.textContent = getCountryPrefixLabel(code);
  }

  function renderCountryPrefixDropdownList() {
    if (!dom.countryPrefixDropdownList || !dom.countryPrefixInput || !dom.countryPrefixDropdownSearch) return;

    const selectedCode = String(dom.countryPrefixInput.value || "").replace(/\D/g, "");
    const query = String(dom.countryPrefixDropdownSearch.value || "")
      .trim()
      .toLowerCase();

    const allOptions = [{ name: "Not set", code: "" }, ...COUNTRY_PREFIX_OPTIONS];
    const filtered = query
      ? allOptions.filter((item) => {
          const label = `${item.name} ${item.code}`.toLowerCase();
          return label.includes(query);
        })
      : allOptions;

    if (!filtered.length) {
      dom.countryPrefixDropdownList.innerHTML = "<div class='email-template-empty'>No countries found.</div>";
      return;
    }

    dom.countryPrefixDropdownList.innerHTML = filtered
      .map((item) => {
        const code = String(item.code || "");
        const label = code ? `${item.name} (+${code})` : item.name;
        const selectedClass = code === selectedCode ? "is-selected" : "";
        return `<button type='button' class='country-prefix-dropdown-item ${selectedClass}' data-country-code='${App.escapeHtml(code)}'>${App.escapeHtml(
          label
        )}</button>`;
      })
      .join("");
  }

  function openCountryPrefixDropdown() {
    if (!dom.countryPrefixDropdown) return;
    dom.countryPrefixDropdown.classList.add("open");
    renderCountryPrefixDropdownList();
    if (dom.countryPrefixDropdownSearch) {
      dom.countryPrefixDropdownSearch.value = "";
      dom.countryPrefixDropdownSearch.focus();
    }
  }

  function bindCountryPrefixDropdown() {
    if (countryDropdownBound) return;
    if (!dom.countryPrefixDropdown || !dom.countryPrefixDropdownBtn || !dom.countryPrefixDropdownList) return;
    countryDropdownBound = true;

    dom.countryPrefixDropdownBtn.addEventListener("click", () => {
      const isOpen = dom.countryPrefixDropdown?.classList.contains("open");
      if (isOpen) {
        closeCountryPrefixDropdown();
      } else {
        openCountryPrefixDropdown();
      }
    });

    if (dom.countryPrefixDropdownSearch) {
      dom.countryPrefixDropdownSearch.addEventListener("input", () => {
        renderCountryPrefixDropdownList();
      });
      dom.countryPrefixDropdownSearch.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCountryPrefixDropdown();
        }
      });
    }

    dom.countryPrefixDropdownList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const option = target.closest("[data-country-code]");
      if (!(option instanceof HTMLElement)) return;
      const code = String(option.getAttribute("data-country-code") || "").replace(/\D/g, "");
      if (dom.countryPrefixInput) {
        dom.countryPrefixInput.value = code;
        dom.countryPrefixInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      updateCountryPrefixDropdownButton();
      closeCountryPrefixDropdown();
    });

    document.addEventListener("click", (event) => {
      if (!dom.countryPrefixDropdown) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dom.countryPrefixDropdown.contains(target)) return;
      closeCountryPrefixDropdown();
    });
  }

  function renderCountryPrefixOptions(countryPrefixInput) {
    if (!dom.countryPrefixInput) return;
    const selectedCode = String(countryPrefixInput || "").replace(/\D/g, "");
    const options = [{ name: "Not set", code: "" }, ...COUNTRY_PREFIX_OPTIONS];

    dom.countryPrefixInput.textContent = "";
    for (const item of options) {
      const option = document.createElement("option");
      option.value = String(item.code || "");
      option.textContent = item.code ? `${item.name} (+${item.code})` : item.name;
      dom.countryPrefixInput.append(option);
    }
    ensureCountryPrefixOptionExists(selectedCode);
    dom.countryPrefixInput.value = selectedCode;
    if (dom.countryPrefixInput.value !== selectedCode) {
      dom.countryPrefixInput.value = "";
    }
    bindCountryPrefixDropdown();
    renderCountryPrefixDropdownList();
    updateCountryPrefixDropdownButton();
  }

  function settingsFromForm() {
    const visibleColumns = {};
    dom.columnChecks.querySelectorAll("input[data-col-id]").forEach((input) => {
      const colId = input.getAttribute("data-col-id");
      if (colId) visibleColumns[colId] = input.checked;
    });

    return {
      countryPrefix: (dom.countryPrefixInput.value || "").replace(/\D/g, ""),
      messageTemplate: String(dom.messageTemplateInput?.value || "").trim(),
      noteTemplate: String(dom.noteTemplateInput?.value || "").trim(),
      rowFilterWord: String(dom.rowFilterInput?.value || "")
        .replace(/\s+/g, " ")
        .trim(),
      defaultLaunchMode: App.normalizeLaunchMode(state.settings.defaultLaunchMode),
      inlineQuickActionsEnabled: dom.inlineQuickActionsEnabledInput
        ? dom.inlineQuickActionsEnabledInput.checked
        : true,
      visibleColumns,
      columnWidths: App.normalizeColumnWidths(state.settings.columnWidths)
    };
  }

  function fillSettingsForm() {
    renderCountryPrefixOptions(state.settings.countryPrefix);
    if (dom.messageTemplateInput) dom.messageTemplateInput.value = "";
    if (dom.noteTemplateInput) dom.noteTemplateInput.value = "";
    if (dom.rowFilterInput) dom.rowFilterInput.value = state.settings.rowFilterWord || "";
    if (dom.inlineQuickActionsEnabledInput) {
      dom.inlineQuickActionsEnabledInput.checked = state.settings.inlineQuickActionsEnabled !== false;
    }
    renderCloudAuthCards();
    renderCloudConnectionStatus();
    renderColumnChecks();
  }

  function openSettings() {
    if (!dom.settingsPageEl || !dom.settingsPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    fillSettingsForm();
    setSettingsMode(true);
  }

  function closeSettings() {
    if (!isSettingsPageOpen()) return;
    setSettingsMode(false);
  }

  function toggleSettings() {
    if (dom.settingsPageEl?.hidden) {
      openSettings();
      return;
    }
    closeSettings();
  }

  function openEmailSettings() {
    if (!dom.emailTemplatesPageEl || !dom.emailTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    setEmailTemplatesMode(true);
    App.loadEmailTemplatesDraftFromSettings();
    App.renderEmailTemplatesPage();
    if (typeof App.ensureEmailBodyEditor === "function") {
      void App.ensureEmailBodyEditor().then(() => {
        App.renderActiveEmailTemplateEditor();
      });
    }
  }

  function closeEmailSettings() {
    if (!isEmailTemplatesOpen()) return;
    if (typeof App.flushEmailTemplateAutosave === "function") {
      void App.flushEmailTemplateAutosave({ showToast: false });
    }
    setEmailTemplatesMode(false);
  }

  function openWhatsappSettings() {
    if (!dom.whatsappTemplatesPageEl || !dom.whatsappTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isNoteTemplatesOpen()) {
      if (typeof App.flushNoteTemplateAutosave === "function") {
        void App.flushNoteTemplateAutosave({ showToast: false });
      }
      setNoteTemplatesMode(false);
    }
    setWhatsappTemplatesMode(true);
    App.loadWhatsappTemplatesDraftFromSettings();
    App.renderWhatsappTemplatesPage();
  }

  function closeWhatsappSettings() {
    if (!isWhatsappTemplatesOpen()) return;
    if (typeof App.flushWhatsappTemplateAutosave === "function") {
      void App.flushWhatsappTemplateAutosave({ showToast: false });
    }
    setWhatsappTemplatesMode(false);
  }

  function toggleEmailSettings() {
    if (dom.emailTemplatesPageEl?.hidden) {
      openEmailSettings();
      return;
    }
    closeEmailSettings();
  }

  function toggleWhatsappSettings() {
    if (dom.whatsappTemplatesPageEl?.hidden) {
      openWhatsappSettings();
      return;
    }
    closeWhatsappSettings();
  }

  function openNoteSettings() {
    if (!dom.noteTemplatesPageEl || !dom.noteTemplatesPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) {
      setSettingsMode(false);
    }
    if (isActiveTabOpen()) {
      setActiveTabMode(false);
    }
    if (isEmailTemplatesOpen()) {
      if (typeof App.flushEmailTemplateAutosave === "function") {
        void App.flushEmailTemplateAutosave({ showToast: false });
      }
      setEmailTemplatesMode(false);
    }
    if (isWhatsappTemplatesOpen()) {
      if (typeof App.flushWhatsappTemplateAutosave === "function") {
        void App.flushWhatsappTemplateAutosave({ showToast: false });
      }
      setWhatsappTemplatesMode(false);
    }
    setNoteTemplatesMode(true);
    App.loadNoteTemplatesDraftFromSettings();
    App.renderNoteTemplatesPage();
  }

  function closeNoteSettings() {
    if (!isNoteTemplatesOpen()) return;
    if (typeof App.flushNoteTemplateAutosave === "function") {
      void App.flushNoteTemplateAutosave({ showToast: false });
    }
    setNoteTemplatesMode(false);
  }

  function toggleNoteSettings() {
    if (dom.noteTemplatesPageEl?.hidden) {
      openNoteSettings();
      return;
    }
    closeNoteSettings();
  }

  function openContactsView() {
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    closeActiveTab();
    closeEmailSettings();
    closeWhatsappSettings();
    closeNoteSettings();
    closeSettings();
  }

  function openActiveTab() {
    if (!dom.activeTabPageEl || !dom.activeTabPageEl.hidden) return;
    App.closeEmailTemplatePicker();
    App.closeWhatsappTemplatePicker();
    if (isSettingsPageOpen()) setSettingsMode(false);
    closeEmailSettings();
    closeWhatsappSettings();
    closeNoteSettings();
    setActiveTabMode(true);
    if (typeof App.loadActiveTabContext === "function") {
      void App.loadActiveTabContext();
    }
  }

  function closeActiveTab() {
    if (!isActiveTabOpen()) return;
    setActiveTabMode(false);
  }

  function toggleActiveTab() {
    if (dom.activeTabPageEl?.hidden) {
      openActiveTab();
      return;
    }
    closeActiveTab();
  }

  async function clearCloudConnection(options = {}) {
    const showToast = options?.showToast !== false;
    const statusMessage = String(options?.statusMessage || "Team access key removed.");
    const targetOrgId = String(options?.organizationId || "").trim();

    if (targetOrgId) {
      state.cloud.authList = (state.cloud.authList || []).filter((item) => item.organizationId !== targetOrgId);
      const cacheKeys = getCloudCacheKeys(targetOrgId);
      if (cacheKeys) {
        await chrome.storage.local.remove([cacheKeys.emailKey, cacheKeys.whatsappKey, cacheKeys.noteKey, cacheKeys.metaKey]);
      }
    } else {
      state.cloud.authList = [];
    }

    state.cloud.status = statusMessage;
    await persistCloudAuthState();
    if (!state.cloud.auth) {
      state.cloud.emailTemplates = [];
      state.cloud.whatsappTemplates = [];
      state.cloud.noteTemplates = [];
      state.cloud.meta = null;
    } else {
      await loadCloudCacheFromStorage(state.cloud.auth);
    }

    ensureDefaultPendingCloudRow();
    rerenderTemplateViewsForCloudChange();
    App.setStatus(statusMessage);
    if (showToast && typeof App.showToast === "function") {
      App.showToast(statusMessage);
    }
  }

  function shouldPerformFullCloudSync(localMeta, remoteMeta, hasCachedTemplates, force) {
    if (force) return true;
    if (!hasCachedTemplates) return true;

    const localLatest = String(localMeta?.latestUpdatedAt || "");
    const remoteLatest = String(remoteMeta?.latestUpdatedAt || "");
    const localCount = Number(localMeta?.templateCount || 0);
    const remoteCount = Number(remoteMeta?.templateCount || 0);
    if (localLatest !== remoteLatest || localCount !== remoteCount) {
      return true;
    }

    const lastFullSyncAt = String(localMeta?.lastFullSyncAt || "");
    const lastFullSyncMs = Date.parse(lastFullSyncAt);
    if (!Number.isFinite(lastFullSyncMs)) return true;
    return Date.now() - lastFullSyncMs >= constants.CLOUD_CACHE_TTL_MS;
  }

  async function refreshCloudTemplates(options = {}) {
    const force = options?.force === true;
    const showToast = options?.showToast === true;
    const silent = options?.silent === true;
    const targetOrgId = String(options?.organizationId || "").trim();
    const authList = normalizeCloudAuthList(state.cloud.authList);
    state.cloud.authList = authList;

    if (!authList.length) {
      renderCloudConnectionStatus();
      if (!silent) {
        App.setStatus("Add your team access key in Settings.");
      }
      return { ok: false, error: "missing_api_token" };
    }

    const targets = targetOrgId
      ? authList.filter((item) => item.organizationId === targetOrgId)
      : authList.slice();
    if (!targets.length) {
      return { ok: false, error: "missing_org_connection" };
    }

    const results = [];
    for (const auth of targets) {
      try {
        const me = await fetchCloudJson("/api/v1/extension/me", auth.apiToken, auth.apiBaseUrl);
        const nextAuth = App.normalizeCloudAuth({
          ...auth,
          organizationId: me?.organization?.id,
          organizationName: me?.organization?.name,
          organizationSlug: me?.organization?.slug,
          tokenPrefix: me?.token?.prefix,
          updatedAt: new Date().toISOString()
        });
        if (!nextAuth) {
          throw new Error("Cloud token is missing organization scope.");
        }

        if (nextAuth.organizationId !== auth.organizationId) {
          const oldCacheKeys = getCloudCacheKeys(auth.organizationId);
          if (oldCacheKeys) {
            await chrome.storage.local.remove([oldCacheKeys.emailKey, oldCacheKeys.whatsappKey, oldCacheKeys.noteKey, oldCacheKeys.metaKey]);
          }
        }

        state.cloud.authList = normalizeCloudAuthList([
          ...(state.cloud.authList || []).filter((item) => item.organizationId !== auth.organizationId && item.organizationId !== nextAuth.organizationId),
          nextAuth
        ]);

        const cacheKeys = getCloudCacheKeys(nextAuth.organizationId);
        const localMetaResult = cacheKeys ? await chrome.storage.local.get([cacheKeys.metaKey]) : {};
        const localMeta = cacheKeys && localMetaResult[cacheKeys.metaKey] && typeof localMetaResult[cacheKeys.metaKey] === "object"
          ? localMetaResult[cacheKeys.metaKey]
          : null;
        const hasCachedTemplates = state.cloud.emailTemplates.some((item) => item.organizationId === nextAuth.organizationId)
          || state.cloud.whatsappTemplates.some((item) => item.organizationId === nextAuth.organizationId)
          || state.cloud.noteTemplates.some((item) => item.organizationId === nextAuth.organizationId);

        const remoteMeta = await fetchCloudJson("/api/v1/extension/templates/meta", nextAuth.apiToken, nextAuth.apiBaseUrl);
        const nowIso = new Date().toISOString();
        const needsFullSync = shouldPerformFullCloudSync(localMeta, remoteMeta, hasCachedTemplates, force);

        const nextMetaBase = {
          organizationId: nextAuth.organizationId,
          latestUpdatedAt: remoteMeta?.latestUpdatedAt || null,
          templateCount: Number(remoteMeta?.templateCount || 0),
          lastCheckedAt: nowIso
        };

        if (needsFullSync) {
          const templatesPayload = await fetchCloudJson("/api/v1/extension/templates", nextAuth.apiToken, nextAuth.apiBaseUrl);
          const split = splitCloudTemplatesByType(templatesPayload?.templates);
          const emailTemplates = App.normalizeCloudTemplateArray(split.email, "EMAIL", nextAuth.organizationId);
          const whatsappTemplates = App.normalizeCloudTemplateArray(split.whatsapp, "WHATSAPP", nextAuth.organizationId);
          const noteTemplates = App.normalizeCloudTemplateArray(split.note, "NOTE", nextAuth.organizationId);
          if (cacheKeys) {
            await chrome.storage.local.set({
              [cacheKeys.emailKey]: emailTemplates,
              [cacheKeys.whatsappKey]: whatsappTemplates,
              [cacheKeys.noteKey]: noteTemplates,
              [cacheKeys.metaKey]: {
                ...nextMetaBase,
                lastFullSyncAt: nowIso
              }
            });
          }
        } else if (cacheKeys) {
          await chrome.storage.local.set({
            [cacheKeys.metaKey]: {
              ...nextMetaBase,
              lastFullSyncAt: String(localMeta?.lastFullSyncAt || nowIso)
            }
          });
        }

        results.push({
          organizationId: nextAuth.organizationId,
          organizationName: nextAuth.organizationName || nextAuth.organizationSlug || nextAuth.organizationId,
          ok: true,
          fullSync: needsFullSync
        });
      } catch (error) {
        const reason = String(error?.message || "Cloud sync failed.");
        if (shouldDisconnectCloudAuth(error)) {
          await clearCloudConnection({
            showToast: false,
            organizationId: auth.organizationId,
            statusMessage: "Team access key is invalid or revoked. Shared templates disconnected."
          });
          results.push({
            organizationId: auth.organizationId,
            organizationName: auth.organizationName || auth.organizationSlug || auth.organizationId,
            ok: false,
            error: reason,
            disconnected: true
          });
          continue;
        }
        results.push({
          organizationId: auth.organizationId,
          organizationName: auth.organizationName || auth.organizationSlug || auth.organizationId,
          ok: false,
          error: reason
        });
      }
    }

    await persistCloudAuthState();
    await loadCloudCacheFromStorage();
    rerenderTemplateViewsForCloudChange();

    const successCount = results.filter((item) => item.ok).length;
    const failed = results.filter((item) => !item.ok);
    if (!silent) {
      if (!failed.length) {
        App.setStatus(targetOrgId ? "Cloud templates refreshed." : `Cloud templates refreshed for ${successCount} org(s).`);
      } else {
        App.setStatus(`Cloud refresh finished: ${successCount} succeeded, ${failed.length} failed.`);
      }
    }
    if (showToast && typeof App.showToast === "function") {
      if (!failed.length) {
        App.showToast(targetOrgId ? "Cloud templates refreshed." : `Cloud templates refreshed for ${successCount} org(s).`);
      } else {
        App.showToast(`Cloud refresh finished: ${successCount} succeeded, ${failed.length} failed.`, 3200);
      }
    }

    return { ok: failed.length === 0, results };
  }

  async function saveCloudApiToken(identifier) {
    const target = String(identifier || "").trim();
    if (!target) return;
    const apiBaseUrl = constants.CLOUD_API_BASE_URL;
    const tokenInput = Array.from(dom.cloudAuthCardsEl?.querySelectorAll("[data-cloud-token-input]") || []).find((input) => {
      if (!(input instanceof HTMLInputElement)) return false;
      return (
        String(input.getAttribute("data-cloud-auth-org-id") || "").trim() === target ||
        String(input.getAttribute("data-cloud-pending-row-id") || "").trim() === target
      );
    });
    const rawToken = String(tokenInput?.value || "").trim();
    if (!rawToken) {
      App.setStatus("Access key is required.");
      return;
    }

    if (getCloudConnectionCount() >= constants.MAX_CLOUD_ORG_CONNECTIONS && !findCloudAuthByOrgId(target)) {
      App.setStatus("You can connect up to 5 org keys.");
      return;
    }

    renderCloudConnectionStatus("Checking access key...");
    App.setStatus("Checking team access key...");

    try {
      const me = await fetchCloudJson("/api/v1/extension/me", rawToken, apiBaseUrl);
      const nextAuth = App.normalizeCloudAuth({
        apiToken: rawToken,
        apiBaseUrl,
        organizationId: me?.organization?.id,
        organizationName: me?.organization?.name,
        organizationSlug: me?.organization?.slug,
        tokenPrefix: me?.token?.prefix,
        updatedAt: new Date().toISOString()
      });

      if (!nextAuth) {
        throw new Error("Cloud token is missing organization scope.");
      }

      const existingByOrg = findCloudAuthByOrgId(nextAuth.organizationId);
      if (existingByOrg && existingByOrg.organizationId !== target) {
        throw new Error("This org is already connected.");
      }

      const previousForTarget = findCloudAuthByOrgId(target);
      if (previousForTarget && previousForTarget.organizationId !== nextAuth.organizationId) {
        const oldCacheKeys = getCloudCacheKeys(previousForTarget.organizationId);
        if (oldCacheKeys) {
          await chrome.storage.local.remove([oldCacheKeys.emailKey, oldCacheKeys.whatsappKey, oldCacheKeys.noteKey, oldCacheKeys.metaKey]);
        }
      }

      state.cloud.authList = normalizeCloudAuthList([
        ...(state.cloud.authList || []).filter((item) => item.organizationId !== target && item.organizationId !== nextAuth.organizationId),
        nextAuth
      ]);
      cloudPendingRows = cloudPendingRows.filter((rowId) => rowId !== target);
      delete cloudPendingTokenDrafts[target];
      delete cloudAuthTokenDrafts[target];
      delete cloudAuthTokenDrafts[nextAuth.organizationId];

      await persistCloudAuthState();
      await loadCloudCacheFromStorage(nextAuth);
      const result = await refreshCloudTemplates({ force: true, showToast: false, silent: true });
      if (!result.ok) {
        throw new Error(String(result.error || "Cloud sync failed."));
      }

      renderCloudConnectionStatus();
      renderCloudAuthCards();
      rerenderTemplateViewsForCloudChange();
      App.setStatus("Team access key saved and connected.");
      if (typeof App.showToast === "function") {
        App.showToast("Team access key saved.");
      }
    } catch (error) {
      const rawReason = String(error?.message || "Could not verify team access key.");
      const reason = rawReason.includes("404")
        ? rawReason + ". Ensure cloud backend is deployed."
        : rawReason;
      renderCloudConnectionStatus(reason);
      App.setStatus(`Team access key failed: ${reason}`);
      if (typeof App.showToast === "function") {
        App.showToast(`Access key failed: ${reason}`, 3200);
      }
    }
  }

  function addCloudAuthRow() {
    if (cloudPendingRows.length > 0) {
      App.setStatus("Connect the current key first.");
      return;
    }
    if (!canAddMoreCloudRows()) {
      App.setStatus("You can connect up to 5 org keys.");
      return;
    }
    cloudPendingRows.push(createCloudPendingRow());
    renderCloudAuthCards();
  }

  function removeCloudPendingRow(rowIdInput) {
    const rowId = String(rowIdInput || "").trim();
    if (!rowId) return;
    cloudPendingRows = cloudPendingRows.filter((item) => item !== rowId);
    delete cloudPendingTokenDrafts[rowId];
    ensureDefaultPendingCloudRow();
    renderCloudAuthCards();
  }

  async function refreshCloudTemplatesNow(organizationIdInput = "") {
    const targetOrgId = String(organizationIdInput || "").trim();
    if (!targetOrgId) {
      await refreshCloudTemplates({ force: true, showToast: true, silent: false });
      return;
    }
    const refreshBtn = Array.from(dom.cloudAuthCardsEl?.querySelectorAll("[data-cloud-refresh-btn]") || []).find((button) => {
      if (!(button instanceof HTMLButtonElement)) return false;
      return String(button.getAttribute("data-cloud-auth-org-id") || "").trim() === targetOrgId;
    });
    if (refreshBtn) {
      refreshBtn.classList.add("is-spinning");
      refreshBtn.disabled = true;
    }

    try {
      await refreshCloudTemplates({ force: true, showToast: true, silent: false, organizationId: targetOrgId });
    } finally {
      if (refreshBtn) {
        refreshBtn.classList.remove("is-spinning");
        refreshBtn.disabled = false;
      }
    }
  }

  async function refreshCloudTemplatesSessionCheck() {
    await refreshCloudTemplates({ force: false, showToast: false, silent: true });
  }

  async function onCloudAuthCardsClick(event) {
    const target = event?.target;
    if (!(target instanceof HTMLElement)) return;

    const connectBtn = target.closest("[data-cloud-connect-btn]");
    if (connectBtn instanceof HTMLElement) {
      const orgId = String(connectBtn.getAttribute("data-cloud-auth-org-id") || "").trim();
      const pendingId = String(connectBtn.getAttribute("data-cloud-pending-row-id") || "").trim();
      await saveCloudApiToken(orgId || pendingId);
      return;
    }

    const refreshBtn = target.closest("[data-cloud-refresh-btn]");
    if (refreshBtn instanceof HTMLElement) {
      const orgId = String(refreshBtn.getAttribute("data-cloud-auth-org-id") || "").trim();
      await refreshCloudTemplatesNow(orgId);
      return;
    }

    const removeBtn = target.closest("[data-cloud-remove-btn]");
    if (removeBtn instanceof HTMLElement) {
      const orgId = String(removeBtn.getAttribute("data-cloud-auth-org-id") || "").trim();
      if (!orgId) return;
      const confirmed = window.confirm("Remove this org key connection?");
      if (!confirmed) return;
      await clearCloudConnection({ organizationId: orgId, statusMessage: "Team access key removed." });
      renderCloudAuthCards();
      return;
    }

    const removePendingBtn = target.closest("[data-cloud-remove-pending-btn]");
    if (removePendingBtn instanceof HTMLElement) {
      const pendingId = String(removePendingBtn.getAttribute("data-cloud-pending-row-id") || "").trim();
      removeCloudPendingRow(pendingId);
    }
  }

  function onCloudAuthCardsInput(event) {
    const target = event?.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.hasAttribute("data-cloud-token-input")) return;

    const orgId = String(target.getAttribute("data-cloud-auth-org-id") || "").trim();
    const pendingId = String(target.getAttribute("data-cloud-pending-row-id") || "").trim();
    if (pendingId) {
      cloudPendingTokenDrafts[pendingId] = String(target.value || "");
      return;
    }

    if (!orgId) return;
    const auth = findConnectedCloudAuthByOrgId(orgId);
    if (!auth) return;
    const nextValue = String(target.value || "");
    if (nextValue.trim() === String(auth.apiToken || "").trim()) {
      delete cloudAuthTokenDrafts[orgId];
    } else {
      cloudAuthTokenDrafts[orgId] = nextValue;
    }

    const row = target.closest("[data-cloud-auth-org-id]");
    if (!(row instanceof HTMLElement)) return;
    const saveBtn = row.querySelector("[data-cloud-connect-btn]");
    if (saveBtn instanceof HTMLElement) {
      saveBtn.hidden = !isCloudAuthTokenDirty(orgId);
    }
  }

  async function saveEmailSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "Template saved.");
    const next = App.normalizeEmailTemplates(state.emailTemplatesDraft);
    state.settings = {
      ...state.settings,
      emailTemplates: next
    };
    await chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  async function saveWhatsappSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "WhatsApp template saved.");
    const next = App.normalizeWhatsappTemplates(state.whatsappTemplatesDraft);
    state.settings = {
      ...state.settings,
      whatsappTemplates: next
    };
    await chrome.storage.local.set({ [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  async function saveNoteTemplateSettings(options = {}) {
    const showToast = options?.showToast === true;
    const toastMessage = String(options?.toastMessage || "Note template saved.");
    const next = App.normalizeNoteTemplates(state.noteTemplatesDraft);
    state.settings = {
      ...state.settings,
      noteTemplates: next
    };
    await chrome.storage.local.set({ [constants.NOTE_TEMPLATES_LOCAL_KEY]: next });
    if (showToast) {
      if (typeof App.showToast === "function") {
        App.showToast(toastMessage);
      } else {
        App.setStatus(toastMessage);
      }
    }
  }

  function normalizeImportedEmailTemplate(item) {
    if (!item || typeof item !== "object") return null;
    const rawName = String(item.name || "").trim();
    const rawSubject = String(item.subject || "").trim();
    const rawBody = String(item.body || "").trim();
    if (!rawName && !rawSubject && !rawBody) return null;
    return {
      name: rawName || "Untitled",
      subject: rawSubject,
      body: rawBody
    };
  }

  function normalizeImportedBasicTemplate(item) {
    if (!item || typeof item !== "object") return null;
    const rawName = String(item.name || "").trim();
    const rawBody = String(item.body || "").trim();
    if (!rawName && !rawBody) return null;
    return {
      name: rawName || "Untitled",
      body: rawBody
    };
  }

  function parseImportedTemplates(text) {
    let payload;
    try {
      payload = JSON.parse(String(text || ""));
    } catch (_error) {
      throw new Error("Invalid JSON file.");
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid import format. Expected an object with emailTemplates, whatsappTemplates, and noteTemplates arrays.");
    }

    if (!Array.isArray(payload.emailTemplates) || !Array.isArray(payload.whatsappTemplates) || !Array.isArray(payload.noteTemplates)) {
      throw new Error("Invalid import format. Expected emailTemplates, whatsappTemplates, and noteTemplates arrays.");
    }

    const entries = [];

    payload.emailTemplates.map(normalizeImportedEmailTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "email", ...template });
    });

    payload.whatsappTemplates.map(normalizeImportedBasicTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "whatsapp", ...template });
    });

    payload.noteTemplates.map(normalizeImportedBasicTemplate).filter(Boolean).forEach((template) => {
      entries.push({ kind: "note", ...template });
    });

    if (!entries.length) {
      throw new Error("No valid templates found in the selected file.");
    }

    return entries;
  }


  function renderTemplateImportList() {
    if (!dom.templateImportListEl) return;
    if (!pendingImportTemplates.length) {
      dom.templateImportListEl.innerHTML = "<div class='notes-empty'>No templates to import.</div>";
      return;
    }

    dom.templateImportListEl.innerHTML = pendingImportTemplates
      .map((template, index) => {
        const kindLabel = template.kind === "email" ? "Email" : template.kind === "whatsapp" ? "WhatsApp" : "Note";
        const preview = template.kind === "email" ? template.subject || "No subject" : template.body || "No content";
        return `
          <label class='template-import-item'>
            <input type='checkbox' data-import-index='${index}' checked />
            <span class='template-import-item-title'>${App.escapeHtml(kindLabel)} - ${App.escapeHtml(template.name)}</span>
            <span class='template-import-item-meta'>${App.escapeHtml(preview.slice(0, 90))}</span>
          </label>
        `;
      })
      .join("");
  }

  function openTemplateImportReview(sourceLabel = "") {
    if (dom.templateImportModeAddInput) dom.templateImportModeAddInput.checked = true;
    if (dom.templateImportSummaryEl) {
      const suffix = sourceLabel ? ` from ${sourceLabel}` : "";
      dom.templateImportSummaryEl.textContent = `Found ${pendingImportTemplates.length} template(s)${suffix}. Select what to import.`;
    }
    renderTemplateImportList();
    if (dom.templateImportOverlay) dom.templateImportOverlay.classList.add("open");
  }

  function closeTemplateImportReview() {
    if (dom.templateImportOverlay) {
      App.blurFocusedElementWithin(dom.templateImportOverlay);
      App.preserveScrollPosition(() => {
        dom.templateImportOverlay.classList.remove("open");
      });
    }
    pendingImportTemplates = [];
    if (dom.templateImportListEl) dom.templateImportListEl.innerHTML = "";
    if (dom.templateImportSummaryEl) dom.templateImportSummaryEl.textContent = "";
  }

  function normalizeNameKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  async function applyTemplateImport() {
    if (!pendingImportTemplates.length) {
      App.setStatus("No templates selected for import.");
      return;
    }

    const selectedIndices = Array.from(dom.templateImportListEl?.querySelectorAll("input[data-import-index]") || [])
      .filter((input) => input.checked)
      .map((input) => Number(input.getAttribute("data-import-index")))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < pendingImportTemplates.length);

    if (!selectedIndices.length) {
      App.setStatus("Select at least one template to import.");
      return;
    }

    const mode = dom.templateImportModeReplaceInput?.checked ? "replace" : "add";

    const emailNext = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({ ...template }));
    const whatsappNext = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates).map((template) => ({ ...template }));
    const noteNext = App.normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({ ...template }));

    const emailNameToIndex = new Map(emailNext.map((template, index) => [normalizeNameKey(template.name), index]));
    const whatsappNameToIndex = new Map(whatsappNext.map((template, index) => [normalizeNameKey(template.name), index]));
    const noteNameToIndex = new Map(noteNext.map((template, index) => [normalizeNameKey(template.name), index]));

    const counts = {
      email: { added: 0, replaced: 0 },
      whatsapp: { added: 0, replaced: 0 },
      note: { added: 0, replaced: 0 },
      skipped: 0
    };

    for (const index of selectedIndices) {
      const incoming = pendingImportTemplates[index];
      if (!incoming) {
        counts.skipped += 1;
        continue;
      }

      const key = normalizeNameKey(incoming.name);

      if (incoming.kind === "email") {
        const matchIndex = mode === "replace" ? emailNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = emailNext[matchIndex];
          emailNext[matchIndex] = { ...current, name: incoming.name, subject: incoming.subject || "", body: incoming.body || "" };
          counts.email.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, subject: incoming.subject || "", body: incoming.body || "" };
          emailNext.push(created);
          emailNameToIndex.set(key, emailNext.length - 1);
          counts.email.added += 1;
        }
        continue;
      }

      if (incoming.kind === "whatsapp") {
        const matchIndex = mode === "replace" ? whatsappNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = whatsappNext[matchIndex];
          whatsappNext[matchIndex] = { ...current, name: incoming.name, body: incoming.body || "" };
          counts.whatsapp.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, body: incoming.body || "" };
          whatsappNext.push(created);
          whatsappNameToIndex.set(key, whatsappNext.length - 1);
          counts.whatsapp.added += 1;
        }
        continue;
      }

      if (incoming.kind === "note") {
        const matchIndex = mode === "replace" ? noteNameToIndex.get(key) : undefined;
        if (mode === "replace" && Number.isInteger(matchIndex)) {
          const current = noteNext[matchIndex];
          noteNext[matchIndex] = { ...current, name: incoming.name, body: incoming.body || "" };
          counts.note.replaced += 1;
        } else {
          const created = { id: App.makeTemplateId(), name: incoming.name, body: incoming.body || "" };
          noteNext.push(created);
          noteNameToIndex.set(key, noteNext.length - 1);
          counts.note.added += 1;
        }
        continue;
      }

      counts.skipped += 1;
    }

    const emailNormalized = App.normalizeEmailTemplates(emailNext);
    const whatsappNormalized = App.normalizeWhatsappTemplates(whatsappNext);
    const noteNormalized = App.normalizeNoteTemplates(noteNext);

    state.settings = {
      ...state.settings,
      emailTemplates: emailNormalized,
      whatsappTemplates: whatsappNormalized,
      noteTemplates: noteNormalized
    };

    await chrome.storage.local.set({
      [constants.EMAIL_TEMPLATES_LOCAL_KEY]: emailNormalized,
      [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: whatsappNormalized,
      [constants.NOTE_TEMPLATES_LOCAL_KEY]: noteNormalized
    });

    if (!dom.emailTemplatesPageEl?.hidden) {
      App.loadEmailTemplatesDraftFromSettings();
      App.renderEmailTemplatesPage();
    }
    if (!dom.whatsappTemplatesPageEl?.hidden) {
      App.loadWhatsappTemplatesDraftFromSettings();
      App.renderWhatsappTemplatesPage();
    }
    if (!dom.noteTemplatesPageEl?.hidden) {
      App.loadNoteTemplatesDraftFromSettings();
      App.renderNoteTemplatesPage();
    }

    closeTemplateImportReview();
    const summary = `Imported templates: Email ${counts.email.added} added / ${counts.email.replaced} replaced, WhatsApp ${counts.whatsapp.added} added / ${counts.whatsapp.replaced} replaced, Note ${counts.note.added} added / ${counts.note.replaced} replaced, ${counts.skipped} skipped.`;
    if (typeof App.showToast === "function") App.showToast(summary, 3200);
    else App.setStatus(summary);
  }

  async function onImportTemplatesInputChange(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      pendingImportTemplates = parseImportedTemplates(text);
      openTemplateImportReview(file.name || "selected file");
    } catch (error) {
      const message = String(error?.message || "Could not import templates.");
      App.setStatus(message);
      if (typeof App.showToast === "function") App.showToast(message, 2800);
    } finally {
      if (dom.importTemplatesInput) dom.importTemplatesInput.value = "";
    }
  }

  function buildExportFileName() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `contact-point-personal-templates-${stamp}.json`;
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportPersonalTemplates() {
    const emailTemplates = App.normalizeEmailTemplates(state.settings.emailTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      subject: String(template.subject || "").trim(),
      body: String(template.body || "").trim()
    }));

    const whatsappTemplates = App.normalizeWhatsappTemplates(state.settings.whatsappTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      body: String(template.body || "").trim()
    }));

    const noteTemplates = App.normalizeNoteTemplates(state.settings.noteTemplates).map((template) => ({
      name: String(template.name || "").trim() || "Untitled",
      body: String(template.body || "").trim()
    }));

    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      emailTemplates,
      whatsappTemplates,
      noteTemplates
    };

    downloadJson(buildExportFileName(), payload);
    const total = emailTemplates.length + whatsappTemplates.length + noteTemplates.length;
    if (typeof App.showToast === "function") App.showToast(`Exported ${total} template(s).`);
  }

  function triggerImportTemplatesPicker() {
    if (!dom.importTemplatesInput) {
      App.setStatus("Import input is not available.");
      return;
    }
    dom.importTemplatesInput.click();
  }

  async function loadSettings() {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get(constants.SETTINGS_KEY),
      chrome.storage.local.get([
        constants.EMAIL_TEMPLATES_LOCAL_KEY,
        constants.WHATSAPP_TEMPLATES_LOCAL_KEY,
        constants.NOTE_TEMPLATES_LOCAL_KEY,
        constants.TEMPLATE_USAGE_LOCAL_KEY,
        constants.QUICK_NOTES_LOCAL_KEY,
        constants.CLOUD_AUTH_LOCAL_KEY,
        constants.CLOUD_AUTH_LIST_LOCAL_KEY,
        constants.CLOUD_ACTIVE_ORG_ID_LOCAL_KEY
      ])
    ]);
    const saved = syncResult[constants.SETTINGS_KEY];
    const {
      defaultEmailTemplateId: _legacyDefaultId,
      emailTemplates: legacySyncTemplates,
      whatsappTemplates: legacySyncWhatsappTemplates,
      noteTemplates: legacySyncNoteTemplates,
      ...savedWithoutLegacy
    } = saved || {};
    const localEmailTemplates = localResult[constants.EMAIL_TEMPLATES_LOCAL_KEY];
    const localWhatsappTemplates = localResult[constants.WHATSAPP_TEMPLATES_LOCAL_KEY];
    const localNoteTemplates = localResult[constants.NOTE_TEMPLATES_LOCAL_KEY];
    const savedTemplateUsage = localResult[constants.TEMPLATE_USAGE_LOCAL_KEY];
    const savedQuickNotes = localResult[constants.QUICK_NOTES_LOCAL_KEY];
    const savedCloudAuth = localResult[constants.CLOUD_AUTH_LOCAL_KEY];
    const savedCloudAuthList = localResult[constants.CLOUD_AUTH_LIST_LOCAL_KEY];
    const hasLocalEmailTemplates = Array.isArray(localEmailTemplates);
    const hasLocalWhatsappTemplates = Array.isArray(localWhatsappTemplates);
    const hasLocalNoteTemplates = Array.isArray(localNoteTemplates);
    const emailTemplates = App.normalizeEmailTemplates(hasLocalEmailTemplates ? localEmailTemplates : legacySyncTemplates);
    const whatsappTemplates = App.normalizeWhatsappTemplates(
      hasLocalWhatsappTemplates ? localWhatsappTemplates : legacySyncWhatsappTemplates
    );
    const noteTemplates = App.normalizeNoteTemplates(hasLocalNoteTemplates ? localNoteTemplates : legacySyncNoteTemplates);
    state.templateUsageByContact = App.normalizeTemplateUsageMap(savedTemplateUsage);
    state.quickNotesByRecordId = App.normalizeQuickNotesMap(savedQuickNotes);
    state.settings = {
      ...constants.DEFAULT_SETTINGS,
      ...savedWithoutLegacy,
      visibleColumns: {
        ...constants.DEFAULT_SETTINGS.visibleColumns,
        ...(savedWithoutLegacy.visibleColumns || {})
      },
      columnWidths: App.normalizeColumnWidths(savedWithoutLegacy.columnWidths),
      emailTemplates,
      whatsappTemplates,
      noteTemplates
    };
    state.settings.inlineQuickActionsEnabled = state.settings.inlineQuickActionsEnabled !== false;
    state.settings.defaultLaunchMode = App.normalizeLaunchMode(state.settings.defaultLaunchMode);
    const migratedList = normalizeCloudAuthList(savedCloudAuthList);
    const legacyAuth = App.normalizeCloudAuth(savedCloudAuth);
    state.cloud.authList = migratedList.length ? migratedList : legacyAuth ? [legacyAuth] : [];
    const primaryAuth = state.cloud.authList[0] || null;
    state.cloud.activeOrganizationId = "";
    state.cloud.auth = primaryAuth;
    state.settings.messageTemplate = "";
    state.settings.noteTemplate = "";
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);
    App.applyTheme(state.settings.themeMode);

    const needsSyncCleanup =
      (saved &&
        (Object.prototype.hasOwnProperty.call(saved, "emailTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "whatsappTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "noteTemplates") ||
          Object.prototype.hasOwnProperty.call(saved, "defaultEmailTemplateId"))) ||
      state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT;
    const writes = [];

    if (!hasLocalEmailTemplates && Array.isArray(legacySyncTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.EMAIL_TEMPLATES_LOCAL_KEY]: emailTemplates }));
    }

    if (!hasLocalWhatsappTemplates && Array.isArray(legacySyncWhatsappTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.WHATSAPP_TEMPLATES_LOCAL_KEY]: whatsappTemplates }));
    }

    if (!hasLocalNoteTemplates && Array.isArray(legacySyncNoteTemplates)) {
      writes.push(chrome.storage.local.set({ [constants.NOTE_TEMPLATES_LOCAL_KEY]: noteTemplates }));
    }

    if (state.settings.noteTemplate === constants.LEGACY_NOTE_TEXT) {
      state.settings.noteTemplate = "";
    }

    if (needsSyncCleanup) {
      writes.push(persistSyncSettings(state.settings));
    }

    if (writes.length) {
      await Promise.all(writes);
    }

    await persistCloudAuthState();
    ensureDefaultPendingCloudRow();
    await loadCloudCacheFromStorage(state.cloud.auth);
  }

  async function saveSettings(options = {}) {
    const silent = options?.silent === true;
    const next = settingsFromForm();

    // Only enforce this when we actually have detected columns.
    const hasDetectedColumns = state.currentColumns.length > 0;
    const hasVisibleDetectedColumn = hasDetectedColumns
      ? state.currentColumns.some((col) => next.visibleColumns[col.id] !== false)
      : true;

    if (!hasVisibleDetectedColumn) {
      const message = "Enable at least one column.";
      App.setStatus(message);
      if (!silent && typeof App.showToast === "function") App.showToast(message, 2600);
      return false;
    }

    state.settings = { ...state.settings, ...next, messageTemplate: "", noteTemplate: "" };
    state.settings.themeMode = App.normalizeThemeMode(state.settings.themeMode);
    state.settings.defaultLaunchMode = App.normalizeLaunchMode(state.settings.defaultLaunchMode);

    try {
      await persistSyncSettings(state.settings);
      App.renderContacts();
      if (!silent) {
        App.setStatus("Settings saved.");
        if (typeof App.showToast === "function") App.showToast("Settings saved.");
      }
      return true;
    } catch (error) {
      const reason = String(error?.message || error || "Unknown error.");
      App.setStatus("Could not save settings: " + reason);
      if (!silent && typeof App.showToast === "function") App.showToast("Save failed: " + reason, 3200);
      return false;
    }
  }

  Object.assign(App, {
    renderColumnChecks,
    settingsFromForm,
    fillSettingsForm,
    openSettings,
    closeSettings,
    toggleSettings,
    setSettingsMode,
    setEmailTemplatesMode,
    setActiveTabMode,
    setWhatsappTemplatesMode,
    setNoteTemplatesMode,
    syncTopLevelViewState,
    openEmailSettings,
    closeEmailSettings,
    toggleEmailSettings,
    openWhatsappSettings,
    closeWhatsappSettings,
    toggleWhatsappSettings,
    openNoteSettings,
    closeNoteSettings,
    toggleNoteSettings,
    openActiveTab,
    closeActiveTab,
    toggleActiveTab,
    openContactsView,
    ensureCountryPrefixOptionExists,
    renderCountryPrefixOptions,
    buildSyncSettingsPayload,
    persistSyncSettings,
    bindSettingsAutosave,
    queueSettingsAutosave,
    flushSettingsAutosave,
    saveEmailSettings,
    saveWhatsappSettings,
    saveNoteTemplateSettings,
    exportPersonalTemplates,
    triggerImportTemplatesPicker,
    onImportTemplatesInputChange,
    openTemplateImportReview,
    closeTemplateImportReview,
    openCloudTokenInfoDialog,
    closeCloudTokenInfoDialog,
    applyTemplateImport,
    renderCloudConnectionStatus,
    renderCloudAuthCards,
    addCloudAuthRow,
    onCloudAuthCardsClick,
    onCloudAuthCardsInput,
    saveCloudApiToken,
    refreshCloudTemplates,
    refreshCloudTemplatesNow,
    refreshCloudTemplatesSessionCheck,
    clearCloudConnection,
    loadSettings,
    saveSettings
  });
})();
