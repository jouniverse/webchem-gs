/**
 * webchem-gs: IUPAC Gold Book Terminology Lookup
 * Searches the IUPAC Compendium of Chemical Terminology (Gold Book)
 * API: https://goldbook.iupac.org/
 */

// ─── Gold Book Index Cache ──────────────────────────────────────────────────────

/**
 * Validate that a parsed Gold Book index object looks reasonable.
 * The Gold Book has ~15 000 entries, so anything under 1 000 is suspect.
 * @param {*} obj - Parsed index object
 * @return {boolean}
 * @private
 */
function isValidGoldBookIndex_(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).length >= 1000;
}

/**
 * Remove all Gold Book cache keys (index, chunks, chunk-count).
 * Call this to force a fresh download on the next lookup.
 * @private
 */
function clearGoldBookCache_() {
  var cache = CacheService.getScriptCache();
  var keysToRemove = ["goldbook_index", "goldbook_idx_n"];
  // Remove up to 20 potential chunk keys
  for (var i = 0; i < 20; i++) {
    keysToRemove.push("goldbook_idx_" + i);
  }
  cache.removeAll(keysToRemove);
}

/**
 * Fetch and cache the Gold Book term index.
 * Uses CacheService (6 h TTL) so the ~1 MB index isn't re-downloaded every call.
 * Falls back to the live API on every sidebar session start.
 *
 * @return {Object} Map of code → { t, s }  (slim: title, status)
 * @private
 */
function getGoldBookIndex_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("goldbook_index");
  if (cached && cached !== "__chunked__") {
    try {
      var parsed = JSON.parse(cached);
      if (isValidGoldBookIndex_(parsed)) return parsed;
      Logger.log(
        "Gold Book cache invalid (" +
          Object.keys(parsed).length +
          " entries) — re-fetching",
      );
    } catch (e) {
      Logger.log("Gold Book cache parse error: " + e.message);
    }
  }

  // Fetch from the Gold Book API
  var slim = null;
  try {
    var resp = UrlFetchApp.fetch(
      "https://goldbook.iupac.org/terms/index/all/json",
      {
        muteHttpExceptions: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; webchem-gs/1.0; Google Apps Script)",
        },
      },
    );
    if (resp.getResponseCode() === 200) {
      var text = resp.getContentText();
      var data = JSON.parse(text);
      // API returns { terms: { list: { code: { title, status, url } } } }
      var entries = data;
      if (data.terms && data.terms.list) {
        entries = data.terms.list;
      }
      // Build a slimmed version with just title/code
      slim = {};
      var codes = Object.keys(entries);
      for (var i = 0; i < codes.length; i++) {
        var entry = entries[codes[i]];
        if (entry && entry.title) {
          slim[codes[i]] = {
            t: entry.title || "",
            s: entry.status || "current",
          };
        }
      }
    } else {
      Logger.log("Gold Book API returned HTTP " + resp.getResponseCode());
    }
  } catch (e) {
    Logger.log("Gold Book API fetch error: " + e.message);
  }

  // Try to cache the data (non-fatal if this fails)
  if (slim && isValidGoldBookIndex_(slim)) {
    try {
      // Clear any stale cache entries first
      clearGoldBookCache_();

      var slimStr = JSON.stringify(slim);
      Logger.log(
        "Gold Book slim index: " +
          Object.keys(slim).length +
          " entries, " +
          slimStr.length +
          " bytes",
      );

      if (slimStr.length <= 100000) {
        cache.put("goldbook_index", slimStr, 21600); // 6 hours
      } else {
        // Store in chunks — CacheService limit is 100 KB per key
        var chunkSize = 99000;
        var numChunks = Math.ceil(slimStr.length / chunkSize);
        for (var c = 0; c < numChunks; c++) {
          cache.put(
            "goldbook_idx_" + c,
            slimStr.substr(c * chunkSize, chunkSize),
            21600,
          );
        }
        cache.put("goldbook_idx_n", String(numChunks), 21600);
        cache.put("goldbook_index", "__chunked__", 21600);
        Logger.log("Gold Book index cached in " + numChunks + " chunks");
      }
    } catch (cacheErr) {
      Logger.log(
        "Gold Book cache write error (non-fatal): " + cacheErr.message,
      );
    }
  }

  return slim;
}

/**
 * Retrieve the Gold Book index, reassembling chunks if needed.
 * @return {Object|null}
 * @private
 */
function loadGoldBookIndex_() {
  var cache = CacheService.getScriptCache();
  var raw = cache.get("goldbook_index");

  // Direct (non-chunked) cache hit
  if (raw && raw !== "__chunked__") {
    try {
      var parsed = JSON.parse(raw);
      if (isValidGoldBookIndex_(parsed)) return parsed;
      Logger.log(
        "Gold Book cached index invalid (" +
          Object.keys(parsed).length +
          " entries) — clearing",
      );
      clearGoldBookCache_();
    } catch (e) {
      Logger.log("Gold Book cache parse error in load: " + e.message);
      clearGoldBookCache_();
    }
  }

  // Chunked cache hit
  if (raw === "__chunked__") {
    var nStr = cache.get("goldbook_idx_n");
    if (nStr) {
      var n = parseInt(nStr, 10);
      var parts = [];
      for (var i = 0; i < n; i++) {
        var chunk = cache.get("goldbook_idx_" + i);
        if (!chunk) {
          Logger.log("Gold Book chunk " + i + " expired — re-fetching");
          clearGoldBookCache_();
          return getGoldBookIndex_();
        }
        parts.push(chunk);
      }
      try {
        var assembled = JSON.parse(parts.join(""));
        if (isValidGoldBookIndex_(assembled)) return assembled;
        Logger.log("Gold Book assembled index invalid — clearing");
        clearGoldBookCache_();
      } catch (e) {
        Logger.log("Gold Book chunk reassembly error: " + e.message);
        clearGoldBookCache_();
      }
    } else {
      clearGoldBookCache_();
    }
  }

  // Nothing valid in cache — fetch fresh
  return getGoldBookIndex_();
}

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * Search the Gold Book index for terms matching the query.
 * Returns up to 20 matching term titles with their codes.
 *
 * @param {string} query - Search string
 * @return {Object} { matches: [{ code, title }], total: number }
 */
function searchGoldBook(query) {
  if (!query || !query.trim()) return { matches: [], total: 0 };

  var index = loadGoldBookIndex_();
  if (!index) {
    return { error: "Could not load Gold Book index. Try again later." };
  }

  var q = query.trim().toLowerCase();
  var exact = [];
  var startsWith = [];
  var contains = [];

  var codes = Object.keys(index);
  for (var i = 0; i < codes.length; i++) {
    var entry = index[codes[i]];
    var title = (entry.t || "").toLowerCase();
    if (entry.s && entry.s !== "current") continue; // skip retired/superseded

    if (title === q) {
      exact.push({ code: codes[i], title: entry.t });
    } else if (title.indexOf(q) === 0) {
      startsWith.push({ code: codes[i], title: entry.t });
    } else if (title.indexOf(q) !== -1) {
      contains.push({ code: codes[i], title: entry.t });
    }
  }

  // Sort each group alphabetically
  var sortFn = function (a, b) {
    return a.title.toLowerCase() < b.title.toLowerCase()
      ? -1
      : a.title.toLowerCase() > b.title.toLowerCase()
        ? 1
        : 0;
  };
  exact.sort(sortFn);
  startsWith.sort(sortFn);
  contains.sort(sortFn);

  var all = exact.concat(startsWith, contains);
  return { matches: all.slice(0, 30), total: all.length };
}

// ─── Term Detail ────────────────────────────────────────────────────────────────

/**
 * Fetch the full definition for a Gold Book term by its code.
 *
 * @param {string} termCode - The Gold Book term code, e.g. "P04409"
 * @return {Object|null} { title, definition, sources, doi, url, citation }
 */
function getGoldBookTerm(termCode) {
  if (!termCode) return null;

  // Ensure proper code format (e.g. "P04409")
  var code = termCode.trim();

  try {
    var resp = UrlFetchApp.fetch(
      "https://goldbook.iupac.org/terms/view/" + code + "/json",
      {
        muteHttpExceptions: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; webchem-gs/1.0; Google Apps Script)",
        },
      },
    );

    if (resp.getResponseCode() !== 200) {
      Logger.log("Gold Book term fetch failed: HTTP " + resp.getResponseCode());
      return null;
    }

    var data = JSON.parse(resp.getContentText());
    var term = data.term || data;

    // Extract definitions
    var defs = term.definitions || [];
    var definition = "";
    var sources = [];
    var notes = {};
    var links = [];
    if (defs.length > 0) {
      definition = defs[0].text || "";
      sources = defs[0].sources || [];
      notes = defs[0].notes || {};
      links = defs[0].links || [];
    }

    return {
      title: term.title || "",
      code: term.code || code,
      definition: definition,
      sources: sources,
      notes: notes,
      links: links,
      doi: term.doi || "",
      url: "https://doi.org/" + (term.doi || "10.1351/goldbook." + code),
      citation: term.citation || "",
      status: term.status || "current",
    };
  } catch (e) {
    Logger.log("Gold Book term error: " + e.message);
    return null;
  }
}

// ─── Inject to Sheet ────────────────────────────────────────────────────────────

/**
 * Inject a Gold Book term's data into the active sheet.
 * Called from the sidebar "Insert to Sheet" button.
 *
 * @param {Object} term - Term object from getGoldBookTerm()
 */
function injectGoldBookTerm(term) {
  if (!term) return;

  // Strip LaTeX delimiters for plain-text sheet output
  var plainDef = (term.definition || "")
    .replace(/\\\(|\\\)/g, "")
    .replace(/\\pu\{([^}]+)\}/g, "$1")
    .replace(/\\rm\{([^}]+)\}/g, "$1")
    .replace(/\\text\{([^}]+)\}/g, "$1")
    .replace(/_\{([^}]+)\}/g, "_$1")
    .replace(/\^\{([^}]+)\}/g, "^$1")
    .replace(/\r\n/g, "\n");

  var flat = {};
  flat["Term"] = term.title || "";
  flat["Code"] = term.code || "";
  flat["Status"] = term.status || "";
  flat["Definition"] = plainDef;
  if (term.sources && term.sources.length > 0) {
    flat["Source"] = term.sources.join("; ");
  }
  if (term.notes) {
    var noteKeys = Object.keys(term.notes);
    if (noteKeys.length > 0) {
      var noteTexts = noteKeys.map(function (k) {
        return term.notes[k];
      });
      flat["Notes"] = noteTexts.join("; ");
    }
  }
  flat["DOI"] = term.doi || "";
  flat["URL"] = term.url || "";
  if (term.citation) flat["Citation"] = term.citation;

  injectCompoundData(flat);
}

/**
 * Fetch all Gold Book sources and inject them into a new sheet.
 * Creates a "Gold Book Sources" sheet with columns: ID, Title, Source URL, Gold Book URL.
 */
function fetchAndInjectGoldBookSources() {
  try {
    var resp = UrlFetchApp.fetch(
      "https://goldbook.iupac.org/sources/index/all/json",
      {
        muteHttpExceptions: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; webchem-gs/1.0; Google Apps Script)",
        },
      },
    );

    if (resp.getResponseCode() !== 200) {
      throw new Error(
        "Gold Book sources API returned HTTP " + resp.getResponseCode(),
      );
    }

    var data = JSON.parse(resp.getContentText());
    var list = (data.sources && data.sources.list) || {};
    var codes = Object.keys(list);

    if (codes.length === 0) {
      throw new Error("No sources returned from Gold Book API.");
    }

    // Sort by source ID
    codes.sort();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = "Gold Book Sources";
    var existing = ss.getSheetByName(sheetName);
    if (existing) {
      ss.setActiveSheet(existing);
      SpreadsheetApp.getUi().alert(
        'A "' +
          sheetName +
          '" sheet already exists. Delete it first to re-export.',
      );
      return;
    }

    var sheet = ss.insertSheet(sheetName);

    // Header row
    var headers = ["ID", "Title", "Source URL", "Gold Book URL"];
    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold")
      .setBackground("#e8f0fe");

    // Data rows
    var rows = codes.map(function (id) {
      var s = list[id];
      return [id, s.title || "", s.srcurl || "", s.url || ""];
    });

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // Auto-resize columns
    for (var c = 1; c <= headers.length; c++) {
      sheet.autoResizeColumn(c);
    }

    // Freeze header row
    sheet.setFrozenRows(1);

    ss.setActiveSheet(sheet);
    return { success: true, count: rows.length };
  } catch (e) {
    Logger.log("Gold Book sources export error: " + e.message);
    return { error: e.message };
  }
}

// ─── Diagnostic ─────────────────────────────────────────────────────────────────

/**
 * Diagnostic function for the Gold Book integration.
 * Run this from the Apps Script editor (Run > diagnoseGoldBook) and check
 * the Execution Log for detailed output.
 */
function diagnoseGoldBook() {
  var log = [];
  log.push("=== Gold Book Diagnostic ===");
  log.push("Timestamp: " + new Date().toISOString());

  // 1. Test index API fetch
  log.push("\n--- Index API ---");
  try {
    var resp = UrlFetchApp.fetch(
      "https://goldbook.iupac.org/terms/index/all/json",
      {
        muteHttpExceptions: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; webchem-gs/1.0; Google Apps Script)",
        },
      },
    );
    log.push("HTTP status: " + resp.getResponseCode());
    var text = resp.getContentText();
    log.push("Response size: " + text.length + " bytes");

    var data = JSON.parse(text);
    log.push("Top-level keys: " + Object.keys(data).join(", "));

    if (data.terms && data.terms.list) {
      var list = data.terms.list;
      var codes = Object.keys(list);
      log.push("terms.list entries: " + codes.length);
      if (codes.length > 0) {
        log.push(
          "First entry: " + codes[0] + " = " + JSON.stringify(list[codes[0]]),
        );
      }
    } else {
      log.push("WARNING: No data.terms.list found!");
      log.push(
        "Data structure: " + JSON.stringify(data).substring(0, 500) + "...",
      );
    }
  } catch (e) {
    log.push("FETCH ERROR: " + e.message);
  }

  // 2. Test cache (before clearing)
  log.push("\n--- Cache (pre-clear) ---");
  var cache = CacheService.getScriptCache();
  var cached = cache.get("goldbook_index");
  log.push("goldbook_index in cache: " + (cached ? "yes" : "no"));
  if (cached) {
    log.push(
      "Cached value: " +
        (cached === "__chunked__"
          ? "__chunked__"
          : cached.length + " bytes, starts: " + cached.substring(0, 100)),
    );
    if (cached !== "__chunked__") {
      try {
        var cachedObj = JSON.parse(cached);
        var valid = isValidGoldBookIndex_(cachedObj);
        log.push(
          "Cache valid: " +
            valid +
            " (" +
            Object.keys(cachedObj).length +
            " entries)",
        );
      } catch (e) {
        log.push("Cache parse error: " + e.message);
      }
    }
  }
  if (cached === "__chunked__") {
    var nStr = cache.get("goldbook_idx_n");
    log.push("Chunk count key: " + (nStr || "missing"));
  }

  // 3. Clear stale cache to force fresh load
  log.push("\n--- Clearing cache ---");
  clearGoldBookCache_();
  log.push("Cache cleared.");

  // 4. Test loadGoldBookIndex_ (will fetch fresh from API)
  log.push("\n--- loadGoldBookIndex_ (fresh) ---");
  try {
    var index = loadGoldBookIndex_();
    if (index) {
      var keys = Object.keys(index);
      log.push("Loaded index: " + keys.length + " entries");
      log.push("Valid: " + isValidGoldBookIndex_(index));
      if (keys.length > 0) {
        log.push(
          "Sample entry: " + keys[0] + " = " + JSON.stringify(index[keys[0]]),
        );
      }
    } else {
      log.push("ERROR: loadGoldBookIndex_ returned null");
    }
  } catch (e) {
    log.push("ERROR: " + e.message);
  }

  // 5. Verify cache was written correctly
  log.push("\n--- Cache (post-load) ---");
  var postCached = cache.get("goldbook_index");
  log.push("goldbook_index in cache: " + (postCached ? "yes" : "no"));
  if (postCached) {
    log.push(
      "Cached value: " +
        (postCached === "__chunked__"
          ? "__chunked__ (chunked storage)"
          : postCached.length + " bytes"),
    );
  }

  // 6. Test search
  log.push("\n--- searchGoldBook('acid') ---");
  try {
    var result = searchGoldBook("acid");
    log.push("Result: " + JSON.stringify(result).substring(0, 500));
  } catch (e) {
    log.push("ERROR: " + e.message);
  }

  // 7. Test term detail
  log.push("\n--- getGoldBookTerm('P04409') ---");
  try {
    var term = getGoldBookTerm("P04409");
    log.push("Result: " + JSON.stringify(term).substring(0, 500));
  } catch (e) {
    log.push("ERROR: " + e.message);
  }

  var output = log.join("\n");
  Logger.log(output);
  return output;
}
