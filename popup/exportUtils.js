(() => {
  const App = window.PopupApp;
  const { state } = App;

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function buildCsvRows(contacts) {
    const visibleCols = App.getVisibleColumns();
    const headers = visibleCols.map((c) => c.label);
    const rows = contacts.map((c) => visibleCols.map((col) => c.values?.[col.id] || ""));
    return [headers, ...rows];
  }

  function toCsv(rows) {
    return rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
  }

  function sanitizeVcf(value) {
    return String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,")
      .replaceAll("\n", "\\n");
  }

  function toVcf(contacts) {
    const nameColumn = state.currentColumns.find((c) => /name/i.test(c.label));
    const emailColumn = state.currentColumns.find((c) => /email/i.test(c.label));

    return contacts
      .map((c, idx) => {
        const name = (nameColumn && c.values?.[nameColumn.id]) || `Contact ${idx + 1}`;
        const email = (emailColumn && c.values?.[emailColumn.id]) || "";
        const phone = c.phoneDigits || "";

        const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${sanitizeVcf(name)}`, `N:${sanitizeVcf(name)};;;;`];
        if (phone) lines.push(`TEL;TYPE=CELL:+${sanitizeVcf(phone)}`);
        if (email) lines.push(`EMAIL;TYPE=INTERNET:${sanitizeVcf(email)}`);
        lines.push("END:VCARD");
        return lines.join("\n");
      })
      .join("\n");
  }

  function exportCsvSelected() {
    const contacts = App.getSelectedContacts();
    if (!contacts.length) {
      App.setStatus("No selected contacts to export.");
      return;
    }

    const csv = toCsv(buildCsvRows(contacts));
    downloadText("hubspot-contacts-selected.csv", csv, "text/csv;charset=utf-8");
  }

  function exportVcfSelected() {
    const contacts = App.getSelectedContacts();
    if (!contacts.length) {
      App.setStatus("No selected contacts to export.");
      return;
    }

    const vcf = toVcf(contacts);
    downloadText("hubspot-contacts-selected.vcf", vcf, "text/vcard;charset=utf-8");
  }

  async function copyEmailSelected() {
    const contacts = App.getSelectedContacts();
    if (!contacts.length) {
      App.setStatus("No selected contacts to copy emails from.");
      return;
    }

    const emailColumn = App.findEmailColumn();
    if (!emailColumn) {
      App.setStatus("No email column detected.");
      return;
    }

    const emails = [...new Set(contacts.map((c) => String(c.values?.[emailColumn.id] || "").trim()).filter(Boolean))];
    if (!emails.length) {
      App.setStatus("No email values found in selected rows.");
      return;
    }

    try {
      await App.copyTextToClipboard(emails.join(", "));
      App.setStatus(`Copied ${emails.length} email(s).`);
    } catch (_error) {
      App.setStatus("Could not copy emails to clipboard.");
    }
  }

  Object.assign(App, {
    downloadText,
    buildCsvRows,
    toCsv,
    sanitizeVcf,
    toVcf,
    exportCsvSelected,
    exportVcfSelected,
    copyEmailSelected
  });
})();
