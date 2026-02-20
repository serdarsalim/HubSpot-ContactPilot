(() => {
  const DEFAULT_COUNTRY_CODE = "60";
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const DAY_TIME_PATTERN = /\b(?:Today|Yesterday)\s+at\s+\d{1,2}:\d{2}\s+GMT[+-]\d+\b/gi;
  const MONTH_TIME_PATTERN = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{1,2}:\d{2}\s+GMT[+-]\d+\b/gi;
  const MONTH_NAME_PATTERN = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;

  function stripOuterNoise(text) {
    return cleanText((text || "").replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, "").replace(/\s*--\s*--\s*/g, " "));
  }

  function removeLeadingInitials(name) {
    const tokens = cleanText(name).split(" ").filter(Boolean);
    if (tokens.length < 2) return cleanText(name);

    const isInitialToken = (token) => {
      const cleaned = token.replace(/[^A-Za-z]/g, "");
      return cleaned.length >= 1 && cleaned.length <= 2 && cleaned === cleaned.toUpperCase();
    };

    while (tokens.length > 1 && isInitialToken(tokens[0])) {
      tokens.shift();
    }

    return cleanText(tokens.join(" "));
  }

  function extractNameAndPossibility(sourceText) {
    let text = cleanText(sourceText || "");
    if (!text) return { name: "Unknown", possibility: "-" };

    text = cleanText(text.replace(EMAIL_PATTERN, "").replace(PHONE_PATTERN, ""));
    const previewParts = text.split(/\bPreview\b/i).map(cleanText);
    const nameCandidate = stripOuterNoise(previewParts[0] || "");
    let possibility = "";

    if (previewParts.length > 1) {
      let remainder = cleanText(previewParts.slice(1).join(" "));
      remainder = cleanText(remainder.replace(MONTH_TIME_PATTERN, " "));

      const midMatch = remainder.match(/GMT[+-]\d+\s+(.+?)\s+(?:Today|Yesterday)\s+at\s+\d{1,2}:\d{2}\s+GMT[+-]\d+/i);
      if (midMatch && midMatch[1]) {
        possibility = stripOuterNoise(midMatch[1]);
      }

      if (!possibility) {
        const endMatch = remainder.match(/(?:Today|Yesterday)\s+at\s+\d{1,2}:\d{2}\s+GMT[+-]\d+\s+(.+)$/i);
        if (endMatch && endMatch[1]) {
          possibility = stripOuterNoise(endMatch[1]);
        }
      }

      if (!possibility) {
        const keywordMatch = remainder.match(/\b(?:\d+\s*-\s*[A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+)*|N\/A\s+[A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+)*)\b/i);
        if (keywordMatch && keywordMatch[0]) {
          possibility = stripOuterNoise(keywordMatch[0]);
        }
      }
    }

    const fallback = cleanText(
      text
        .replace(/\bPreview\b/gi, " ")
        .replace(DAY_TIME_PATTERN, " ")
        .replace(MONTH_TIME_PATTERN, " ")
    );

    const rawName = nameCandidate || stripOuterNoise(fallback.split(" ").slice(0, 5).join(" ")) || "Unknown";
    const name = removeLeadingInitials(rawName) || "Unknown";
    return { name, possibility: possibility || "-" };
  }

  function normalizePhone(raw) {
    const trimmed = cleanPhoneCandidate(raw);
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    if (trimmed.startsWith("+")) return digits;
    if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return digits;
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  function cleanPhoneCandidate(raw) {
    let text = cleanText(raw || "");
    if (!text) return "";

    // If a month token appears inside the captured range, cut everything from there.
    const monthMatch = text.match(MONTH_NAME_PATTERN);
    if (monthMatch && typeof monthMatch.index === "number") {
      text = cleanText(text.slice(0, monthMatch.index));
    }

    // HubSpot rows can append day numbers (e.g. "... 18") from dates next to phone.
    // Remove trailing short numeric fragments after a space.
    text = text.replace(/\s+\d{1,3}$/, "");
    return cleanText(text);
  }

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getRowLikeElements() {
    const rows = new Set();

    document.querySelectorAll("tr, [role='row'], .private-table__row, .private-table-row").forEach((el) => {
      rows.add(el);
    });

    // Fallback for card/list layouts.
    document.querySelectorAll("li, article, [data-test-id*='record'], [class*='record']").forEach((el) => {
      if (el.textContent && PHONE_PATTERN.test(el.textContent)) rows.add(el);
      PHONE_PATTERN.lastIndex = 0;
    });

    return Array.from(rows);
  }

  function extractFromElement(element) {
    const text = cleanText(element.innerText || element.textContent || "");
    if (!text) return [];

    const emails = Array.from(text.matchAll(EMAIL_PATTERN)).map((m) => m[0]);
    const phonesRaw = Array.from(text.matchAll(PHONE_PATTERN)).map((m) => m[0]);

    if (!phonesRaw.length) return [];

    const phones = [];
    const seenPhones = new Set();
    for (const p of phonesRaw) {
      const cleanedRaw = cleanPhoneCandidate(p);
      const normalized = normalizePhone(cleanedRaw);
      if (!normalized || seenPhones.has(normalized)) continue;
      seenPhones.add(normalized);
      phones.push({ raw: cleanedRaw, normalized });
    }

    if (!phones.length) return [];

    const { name, possibility } = extractNameAndPossibility(text);

    const primaryEmail = emails[0] || "";

    return phones.map((phone) => ({
      name,
      email: primaryEmail,
      phoneDisplay: phone.raw,
      phoneDigits: phone.normalized,
      possibility,
      waUrl: `https://wa.me/${phone.normalized}`
    }));
  }

  function dedupeContacts(contacts) {
    const out = [];
    const seen = new Set();

    for (const c of contacts) {
      const key = `${c.name}|${c.email}|${c.phoneDigits}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }

    return out;
  }

  function collectContacts() {
    const rows = getRowLikeElements();
    const all = [];

    for (const row of rows) {
      all.push(...extractFromElement(row));
    }

    // Fallback: collect phone links directly if row parsing misses some.
    document.querySelectorAll("a[href^='tel:'], a[href*='wa.me/']").forEach((a) => {
      const raw = cleanText(a.textContent || a.getAttribute("href") || "");
      const normalized = normalizePhone(raw);
      if (!normalized) return;

      const container = a.closest("tr, [role='row'], li, article, div") || a.parentElement;
      const context = cleanText(container?.innerText || "");
      const emailMatch = context.match(EMAIL_PATTERN);
      const email = emailMatch ? emailMatch[0] : "";
      const parsed = extractNameAndPossibility(context);

      all.push({
        name: parsed.name,
        email,
        phoneDisplay: raw,
        phoneDigits: normalized,
        possibility: parsed.possibility,
        waUrl: `https://wa.me/${normalized}`
      });
    });

    return dedupeContacts(all);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "GET_CONTACTS") return;

    try {
      const contacts = collectContacts();
      sendResponse({ ok: true, contacts });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  });
})();
