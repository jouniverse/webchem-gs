/**
 * webchem-gs: Configuration & Constants
 * API endpoints, property keys, defaults
 */

// ─── API Base URLs ──────────────────────────────────────────────────────────────

var API = {
  PUBCHEM_PUG: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
  PUBCHEM_VIEW: "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view",
  PUBCHEM_IMG: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/",

  CHEMSPIDER: "https://api.rsc.org/compounds/v1",

  CHEMBL: "https://www.ebi.ac.uk/chembl/api/data",

  CHEBI_OLS: "https://www.ebi.ac.uk/ols4/api",

  OPSIN: "https://opsin.ch.cam.ac.uk/opsin",

  CIR: "https://cactus.nci.nih.gov/chemical/structure",

  CTS: "https://cts.fiehnlab.ucdavis.edu",

  CAS: "https://commonchemistry.cas.org/api",

  SRS: "https://cdxapps.epa.gov/oms-substance-registry-services/rest-api",

  COCONUT: "https://coconut.naturalproducts.net/api",

  // Research / Literature
  OPENALEX: "https://api.openalex.org",
  SPRINGER_META: "https://api.springernature.com/meta/v2/json",
  PMC_EUTILS: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
  CROSSREF: "https://api.crossref.org",
  ZENODO: "https://zenodo.org/api",
};

// ─── Script Property Keys ───────────────────────────────────────────────────────

var PROP_KEYS = {
  RSC_API_KEY: "RSC_API_KEY",
  CAS_API_KEY: "CAS_API_KEY",
  GEMINI_API_KEY: "GEMINI_API_KEY",
  COCONUT_API_KEY: "COCONUT_API_KEY",
  OPENALEX_API_KEY: "OPENALEX_API_KEY",
  META_API_KEY: "META_API_KEY",
  OA_API_KEY: "OA_API_KEY",
  ZENODO_API_KEY: "ZENODO_API_KEY",
};

// ─── Default PubChem Properties ─────────────────────────────────────────────────

var PUBCHEM_DEFAULT_PROPERTIES = [
  "MolecularFormula",
  "MolecularWeight",
  "CanonicalSMILES",
  "IsomericSMILES",
  "InChI",
  "InChIKey",
  "IUPACName",
  "Title",
  "XLogP",
  "ExactMass",
  "MonoisotopicMass",
  "TPSA",
  "Complexity",
  "Charge",
  "HBondDonorCount",
  "HBondAcceptorCount",
  "RotatableBondCount",
  "HeavyAtomCount",
  "CovalentUnitCount",
];

// ─── ChemSpider Fields ──────────────────────────────────────────────────────────

var CHEMSPIDER_DEFAULT_FIELDS = [
  "SMILES",
  "Formula",
  "InChI",
  "InChIKey",
  "StdInChI",
  "StdInChIKey",
  "AverageMass",
  "MolecularWeight",
  "MonoisotopicMass",
  "NominalMass",
  "CommonName",
];

// ─── Rate Limit Delays (ms) ────────────────────────────────────────────────────

var RATE_LIMIT = {
  API: 200,
  SCRAPE: 300,
  CIR: 1000, // CIR enforces 1 req/sec
};

// ─── Cache TTL (seconds) ────────────────────────────────────────────────────────

var CACHE_TTL = 21600; // 6 hours

// ─── Helper: Get ChemSpider API Key ─────────────────────────────────────────────

/**
 * Retrieve the ChemSpider API key from Script Properties.
 * @return {string|null} The API key, or null if not set
 */
function getChemSpiderApiKey() {
  return PropertiesService.getScriptProperties().getProperty(
    PROP_KEYS.RSC_API_KEY,
  );
}

/**
 * Save the ChemSpider API key to Script Properties.
 * @param {string} key - The API key to save
 */
function saveChemSpiderApiKey(key) {
  PropertiesService.getScriptProperties().setProperty(
    PROP_KEYS.RSC_API_KEY,
    key,
  );
}

/**
 * Check if ChemSpider API key is configured.
 * @return {boolean}
 */
function hasChemSpiderApiKey() {
  var key = getChemSpiderApiKey();
  return key !== null && key !== "";
}

// ─── Generic API Key Helpers ────────────────────────────────────────────────────

/**
 * Retrieve all configurable Research-tab API keys (for Settings dialog).
 * @return {Object} key-value map of current keys (values masked)
 */
function getResearchApiKeys() {
  var props = PropertiesService.getScriptProperties();
  var keys = [
    "META_API_KEY",
    "ZENODO_API_KEY",
    "GEMINI_API_KEY",
    "COCONUT_API_KEY",
  ];
  var result = {};
  keys.forEach(function (k) {
    var v = props.getProperty(k);
    result[k] = v ? "••••" + v.slice(-4) : "";
  });
  return result;
}

/**
 * Save an API key to Script Properties.
 * @param {string} propKey - Property name (e.g. "META_API_KEY")
 * @param {string} value  - Key value (empty string to clear)
 */
function saveApiKey(propKey, value) {
  var allowed = [
    "META_API_KEY",
    "ZENODO_API_KEY",
    "GEMINI_API_KEY",
    "COCONUT_API_KEY",
  ];
  if (allowed.indexOf(propKey) === -1) {
    throw new Error("Unknown API key: " + propKey);
  }
  var props = PropertiesService.getScriptProperties();
  if (value) {
    props.setProperty(propKey, value.trim());
  } else {
    props.deleteProperty(propKey);
  }
}
