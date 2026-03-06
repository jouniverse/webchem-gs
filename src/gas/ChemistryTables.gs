/**
 * webchem-gs: Chemistry Tables
 * Injects reference chemistry data tables into new named sheets.
 */

// ─── Table Registry ─────────────────────────────────────────────────────────────
// Each entry: { id, sheetName, menuLabel, dataFn }

var CHEM_TABLES_ = [
  {
    id: "weak-acid-ka",
    sheetName: "Weak Acid Ka",
    menuLabel: "Ionization Constants of Weak Acids",
    dataFn: "getWeakAcidKaData_",
  },
  {
    id: "weak-base-kb",
    sheetName: "Weak Base Kb",
    menuLabel: "Ionization Constants of Weak Bases",
    dataFn: "getWeakBaseKbData_",
  },
  {
    id: "solubility-products",
    sheetName: "Solubility Products",
    menuLabel: "Solubility Products (Ksp)",
    dataFn: "getSolubilityProductsData_",
  },
  {
    id: "formation-constants",
    sheetName: "Formation Constants",
    menuLabel: "Formation Constants of Complex Ions",
    dataFn: "getFormationConstantsData_",
  },
  {
    id: "electrode-potentials",
    sheetName: "Electrode Potentials",
    menuLabel: "Standard Electrode Potentials (E°)",
    dataFn: "getElectrodePotentialsData_",
  },
  {
    id: "half-lives",
    sheetName: "Radioactive Half-Lives",
    menuLabel: "Half-Lives of Radioactive Isotopes",
    dataFn: "getRadioactiveHalfLivesData_",
  },
  {
    id: "functional-groups",
    sheetName: "Functional Groups",
    menuLabel: "Classification of Functional Groups",
    dataFn: "getFunctionalGroupsData_",
  },
  {
    id: "organic-acidity",
    sheetName: "Organic pKa",
    menuLabel: "Acidity Constants for Organic Compounds",
    dataFn: "getOrganicAcidityData_",
  },
  {
    id: "commercial-acids-bases",
    sheetName: "Commercial Acids & Bases",
    menuLabel: "Composition of Commercial Acids & Bases",
    dataFn: "getCommercialAcidsBasesData_",
  },
  {
    id: "thermo-properties",
    sheetName: "Thermodynamic Properties",
    menuLabel: "Standard Thermodynamic Properties",
    dataFn: "getThermodynamicPropertiesData_",
  },
  {
    id: "thermo-values",
    sheetName: "Thermodynamic Values",
    menuLabel: "Standard Thermodynamic Values (extended)",
    dataFn: "getThermodynamicValuesData_",
  },
  {
    id: "water-density",
    sheetName: "Water Density",
    menuLabel: "Water Density at Different Temperatures",
    dataFn: "getWaterDensityData_",
  },
  {
    id: "water-kw",
    sheetName: "Water Kw & pKw",
    menuLabel: "Water Kw and pKw at Different Temperatures",
    dataFn: "getWaterKwData_",
  },
  {
    id: "water-vapor-pressure",
    sheetName: "Water Vapor Pressure",
    menuLabel: "Water Vapor Pressure at Different Temperatures",
    dataFn: "getWaterVaporPressureData_",
  },
  {
    id: "water-melting-boiling",
    sheetName: "Water Phase Transitions",
    menuLabel: "Water Melting & Boiling Points",
    dataFn: "getWaterMeltingBoilingData_",
  },
  {
    id: "water-specific-heat",
    sheetName: "Water Specific Heat",
    menuLabel: "Specific Heat Capacity of Water",
    dataFn: "getWaterSpecificHeatData_",
  },
];

// ─── Generic Injection ──────────────────────────────────────────────────────────

/**
 * Insert a chemistry table as a new named sheet.
 * If a sheet with the same name already exists, activate it and alert the user.
 *
 * @param {string} tableId - The table ID from CHEM_TABLES_
 */
function insertChemistryTable_(tableId) {
  var entry = null;
  for (var i = 0; i < CHEM_TABLES_.length; i++) {
    if (CHEM_TABLES_[i].id === tableId) {
      entry = CHEM_TABLES_[i];
      break;
    }
  }
  if (!entry) {
    SpreadsheetApp.getUi().alert("Unknown table: " + tableId);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check for existing sheet
  var existing = ss.getSheetByName(entry.sheetName);
  if (existing) {
    ss.setActiveSheet(existing);
    SpreadsheetApp.getUi().alert(
      'A "' + entry.sheetName + '" sheet already exists.',
    );
    return;
  }

  // Get data — resolve function name from global scope
  var DATA_FN_MAP_ = {
    getWeakAcidKaData_: getWeakAcidKaData_,
    getWeakBaseKbData_: getWeakBaseKbData_,
    getSolubilityProductsData_: getSolubilityProductsData_,
    getFormationConstantsData_: getFormationConstantsData_,
    getElectrodePotentialsData_: getElectrodePotentialsData_,
    getRadioactiveHalfLivesData_: getRadioactiveHalfLivesData_,
    getFunctionalGroupsData_: getFunctionalGroupsData_,
    getOrganicAcidityData_: getOrganicAcidityData_,
    getCommercialAcidsBasesData_: getCommercialAcidsBasesData_,
    getThermodynamicPropertiesData_: getThermodynamicPropertiesData_,
    getThermodynamicValuesData_: getThermodynamicValuesData_,
    getWaterDensityData_: getWaterDensityData_,
    getWaterKwData_: getWaterKwData_,
    getWaterVaporPressureData_: getWaterVaporPressureData_,
    getWaterMeltingBoilingData_: getWaterMeltingBoilingData_,
    getWaterSpecificHeatData_: getWaterSpecificHeatData_,
  };
  var dataFn = DATA_FN_MAP_[entry.dataFn];
  if (typeof dataFn !== "function") {
    SpreadsheetApp.getUi().alert("Data function not found: " + entry.dataFn);
    return;
  }
  var rows = dataFn();
  if (!rows || rows.length === 0) {
    SpreadsheetApp.getUi().alert("No data available for this table.");
    return;
  }

  // Create sheet
  var sheet = ss.insertSheet(entry.sheetName);
  var nCols = rows[0].length;
  var nRows = rows.length;

  // Write all data
  sheet.getRange(1, 1, nRows, nCols).setValues(rows);

  // Style header row
  var headerRange = sheet.getRange(1, 1, 1, nCols);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#e8f0fe");
  headerRange.setWrap(true);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Auto-resize columns
  for (var c = 1; c <= nCols; c++) {
    sheet.autoResizeColumn(c);
  }

  // Add filter
  if (nRows > 2) {
    sheet.getRange(1, 1, nRows, nCols).createFilter();
  }

  // Activate the new sheet
  ss.setActiveSheet(sheet);
}

// ─── Menu-callable Functions (one per table) ────────────────────────────────────
// Apps Script menu items require named top-level functions.

function insertTable_WeakAcidKa() {
  insertChemistryTable_("weak-acid-ka");
}
function insertTable_WeakBaseKb() {
  insertChemistryTable_("weak-base-kb");
}
function insertTable_SolubilityProducts() {
  insertChemistryTable_("solubility-products");
}
function insertTable_FormationConstants() {
  insertChemistryTable_("formation-constants");
}
function insertTable_ElectrodePotentials() {
  insertChemistryTable_("electrode-potentials");
}
function insertTable_HalfLives() {
  insertChemistryTable_("half-lives");
}
function insertTable_FunctionalGroups() {
  insertChemistryTable_("functional-groups");
}
function insertTable_OrganicAcidity() {
  insertChemistryTable_("organic-acidity");
}
function insertTable_CommercialAcidsBases() {
  insertChemistryTable_("commercial-acids-bases");
}
function insertTable_ThermodynamicProperties() {
  insertChemistryTable_("thermo-properties");
}
function insertTable_ThermodynamicValues() {
  insertChemistryTable_("thermo-values");
}
function insertTable_WaterDensity() {
  insertChemistryTable_("water-density");
}
function insertTable_WaterKw() {
  insertChemistryTable_("water-kw");
}
function insertTable_WaterVaporPressure() {
  insertChemistryTable_("water-vapor-pressure");
}
function insertTable_WaterMeltingBoiling() {
  insertChemistryTable_("water-melting-boiling");
}
function insertTable_WaterSpecificHeat() {
  insertChemistryTable_("water-specific-heat");
}
