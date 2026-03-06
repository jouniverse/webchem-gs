/**
 * webchem-gs: ChEMBL Module
 * REST API integration — no auth required.
 * Adapted from webchem R package chembl.R
 */

// ─── Search Molecule ────────────────────────────────────────────────────────────

/**
 * Search ChEMBL for a molecule by name, ChEMBL ID, or other identifiers.
 *
 * For name searches, tries exact pref_name match first for accuracy,
 * then falls back to full-text search.
 *
 * @param {string} query - Search term (name, ChEMBL ID like 'CHEMBL25', etc.)
 * @param {string} [from='name'] - Identifier type: 'name', 'chembl_id', 'smiles', 'inchikey'
 * @return {Object|null} Molecule data, or null
 */
function chembl_search(query, from) {
  from = from || "name";
  if (!query) return null;

  // EBI APIs require explicit Accept header to return JSON reliably
  var headers = { Accept: "application/json" };

  var url;
  if (from === "chembl_id" || query.toUpperCase().indexOf("CHEMBL") === 0) {
    // Direct lookup by ChEMBL ID
    url = API.CHEMBL + "/molecule/" + encodeURIComponent(query) + ".json";
  } else if (from === "smiles") {
    // Search by SMILES — use similarity search (70% threshold) for flexible matching
    url = API.CHEMBL + "/similarity/" + encodeURIComponent(query) + "/70.json";
  } else if (from === "inchikey") {
    // Search by InChIKey — standard_inchi_key filter
    url =
      API.CHEMBL +
      "/molecule.json?molecule_structures__standard_inchi_key=" +
      encodeURIComponent(query);
  } else {
    // Search by name — try exact pref_name match first for accuracy.
    // The full-text search endpoint can return unrelated molecules with
    // matching substrings; the exact filter returns the right compound.
    url =
      API.CHEMBL +
      "/molecule.json?pref_name__iexact=" +
      encodeURIComponent(query);
    Logger.log("ChEMBL exact name search: " + url);
    var exactData = httpGet(url, headers);
    if (exactData && exactData.molecules && exactData.molecules.length > 0) {
      Logger.log(
        "ChEMBL exact match found: " +
          exactData.molecules[0].molecule_chembl_id,
      );
      return formatChemblResult_(exactData.molecules[0]);
    }

    // Exact match failed — fall back to full-text search
    Logger.log("ChEMBL exact match miss, falling back to full-text search");
    url = API.CHEMBL + "/molecule/search.json?q=" + encodeURIComponent(query);
  }

  Logger.log("ChEMBL search: " + url);
  var data = httpGet(url, headers);
  if (!data) {
    Logger.log("ChEMBL search returned null for: " + url);
    return null;
  }

  var molecule = null;

  // Direct molecule lookup returns the molecule object directly
  if (data.molecule_chembl_id) {
    molecule = data;
  }
  // Search results come in a 'molecules' array
  else if (data.molecules && data.molecules.length > 0) {
    molecule = data.molecules[0];
  }

  if (!molecule) return null;

  return formatChemblResult_(molecule);
}

// ─── Format Result ──────────────────────────────────────────────────────────────

/**
 * Format a raw ChEMBL molecule object into a standardized result.
 * @param {Object} mol - Raw ChEMBL molecule object
 * @return {Object} Formatted result
 * @private
 */
function formatChemblResult_(mol) {
  var structures = mol.molecule_structures || {};
  var properties = mol.molecule_properties || {};

  return {
    source: "ChEMBL",
    chemblId: mol.molecule_chembl_id || null,
    name: mol.pref_name || mol.molecule_chembl_id || null,
    moleculeType: mol.molecule_type || null,
    maxPhase: mol.max_phase || null, // Drug development phase (4 = approved)
    oral: mol.oral || false,
    parenteral: mol.parenteral || false,
    topical: mol.topical || false,
    therapeuticFlag: mol.therapeutic_flag || false,
    naturalProduct: mol.natural_product || null,

    // Structures
    smiles: structures.canonical_smiles || null,
    stdInchi: structures.standard_inchi || null,
    stdInchiKey: structures.standard_inchi_key || null,

    // Properties
    formula: properties.full_molformula || null,
    molecularWeight: properties.full_mwt || null,
    alogp: properties.alogp || null,
    psa: properties.psa || null,
    hba: properties.hba || null,
    hbd: properties.hbd || null,
    numRo5Violations: properties.num_ro5_violations || null,
    rotatableBonds: properties.rtb || null,
    aromaticRings: properties.aromatic_rings || null,
    heavyAtoms: properties.heavy_atoms || null,
    qedWeighted: properties.qed_weighted || null,

    url:
      "https://www.ebi.ac.uk/chembl/compound_report_card/" +
      (mol.molecule_chembl_id || ""),
  };
}
