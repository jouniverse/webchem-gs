/**
 * webchem-gs: Research Tab — Literature Search
 * Search scientific literature across OpenAlex, Springer Nature, PMC, Crossref, and Zenodo.
 */

// ─── Chemistry Field IDs (OpenAlex) ────────────────────────────────────────────
// Broad filter (for relevance sort — cast a wider net)
var OPENALEX_FIELDS_BROAD_ = "topics.field.id:13|15|16|27|30";
// 13 = Biochemistry / Genetics / Molecular Biology
// 15 = Chemical Engineering
// 16 = Chemistry
// 27 = Medicine
// 30 = Pharmacology, Toxicology and Pharmaceutics

// Strict filter (for newest sort — keep results chemistry-focused)
var OPENALEX_FIELDS_STRICT_ = "topics.field.id:15|16|30";
// 15 = Chemical Engineering
// 16 = Chemistry
// 30 = Pharmacology, Toxicology and Pharmaceutics

// ─── Main Search Orchestrator ───────────────────────────────────────────────────

/**
 * Search scientific literature across selected databases.
 * @param {string} query - Search keyword
 * @param {string} sortBy - "relevance" or "newest"
 * @param {string[]} sources - Array of source names to query
 * @return {Object} { results: [...], meta: { source: {total, returned} } }
 */
function performLiteratureSearch(query, sortBy, sources) {
  if (!query || !sources || sources.length === 0) {
    return { results: [], meta: {} };
  }

  var allResults = [];
  var meta = {};

  sources.forEach(function (src) {
    try {
      var data = null;
      switch (src) {
        case "openalex":
          data = searchOpenAlex_(query, sortBy);
          break;
        case "springer":
          data = searchSpringerNature_(query, sortBy);
          break;
        case "pmc":
          data = searchPMC_(query, sortBy);
          break;
        case "crossref":
          data = searchCrossref_(query, sortBy);
          break;
        case "zenodo":
          data = searchZenodo_(query, sortBy);
          break;
      }
      if (data) {
        meta[src] = { total: data.total, returned: data.results.length };
        if (data.error) meta[src].error = data.error;
        data.results.forEach(function (r) {
          r.source = src;
          allResults.push(r);
        });
      }
    } catch (e) {
      Logger.log("Research search error for " + src + ": " + e.message);
      meta[src] = { total: 0, returned: 0, error: e.message };
    }
  });

  return { results: allResults, meta: meta };
}

// ─── OpenAlex ───────────────────────────────────────────────────────────────────

/**
 * Search OpenAlex for works matching the query.
 * @param {string} query
 * @param {string} sortBy - "relevance" or "newest"
 * @return {Object} { total, results: [...] }
 */
function searchOpenAlex_(query, sortBy) {
  var sort =
    sortBy === "newest" ? "publication_date:desc" : "relevance_score:desc";

  // Use stricter field filter for "newest" to avoid irrelevant articles
  var fieldFilter =
    sortBy === "newest" ? OPENALEX_FIELDS_STRICT_ : OPENALEX_FIELDS_BROAD_;
  // Encode pipes in filter for GAS UrlFetchApp compatibility
  var filter = fieldFilter.replace(/\|/g, "%7C");

  var params = [
    "search=" + encodeURIComponent(query),
    "sort=" + sort,
    "per_page=100",
    "filter=" + filter,
    "select=title,doi,publication_date,authorships,primary_location,open_access,cited_by_count,type",
  ];

  // Add API key if available
  var apiKey =
    PropertiesService.getScriptProperties().getProperty("OPENALEX_API_KEY");
  if (apiKey) {
    params.push("api_key=" + encodeURIComponent(apiKey));
  } else {
    params.push("mailto=polite@webchem-gs.app");
  }

  var url = "https://api.openalex.org/works?" + params.join("&");
  var data = fetchUrl(url, {}, { useCache: true, cacheTtl: 3600 });
  if (!data) return { total: 0, results: [] };

  var total = (data.meta && data.meta.count) || 0;
  var results = (data.results || []).map(function (w) {
    var loc = w.primary_location || {};
    var src = loc.source || {};
    var auths = (w.authorships || [])
      .slice(0, 10)
      .map(function (a) {
        return (a.author && a.author.display_name) || "";
      })
      .filter(Boolean);

    return {
      title: w.title || "",
      authors: auths.join("; "),
      journal: src.display_name || "",
      date: w.publication_date || "",
      doi: (w.doi || "").replace("https://doi.org/", ""),
      url: w.doi || "",
      type: w.type || "",
      openAccess: w.open_access && w.open_access.is_oa ? "Yes" : "No",
      citedBy: w.cited_by_count || 0,
    };
  });

  return { total: total, results: results };
}

// ─── Springer Nature (Meta API) ─────────────────────────────────────────────────

/**
 * Search Springer Nature Meta API for articles.
 * @param {string} query
 * @param {string} sortBy
 * @return {Object} { total, results: [...] }
 */
function searchSpringerNature_(query, sortBy) {
  var apiKey =
    PropertiesService.getScriptProperties().getProperty("META_API_KEY");
  if (!apiKey) {
    return {
      total: 0,
      results: [],
      error:
        "META_API_KEY not set. Configure it in Chemistry Tools → Settings.",
    };
  }

  // Springer requires constraint prefix; wrap multi-word queries in quotes
  var qValue =
    query.indexOf(" ") >= 0
      ? "keyword:%22" + encodeURIComponent(query) + "%22"
      : "keyword:" + encodeURIComponent(query);

  // For "newest" sort, add datefrom constraint (past 1 year) — results
  // are returned newest-first by the API when a date range is specified.
  if (sortBy === "newest") {
    var d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    var yyyy = d.getFullYear();
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    var dd = ("0" + d.getDate()).slice(-2);
    qValue += "%20datefrom:" + yyyy + "-" + mm + "-" + dd;
  }

  var baseUrl =
    "https://api.springernature.com/meta/v2/json" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&q=" +
    qValue;

  // Free tier allows max 25 results per page (p>25 returns 403).
  // Fetch up to 4 pages (100 results) via pagination.
  var PAGE_SIZE = 25;
  var MAX_PAGES = 4;
  var allResults = [];
  var total = 0;

  for (var page = 0; page < MAX_PAGES; page++) {
    var start = page * PAGE_SIZE + 1;
    var url = baseUrl + "&s=" + start + "&p=" + PAGE_SIZE;

    var data = fetchUrl(url, {}, { useCache: true, cacheTtl: 3600 });
    if (!data) {
      if (page === 0) {
        return {
          total: 0,
          results: [],
          error: "No response from Springer Nature API. Check META_API_KEY.",
        };
      }
      break;
    }

    // Handle API error responses
    if (data.status === "Fail" || data.error) {
      if (page === 0) {
        var errMsg =
          data.message ||
          (data.error && data.error.error_description) ||
          "Unknown error";
        return { total: 0, results: [], error: errMsg };
      }
      break;
    }

    if (page === 0) {
      var resultMeta = data.result && data.result[0];
      total = resultMeta ? parseInt(resultMeta.total, 10) || 0 : 0;
    }

    var records = data.records || [];
    for (var i = 0; i < records.length; i++) {
      allResults.push(records[i]);
    }

    // Stop if we've fetched all available results
    if (allResults.length >= total || records.length < PAGE_SIZE) {
      break;
    }
  }

  var results = allResults.map(function (r) {
    var authors = (r.creators || [])
      .slice(0, 10)
      .map(function (c) {
        return c.creator || "";
      })
      .filter(Boolean);

    var articleUrl = "";
    if (r.url && r.url.length > 0) {
      articleUrl = r.url[0].value || "";
    }
    if (!articleUrl && r.doi) {
      articleUrl = "https://doi.org/" + r.doi;
    }

    return {
      title: r.title || "",
      authors: authors.join("; "),
      journal: r.publicationName || "",
      date: r.publicationDate || "",
      doi: (r.doi || "").replace("http://dx.doi.org/", ""),
      url: articleUrl,
      type: r.contentType || "",
      openAccess: r.openaccess === "true" ? "Yes" : "No",
    };
  });

  return { total: total, results: results };
}

// ─── PubMed Central (NCBI E-Utilities) ──────────────────────────────────────────

/**
 * Search PMC via NCBI E-Utilities (esearch + esummary).
 * @param {string} query
 * @param {string} sortBy
 * @return {Object} { total, results: [...] }
 */
function searchPMC_(query, sortBy) {
  var sort = sortBy === "newest" ? "pub+date" : "relevance";

  // Step 1: Search for IDs
  var searchUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi" +
    "?db=pmc" +
    "&term=" +
    encodeURIComponent(query) +
    "&retmax=100" +
    "&retmode=json" +
    "&sort=" +
    sort;

  var searchData = fetchUrl(
    searchUrl,
    {},
    { useCache: true, cacheTtl: 3600, delay: 350 },
  );
  if (!searchData || !searchData.esearchresult) {
    return { total: 0, results: [] };
  }

  var total = parseInt(searchData.esearchresult.count, 10) || 0;
  var ids = searchData.esearchresult.idlist || [];
  if (ids.length === 0) return { total: total, results: [] };

  // Step 2: Fetch summaries in batches of 100
  var summaryUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi" +
    "?db=pmc" +
    "&id=" +
    ids.join(",") +
    "&retmode=json";

  var summaryData = fetchUrl(
    summaryUrl,
    {},
    { useCache: true, cacheTtl: 3600, delay: 350 },
  );
  if (!summaryData || !summaryData.result) {
    return { total: total, results: [] };
  }

  var result = summaryData.result;
  var uids = result.uids || [];

  var results = uids.map(function (uid) {
    var item = result[uid] || {};
    var authors = (item.authors || [])
      .slice(0, 10)
      .map(function (a) {
        return a.name || "";
      })
      .filter(Boolean);

    var dois = (item.articleids || []).filter(function (a) {
      return a.idtype === "doi";
    });
    var doi = dois.length > 0 ? dois[0].value : "";

    return {
      title: (item.title || "").replace(/<[^>]+>/g, ""),
      authors: authors.join("; "),
      journal: item.fulljournalname || item.source || "",
      date: item.pubdate || "",
      doi: doi,
      url: doi
        ? "https://doi.org/" + doi
        : "https://pmc.ncbi.nlm.nih.gov/articles/PMC" + uid + "/",
      type: "article",
      pmcid: "PMC" + uid,
    };
  });

  return { total: total, results: results };
}

// ─── Crossref ───────────────────────────────────────────────────────────────────

/**
 * Search Crossref for works matching the query.
 * @param {string} query
 * @param {string} sortBy
 * @return {Object} { total, results: [...] }
 */
function searchCrossref_(query, sortBy) {
  var sort = sortBy === "newest" ? "created" : "relevance";

  var url =
    "https://api.crossref.org/works" +
    "?mailto=jouni.dev@gmail.com" +
    "&rows=100" +
    "&query=" +
    encodeURIComponent(query) +
    "&sort=" +
    sort;

  var data = fetchUrl(url, {}, { useCache: true, cacheTtl: 3600 });
  if (!data || !data.message) return { total: 0, results: [] };

  var msg = data.message;
  var total = msg["total-results"] || 0;

  var results = (msg.items || []).map(function (item) {
    var authors = (item.author || [])
      .slice(0, 10)
      .map(function (a) {
        var name = a.family || "";
        if (a.given) name += ", " + a.given.charAt(0) + ".";
        return name;
      })
      .filter(Boolean);

    // Extract publication date
    var pub =
      item["published-print"] ||
      item["published-online"] ||
      item["created"] ||
      {};
    var parts = (pub["date-parts"] && pub["date-parts"][0]) || [];
    var dateStr = parts
      .map(function (p) {
        return String(p);
      })
      .join("-");

    var journal = (item["container-title"] || [])[0] || "";

    return {
      title: (item.title || [""])[0] || "",
      authors: authors.join("; "),
      journal: journal,
      date: dateStr,
      doi: item.DOI || "",
      url: item.DOI ? "https://doi.org/" + item.DOI : "",
      type: item.type || "",
    };
  });

  return { total: total, results: results };
}

// ─── Zenodo ─────────────────────────────────────────────────────────────────────

/**
 * Search Zenodo for records matching the query.
 * @param {string} query
 * @param {string} sortBy
 * @return {Object} { total, results: [...] }
 */
function searchZenodo_(query, sortBy) {
  var sort = sortBy === "newest" ? "mostrecent" : "bestmatch";

  // Use API token if available (allows up to 100 results; without it max is 25)
  var token =
    PropertiesService.getScriptProperties().getProperty("ZENODO_API_KEY");
  var size = token ? 100 : 25;

  var url =
    "https://zenodo.org/api/records" +
    "?q=" +
    encodeURIComponent(query) +
    "&size=" +
    size +
    "&sort=" +
    sort;

  var headers = {};
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  var data = fetchUrl(
    url,
    headers["Authorization"] ? { headers: headers } : {},
    { useCache: true, cacheTtl: 3600 },
  );
  if (!data || !data.hits) return { total: 0, results: [] };

  var total = data.hits.total || 0;

  var results = (data.hits.hits || []).map(function (h) {
    var m = h.metadata || {};
    var authors = (m.creators || [])
      .slice(0, 10)
      .map(function (c) {
        return c.name || "";
      })
      .filter(Boolean);

    var articleUrl = (h.links && h.links.self_html) || h.doi_url || "";

    var resType = m.resource_type || {};

    return {
      title: m.title || h.title || "",
      authors: authors.join("; "),
      journal: resType.subtype || resType.type || "",
      date: m.publication_date || "",
      doi: m.doi || "",
      url: articleUrl,
      type: resType.type || "",
      openAccess: m.access_right === "open" ? "Yes" : "No",
    };
  });

  return { total: total, results: results };
}

// ─── Inject Literature Results ──────────────────────────────────────────────────

/**
 * Inject literature search results into the active sheet as a table.
 * @param {Object[]} results - Array of literature result objects
 */
function injectLiteratureResults(results) {
  if (!results || results.length === 0) return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var startRow = sheet.getActiveCell().getRow();
  var startCol = sheet.getActiveCell().getColumn();

  // Headers
  var headers = [
    "Source",
    "Title",
    "Authors",
    "Journal",
    "Date",
    "DOI",
    "URL",
    "Type",
  ];

  // Write headers
  var headerRange = sheet.getRange(startRow, startCol, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#f3f3f3");

  // Write data rows
  var rows = results.map(function (r) {
    var srcLabel = {
      openalex: "OpenAlex",
      springer: "Springer",
      pmc: "PMC",
      crossref: "Crossref",
      zenodo: "Zenodo",
    };

    return [
      srcLabel[r.source] || r.source,
      r.title || "",
      r.authors || "",
      r.journal || "",
      r.date || "",
      r.doi || "",
      r.url || "",
      r.type || "",
    ];
  });

  if (rows.length > 0) {
    sheet
      .getRange(startRow + 1, startCol, rows.length, headers.length)
      .setValues(rows);
  }

  // Auto-resize columns
  for (var i = 0; i < headers.length; i++) {
    sheet.autoResizeColumn(startCol + i);
  }

  // Cap title/authors column widths
  var titleCol = startCol + 1;
  var authorsCol = startCol + 2;
  if (sheet.getColumnWidth(titleCol) > 400) {
    sheet.setColumnWidth(titleCol, 400);
  }
  if (sheet.getColumnWidth(authorsCol) > 300) {
    sheet.setColumnWidth(authorsCol, 300);
  }
}
