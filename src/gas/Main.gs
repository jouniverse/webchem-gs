/**
 * webchem-gs: Chemistry Data App for Google Sheets
 * Main entry point — menu, sidebar launcher, triggers
 */

// ─── Menu & Sidebar ────────────────────────────────────────────────────────────

/**
 * Runs when the spreadsheet is opened. Creates the Chemistry Tools menu.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Chemistry Tools")
    .addItem("Open Sidebar", "showSidebar")
    .addSeparator()
    .addItem("Quick Lookup (selected cell)", "quickLookup")
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu("Periodic Table")
        .addItem("Insert Periodic Table", "insertPeriodicTableSheet"),
    )
    .addSubMenu(
      ui
        .createMenu("Chemistry Tables")
        .addItem("Ionization Constants of Weak Acids", "insertTable_WeakAcidKa")
        .addItem("Ionization Constants of Weak Bases", "insertTable_WeakBaseKb")
        .addItem("Solubility Products (Ksp)", "insertTable_SolubilityProducts")
        .addItem(
          "Formation Constants of Complex Ions",
          "insertTable_FormationConstants",
        )
        .addItem(
          "Standard Electrode Potentials (E°)",
          "insertTable_ElectrodePotentials",
        )
        .addItem("Half-Lives of Radioactive Isotopes", "insertTable_HalfLives")
        .addSeparator()
        .addItem(
          "Acidity Constants for Organic Compounds",
          "insertTable_OrganicAcidity",
        )
        .addItem(
          "Classification of Functional Groups",
          "insertTable_FunctionalGroups",
        )
        .addItem(
          "Composition of Commercial Acids & Bases",
          "insertTable_CommercialAcidsBases",
        )
        .addSeparator()
        .addItem(
          "Standard Thermodynamic Properties",
          "insertTable_ThermodynamicProperties",
        )
        .addItem(
          "Standard Thermodynamic Values (extended)",
          "insertTable_ThermodynamicValues",
        )
        .addSeparator()
        .addItem("Water Density", "insertTable_WaterDensity")
        .addItem("Water Kw and pKw", "insertTable_WaterKw")
        .addItem("Water Vapor Pressure", "insertTable_WaterVaporPressure")
        .addItem(
          "Water Melting & Boiling Points",
          "insertTable_WaterMeltingBoiling",
        )
        .addItem(
          "Specific Heat Capacity of Water",
          "insertTable_WaterSpecificHeat",
        ),
    )
    .addSeparator()
    .addItem("Settings", "showSettings")
    .addToUi();
}

/**
 * Opens the Chemistry Tools sidebar.
 */
function showSidebar() {
  var html = HtmlService.createTemplateFromFile("Sidebar")
    .evaluate()
    .setTitle("Chemistry Tools")
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Opens the Settings modal dialog.
 */
function showSettings() {
  var html = HtmlService.createHtmlOutputFromFile("SettingsDialog")
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, "Settings");
}

// ─── HTML Include Helper ────────────────────────────────────────────────────────

/**
 * Include an HTML file's content inside another HTML template.
 * Used as: <?!= include('Css') ?> inside .html files.
 * @param {string} filename - The name of the HTML file (without extension)
 * @return {string} The raw HTML content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── Quick Lookup ───────────────────────────────────────────────────────────────

/**
 * Quick lookup: reads the active cell value and opens the sidebar with a search.
 * The sidebar JS checks for a pending query on load.
 */
function quickLookup() {
  var cell = SpreadsheetApp.getActiveSpreadsheet().getActiveCell();
  var value = cell.getValue();
  if (!value || String(value).trim() === "") {
    SpreadsheetApp.getUi().alert(
      "Please select a cell with a chemical name or identifier.",
    );
    return;
  }
  // Store the query so the sidebar can pick it up
  PropertiesService.getUserProperties().setProperty(
    "pendingQuery",
    String(value).trim(),
  );
  showSidebar();
}

/**
 * Retrieve and clear any pending quick-lookup query.
 * Called by the sidebar JS on load.
 * @return {string|null} The pending query, or null
 */
function getPendingQuery() {
  var props = PropertiesService.getUserProperties();
  var query = props.getProperty("pendingQuery");
  if (query) {
    props.deleteProperty("pendingQuery");
  }
  return query;
}

// ─── Search Orchestrator ────────────────────────────────────────────────────────

/**
 * Run a search across selected sources. Called from the sidebar.
 * Uses CTS to resolve database-specific IDs for ChEMBL and ChEBI.
 *
 * @param {string} query - Search term
 * @param {string} idType - Identifier type ('auto', 'name', 'cas', etc.)
 * @param {string[]} sources - Array of source names to query
 * @return {Object[]} Array of result objects from each source
 */
function performSearch(query, idType, sources) {
  if (!query) return [];

  // Auto-detect identifier type if needed
  if (idType === "auto") {
    idType = detectIdentifierType(query);
  }

  var results = [];

  sources.forEach(function (src) {
    try {
      var result = null;
      switch (src) {
        case "pubchem":
          result = pubchem_search(query, mapIdTypeToPubChem_(idType));
          break;

        case "chembl":
          // If the query is already a ChEMBL ID, use it directly
          if (
            idType === "chembl_id" ||
            String(query).toUpperCase().indexOf("CHEMBL") === 0
          ) {
            result = chembl_search(query, "chembl_id");
          } else if (idType === "formula") {
            // CTS can't convert formula; try native text search
            result = chembl_search(query, "name");
          } else {
            // Resolve to a ChEMBL ID via CTS for reliable results
            var chemblId = resolveIdViaCTS(query, idType, "ChEMBL");
            if (chemblId) {
              result = chembl_search(chemblId, "chembl_id");
            }
            // If CTS returned nothing, OR CTS ID was invalid (lookup returned null),
            // fall back to native ChEMBL search by name
            if (!result) {
              result = chembl_search(query, mapIdTypeToChembl_(idType));
            }
          }
          break;

        case "chebi":
          // If the query is already a ChEBI ID, use it directly
          if (
            idType === "chebi_id" ||
            String(query).toUpperCase().indexOf("CHEBI:") === 0
          ) {
            result = chebi_search(query, "chebi_id");
          } else if (idType === "formula") {
            // CTS can't convert formula; try native ChEBI search
            result = chebi_search(query, "formula");
          } else {
            // Resolve to a ChEBI ID via CTS for reliable results
            var chebiId = resolveIdViaCTS(query, idType, "ChEBI");
            if (chebiId) {
              // Ensure CHEBI: prefix
              if (String(chebiId).indexOf("CHEBI:") !== 0) {
                chebiId = "CHEBI:" + chebiId;
              }
              result = chebi_search(chebiId, "chebi_id");
            }
            // If CTS returned nothing, OR CTS ID was invalid (lookup returned null),
            // fall back to native ChEBI search
            if (!result) {
              result = chebi_search(query, mapIdTypeToChebi_(idType));
            }
          }
          break;

        case "opsin":
          // OPSIN only works with names
          if (idType === "name" || idType === "auto") {
            result = opsin_search(query);
          }
          break;

        case "cas":
          result = cas_search(query);
          break;
      }
      if (result) results.push(result);
    } catch (e) {
      Logger.log("Search error for " + src + ": " + e.message);
    }
  });

  return results;
}

// ─── ID Type Mappers ────────────────────────────────────────────────────────────

function mapIdTypeToPubChem_(type) {
  var map = {
    name: "name",
    cas: "xref/rn",
    smiles: "smiles",
    inchi: "inchi",
    inchikey: "inchikey",
    formula: "formula",
    cid: "cid",
  };
  return map[type] || "name";
}

function mapIdTypeToChembl_(type) {
  var map = {
    name: "name",
    smiles: "smiles",
    inchikey: "inchikey",
  };
  return map[type] || "name";
}

function mapIdTypeToChebi_(type) {
  var map = {
    name: "name",
    smiles: "smiles",
    inchi: "inchi",
    inchikey: "inchikey",
    formula: "formula",
    mass: "mass",
  };
  return map[type] || "name";
}

// ─── Inject Search Result ────────────────────────────────────────────────────────

/**
 * Flatten a search result and inject it into the sheet.
 * Called from the sidebar "Insert to Sheet" button.
 *
 * @param {Object} result - Search result object from any source
 */
function injectSearchResult(result) {
  if (!result) return;

  var flat = {};
  flat["Source"] = result.source || "";

  if (result.source === "PubChem") {
    flat["CID"] = result.cid || "";
    if (result.cas) flat["CAS"] = result.cas;
    if (result.properties) {
      var p = result.properties;
      var propKeys = Object.keys(p);
      propKeys.forEach(function (k) {
        if (k !== "CID") flat[k] = p[k];
      });
    }
  } else if (result.source === "ChEMBL") {
    flat["ChEMBL ID"] = result.chemblId || "";
    flat["Name"] = result.name || "";
    flat["Formula"] = result.formula || "";
    flat["Mol. Weight"] = result.molecularWeight || "";
    flat["SMILES"] = result.smiles || "";
    flat["InChIKey"] = result.stdInchiKey || "";
    flat["Max Phase"] = result.maxPhase || "";
    flat["Molecule Type"] = result.moleculeType || "";
  } else if (result.source === "ChEBI") {
    flat["ChEBI ID"] = result.chebiId || "";
    flat["Name"] = result.name || "";
    flat["Formula"] = result.formula || "";
    flat["Mass"] = result.mass || "";
    flat["SMILES"] = result.smiles || "";
    flat["InChIKey"] = result.inchiKey || "";
    if (result.cas) flat["CAS"] = result.cas;
  } else if (result.source === "OPSIN") {
    flat["Name"] = result.name || "";
    flat["SMILES"] = result.smiles || "";
    flat["InChI"] = result.stdinchi || "";
    flat["InChIKey"] = result.stdinchikey || "";
  } else if (result.source === "CAS") {
    flat["CAS RN"] = result.cas || "";
    flat["Name"] = result.name || "";
    flat["Formula"] = result.formula || "";
    flat["Mol. Mass"] = result.molecularMass || "";
    flat["SMILES"] = result.smiles || "";
    flat["InChI"] = result.inchi || "";
    flat["InChIKey"] = result.inchiKey || "";
    if (result.boilingPoint) flat["Boiling Point"] = result.boilingPoint;
    if (result.meltingPoint) flat["Melting Point"] = result.meltingPoint;
    if (result.density) flat["Density"] = result.density;
  }

  if (result.url) flat["URL"] = result.url;

  injectCompoundData(flat);
}

/**
 * Insert a single value into the active cell.
 * Used by the Convert tab.
 *
 * @param {string} value - The value to insert
 */
function insertValueToActiveCell(value) {
  var cell = SpreadsheetApp.getActiveSpreadsheet().getActiveCell();
  cell.setValue(value);
}
