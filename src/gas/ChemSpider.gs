/**
 * webchem-gs: ChemSpider Module
 * RSC Compounds API v1 integration.
 * Adapted from webchem R package chemspider.R
 *
 * ChemSpider uses a 3-step async search pattern:
 *   1. POST filter → get queryId
 *   2. GET status → wait for completion
 *   3. GET results → get CSID array
 * Then: GET records/{id}/details → get compound details
 *
 * All HTTP calls use direct UrlFetchApp.fetch to eliminate
 * intermediary issues with httpPostJson/httpGet wrappers.
 */

// ─── Direct HTTP helpers (ChemSpider-specific) ──────────────────────────────────

/**
 * Make a direct POST request to the ChemSpider API.
 * Uses UrlFetchApp.fetch directly for maximum compatibility.
 *
 * @param {string} url - Full URL
 * @param {Object} body - Request body (will be JSON-stringified)
 * @param {string} apiKey - RSC API key
 * @return {Object|null} Parsed JSON response, or null on failure
 * @private
 */
function cs_post_(url, body, apiKey) {
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: apiKey,
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  };

  try {
    Utilities.sleep(RATE_LIMIT.API);
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();

    Logger.log("CS POST " + url + " → HTTP " + code);
    if (code !== 200) {
      Logger.log("CS POST error body: " + text.substring(0, 500));
      return null;
    }
    return JSON.parse(text);
  } catch (e) {
    Logger.log("CS POST exception for " + url + ": " + e.message);
    return null;
  }
}

/**
 * Make a direct GET request to the ChemSpider API.
 *
 * @param {string} url - Full URL
 * @param {string} apiKey - RSC API key
 * @return {Object|null} Parsed JSON response, or null on failure
 * @private
 */
function cs_get_(url, apiKey) {
  var options = {
    method: "get",
    headers: {
      apikey: apiKey,
    },
    muteHttpExceptions: true,
  };

  try {
    Utilities.sleep(RATE_LIMIT.API);
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var text = response.getContentText();

    Logger.log("CS GET " + url + " → HTTP " + code);
    if (code !== 200) {
      Logger.log("CS GET error body: " + text.substring(0, 500));
      return null;
    }
    return JSON.parse(text);
  } catch (e) {
    Logger.log("CS GET exception for " + url + ": " + e.message);
    return null;
  }
}

// ─── Search (Get CSID) ──────────────────────────────────────────────────────────

/**
 * Search ChemSpider and get ChemSpider IDs (CSIDs).
 *
 * @param {string} query - Search term
 * @param {string} [from='name'] - One of: 'name', 'formula', 'smiles', 'inchi', 'inchikey'
 * @return {number[]|null} Array of CSIDs, or null
 */
function chemspider_getCsid(query, from) {
  from = from || "name";
  if (!query) return null;

  var apiKey = getChemSpiderApiKey();
  if (!apiKey) {
    Logger.log("ChemSpider: no API key configured");
    return null;
  }

  // Step 1: POST filter
  var body = {};
  if (from === "name") {
    body = { name: query, orderBy: "recordId", orderDirection: "ascending" };
  } else if (from === "formula") {
    var cleanFormula = query.replace(/[_{}]/g, "");
    body = {
      formula: cleanFormula,
      dataSources: [],
      orderBy: "recordId",
      orderDirection: "ascending",
    };
  } else if (from === "smiles") {
    body = { smiles: query };
  } else if (from === "inchi") {
    body = { inchi: query };
  } else if (from === "inchikey") {
    body = { inchikey: query };
  }

  var filterUrl = API.CHEMSPIDER + "/filter/" + from;
  Logger.log(
    "ChemSpider step 1: POST " +
      filterUrl +
      " body=" +
      JSON.stringify(body) +
      " keyLen=" +
      apiKey.length,
  );

  var filterResult = cs_post_(filterUrl, body, apiKey);
  if (!filterResult || !filterResult.queryId) {
    Logger.log("ChemSpider step 1 FAILED: " + JSON.stringify(filterResult));
    return null;
  }
  var queryId = filterResult.queryId;
  Logger.log("ChemSpider step 1 OK, queryId: " + queryId);

  // Step 2: GET status (poll until complete)
  var statusUrl = API.CHEMSPIDER + "/filter/" + queryId + "/status";
  var maxPolls = 15;
  var statusOk = false;
  for (var i = 0; i < maxPolls; i++) {
    Utilities.sleep(i === 0 ? 500 : 1000);
    var statusResult = cs_get_(statusUrl, apiKey);
    if (!statusResult) {
      Logger.log("ChemSpider step 2 poll " + i + " returned null");
      continue;
    }

    var status = statusResult.status || statusResult;
    Logger.log(
      "ChemSpider step 2 poll " +
        i +
        ": status=" +
        status +
        " count=" +
        (statusResult.count || "?"),
    );
    if (status === "Complete") {
      statusOk = true;
      break;
    }
    if (
      status === "Failed" ||
      status === "Not Found" ||
      status === "TooManyRequests"
    )
      return null;
  }

  if (!statusOk) {
    Logger.log("ChemSpider step 2 TIMED OUT after " + maxPolls + " polls");
    return null;
  }

  // Step 3: GET results
  var resultsUrl = API.CHEMSPIDER + "/filter/" + queryId + "/results";
  var resultsData = cs_get_(resultsUrl, apiKey);
  Logger.log("ChemSpider step 3 results: " + JSON.stringify(resultsData));

  if (resultsData && resultsData.results && resultsData.results.length > 0) {
    return resultsData.results;
  }
  return null;
}

// ─── Get Compound Info ───────────────────────────────────────────────────────────

/**
 * Retrieve compound details for a single CSID using the GET record endpoint.
 *
 * @param {number} csid - ChemSpider ID
 * @param {string[]} [fields] - Fields to retrieve (defaults to CHEMSPIDER_DEFAULT_FIELDS)
 * @return {Object|null} Record object, or null
 */
function chemspider_getCompInfo(csid, fields) {
  if (!csid) return null;
  fields = fields || CHEMSPIDER_DEFAULT_FIELDS;

  var apiKey = getChemSpiderApiKey();
  if (!apiKey) return null;

  // Use GET single-record endpoint (simpler, confirmed working)
  var url =
    API.CHEMSPIDER + "/records/" + csid + "/details?fields=" + fields.join(",");

  Logger.log("ChemSpider record GET: " + url);
  var data = cs_get_(url, apiKey);
  Logger.log(
    "ChemSpider record response: " +
      (data ? JSON.stringify(data).substring(0, 500) : "null"),
  );

  // The GET endpoint returns the record object directly (not wrapped in .records)
  if (data && data.id) {
    return data;
  }
  return null;
}

// ─── Get Image URL ───────────────────────────────────────────────────────────────

/**
 * Get the URL for a compound image from ChemSpider.
 *
 * @param {number} csid - ChemSpider ID
 * @return {string} Image URL
 */
function chemspider_getImageUrl(csid) {
  return (
    "https://www.chemspider.com/ImagesHandler.ashx?id=" + csid + "&w=300&h=300"
  );
}

// ─── Combined Search ────────────────────────────────────────────────────────────

/**
 * Full ChemSpider search: find CSID, then get compound details.
 *
 * @param {string} query - Search term
 * @param {string} [from='name'] - Identifier type
 * @return {Object|null} Object with csid, record, imageUrl, url
 */
function chemspider_search(query, from) {
  from = from || "name";
  var csids = chemspider_getCsid(query, from);
  if (!csids || csids.length === 0) return null;

  var csid = csids[0];
  var rec = chemspider_getCompInfo(csid);
  if (!rec) rec = {};

  // Normalise record field names to camelCase for consistent display.
  var record = normalizeRecordFields_(rec);

  return {
    source: "ChemSpider",
    csid: csid,
    record: record,
    imageUrl: chemspider_getImageUrl(csid),
    url: "https://www.chemspider.com/Chemical-Structure." + csid + ".html",
  };
}

/**
 * Normalise ChemSpider record fields to a consistent camelCase convention
 * so display code can rely on fixed property names.
 * @param {Object} rec
 * @return {Object}
 * @private
 */
function normalizeRecordFields_(rec) {
  if (!rec) return {};
  // Build a lowercase → original mapping
  var lower = {};
  Object.keys(rec).forEach(function (k) {
    lower[k.toLowerCase()] = rec[k];
  });

  return {
    id: lower.id || lower.recordid || null,
    commonName: lower.commonname || null,
    formula: lower.formula || null,
    smiles: lower.smiles || null,
    inchi: lower.inchi || null,
    inchiKey: lower.inchikey || null,
    stdInChI: lower.stdinchi || null,
    stdInChIKey: lower.stdinchikey || null,
    averageMass: lower.averagemass || null,
    molecularWeight: lower.molecularweight || null,
    monoisotopicMass: lower.monoisotopicmass || null,
    nominalMass: lower.nominalmass || null,
  };
}

// ─── Diagnostic Function ─────────────────────────────────────────────────────────

/**
 * Run a step-by-step diagnostic test of the ChemSpider API.
 * Execute this directly from the GAS editor (Run → testChemSpider)
 * and check the Execution log for detailed output.
 *
 * Tests: API key retrieval, POST filter, GET status, GET results, GET record.
 */
function testChemSpider() {
  var log = [];
  function l(msg) {
    Logger.log(msg);
    log.push(msg);
  }

  l("═══ ChemSpider Diagnostic ═══");
  l("Timestamp: " + new Date().toISOString());

  // 1. Check API key
  var apiKey = getChemSpiderApiKey();
  l(
    "1. API Key from ScriptProperties: " +
      (apiKey
        ? "[" + apiKey.length + " chars] '" + apiKey.substring(0, 4) + "...'"
        : "NULL / EMPTY"),
  );
  if (!apiKey) {
    l("   ⛔ No API key! Go to Chemistry Tools → Settings to save your key.");
    l(
      "   Or run: saveChemSpiderApiKey('YOUR_KEY_HERE') from the script editor.",
    );
    return log.join("\n");
  }

  // 2. Test direct GET to a known CSID (236 = benzene)
  l("");
  l("2. Direct record GET (CSID 236 = benzene)...");
  try {
    var recordUrl =
      API.CHEMSPIDER + "/records/236/details?fields=CommonName,Formula,SMILES";
    var recOpts = {
      method: "get",
      headers: { apikey: apiKey },
      muteHttpExceptions: true,
    };
    Utilities.sleep(300);
    var recResp = UrlFetchApp.fetch(recordUrl, recOpts);
    l("   URL: " + recordUrl);
    l("   HTTP " + recResp.getResponseCode());
    l("   Body: " + recResp.getContentText().substring(0, 500));
  } catch (e) {
    l("   EXCEPTION: " + e.message);
  }

  // 3. Test POST filter/name for "benzene"
  l("");
  l("3. POST filter/name for 'benzene'...");
  var queryId = null;
  try {
    var filterUrl = API.CHEMSPIDER + "/filter/name";
    var payload = JSON.stringify({
      name: "benzene",
      orderBy: "recordId",
      orderDirection: "ascending",
    });
    var postOpts = {
      method: "post",
      contentType: "application/json",
      headers: { apikey: apiKey },
      payload: payload,
      muteHttpExceptions: true,
    };
    Utilities.sleep(300);
    var postResp = UrlFetchApp.fetch(filterUrl, postOpts);
    l("   URL: " + filterUrl);
    l("   Payload: " + payload);
    l("   HTTP " + postResp.getResponseCode());
    var postBody = postResp.getContentText();
    l("   Body: " + postBody.substring(0, 500));
    if (postResp.getResponseCode() === 200) {
      var postData = JSON.parse(postBody);
      queryId = postData.queryId;
      l("   queryId: " + queryId);
    }
  } catch (e) {
    l("   EXCEPTION: " + e.message);
  }

  if (!queryId) {
    l("   ⛔ No queryId — cannot continue. Check API key and network.");
    return log.join("\n");
  }

  // 4. GET status
  l("");
  l("4. GET filter status...");
  Utilities.sleep(1000);
  try {
    var statusUrl = API.CHEMSPIDER + "/filter/" + queryId + "/status";
    var getOpts = {
      method: "get",
      headers: { apikey: apiKey },
      muteHttpExceptions: true,
    };
    var statusResp = UrlFetchApp.fetch(statusUrl, getOpts);
    l("   URL: " + statusUrl);
    l("   HTTP " + statusResp.getResponseCode());
    l("   Body: " + statusResp.getContentText().substring(0, 500));
  } catch (e) {
    l("   EXCEPTION: " + e.message);
  }

  // 5. GET results
  l("");
  l("5. GET filter results...");
  Utilities.sleep(500);
  try {
    var resultsUrl = API.CHEMSPIDER + "/filter/" + queryId + "/results";
    var resOpts = {
      method: "get",
      headers: { apikey: apiKey },
      muteHttpExceptions: true,
    };
    var resResp = UrlFetchApp.fetch(resultsUrl, resOpts);
    l("   URL: " + resultsUrl);
    l("   HTTP " + resResp.getResponseCode());
    l("   Body: " + resResp.getContentText().substring(0, 500));
  } catch (e) {
    l("   EXCEPTION: " + e.message);
  }

  l("");
  l("═══ Diagnostic Complete ═══");
  return log.join("\n");
}
