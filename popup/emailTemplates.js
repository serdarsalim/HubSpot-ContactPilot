(() => {
  const App = window.PopupApp;
  const { dom, state, constants } = App;
  const MT = App.messageTypes;
  const timing = App.timing.popup;
  const isDetachedLaunch = new URLSearchParams(globalThis.location?.search || "").get("mode") === "detached";
  const BODY_EDITOR_ID = "emailTemplateBodyInput";
  const TINYMCE_TOOLBAR_ORDER = [
    "blocks",
    "bold italic underline strikethrough",
    "bullist numlist",
    "cp_link",
    "forecolor backcolor",
    "alignleft aligncenter alignright",
    "removeformat",
    "undo redo"
  ].join(" | ");
  const AUTOSAVE_DELAY_MS = 1000;
  const FORM_SYNC_RELEASE_DELAY_MS = 140;
  let emailBodyEditorInitPromise = null;
  let tinyEditorUnavailable = false;
  let autosaveTimerId = null;
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let lastSavedDraftSignature = "";
  let formSyncReleaseTimerId = null;
  let linkDialogOutsideClickCleanup = null;
  let draggedEmailTemplateId = "";

  function htmlToPlainText(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (!/<[a-z][\s\S]*>/i.test(raw)) {
      return raw
        .replace(/\r\n/g, "\n")
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n")
        .trim();
    }

    const node = document.createElement("div");
    node.innerHTML = raw;
    return String(node.textContent || "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
  }

  function templatePreviewText(template) {
    return String(template?.subject || "").trim() || htmlToPlainText(template?.body);
  }

  function scoreEmailTemplateSearchMatch(template, query) {
    const normalizedQuery = App.normalizeSearchText(query || "");
    if (!normalizedQuery) return 0;

    const name = App.normalizeSearchText(template?.name || "");
    const subject = App.normalizeSearchText(template?.subject || "");
    const nameWords = name.split(/\s+/).filter(Boolean);
    const subjectWords = subject.split(/\s+/).filter(Boolean);

    if (name === normalizedQuery) return 1000;
    if (subject === normalizedQuery) return 700;
    if (name.startsWith(normalizedQuery)) return 450;
    if (subject.startsWith(normalizedQuery)) return 260;
    if (nameWords.includes(normalizedQuery)) return 220;
    if (subjectWords.includes(normalizedQuery)) return 140;
    if (name.includes(normalizedQuery)) return 120;
    if (subject.includes(normalizedQuery)) return 80;
    return 0;
  }

  function rankEmailTemplatesForQuery(templates, query) {
    const normalizedQuery = App.normalizeSearchText(query || "");
    const source = Array.isArray(templates) ? templates : [];
    if (!normalizedQuery) return source;

    return [...source]
      .map((template, index) => ({
        template,
        index,
        score: scoreEmailTemplateSearchMatch(template, normalizedQuery)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map((entry) => entry.template);
  }

  function hasEmailInteraction(url) {
    return /\binteraction=email\b/i.test(String(url || ""));
  }

  async function findOpenEmailInteractionTab(recordId, portalId) {
    const tabs = await chrome.tabs.query({ url: App.constants.HUBSPOT_URL_PATTERNS || ["https://*.hubspot.com/*"] });
    const cleanRecordId = String(recordId || "").replace(/\D/g, "");
    const cleanPortalId = String(portalId || "").replace(/\D/g, "");
    const matches = tabs.filter((tab) => {
      const url = String(tab?.url || "");
      if (!hasEmailInteraction(url)) return false;
      const tabRecordIdMatch = url.match(/\/record\/0-1\/(\d+)/i);
      const tabPortalIdMatch = url.match(/\/contacts\/(\d+)\/record\/0-1\//i);
      const tabRecordId = tabRecordIdMatch ? tabRecordIdMatch[1] : "";
      const tabPortalId = tabPortalIdMatch ? tabPortalIdMatch[1] : "";
      if (tabRecordId !== cleanRecordId) return false;
      if (cleanPortalId && tabPortalId !== cleanPortalId) return false;
      return true;
    });
    matches.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
    return matches[0] || null;
  }

  async function requestContactContextForTabId(tabId) {
    const attempts = Number(App.timing?.popup?.messageRetryAttempts || 3);
    const delayMs = Number(App.timing?.popup?.messageRetryDelayMs || 500);
    let lastError = "";

    try {
      await App.waitForTabComplete(tabId);
    } catch (_error) {
      // Best effort only.
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
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

  function mergeContactValues(baseContact, nextContact) {
    if (!nextContact) return baseContact;
    if (!baseContact) return nextContact;

    const baseValues = baseContact.values && typeof baseContact.values === "object" ? baseContact.values : {};
    const nextValues = nextContact.values && typeof nextContact.values === "object" ? nextContact.values : {};

    return {
      ...baseContact,
      ...nextContact,
      values: {
        ...baseValues,
        ...nextValues
      }
    };
  }

  function renderTemplateSourceBadge(template) {
    if (template?.source !== "cloud") return "";
    return `<span class='template-source-pill cloud' aria-label='Cloud template' title='Cloud template'>☁</span>`;
  }

  function toEditorHtml(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return App.escapeHtml(raw).replace(/\n/g, "<br>");
  }

  function getTinyEmailBodyEditor() {
    const tiny = window.tinymce;
    if (!tiny || typeof tiny.get !== "function") return null;
    return tiny.get(BODY_EDITOR_ID) || null;
  }

  function escapeHtmlAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getAnchorFromNode(node) {
    const element = node && typeof node === "object" && node.nodeType === 1 ? node : null;
    if (!element || typeof element.closest !== "function") return null;
    const anchor = element.closest("a[href]");
    return anchor && anchor.nodeType === 1 ? anchor : null;
  }

  function getSelectedAnchor(editor, nodeHint = null) {
    const hintedAnchor = getAnchorFromNode(nodeHint);
    if (hintedAnchor) return hintedAnchor;
    const selectedNode = editor?.selection?.getNode?.();
    return getAnchorFromNode(selectedNode);
  }

  function normalizeLinkHref(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return "";
    if (/^(https?:|mailto:|tel:|sms:)/i.test(value)) return value;
    if (/^\/|^#|^\?/i.test(value)) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return `https://${value}`;
  }

  function removeLinkAtSelection(editor, nodeHint = null) {
    const anchor = getSelectedAnchor(editor, nodeHint);
    if (!anchor) return false;
    editor.undoManager.transact(() => {
      const parent = anchor.parentNode;
      if (!parent) return;
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
      parent.removeChild(anchor);
    });
    return true;
  }

  function upsertLinkAtSelection(editor, rawHref, rawText, nodeHint = null) {
    const anchor = getSelectedAnchor(editor, nodeHint);
    const href = normalizeLinkHref(rawHref);
    if (!href) {
      removeLinkAtSelection(editor, nodeHint);
      return;
    }

    editor.undoManager.transact(() => {
      if (anchor) {
        anchor.setAttribute("href", href);
        if (typeof rawText === "string" && rawText.trim()) {
          anchor.textContent = rawText.trim();
        }
        return;
      }

      const selectionHtml = String(editor.selection?.getContent({ format: "html" }) || "").trim();
      const selectionText = String(editor.selection?.getContent({ format: "text" }) || "").trim();
      if (selectionHtml) {
        editor.selection.setContent(`<a href="${escapeHtmlAttr(href)}">${selectionHtml}</a>`);
        return;
      }

      const fallbackText = String(rawText || "").trim() || selectionText || href;
      const text = fallbackText || href;
      editor.insertContent(`<a href="${escapeHtmlAttr(href)}">${App.escapeHtml(text)}</a>`);
    });
  }

  function openSelectedLink(editor, nodeHint = null, overrideHref = "") {
    const hrefFromInput = normalizeLinkHref(overrideHref);
    if (hrefFromInput) {
      window.open(hrefFromInput, "_blank", "noopener,noreferrer");
      return true;
    }
    const anchor = getSelectedAnchor(editor, nodeHint);
    if (!anchor) return false;
    const href = normalizeLinkHref(anchor.getAttribute("href"));
    if (!href) return false;
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  }

  function openLinkDialog(editor, nodeHint = null) {
    const anchor = getSelectedAnchor(editor, nodeHint);
    const selectedText = String(editor.selection?.getContent({ format: "text" }) || "").trim();
    const anchorText = String(anchor?.textContent || "").trim();
    const anchorHref = String(anchor?.getAttribute("href") || "").trim();
    const initialHref = anchorHref || "https://";
    const initialText = anchorText || selectedText;

    if (typeof linkDialogOutsideClickCleanup === "function") {
      linkDialogOutsideClickCleanup();
      linkDialogOutsideClickCleanup = null;
    }

    const dialogApi = editor.windowManager.open({
      title: "Link",
      size: "normal",
      closeOnClickOutside: true,
      body: {
        type: "panel",
        items: [
          {
            type: "input",
            name: "href",
            label: "URL"
          },
          {
            type: "input",
            name: "text",
            label: "Text"
          }
        ]
      },
      initialData: {
        href: initialHref,
        text: initialText
      },
      buttons: [
        { type: "cancel", text: "Cancel" },
        { type: "custom", name: "open", text: "Open in New Tab" },
        { type: "custom", name: "unlink", text: "Unlink" },
        { type: "submit", text: "Save", primary: true }
      ],
      onAction(api, details) {
        if (details.name === "open") {
          const href = String(api.getData().href || "").trim();
          if (!openSelectedLink(editor, nodeHint, href)) {
            App.setStatus("Provide a valid link to open.");
          }
          return;
        }
        if (details.name === "unlink") {
          if (!removeLinkAtSelection(editor, nodeHint)) {
            App.setStatus("Place cursor on a link to unlink it.");
            return;
          }
          api.close();
        }
      },
      onSubmit(api) {
        const data = api.getData();
        const href = String(data?.href || "").trim();
        const text = String(data?.text || "").trim();
        if (!href) {
          App.setStatus("Link URL is required.");
          return;
        }
        upsertLinkAtSelection(editor, href, text, nodeHint);
        api.close();
      },
      onClose() {
        if (typeof linkDialogOutsideClickCleanup === "function") {
          linkDialogOutsideClickCleanup();
          linkDialogOutsideClickCleanup = null;
        }
      }
    });

    const outsideClickHandler = (event) => {
      const target = event?.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".tox-dialog")) return;
      const isBackdrop = !!target.closest(".tox-dialog-wrap__backdrop");
      const inDialogWrap = !!target.closest(".tox-dialog-wrap");
      if (!isBackdrop && !inDialogWrap) return;
      dialogApi.close();
    };
    document.addEventListener("mousedown", outsideClickHandler, true);
    linkDialogOutsideClickCleanup = () => {
      document.removeEventListener("mousedown", outsideClickHandler, true);
    };
  }

  function setEmailTemplateSaveState(stateKey, text) {
    if (!dom.emailTemplateSaveStateEl) return;
    dom.emailTemplateSaveStateEl.dataset.state = String(stateKey || "saved");
    dom.emailTemplateSaveStateEl.textContent = String(text || "Saved");
  }

  function getEmailTemplateDraftSignature() {
    return JSON.stringify(App.normalizeEmailTemplates(state.emailTemplatesDraft));
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
    try {
      return JSON.stringify(error);
    } catch (_stringifyError) {
      return String(error);
    }
  }

  function beginTemplateFormSync() {
    state.syncingEmailTemplateForm = true;
    if (formSyncReleaseTimerId) {
      clearTimeout(formSyncReleaseTimerId);
      formSyncReleaseTimerId = null;
    }
  }

  function endTemplateFormSyncDeferred(delayMs = FORM_SYNC_RELEASE_DELAY_MS) {
    if (formSyncReleaseTimerId) {
      clearTimeout(formSyncReleaseTimerId);
      formSyncReleaseTimerId = null;
    }
    formSyncReleaseTimerId = setTimeout(() => {
      state.syncingEmailTemplateForm = false;
      formSyncReleaseTimerId = null;
    }, Math.max(0, Number(delayMs) || 0));
  }

  async function saveEmailTemplateDraftNow(force = false) {
    if (autosaveInFlight) {
      autosaveQueued = true;
      return false;
    }

    const signatureBefore = getEmailTemplateDraftSignature();
    if (!force && signatureBefore === lastSavedDraftSignature) {
      setEmailTemplateSaveState("saved", "Saved");
      return true;
    }

    autosaveInFlight = true;
    setEmailTemplateSaveState("saving", "Saving...");

    try {
      await App.saveEmailSettings({ showToast: false });
      lastSavedDraftSignature = getEmailTemplateDraftSignature();
      setEmailTemplateSaveState("saved", "Saved");
      return true;
    } catch (error) {
      const reason = getErrorMessage(error).replace(/\s+/g, " ").trim();
      setEmailTemplateSaveState("error", "Save failed");
      App.setStatus(`Template save failed: ${reason || "Unknown error."}`);
      if (typeof App.showToast === "function") {
        App.showToast(`Save failed: ${reason || "Unknown error."}`, 3200);
      }
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error("Template autosave failed", error);
      }
      return false;
    } finally {
      autosaveInFlight = false;
      if (autosaveQueued) {
        autosaveQueued = false;
        void saveEmailTemplateDraftNow();
      }
    }
  }

  function scheduleEmailTemplateAutosave() {
    const signature = getEmailTemplateDraftSignature();
    if (signature === lastSavedDraftSignature) {
      setEmailTemplateSaveState("saved", "Saved");
      return;
    }

    setEmailTemplateSaveState("saving", "Saving...");
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      void saveEmailTemplateDraftNow();
    }, AUTOSAVE_DELAY_MS);
  }

  async function flushEmailTemplateAutosave(_options = {}) {
    if (autosaveTimerId) {
      clearTimeout(autosaveTimerId);
      autosaveTimerId = null;
    }
    return saveEmailTemplateDraftNow(true);
  }

  function readEmailBodyValueFromForm() {
    const editor = getTinyEmailBodyEditor();
    if (editor) {
      const text = String(editor.getContent({ format: "text" }) || "").trim();
      if (!text) return "";
      const html = String(editor.getContent({ format: "html" }) || "").trim();
      return html;
    }
    return String(dom.emailTemplateBodyInput?.value || "").trim();
  }

  function writeEmailBodyValueToForm(value) {
    const next = String(value || "");
    const editor = getTinyEmailBodyEditor();
    if (editor) {
      const nextHtml = toEditorHtml(next);
      const currentHtml = String(editor.getContent({ format: "html" }) || "").trim();
      if (currentHtml !== nextHtml.trim()) {
        editor.setContent(nextHtml);
      }
      return;
    }
    if (dom.emailTemplateBodyInput) {
      dom.emailTemplateBodyInput.value = next;
    }
  }

  function ensureEmailBodyEditor() {
    if (tinyEditorUnavailable) return Promise.resolve(null);
    const tiny = window.tinymce;
    if (!tiny || typeof tiny.init !== "function") {
      tinyEditorUnavailable = true;
      App.setStatus("TinyMCE is unavailable. Falling back to plain text body editor.");
      return Promise.resolve(null);
    }

    const existing = getTinyEmailBodyEditor();
    if (existing) return Promise.resolve(existing);
    if (emailBodyEditorInitPromise) return emailBodyEditorInitPromise;

    emailBodyEditorInitPromise = tiny
      .init({
        selector: `#${BODY_EDITOR_ID}`,
        license_key: "gpl",
        menubar: false,
        statusbar: false,
        branding: false,
        promotion: false,
        resize: false,
        plugins: "lists",
        toolbar: TINYMCE_TOOLBAR_ORDER,
        skin: "oxide",
        content_css: "default",
        content_style: "a[href] { cursor: pointer; }",
        setup(editor) {
          editor.ui.registry.addButton("cp_link", {
            icon: "link",
            tooltip: "Link",
            onAction: () => openLinkDialog(editor)
          });
          editor.on("change input undo redo keyup", () => {
            if (state.syncingEmailTemplateForm) return;
            upsertActiveTemplateFromForm();
          });
          editor.on("click", (event) => {
            const anchor = getAnchorFromNode(event.target);
            if (!anchor) return;
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              openSelectedLink(editor);
            }
          });
          editor.on("dblclick", (event) => {
            const anchor = getAnchorFromNode(event.target);
            if (!anchor) return;
            event.preventDefault();
            openLinkDialog(editor, anchor);
          });
          editor.on("blur", () => {
            void flushEmailTemplateAutosave({ showToast: false });
          });
        }
      })
      .then((editors) => {
        const editor = Array.isArray(editors) ? editors[0] || null : null;
        emailBodyEditorInitPromise = null;
        return editor;
      })
      .catch(() => {
        tinyEditorUnavailable = true;
        emailBodyEditorInitPromise = null;
        App.setStatus("Could not initialize TinyMCE. Falling back to plain text body editor.");
        return null;
      });

    return emailBodyEditorInitPromise;
  }

  function loadEmailTemplatesDraftFromSettings() {
    const normalized = App.normalizeEmailTemplates(state.settings.emailTemplates);
    state.emailTemplatesDraft = normalized.map((template) => ({ ...template }));
    state.activeEmailTemplateId = state.emailTemplatesDraft[0]?.id || "";
    lastSavedDraftSignature = getEmailTemplateDraftSignature();
    setEmailTemplateSaveState("saved", "Saved");
  }

  function getMergedEmailTemplates() {
    const localSource =
      Array.isArray(state.emailTemplatesDraft) && state.emailTemplatesDraft.length
        ? state.emailTemplatesDraft
        : state.settings.emailTemplates;
    const localTemplates = App.normalizeEmailTemplates(localSource).map((template) => ({
      ...template,
      source: "local",
      readOnly: false,
      type: "EMAIL"
    }));
    const cloudTemplates = Array.isArray(state.cloud?.emailTemplates) ? state.cloud.emailTemplates : [];
    return App.sortTemplatesByUsage([...localTemplates, ...cloudTemplates], "email");
  }

  function getFilteredEmailTemplates() {
    const templates = getMergedEmailTemplates();
    const query = App.normalizeSearchText(state.emailTemplatesSearchQuery || "");
    const showCloud = state.emailTemplatesShowCloud !== false;
    return templates.filter((template) => {
      if (!showCloud && template?.source === "cloud") return false;
      if (!query) return true;
      const name = App.normalizeSearchText(template?.name || "");
      const subject = App.normalizeSearchText(template?.subject || "");
      return name.includes(query) || subject.includes(query);
    });
  }

  function getActiveEmailTemplateDraft() {
    return state.emailTemplatesDraft.find((template) => template.id === state.activeEmailTemplateId) || null;
  }

  function getActiveEmailTemplateAny() {
    const templates = getMergedEmailTemplates();
    return templates.find((template) => template.id === state.activeEmailTemplateId) || null;
  }

  function isCloudTemplate(template) {
    if (!template) return false;
    if (template.readOnly === true || template.source === "cloud") return true;
    if (typeof App.isCloudTemplateId === "function") {
      return App.isCloudTemplateId(template.id);
    }
    return false;
  }

  function setEmailEditorReadOnly(readOnly) {
    const nextReadOnly = !!readOnly;
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.disabled = nextReadOnly;
    if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.disabled = nextReadOnly;
    if (dom.deleteEmailTemplateBtn) dom.deleteEmailTemplateBtn.hidden = nextReadOnly;

    const editor = getTinyEmailBodyEditor();
    if (editor?.mode?.set) {
      editor.mode.set(nextReadOnly ? "readonly" : "design");
    } else if (dom.emailTemplateBodyInput) {
      dom.emailTemplateBodyInput.readOnly = nextReadOnly;
      dom.emailTemplateBodyInput.disabled = nextReadOnly;
    }
  }

  function renderEmailTemplatesList() {
    const allTemplates = getMergedEmailTemplates();
    const templates = getFilteredEmailTemplates();
    if (!dom.emailTemplatesListEl) return;
    if (dom.emailTemplatesSearchInput && dom.emailTemplatesSearchInput.value !== state.emailTemplatesSearchQuery) {
      dom.emailTemplatesSearchInput.value = state.emailTemplatesSearchQuery;
    }
    const hasCloudTemplates = allTemplates.some((template) => template?.source === "cloud");
    if (dom.emailCloudToggleWrap) dom.emailCloudToggleWrap.hidden = !hasCloudTemplates;
    if (dom.emailCloudToggleInput) dom.emailCloudToggleInput.checked = state.emailTemplatesShowCloud !== false;
    if (!allTemplates.length) {
      dom.emailTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates yet.</div>";
      return;
    }
    if (!templates.length) {
      dom.emailTemplatesListEl.innerHTML = "<div class='email-template-empty'>No templates match the current filters.</div>";
      return;
    }

    if (!templates.some((template) => template.id === state.activeEmailTemplateId)) {
      state.activeEmailTemplateId = templates[0]?.id || "";
    }

    dom.emailTemplatesListEl.innerHTML = templates
      .map((template) => {
        const activeClass = template.id === state.activeEmailTemplateId ? "active" : "";
        const isLocalTemplate = template.source !== "cloud";
        const sourceBadge = renderTemplateSourceBadge(template);
        return `
        <button
          type='button'
          class='email-template-list-btn ${activeClass} ${isLocalTemplate ? "is-draggable" : ""}'
          data-template-id='${App.escapeHtml(template.id)}'
          ${isLocalTemplate ? "draggable='true'" : ""}
        >
          <span class='email-template-list-head'>
            <span class='email-template-list-name'>${App.escapeHtml(template.name || "Untitled")}</span>
            ${sourceBadge}
          </span>
        </button>
      `;
      })
      .join("");

    dom.emailTemplatesListEl.querySelectorAll(".email-template-list-btn.is-draggable").forEach((button) => {
      button.addEventListener("dragstart", (event) => {
        draggedEmailTemplateId = String(button.getAttribute("data-template-id") || "");
        button.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", draggedEmailTemplateId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });

      button.addEventListener("dragend", () => {
        draggedEmailTemplateId = "";
        button.classList.remove("is-dragging");
        dom.emailTemplatesListEl
          ?.querySelectorAll(".email-template-list-btn.drag-over")
          .forEach((element) => element.classList.remove("drag-over"));
      });

      button.addEventListener("dragover", (event) => {
        const targetId = String(button.getAttribute("data-template-id") || "");
        if (!draggedEmailTemplateId || draggedEmailTemplateId === targetId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        button.classList.add("drag-over");
      });

      button.addEventListener("dragleave", () => {
        button.classList.remove("drag-over");
      });

      button.addEventListener("drop", (event) => {
        const targetId = String(button.getAttribute("data-template-id") || "");
        button.classList.remove("drag-over");
        if (!draggedEmailTemplateId || !targetId || draggedEmailTemplateId === targetId) return;
        event.preventDefault();
        const fromIndex = state.emailTemplatesDraft.findIndex((template) => template.id === draggedEmailTemplateId);
        const toIndex = state.emailTemplatesDraft.findIndex((template) => template.id === targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        const next = [...state.emailTemplatesDraft];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        state.emailTemplatesDraft = next;
        state.activeEmailTemplateId = moved.id;
        renderEmailTemplatesPage();
        scheduleEmailTemplateAutosave();
      });
    });
  }

  function renderActiveEmailTemplateEditor() {
    const visibleTemplates = getFilteredEmailTemplates();
    if (!visibleTemplates.length) {
      if (dom.emailTemplateEmptyEl) {
        dom.emailTemplateEmptyEl.hidden = false;
        dom.emailTemplateEmptyEl.textContent = getMergedEmailTemplates().length
          ? "No templates match the current filters."
          : "Select a template from the left or create a new one.";
      }
      if (dom.emailTemplateEditorEl) dom.emailTemplateEditorEl.hidden = true;
      setEmailEditorReadOnly(false);
      return;
    }
    if (visibleTemplates.length && !visibleTemplates.some((template) => template.id === state.activeEmailTemplateId)) {
      state.activeEmailTemplateId = visibleTemplates[0]?.id || "";
    }
    const active = getActiveEmailTemplateAny();
    const hasActive = !!active;
    const activeIsCloud = isCloudTemplate(active);

    if (dom.emailTemplateEmptyEl) dom.emailTemplateEmptyEl.hidden = hasActive;
    if (dom.emailTemplateEditorEl) dom.emailTemplateEditorEl.hidden = !hasActive;
    if (!hasActive) {
      setEmailEditorReadOnly(false);
      return;
    }

    beginTemplateFormSync();
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.value = active.name || "";
    if (dom.emailTemplateSubjectInput) dom.emailTemplateSubjectInput.value = active.subject || "";
    writeEmailBodyValueToForm(active.body || "");
    endTemplateFormSyncDeferred();
    setEmailEditorReadOnly(activeIsCloud);
    setEmailTemplateSaveState("saved", activeIsCloud ? ("Managed by " + String(state.cloud?.auth?.organizationName || state.cloud?.auth?.organizationSlug || state.cloud?.auth?.organizationId || "Cloud")) : "Saved");
  }

  function renderEmailTemplatesPage() {
    renderEmailTemplatesList();
    renderActiveEmailTemplateEditor();
  }

  function upsertActiveTemplateFromForm() {
    if (state.syncingEmailTemplateForm) return;
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeEmailTemplateId)) return;
    const active = getActiveEmailTemplateDraft();
    if (!active) return;

    active.name = String(dom.emailTemplateNameInput?.value || "").trim() || "Untitled";
    active.subject = String(dom.emailTemplateSubjectInput?.value || "").trim();
    active.body = readEmailBodyValueFromForm();
    renderEmailTemplatesList();
    scheduleEmailTemplateAutosave();
  }

  function addEmailTemplateDraft() {
    const nextTemplate = {
      id: App.makeTemplateId(),
      name: `Template ${state.emailTemplatesDraft.length + 1}`,
      subject: "",
      body: ""
    };
    state.emailTemplatesDraft = [...state.emailTemplatesDraft, nextTemplate];
    state.activeEmailTemplateId = nextTemplate.id;
    renderEmailTemplatesPage();
    scheduleEmailTemplateAutosave();
    if (dom.emailTemplateNameInput) dom.emailTemplateNameInput.focus();
  }

  function deleteActiveEmailTemplateDraft() {
    if (typeof App.isCloudTemplateId === "function" && App.isCloudTemplateId(state.activeEmailTemplateId)) return;
    if (!state.activeEmailTemplateId) return;

    const active = getActiveEmailTemplateDraft();
    const templateName = String(active?.name || "this template");
    const confirmed = window.confirm("Delete " + templateName + "?");
    if (!confirmed) return;

    state.emailTemplatesDraft = state.emailTemplatesDraft.filter((template) => template.id !== state.activeEmailTemplateId);
    if (!state.emailTemplatesDraft.length) {
      state.emailTemplatesDraft = [{ ...constants.DEFAULT_EMAIL_TEMPLATE, id: App.makeTemplateId() }];
    }
    state.activeEmailTemplateId = state.emailTemplatesDraft[0].id;
    renderEmailTemplatesPage();
    scheduleEmailTemplateAutosave();

    if (typeof App.showToast === "function") {
      App.showToast("Template deleted.");
    }
  }

  function renderEmailTemplatePickerOptions() {
    if (!dom.emailTemplatePickList) return;
    const templates = getMergedEmailTemplates();
    const query = App.normalizeSearchText(state.emailTemplatePickState?.query || "");
    const matchingTemplates = query ? rankEmailTemplatesForQuery(templates, query) : templates;
    if (!templates.length) {
      dom.emailTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates found.</div>";
      return;
    }
    if (!matchingTemplates.length) {
      dom.emailTemplatePickList.innerHTML = "<div class='email-template-empty'>No templates match that title.</div>";
      return;
    }

    dom.emailTemplatePickList.innerHTML = matchingTemplates
      .map((template) => {
        const preview = templatePreviewText(template);
        const isAppliedForContact = App.hasTemplateApplied("email", state.emailTemplatePickState.key, template.id);
        const sourceBadge = renderTemplateSourceBadge(template);
        return `
        <button type='button' class='email-template-pick-item' data-template-id='${App.escapeHtml(template.id)}'>
          <span class='email-template-pick-head'>
            <span class='email-template-pick-title-wrap'>
              <span class='email-template-pick-name'>${App.escapeHtml(template.name || "Untitled")}</span>
              ${sourceBadge}
            </span>
            <span class='email-template-pick-used ${isAppliedForContact ? "is-used" : ""}' aria-hidden='true'>${isAppliedForContact ? "✓" : ""}</span>
          </span>
          <span class='email-template-pick-preview'>${App.escapeHtml(preview.slice(0, 90) || "No subject/body yet")}</span>
        </button>
      `;
      })
      .join("");
  }

  function openEmailTemplatePicker(contact, key) {
    if (!dom.emailTemplatePickOverlay) return;
    state.emailTemplatePickState = {
      key: String(key || ""),
      contact: contact || null,
      query: ""
    };
    if (dom.emailTemplatePickTitle) {
      dom.emailTemplatePickTitle.textContent = `Choose Template for ${App.getContactDisplayName(contact)}`;
    }
    if (dom.emailTemplatePickSearchInput) {
      dom.emailTemplatePickSearchInput.value = "";
    }
    renderEmailTemplatePickerOptions();
    dom.emailTemplatePickOverlay.classList.add("open");
    dom.emailTemplatePickSearchInput?.focus();
  }

  function closeEmailTemplatePicker() {
    if (dom.emailTemplatePickOverlay) {
      App.blurFocusedElementWithin(dom.emailTemplatePickOverlay);
      App.preserveScrollPosition(() => {
        dom.emailTemplatePickOverlay.classList.remove("open");
      });
    }
    state.emailTemplatePickState = { key: "", contact: null, query: "" };
    if (dom.emailTemplatePickSearchInput) dom.emailTemplatePickSearchInput.value = "";
  }

  async function applyEmailTemplateToContact(contact, key, template) {
    if (!contact) return;
    if (!template) {
      App.setStatus("No email template found. Add one via the email icon.");
      return;
    }

    const recordId = App.getRecordIdForContact(contact);
    const contactUrl = App.buildContactUrl(recordId, state.currentPortalId);
    if (!contactUrl) {
      App.setStatus("Could not open contact. Missing Record ID or Portal ID.");
      return;
    }

    const resolvedKey = String(key || App.contactKey(contact));
    App.setStatus(`Opening ${App.getContactDisplayName(contact)} and applying "${template.name}"...`);

    try {
      const portalId = await App.resolvePortalIdForRecord(recordId);
      if (!portalId) {
        App.setStatus("Could not detect HubSpot portal ID for this contact.");
        return;
      }

      const existingEmailTab = await findOpenEmailInteractionTab(recordId, portalId);
      const existingContactTab = existingEmailTab || (await App.findExistingContactTab(recordId, portalId));

      let templateContact = contact;
      if (existingContactTab && typeof existingContactTab.id === "number") {
        try {
          const contextResponse = await requestContactContextForTabId(existingContactTab.id);
          if (contextResponse?.contact) {
            templateContact = mergeContactValues(contact, contextResponse.contact);
          }
        } catch (_error) {
          // Keep the popup contact data when the page context is not reachable.
        }
      }

      const tokens = App.getContactTokenMap(templateContact);
      const escapedHtmlTokens = Object.fromEntries(
        Object.entries(tokens).map(([tokenKey, tokenValue]) => [tokenKey, App.escapeHtml(tokenValue)])
      );
      const subject = App.applyTokens(template.subject, tokens).trim();
      const bodyHtml = App.applyTokens(template.body, escapedHtmlTokens).trim();
      const body = htmlToPlainText(bodyHtml);
      if (!subject && !body && !bodyHtml) {
        App.setStatus(`Template "${template.name}" is empty.`);
        return;
      }

      const sendApplyMessage = (tabId) =>
        chrome.tabs.sendMessage(tabId, {
          type: MT.APPLY_EMAIL_TEMPLATE_ON_PAGE,
          subject,
          body,
          bodyHtml
        });

      let response = null;

      if (isDetachedLaunch) {
        if (existingEmailTab && typeof existingEmailTab.id === "number") {
          await chrome.tabs.update(existingEmailTab.id, { active: true });
          await App.waitForTabComplete(existingEmailTab.id);
          await App.sleep(timing.emailComposerReadyDelayMs);
          response = await sendApplyMessage(existingEmailTab.id);
          if (!response?.ok) {
            response = await chrome.tabs.sendMessage(existingEmailTab.id, {
              type: MT.OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE,
              subject,
              body,
              bodyHtml
            });
          }
        } else {
          if (existingContactTab && typeof existingContactTab.id === "number") {
            const interactionUrl = `${App.buildHubSpotContactUrl(
              recordId,
              portalId,
              App.getHubSpotOrigin(existingContactTab.url || App.state.currentHubSpotOrigin)
            )}?interaction=email`;
            await chrome.tabs.update(existingContactTab.id, { url: interactionUrl, active: true });
            await App.waitForTabComplete(existingContactTab.id);
            await App.sleep(timing.contactTabPostLoadDelayMs);
            await App.sleep(timing.emailComposerReadyDelayMs);
            response = await chrome.tabs.sendMessage(existingContactTab.id, {
              type: MT.OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE,
              subject,
              body,
              bodyHtml
            });
          }
        }
      }

      if (!response) {
        response = await App.withContactTab(
          recordId,
          portalId,
          async (tabId) => {
            await chrome.tabs.update(tabId, { active: true });
            await App.sleep(timing.emailComposerReadyDelayMs);
            return chrome.tabs.sendMessage(tabId, {
              type: MT.OPEN_EMAIL_AND_APPLY_TEMPLATE_ON_PAGE,
              subject,
              body,
              bodyHtml
            });
          },
          { allowOpenFresh: true, interaction: "email" }
        );
      }

      if (!response?.ok) {
        App.setStatus(response?.error || "Opened contact, but could not apply email template.");
        if (typeof App.trackEvent === "function") {
          App.trackEvent("template_apply_failed", { reason: "hubspot_response_not_ok" });
        }
        return;
      }

      App.markTemplateApplied("email", resolvedKey, template.id);
      void App.trackCloudTemplateUse(template);
      App.setStatus(`Applied "${template.name}" for ${App.getContactDisplayName(contact)}.`);
      if (typeof App.trackEvent === "function") {
        App.trackEvent("template_applied", {
          template_id: String(template.id || ""),
          subject_length: subject.length,
          body_length: bodyHtml.length
        });
      }
    } catch (_error) {
      App.setStatus("Could not apply email template on HubSpot tab.");
      if (typeof App.trackEvent === "function") {
        App.trackEvent("template_apply_failed", { reason: "exception" });
      }
    }
  }

  Object.assign(App, {
    loadEmailTemplatesDraftFromSettings,
    getActiveEmailTemplateDraft,
    renderEmailTemplatesList,
    renderActiveEmailTemplateEditor,
    renderEmailTemplatesPage,
    upsertActiveTemplateFromForm,
    addEmailTemplateDraft,
    deleteActiveEmailTemplateDraft,
    ensureEmailBodyEditor,
    flushEmailTemplateAutosave,
    renderEmailTemplatePickerOptions,
    openEmailTemplatePicker,
    closeEmailTemplatePicker,
    applyEmailTemplateToContact
  });
})();
