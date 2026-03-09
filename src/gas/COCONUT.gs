/**
 * webchem-gs: COCONUT (COlleCtion of Open NatUral producTs) Module
 * API integration for the COCONUT natural products database.
 * Requires Bearer token stored as COCONUT_API_KEY in Script Properties.
 */

// ─── API Key ────────────────────────────────────────────────────────────────────

/**
 * Retrieve the COCONUT Bearer token from Script Properties.
 * @return {string|null}
 */
function getCoconutApiKey_() {
  return PropertiesService.getScriptProperties().getProperty(
    PROP_KEYS.COCONUT_API_KEY,
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * Search COCONUT for a natural product by name, CAS, SMILES, InChI, or InChIKey.
 * Uses POST /api/molecules/search endpoint (requires auth).
 *
 * @param {string} query - Search term
 * @param {string} [idType] - Identifier type
 * @return {Object|null} Result object, or null if not found
 */
function coconut_search(query, idType) {
  if (!query) return null;

  var token = getCoconutApiKey_();
  if (!token) {
    throw new Error(
      "COCONUT API token not configured. Set COCONUT_API_KEY in Script Properties.",
    );
  }

  // Map identifier type to COCONUT field name
  var field = mapIdTypeToCoconut_(idType, query);
  var isNameSearch = field === "name" || field === "iupac_name";

  // For name searches: try exact match first, fall back to 'like'
  var operator = isNameSearch ? "=" : "=";
  var value = query.trim();

  var body = {
    search: {
      scopes: [],
      filters: [{ field: field, operator: operator, value: value }],
    },
  };

  var headers = {
    Authorization: "Bearer " + token,
  };

  var url = API.COCONUT + "/molecules/search";
  var data = httpPostJson(url, body, headers, { retries: 2 });

  // For name searches: if exact match found nothing, try fuzzy 'like'
  if (isNameSearch && (!data || !data.data || data.data.length === 0)) {
    body.search.filters[0].operator = "like";
    body.search.filters[0].value = "%" + value + "%";
    data = httpPostJson(url, body, headers, { retries: 2, useCache: false });
  }

  if (!data || !data.data || data.data.length === 0) {
    // If name search found nothing, try iupac_name as fallback
    if (field === "name") {
      body.search.filters[0].field = "iupac_name";
      body.search.filters[0].operator = "=";
      body.search.filters[0].value = value;
      data = httpPostJson(url, body, headers, { retries: 2, useCache: false });
      // If exact iupac_name also failed, try 'like'
      if (!data || !data.data || data.data.length === 0) {
        body.search.filters[0].operator = "like";
        body.search.filters[0].value = "%" + value + "%";
        data = httpPostJson(url, body, headers, {
          retries: 2,
          useCache: false,
        });
      }
      if (!data || !data.data || data.data.length === 0) {
        return null;
      }
    } else {
      return null;
    }
  }

  var mol = data.data[0];
  if (!mol) return null;

  // Build result page URL
  var pageUrl =
    "https://coconut.naturalproducts.net/compounds/" +
    encodeURIComponent(mol.identifier || "");

  // CAS may be an array
  var cas = "";
  if (Array.isArray(mol.cas) && mol.cas.length > 0) {
    cas = mol.cas[0];
  } else if (typeof mol.cas === "string") {
    cas = mol.cas;
  }

  return {
    source: "COCONUT",
    name: mol.name || mol.iupac_name || "",
    iupacName: mol.iupac_name || "",
    identifier: mol.identifier || "",
    cas: cas,
    smiles: mol.canonical_smiles || "",
    inchi: mol.standard_inchi || "",
    inchiKey: mol.standard_inchi_key || "",
    annotationLevel: mol.annotation_level || "",
    organismCount: mol.organism_count || 0,
    citationCount: mol.citation_count || 0,
    url: pageUrl,
    totalResults: data.total || 1,
  };
}

// ─── ID Type Mapper ─────────────────────────────────────────────────────────────

/**
 * Map identifier type to a COCONUT search field.
 * @param {string} idType
 * @param {string} query
 * @return {string}
 */
function mapIdTypeToCoconut_(idType, query) {
  switch (idType) {
    case "cas":
      return "cas";
    case "smiles":
      return "canonical_smiles";
    case "inchi":
      return "standard_inchi";
    case "inchikey":
      return "standard_inchi_key";
    case "formula":
      return "properties.molecular_formula";
    default:
      // Check if query looks like a CAS number
      if (/^\d{2,7}-\d{2}-\d$/.test(query.trim())) return "cas";
      return "name";
  }
}
