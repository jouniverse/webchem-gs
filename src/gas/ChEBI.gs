/**
 * webchem-gs: ChEBI Module
 * Uses the EBI OLS4 REST API — no auth required.
 *
 * The original ChEBI SOAP web service
 * (https://www.ebi.ac.uk/webservices/chebi/2.0/webservice) is down (HTTP 500).
 * This module uses the OLS4 (Ontology Lookup Service) REST API instead,
 * which indexes the full ChEBI ontology and provides the same compound data.
 *
 * OLS4 endpoints:
 *   Search:  GET /ols4/api/search?q={query}&ontology=chebi&rows={max}
 *   Detail:  GET /ols4/api/ontologies/chebi/terms?obo_id=CHEBI:{id}
 */

// ─── Search ChEBI via OLS4 ──────────────────────────────────────────────────────

/**
 * Search ChEBI for compounds using the OLS4 search endpoint.
 * Results are re-ranked by checking if the query matches the label or
 * synonyms of each result (using normalized comparison) to avoid
 * returning unrelated compounds from OLS4's fuzzy text search.
 *
 * @param {string} query - Search term (name, formula, InChI, etc.)
 * @param {number} [maxResults=10] - Max results to fetch (more = better re-ranking)
 * @return {Object[]|null} Array of {chebiId, label, description}
 */
function chebi_searchOLS(query, maxResults) {
  maxResults = maxResults || 10;
  if (!query) return null;

  var url =
    API.CHEBI_OLS +
    "/search?q=" +
    encodeURIComponent(query) +
    "&ontology=chebi&rows=" +
    maxResults +
    "&exact=false";

  Logger.log("ChEBI OLS4 search: " + url);
  var data = httpGet(url);
  if (!data) {
    Logger.log("ChEBI OLS4 search returned null");
    return null;
  }

  var docs = data.response && data.response.docs ? data.response.docs : null;
  if (!docs || docs.length === 0) {
    Logger.log("ChEBI OLS4 search: no results for " + query);
    return null;
  }

  // Re-rank results: prefer hits where the query matches label or synonyms.
  // OLS4's fuzzy search often returns unrelated compounds for IUPAC names.
  var queryNorm = chebi_normalizeStr_(query);
  var ranked = [];
  var unranked = [];

  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var label = doc.label || "";
    var synonyms = (doc.related_synonyms || []).concat(
      doc.exact_synonyms || [],
    );

    if (chebi_matchesQuery_(queryNorm, label, synonyms)) {
      ranked.push(doc);
    } else {
      unranked.push(doc);
    }
  }

  // If we found validated matches, use those; otherwise use OLS4 ranking
  var sorted = ranked.length > 0 ? ranked.concat(unranked) : unranked;

  Logger.log(
    "ChEBI OLS4: " +
      docs.length +
      " results, " +
      ranked.length +
      " validated matches",
  );

  return sorted.map(function (doc) {
    return {
      chebiId: doc.obo_id || doc.short_form || null,
      label: doc.label || null,
      description:
        doc.description && doc.description.length > 0
          ? doc.description[0]
          : null,
      validated: ranked.indexOf(doc) !== -1,
    };
  });
}

// ─── Get Complete Entity via OLS4 ────────────────────────────────────────────────

/**
 * Retrieve complete compound info from ChEBI by ID using OLS4.
 *
 * @param {string} chebiId - ChEBI ID (e.g. "CHEBI:16716" or "16716")
 * @return {Object|null} Full compound data
 */
function chebi_getCompleteEntity(chebiId) {
  if (!chebiId) return null;

  // Ensure CHEBI: prefix
  var id = String(chebiId);
  if (id.indexOf("CHEBI:") !== 0) {
    id = "CHEBI:" + id;
  }

  var url =
    API.CHEBI_OLS + "/ontologies/chebi/terms?obo_id=" + encodeURIComponent(id);

  Logger.log("ChEBI OLS4 entity: " + url);
  var data = httpGet(url);
  if (!data) {
    Logger.log("ChEBI OLS4 entity returned null for " + id);
    return null;
  }

  // OLS4 returns { _embedded: { terms: [...] } }
  var terms =
    data._embedded && data._embedded.terms ? data._embedded.terms : null;
  if (!terms || terms.length === 0) {
    Logger.log("ChEBI OLS4: no term found for " + id);
    return null;
  }

  var term = terms[0];
  var ann = term.annotation || {};

  // Extract CAS from database_cross_reference annotations
  var cas = null;
  var dbXrefs = ann.database_cross_reference || [];
  for (var i = 0; i < dbXrefs.length; i++) {
    if (String(dbXrefs[i]).indexOf("cas:") === 0) {
      cas = dbXrefs[i].substring(4);
      break;
    }
  }

  // Extract synonyms (combine exact and related, deduplicate)
  var synonyms = [];
  var seen = {};
  var allSyns = term.synonyms || [];
  allSyns.forEach(function (s) {
    var lower = String(s).toLowerCase();
    if (!seen[lower]) {
      seen[lower] = true;
      synonyms.push(s);
    }
  });

  return {
    chebiId: term.obo_id || id,
    chebiAsciiName: term.label || null,
    definition:
      term.description && term.description.length > 0
        ? term.description[0]
        : null,
    smiles:
      ann.smiles_string && ann.smiles_string.length > 0
        ? ann.smiles_string[0]
        : null,
    inchi:
      ann.inchi_string && ann.inchi_string.length > 0
        ? ann.inchi_string[0]
        : null,
    inchiKey:
      ann.inchi_key_string && ann.inchi_key_string.length > 0
        ? ann.inchi_key_string[0]
        : null,
    charge: ann.charge && ann.charge.length > 0 ? String(ann.charge[0]) : null,
    mass: ann.mass && ann.mass.length > 0 ? String(ann.mass[0]) : null,
    monoisotopicMass:
      ann.monoisotopic_mass && ann.monoisotopic_mass.length > 0
        ? String(ann.monoisotopic_mass[0])
        : null,
    formulae: ann.generalized_empirical_formula || [],
    cas: cas,
    synonyms: synonyms,
    starRating:
      term.in_subset && term.in_subset.length > 0 ? term.in_subset[0] : null,
  };
}

// ─── Combined Search ────────────────────────────────────────────────────────────

/**
 * Full ChEBI search: search for hits via OLS4, then get entity details.
 *
 * @param {string} query - Search term
 * @param {string} [from='name'] - Identifier type
 * @return {Object|null} Formatted result
 */
function chebi_search(query, from) {
  from = from || "name";

  // When we already have a ChEBI ID, go directly to entity lookup.
  if (from === "chebi_id") {
    var directId = String(query);
    if (directId.indexOf("CHEBI:") !== 0) {
      directId = "CHEBI:" + directId;
    }
    var entity = chebi_getCompleteEntity(directId);
    if (!entity) return null;

    return formatChebiResult_(entity);
  }

  // Formula searches are not reliable via OLS4 text search.
  // OLS4 returns compounds ranked by text relevance, not by formula field match.
  // For C9H8O4, aspirin (CHEBI:15365) doesn't even appear in the top 30 results.
  // Return null rather than a misleading/random compound.
  if (from === "formula") {
    Logger.log(
      "ChEBI: formula search not supported — OLS4 text search cannot " +
        "reliably match compounds by molecular formula. Query: " +
        query,
    );
    return null;
  }

  // Search via OLS4 text search
  var hits = chebi_searchOLS(query, 10);
  if (!hits || hits.length === 0) return null;

  var bestHit = null;

  {
    // Prefer validated matches (where query matches label or synonyms).
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].validated) {
        bestHit = hits[i];
        break;
      }
    }

    if (!bestHit) {
      // No validated match — OLS4 results are likely unrelated to the query.
      // Return null rather than a misleading result.
      Logger.log(
        "ChEBI: no validated match for '" +
          query +
          "'. Top OLS4 hit was '" +
          hits[0].label +
          "' — skipping to avoid wrong result.",
      );
      return null;
    }
  }

  // Get full details for the best match
  var chebiId = bestHit.chebiId;
  var entity = chebi_getCompleteEntity(chebiId);
  if (!entity) return null;

  return formatChebiResult_(entity);
}

// ─── String Matching Helpers ─────────────────────────────────────────────────────

/**
 * Normalize a string for fuzzy comparison: lowercase, strip parentheses,
 * hyphens, spaces, and common punctuation.
 * @param {string} s
 * @return {string}
 * @private
 */
function chebi_normalizeStr_(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s\-\(\)\[\]\{\},;:\.]/g, "");
}

/**
 * Check if a search query matches a result's label or synonyms.
 * Uses normalized comparison so "2-acetyloxybenzoic acid" matches
 * "2-(acetyloxy)benzoic acid".
 *
 * @param {string} queryNorm - Normalized query string
 * @param {string} label - Result label
 * @param {string[]} synonyms - Result synonym list
 * @return {boolean}
 * @private
 */
function chebi_matchesQuery_(queryNorm, label, synonyms) {
  // Check label
  var labelNorm = chebi_normalizeStr_(label);
  if (
    labelNorm === queryNorm ||
    labelNorm.indexOf(queryNorm) !== -1 ||
    queryNorm.indexOf(labelNorm) !== -1
  ) {
    return true;
  }

  // Check each synonym
  for (var i = 0; i < synonyms.length; i++) {
    var synNorm = chebi_normalizeStr_(synonyms[i]);
    if (
      synNorm === queryNorm ||
      synNorm.indexOf(queryNorm) !== -1 ||
      queryNorm.indexOf(synNorm) !== -1
    ) {
      return true;
    }
  }

  return false;
}

// ─── Format Result ──────────────────────────────────────────────────────────────

/**
 * Format a ChEBI entity into a standardized result object.
 * @param {Object} entity - Raw entity from chebi_getCompleteEntity
 * @return {Object} Formatted result
 * @private
 */
function formatChebiResult_(entity) {
  return {
    source: "ChEBI",
    chebiId: entity.chebiId,
    name: entity.chebiAsciiName,
    definition: entity.definition,
    formula:
      entity.formulae && entity.formulae.length > 0 ? entity.formulae[0] : null,
    smiles: entity.smiles,
    inchi: entity.inchi,
    inchiKey: entity.inchiKey,
    charge: entity.charge,
    mass: entity.mass,
    monoisotopicMass: entity.monoisotopicMass,
    cas: entity.cas,
    synonyms: entity.synonyms || [],
    url: "https://www.ebi.ac.uk/chebi/searchId.do?chebiId=" + entity.chebiId,
  };
}
