/**
 * webchem-gs: PubChem Module
 * PUG-REST API integration.
 * Adapted from webchem R package pubchem.R
 */

// ─── Get CID ────────────────────────────────────────────────────────────────────

/**
 * Retrieve PubChem Compound IDs (CIDs) from a query.
 *
 * @param {string} query - Search term
 * @param {string} [from='name'] - Identifier type: 'name','smiles','inchi','inchikey','formula','cid','xref/rn'
 * @return {number[]|null} Array of CIDs, or null if not found
 */
function pubchem_getCid(query, from) {
  from = from || "name";
  if (!query) return null;

  // Map convenience names
  if (from === "cas") from = "xref/rn";

  var url;
  if (from === "smiles") {
    url =
      API.PUBCHEM_PUG +
      "/compound/smiles/cids/JSON?smiles=" +
      encodeURIComponent(query);
  } else if (from === "inchi") {
    // InChI requires POST
    var data = httpPostRaw(
      API.PUBCHEM_PUG + "/compound/inchi/cids/JSON",
      "inchi=" + encodeURIComponent(query),
      { "Content-Type": "application/x-www-form-urlencoded" },
    );
    if (data && data.IdentifierList && data.IdentifierList.CID) {
      return data.IdentifierList.CID;
    }
    return null;
  } else if (from === "cid") {
    // Already have CID
    return [Number(query)];
  } else if (from === "name") {
    // Name search: use POST to avoid URL-path encoding issues
    // (e.g. "/" in compound names breaks PUG REST path parsing)
    var data = httpPostRaw(
      API.PUBCHEM_PUG + "/compound/name/cids/JSON",
      "name=" + encodeURIComponent(query),
      { "Content-Type": "application/x-www-form-urlencoded" },
    );
    if (data && data.IdentifierList && data.IdentifierList.CID) {
      return data.IdentifierList.CID;
    }
    return null;
  } else if (from === "formula") {
    // Formula search is asynchronous in PubChem — returns a ListKey
    // that must be polled until results are ready.
    var asyncUrl =
      API.PUBCHEM_PUG +
      "/compound/formula/" +
      encodeURIComponent(query) +
      "/cids/JSON";
    var asyncData = httpGet(asyncUrl, null, { useCache: false });

    // Check for direct result (rare but possible)
    if (asyncData && asyncData.IdentifierList && asyncData.IdentifierList.CID) {
      return asyncData.IdentifierList.CID;
    }

    // Handle async: poll the ListKey
    if (asyncData && asyncData.Waiting && asyncData.Waiting.ListKey) {
      var listKey = asyncData.Waiting.ListKey;
      var pollUrl =
        API.PUBCHEM_PUG + "/compound/listkey/" + listKey + "/cids/JSON";
      // Poll up to 10 times with 2-second intervals
      for (var attempt = 0; attempt < 10; attempt++) {
        Utilities.sleep(2000);
        var pollData = httpGet(pollUrl, null, { useCache: false });
        if (
          pollData &&
          pollData.IdentifierList &&
          pollData.IdentifierList.CID
        ) {
          return pollData.IdentifierList.CID;
        }
        // Still waiting — continue polling
        if (pollData && pollData.Waiting) continue;
        // Error or unexpected response — stop
        break;
      }
    }
    return null;
  } else {
    url =
      API.PUBCHEM_PUG +
      "/compound/" +
      from +
      "/" +
      encodeURIComponent(query) +
      "/cids/JSON";
  }

  var data = httpGet(url);
  if (data && data.IdentifierList && data.IdentifierList.CID) {
    return data.IdentifierList.CID;
  }
  return null;
}

// ─── Get Properties ─────────────────────────────────────────────────────────────

/**
 * Retrieve compound properties by CID.
 *
 * @param {number|string} cid - PubChem CID
 * @param {string[]} [properties] - Array of property names (defaults to PUBCHEM_DEFAULT_PROPERTIES)
 * @return {Object|null} Property object, or null
 */
function pubchem_getProperties(cid, properties) {
  if (!cid) return null;
  properties = properties || PUBCHEM_DEFAULT_PROPERTIES;
  var propStr = properties.join(",");

  var url =
    API.PUBCHEM_PUG + "/compound/cid/" + cid + "/property/" + propStr + "/JSON";
  var data = httpGet(url);

  if (
    data &&
    data.PropertyTable &&
    data.PropertyTable.Properties &&
    data.PropertyTable.Properties.length > 0
  ) {
    return data.PropertyTable.Properties[0];
  }
  return null;
}

// ─── Get Synonyms ───────────────────────────────────────────────────────────────

/**
 * Retrieve synonyms for a compound.
 *
 * @param {number|string} cid - PubChem CID
 * @param {number} [limit=20] - Max number of synonyms to return
 * @return {string[]} Array of synonym strings
 */
function pubchem_getSynonyms(cid, limit) {
  if (!cid) return [];
  limit = limit || 20;

  var url = API.PUBCHEM_PUG + "/compound/cid/" + cid + "/synonyms/JSON";
  var data = httpGet(url);

  if (
    data &&
    data.InformationList &&
    data.InformationList.Information &&
    data.InformationList.Information.length > 0
  ) {
    var syns = data.InformationList.Information[0].Synonym || [];
    return syns.slice(0, limit);
  }
  return [];
}

// ─── Get 2D Structure Image URL ─────────────────────────────────────────────────

/**
 * Get the URL for a 2D structure PNG image from PubChem.
 *
 * @param {number|string} cid - PubChem CID
 * @return {string} Image URL
 */
function pubchem_getImageUrl(cid) {
  return API.PUBCHEM_IMG + cid + "/PNG?image_size=300x300";
}

// ─── Combined Search ────────────────────────────────────────────────────────────

/**
 * Full PubChem search: get CID(s), then properties for the first hit.
 *
 * @param {string} query - Search term
 * @param {string} [from='name'] - Identifier type
 * @return {Object|null} Object with cid, properties, synonyms, imageUrl
 */
function pubchem_search(query, from) {
  from = from || "name";
  var cids = pubchem_getCid(query, from);
  if (!cids || cids.length === 0) return null;

  var cid = cids[0];
  var props = pubchem_getProperties(cid);
  var synonyms = pubchem_getSynonyms(cid, 10);
  var imageUrl = pubchem_getImageUrl(cid);

  // Extract CAS Registry Number from synonyms (format: digits-digits-digit)
  var cas = "";
  var casRegex = /^\d{2,7}-\d{2}-\d$/;
  for (var si = 0; si < synonyms.length; si++) {
    if (casRegex.test(synonyms[si])) {
      cas = synonyms[si];
      break;
    }
  }

  return {
    source: "PubChem",
    cid: cid,
    properties: props,
    synonyms: synonyms,
    cas: cas,
    imageUrl: imageUrl,
    url: "https://pubchem.ncbi.nlm.nih.gov/compound/" + cid,
  };
}
