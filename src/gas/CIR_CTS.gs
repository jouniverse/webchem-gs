/**
 * webchem-gs: CIR & CTS Conversion Module
 * Chemical Identifier Resolver (NCI/NIH) and Chemical Translation Service (Fiehn Lab).
 * Adapted from webchem R package cir.R and cts.R
 */

// ═══════════════════════════════════════════════════════════════════
// CIR — Chemical Identifier Resolver
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a chemical identifier using the CIR service.
 *
 * Representations: 'smiles', 'names', 'iupac_name', 'cas', 'stdinchi',
 *   'stdinchikey', 'formula', 'mw' (molecular weight), 'image' (url)
 *
 * @param {string} query - Chemical identifier (name, CAS, SMILES, InChI, etc.)
 * @param {string} representation - Desired output representation
 * @return {string|string[]|null} Result value(s), or null
 */
function cir_query(query, representation) {
  if (!query || !representation) return null;

  // Use plain text endpoint — simpler and more reliable than XML.
  // CIR returns one value per line in plain text.
  var url =
    API.CIR +
    "/" +
    encodeURIComponent(query) +
    "/" +
    encodeURIComponent(representation);

  var text = httpGetText(url, null, { delay: RATE_LIMIT.CIR });

  if (!text || !text.trim()) return null;

  // Split multi-line results (e.g., multiple names)
  var lines = text
    .trim()
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return l.length > 0;
    });

  if (lines.length === 0) return null;
  if (lines.length === 1) return lines[0];
  return lines;
}

/**
 * Get structure image URL from CIR.
 *
 * @param {string} query - Chemical identifier
 * @return {string} Image URL
 */
function cir_imageUrl(query) {
  return API.CIR + "/" + encodeURIComponent(query) + "/image";
}

// ═══════════════════════════════════════════════════════════════════
// CTS — Chemical Translation Service
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a chemical identifier between systems using CTS REST API.
 *
 * @param {string} query - Input identifier
 * @param {string} from - Source ID type (e.g., 'CAS', 'Chemical Name', 'InChIKey', 'InChI Code')
 * @param {string} to - Target ID type
 * @return {string[]|null} Array of converted values
 */
function cts_convert(query, from, to) {
  if (!query || !from || !to) return null;

  var url =
    API.CTS +
    "/rest/convert/" +
    encodeURIComponent(from) +
    "/" +
    encodeURIComponent(to) +
    "/" +
    encodeURIComponent(query);

  var data = httpGet(url);
  if (!data) return null;

  // CTS REST API returns an array with one object: [{searchTerm, result: [...]}]
  var entry = Array.isArray(data) ? data[0] : data;
  if (entry && entry.result && entry.result.length > 0) {
    return entry.result;
  }
  // Also check 'results' key (older API versions)
  if (entry && entry.results && entry.results.length > 0) {
    return entry.results;
  }
  return null;
}

/**
 * Get available 'from' ID types for CTS.
 *
 * @return {string[]} List of available source types
 */
function cts_fromTypes() {
  var data = httpGet(API.CTS + "/service/conversion/fromValues");
  return data || [];
}

/**
 * Get available 'to' ID types for CTS.
 *
 * @return {string[]} List of available target types
 */
function cts_toTypes() {
  var data = httpGet(API.CTS + "/service/conversion/toValues");
  return data || [];
}

/**
 * Get compound info from CTS.
 *
 * @param {string} query - InChIKey
 * @return {Object|null} Compound info
 */
function cts_compinfo(query) {
  if (!query) return null;

  var url = API.CTS + "/service/compound/" + encodeURIComponent(query);
  var data = httpGet(url);
  return data || null;
}

// ═══════════════════════════════════════════════════════════════════
// Unified Conversion Interface
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// CTS ↔ Display-Name Mappings
// ═══════════════════════════════════════════════════════════════════

/** Maps our UI "From" labels → CTS source type names. */
var CTS_FROM_MAP_ = {
  Name: "Chemical Name",
  CAS: "CAS",
  SMILES: "SMILES",
  InChI: "InChI Code",
  InChIKey: "InChIKey",
};

/** Maps our UI "To" labels → CTS target type names. */
var CTS_TO_MAP_ = {
  CAS: "CAS",
  SMILES: "SMILES",
  InChI: "InChI Code",
  InChIKey: "InChIKey",
  Name: "Chemical Name",
  "PubChem CID": "PubChem CID",
  ChEBI: "ChEBI",
  ChEMBL: "ChEMBL",
};

/** Maps internal search idTypes → CTS source type names. */
var CTS_SEARCH_FROM_MAP_ = {
  name: "Chemical Name",
  cas: "CAS",
  smiles: "SMILES",
  inchi: "InChI Code",
  inchikey: "InChIKey",
  cid: "PubChem CID",
};

// ═══════════════════════════════════════════════════════════════════
// Unified Conversion Interface
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an identifier using a tiered service approach:
 *   PubChem (primary) → CTS (fallback) → CIR (fallback) → SRS (for CAS/Name)
 *
 * Special routing:
 *  - IUPAC Name source → OPSIN first, then standard chain
 *  - IUPAC Name target → CIR iupac_name (via CTS or PubChem for intermediate)
 *
 * @param {string} query - Input identifier
 * @param {string} from - Source type (UI label)
 * @param {string} to - Target type (UI label)
 * @return {Object} { success, value, source, from, to, error }
 */
function convertIdentifier(query, from, to) {
  if (!query || !from || !to) {
    return { success: false, error: "Missing query, from, or to parameter" };
  }

  // ── Case 1: IUPAC Name as source ──
  if (from === "IUPAC Name") {
    var opsinResult = opsin_search(query);
    if (!opsinResult) {
      return {
        success: false,
        error: "OPSIN could not parse the IUPAC name",
        from: from,
        to: to,
      };
    }
    // Direct OPSIN results for SMILES / InChI / InChIKey
    if (to === "SMILES" && opsinResult.smiles) {
      return {
        success: true,
        value: opsinResult.smiles,
        source: "OPSIN",
        from: from,
        to: to,
      };
    }
    if (to === "InChI" && opsinResult.stdinchi) {
      return {
        success: true,
        value: opsinResult.stdinchi,
        source: "OPSIN",
        from: from,
        to: to,
      };
    }
    if (to === "InChIKey" && opsinResult.stdinchikey) {
      return {
        success: true,
        value: opsinResult.stdinchikey,
        source: "OPSIN",
        from: from,
        to: to,
      };
    }
    // For all other targets, use OPSIN SMILES → PubChem path
    if (opsinResult.smiles) {
      var pubResult = convertViaPubChem_(opsinResult.smiles, "SMILES", to);
      if (pubResult) {
        return {
          success: true,
          value: pubResult,
          source: "OPSIN + PubChem",
          from: from,
          to: to,
        };
      }
      // Fallback: OPSIN → SMILES → CTS
      var ctsTo = CTS_TO_MAP_[to];
      if (ctsTo) {
        var ctsResult = cts_convert(opsinResult.smiles, "SMILES", ctsTo);
        if (ctsResult && ctsResult.length > 0) {
          return {
            success: true,
            value: ctsResult.length === 1 ? ctsResult[0] : ctsResult,
            source: "OPSIN + CTS",
            from: from,
            to: to,
          };
        }
      }
    }
    return {
      success: false,
      error: "Conversion not available for this target",
      from: from,
      to: to,
    };
  }

  // ── Case 2: IUPAC Name as target ──
  if (to === "IUPAC Name") {
    // Try CIR directly first (it handles many identifier types)
    var iupacResult = cir_query(query, "iupac_name");
    if (iupacResult) {
      return {
        success: true,
        value: iupacResult,
        source: "CIR",
        from: from,
        to: to,
      };
    }
    // If CIR failed, try PubChem → IUPACName property
    var pubIupac = convertViaPubChem_(query, from, "IUPAC Name");
    if (pubIupac) {
      return {
        success: true,
        value: pubIupac,
        source: "PubChem",
        from: from,
        to: to,
      };
    }
    // Last resort: resolve to name via CTS, then CIR
    if (from !== "Name") {
      var ctsFrom = CTS_FROM_MAP_[from];
      if (ctsFrom) {
        var nameResults = cts_convert(query, ctsFrom, "Chemical Name");
        if (nameResults && nameResults.length > 0) {
          iupacResult = cir_query(nameResults[0], "iupac_name");
          if (iupacResult) {
            return {
              success: true,
              value: iupacResult,
              source: "CTS + CIR",
              from: from,
              to: to,
            };
          }
        }
      }
    }
    return {
      success: false,
      error: "IUPAC name not found",
      from: from,
      to: to,
    };
  }

  // ── Case 3: Standard conversion (PubChem → CTS → CIR → SRS) ──

  // 3a. Try PubChem first (most reliable for name/CAS/SMILES/InChI/InChIKey)
  var pubResult = convertViaPubChem_(query, from, to);
  if (pubResult) {
    return {
      success: true,
      value: pubResult,
      source: "PubChem",
      from: from,
      to: to,
    };
  }

  // 3b. Try CTS as fallback
  var ctsFrom = CTS_FROM_MAP_[from];
  var ctsTo = CTS_TO_MAP_[to];
  if (ctsFrom && ctsTo) {
    var ctsResult = cts_convert(query, ctsFrom, ctsTo);
    if (ctsResult && ctsResult.length > 0) {
      return {
        success: true,
        value: ctsResult.length === 1 ? ctsResult[0] : ctsResult,
        source: "CTS",
        from: from,
        to: to,
      };
    }
  }

  // 3c. Try CIR as fallback (works well for name/CAS → SMILES/InChI/InChIKey)
  var cirRep = CIR_REP_MAP_[to];
  if (cirRep) {
    var cirResult = cir_query(query, cirRep);
    if (cirResult) {
      return {
        success: true,
        value: cirResult,
        source: "CIR",
        from: from,
        to: to,
      };
    }
  }

  // 3d. Try SRS as fallback for CAS ↔ Name conversions
  if ((from === "Name" && to === "CAS") || (from === "CAS" && to === "Name")) {
    var srsResult = srs_search(query, from === "CAS" ? "cas" : "name");
    if (srsResult) {
      var srsVal = to === "CAS" ? srsResult.cas : srsResult.name;
      if (srsVal) {
        return {
          success: true,
          value: srsVal,
          source: "SRS",
          from: from,
          to: to,
        };
      }
    }
  }

  return {
    success: false,
    error: "Conversion not found",
    from: from,
    to: to,
  };
}

// ─── PubChem Conversion Helper ──────────────────────────────────────────────────

/** Maps our UI "From" labels → PubChem input namespace. */
var PUBCHEM_FROM_MAP_ = {
  Name: "name",
  CAS: "xref/rn",
  SMILES: "smiles",
  InChI: "inchi",
  InChIKey: "inchikey",
};

/** Maps our UI "To" labels → PubChem property names. */
var PUBCHEM_TO_PROP_MAP_ = {
  SMILES: "CanonicalSMILES",
  InChI: "InChI",
  InChIKey: "InChIKey",
  Name: "Title",
  "IUPAC Name": "IUPACName",
  "PubChem CID": "CID",
};

/** Maps our "To" labels → CIR representations (for CIR fallback). */
var CIR_REP_MAP_ = {
  SMILES: "smiles",
  InChI: "stdinchi",
  InChIKey: "stdinchikey",
  Name: "names",
  CAS: "cas",
};

/**
 * Convert via PubChem: query → CID → property extraction.
 *
 * @param {string} query - Input identifier
 * @param {string} from - UI label (Name, CAS, SMILES, etc.)
 * @param {string} to - UI label (SMILES, CAS, InChI, etc.)
 * @return {string|null} Converted value, or null
 */
function convertViaPubChem_(query, from, to) {
  var pubFrom = PUBCHEM_FROM_MAP_[from];
  if (!pubFrom) return null;

  // Resolve to CID
  var cids = pubchem_getCid(query, pubFrom);
  if (!cids || cids.length === 0) return null;
  var cid = cids[0];

  // If target is PubChem CID, we're done
  if (to === "PubChem CID") return String(cid);

  // If target is CAS, extract from synonyms (PubChem stores CAS in synonyms)
  if (to === "CAS") {
    var syns = pubchem_getSynonyms(cid, 50);
    for (var i = 0; i < syns.length; i++) {
      if (/^\d{2,7}-\d{2}-\d$/.test(syns[i])) {
        return syns[i];
      }
    }
    return null;
  }

  // If target is ChEBI or ChEMBL, not available via PubChem properties
  if (to === "ChEBI" || to === "ChEMBL") return null;

  // Get properties for everything else
  var propName = PUBCHEM_TO_PROP_MAP_[to];
  if (!propName) return null;

  var props = pubchem_getProperties(cid, [propName]);
  if (!props) return null;

  var val = props[propName];
  return val ? String(val) : null;
}

// ═══════════════════════════════════════════════════════════════════
// CTS-Based ID Resolution (for search orchestrator)
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolve a query to a database-specific ID via CTS.
 * Used by the search orchestrator for ChEBI / ChEMBL.
 *
 * @param {string} query - The query string
 * @param {string} idType - Internal type: name, cas, smiles, inchi, inchikey, cid
 * @param {string} targetDb - CTS target: "ChEBI", "ChEMBL", "Chemical Name"
 * @return {string|null} The first resolved ID, or null
 */
function resolveIdViaCTS(query, idType, targetDb) {
  var ctsFrom = CTS_SEARCH_FROM_MAP_[idType];
  if (!ctsFrom) return null;

  var results = cts_convert(query, ctsFrom, targetDb);
  if (results && results.length > 0) {
    return results[0];
  }
  return null;
}

/**
 * Convert a query to a Chemical Name via CTS.
 *
 * @param {string} query
 * @param {string} idType
 * @return {string|null}
 */
function resolveToNameViaCTS(query, idType) {
  return resolveIdViaCTS(query, idType, "Chemical Name");
}

/**
 * Get the list of available conversion types (for UI dropdowns).
 *
 * @return {Object} Object with fromTypes and toTypes arrays
 */
function getConversionTypes() {
  return {
    fromTypes: ["Name", "CAS", "SMILES", "InChI", "InChIKey", "IUPAC Name"],
    toTypes: [
      "CAS",
      "SMILES",
      "InChI",
      "InChIKey",
      "IUPAC Name",
      "Name",
      "PubChem CID",
      "ChEBI",
      "ChEMBL",
    ],
  };
}
