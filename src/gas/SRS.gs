/**
 * webchem-gs: EPA SRS (Substance Registry Services) Module
 * API integration for EPA's Substance Registry Services.
 * No API key required.
 */

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * Search EPA SRS for a substance by name or CAS number.
 * Uses /rest-api/substance/{mode}/{identifier} endpoint.
 *
 * @param {string} query - Substance name or CAS number
 * @param {string} [idType] - Identifier type ('name', 'cas', or auto-detect)
 * @return {Object|null} Result object, or null if not found
 */
function srs_search(query, idType) {
  if (!query) return null;

  // Determine lookup mode: SRS supports name and cas
  var mode = "name";
  if (idType === "cas" || /^\d{2,7}-\d{2}-\d$/.test(query.trim())) {
    mode = "cas";
  }

  var baseUrl =
    "https://cdxapps.epa.gov/oms-substance-registry-services/rest-api/substance";
  var url = baseUrl + "/" + mode + "/" + encodeURIComponent(query.trim());

  var data = httpGet(url, null, { retries: 2 });
  if (!data) return null;

  // Response is an array of substances
  var substances = Array.isArray(data) ? data : [data];
  if (substances.length === 0) return null;

  var sub = substances[0];
  if (!sub || !sub.epaName) return null;

  // Build InChI (add prefix if needed)
  var inchi = sub.inchiNotation || "";
  if (inchi && inchi.indexOf("InChI=") !== 0) {
    inchi = "InChI=" + inchi;
  }

  // Build detail URL
  var pageUrl =
    "https://cdxapps.epa.gov/oms-substance-registry-services/substance-details/" +
    (sub.internalTrackingNumber || "");

  return {
    source: "SRS",
    name: sub.epaName || "",
    systematicName: sub.systematicName || "",
    iupacName: sub.iupacName || "",
    cas: sub.currentCasNumber || "",
    formula: sub.molecularFormula || "",
    molecularWeight: sub.molecularWeight || "",
    smiles: sub.smilesNotation || "",
    inchi: inchi,
    itn: sub.internalTrackingNumber || "",
    substanceType: sub.substanceType || "",
    url: pageUrl,
    totalResults: substances.length,
  };
}
