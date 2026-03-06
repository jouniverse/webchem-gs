/**
 * webchem-gs: CAS Common Chemistry Module
 * API integration for CAS Common Chemistry (commonchemistry.cas.org).
 */

// ─── API Key ────────────────────────────────────────────────────────────────────

/**
 * Retrieve the CAS Common Chemistry API key from Script Properties.
 * @return {string|null}
 */
function getCasApiKey_() {
  return PropertiesService.getScriptProperties().getProperty(
    PROP_KEYS.CAS_API_KEY,
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * Search CAS Common Chemistry for a compound.
 * 1. Hit /api/search?q=... to get CAS RN(s).
 * 2. Hit /api/detail?cas_rn=... for the first hit to get full details.
 *
 * @param {string} query - Name, CAS number, InChIKey, SMILES, or formula
 * @return {Object|null} Result object, or null if not found
 */
function cas_search(query) {
  if (!query) return null;

  var apiKey = getCasApiKey_();
  if (!apiKey) {
    throw new Error(
      "CAS API key not configured. Set CAS_API_KEY in Script Properties.",
    );
  }

  var headers = { "X-API-KEY": apiKey };

  // ── Step 1: Search ──
  var searchUrl = API.CAS + "/search?q=" + encodeURIComponent(query);
  var searchData = httpGet(searchUrl, headers);

  if (!searchData || !searchData.results || searchData.results.length === 0) {
    return null;
  }

  var firstHit = searchData.results[0];
  var casRn = firstHit.rn;
  if (!casRn) return null;

  // ── Step 2: Detail ──
  var detailUrl = API.CAS + "/detail?cas_rn=" + encodeURIComponent(casRn);
  var detail = httpGet(detailUrl, headers);

  if (!detail || !detail.rn) return null;

  // Clean HTML tags from molecular formula (e.g. "CH<sub>2</sub>O" → "CH2O")
  var formula = (detail.molecularFormula || "").replace(/<[^>]+>/g, "");

  // Extract experimental properties
  var bp = "";
  var mp = "";
  var density = "";
  if (detail.experimentalProperties) {
    for (var i = 0; i < detail.experimentalProperties.length; i++) {
      var prop = detail.experimentalProperties[i];
      if (prop.name === "Boiling Point") bp = prop.property || "";
      if (prop.name === "Melting Point") mp = prop.property || "";
      if (prop.name === "Density") density = prop.property || "";
    }
  }

  // Clean InChIKey (may have "InChIKey=" prefix)
  var inchiKey = (detail.inchiKey || "").replace(/^InChIKey=/i, "");

  // Build result page URL
  var pageUrl =
    "https://commonchemistry.cas.org/detail?cas_rn=" +
    encodeURIComponent(casRn) +
    "&search=" +
    encodeURIComponent(query);

  return {
    source: "CAS",
    name: detail.name || firstHit.name || "",
    cas: casRn,
    formula: formula,
    molecularMass: detail.molecularMass || "",
    inchi: detail.inchi || "",
    inchiKey: inchiKey,
    smiles: detail.canonicalSmile || "",
    boilingPoint: bp,
    meltingPoint: mp,
    density: density,
    synonyms: detail.synonyms || [],
    imageUrl: "",
    imageSvg: detail.images && detail.images.length > 0 ? detail.images[0] : "",
    url: pageUrl,
    totalResults: searchData.count || 1,
  };
}
