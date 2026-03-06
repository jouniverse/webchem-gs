/**
 * webchem-gs: Periodic Table Module
 * Loads element data from embedded JSON, provides lookup and sheet insertion.
 */

// ─── Periodic Table Layout ───────────────────────────────────────────────────────
// Standard 18-column layout. Each entry: [row, col, atomicNumber]
// Lanthanides (57-71) in row 9, Actinides (89-103) in row 10.

var PT_LAYOUT_ = [
  // Period 1
  [1, 1, 1],
  [1, 18, 2],
  // Period 2
  [2, 1, 3],
  [2, 2, 4],
  [2, 13, 5],
  [2, 14, 6],
  [2, 15, 7],
  [2, 16, 8],
  [2, 17, 9],
  [2, 18, 10],
  // Period 3
  [3, 1, 11],
  [3, 2, 12],
  [3, 13, 13],
  [3, 14, 14],
  [3, 15, 15],
  [3, 16, 16],
  [3, 17, 17],
  [3, 18, 18],
  // Period 4
  [4, 1, 19],
  [4, 2, 20],
  [4, 3, 21],
  [4, 4, 22],
  [4, 5, 23],
  [4, 6, 24],
  [4, 7, 25],
  [4, 8, 26],
  [4, 9, 27],
  [4, 10, 28],
  [4, 11, 29],
  [4, 12, 30],
  [4, 13, 31],
  [4, 14, 32],
  [4, 15, 33],
  [4, 16, 34],
  [4, 17, 35],
  [4, 18, 36],
  // Period 5
  [5, 1, 37],
  [5, 2, 38],
  [5, 3, 39],
  [5, 4, 40],
  [5, 5, 41],
  [5, 6, 42],
  [5, 7, 43],
  [5, 8, 44],
  [5, 9, 45],
  [5, 10, 46],
  [5, 11, 47],
  [5, 12, 48],
  [5, 13, 49],
  [5, 14, 50],
  [5, 15, 51],
  [5, 16, 52],
  [5, 17, 53],
  [5, 18, 54],
  // Period 6
  [6, 1, 55],
  [6, 2, 56],
  [6, 3, 71],
  [6, 4, 72],
  [6, 5, 73],
  [6, 6, 74],
  [6, 7, 75],
  [6, 8, 76],
  [6, 9, 77],
  [6, 10, 78],
  [6, 11, 79],
  [6, 12, 80],
  [6, 13, 81],
  [6, 14, 82],
  [6, 15, 83],
  [6, 16, 84],
  [6, 17, 85],
  [6, 18, 86],
  // Period 7
  [7, 1, 87],
  [7, 2, 88],
  [7, 3, 103],
  [7, 4, 104],
  [7, 5, 105],
  [7, 6, 106],
  [7, 7, 107],
  [7, 8, 108],
  [7, 9, 109],
  [7, 10, 110],
  [7, 11, 111],
  [7, 12, 112],
  [7, 13, 113],
  [7, 14, 114],
  [7, 15, 115],
  [7, 16, 116],
  [7, 17, 117],
  [7, 18, 118],
  // Lanthanides (row 9, cols 3-17)
  [9, 3, 57],
  [9, 4, 58],
  [9, 5, 59],
  [9, 6, 60],
  [9, 7, 61],
  [9, 8, 62],
  [9, 9, 63],
  [9, 10, 64],
  [9, 11, 65],
  [9, 12, 66],
  [9, 13, 67],
  [9, 14, 68],
  [9, 15, 69],
  [9, 16, 70],
  // Actinides (row 10, cols 3-17)
  [10, 3, 89],
  [10, 4, 90],
  [10, 5, 91],
  [10, 6, 92],
  [10, 7, 93],
  [10, 8, 94],
  [10, 9, 95],
  [10, 10, 96],
  [10, 11, 97],
  [10, 12, 98],
  [10, 13, 99],
  [10, 14, 100],
  [10, 15, 101],
  [10, 16, 102],
];

// Group block → background color mapping
var GROUP_COLORS_ = {
  Nonmetal: "#A8E6CF",
  "Noble gas": "#DCD3FF",
  "Alkali metal": "#FFB3BA",
  "Alkaline earth metal": "#FFDEAD",
  Metalloid: "#B6D7A8",
  Halogen: "#FFFFBA",
  Metal: "#D5D5D5",
  "Transition metal": "#FFD8B1",
  "Post-transition metal": "#B4C7E7",
  Lanthanide: "#FFCCF9",
  Actinide: "#E8CCD7",
};

// Hardcoded column names matching PubChem CSV
var PT_COLUMNS_ = [
  "AtomicNumber",
  "Symbol",
  "Name",
  "AtomicMass",
  "CPKHexColor",
  "ElectronConfiguration",
  "Electronegativity",
  "AtomicRadius",
  "IonizationEnergy",
  "ElectronAffinity",
  "OxidationStates",
  "StandardState",
  "MeltingPoint",
  "BoilingPoint",
  "Density",
  "GroupBlock",
  "YearDiscovered",
];

// ─── Load Element Data ───────────────────────────────────────────────────────────

/**
 * Parse the embedded PubChem elements JSON.
 * @return {Object[]} Array of element objects
 */
function getElementsData_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("periodic_table_elements");
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      // Validate cached data: must be a non-empty array of elements
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      Logger.log("PT cache: invalid or empty — reloading from source");
    } catch (e) {
      Logger.log("PT cache: parse error — reloading from source");
    }
  }

  // Read from project bundled data
  var json = getPeriodicTableJson_();
  var table = JSON.parse(json);

  var columns = table.Table.Columns.Column;
  var rows = table.Table.Row;

  var elements = rows.map(function (row) {
    var obj = {};
    for (var i = 0; i < columns.length; i++) {
      obj[columns[i]] = row.Cell[i] || "";
    }
    // Parse numeric fields
    obj.AtomicNumber = parseInt(obj.AtomicNumber, 10);
    obj.AtomicMass = parseFloat(obj.AtomicMass) || 0;
    obj.Electronegativity = parseFloat(obj.Electronegativity) || null;
    obj.AtomicRadius = parseFloat(obj.AtomicRadius) || null;
    obj.IonizationEnergy = parseFloat(obj.IonizationEnergy) || null;
    obj.ElectronAffinity = parseFloat(obj.ElectronAffinity) || null;
    obj.MeltingPoint = parseFloat(obj.MeltingPoint) || null;
    obj.BoilingPoint = parseFloat(obj.BoilingPoint) || null;
    obj.Density = parseFloat(obj.Density) || null;
    return obj;
  });

  // Cache for 6 hours
  try {
    cache.put("periodic_table_elements", JSON.stringify(elements), 21600);
  } catch (e) {
    // Too large for cache — that's fine, it'll just reload each time
  }

  return elements;
}

/**
 * Look up a single element by atomic number, symbol, or name.
 *
 * @param {string|number} query - Atomic number, symbol, or name
 * @return {Object|null} Element data
 */
function lookupElement(query) {
  if (!query) return null;
  var elements = getElementsData_();
  var q = String(query).trim().toLowerCase();
  var qNum = parseInt(q, 10);

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (el.AtomicNumber === qNum) return el;
    if (el.Symbol.toLowerCase() === q) return el;
    if (el.Name.toLowerCase() === q) return el;
  }
  return null;
}

// ─── Periodic Table for Sidebar ─────────────────────────────────────────────────

/**
 * Return periodic table data for the sidebar UI.
 *
 * @return {Object} { elements: [...], layout: [...], colors: {...} }
 */
function getPeriodicTableData() {
  var elements = getElementsData_();

  // Build a map by atomic number for quick lookup
  var byNumber = {};
  elements.forEach(function (el) {
    byNumber[el.AtomicNumber] = {
      n: el.AtomicNumber,
      s: el.Symbol,
      name: el.Name,
      mass: el.AtomicMass,
      group: el.GroupBlock,
      color: GROUP_COLORS_[el.GroupBlock] || "#E0E0E0",
    };
  });

  return {
    elements: byNumber,
    layout: PT_LAYOUT_,
    colors: GROUP_COLORS_,
  };
}

/**
 * Return full details for an element (for the sidebar popup).
 *
 * @param {number} atomicNumber - Atomic number
 * @return {Object|null} Full element data
 */
function getElementDetails(atomicNumber) {
  var elements = getElementsData_();
  for (var i = 0; i < elements.length; i++) {
    if (elements[i].AtomicNumber === atomicNumber) return elements[i];
  }
  return null;
}

// ─── Insert Periodic Table Sheet ─────────────────────────────────────────────────

/**
 * Create a simple periodic table data sheet.
 * Outputs a flat table with hardcoded column headers and one row per element.
 */
function buildPeriodicTableSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Delete existing PT sheet if present
  var existing = ss.getSheetByName("Periodic Table");
  if (existing) ss.deleteSheet(existing);

  var sheet = ss.insertSheet("Periodic Table");
  var elements = getElementsData_();

  // Header row
  sheet
    .getRange(1, 1, 1, PT_COLUMNS_.length)
    .setValues([PT_COLUMNS_])
    .setFontWeight("bold")
    .setBackground("#e8f0fe");

  // Data rows
  if (elements.length > 0) {
    var rows = elements.map(function (el) {
      return PT_COLUMNS_.map(function (col) {
        var val = el[col];
        return val !== null && val !== undefined ? val : "";
      });
    });
    sheet.getRange(2, 1, rows.length, PT_COLUMNS_.length).setValues(rows);
  }

  // Auto-resize columns and freeze header
  for (var c = 1; c <= PT_COLUMNS_.length; c++) {
    sheet.autoResizeColumn(c);
  }
  sheet.setFrozenRows(1);

  SpreadsheetApp.setActiveSheet(sheet);
  return true;
}

// ─── Periodic Table JSON Storage ─────────────────────────────────────────────────

/**
 * Store periodic table JSON in ScriptProperties.
 * Run this once to initialize the data, e.g.:
 *   setPeriodicTableJson(JSON.stringify(pubchemElementsAll))
 *
 * Note: ScriptProperties has a 9KB per-value limit, so we chunk if needed.
 *
 * @param {string} json - The full PubChem elements JSON string
 */
function setPeriodicTableJson(json) {
  var props = PropertiesService.getScriptProperties();
  // ScriptProperties max value = 9KB. JSON is ~40KB, so we chunck.
  var chunkSize = 8000;
  var chunks = [];
  for (var i = 0; i < json.length; i += chunkSize) {
    chunks.push(json.substring(i, i + chunkSize));
  }

  props.setProperty("PERIODIC_TABLE_CHUNKS", String(chunks.length));
  for (var c = 0; c < chunks.length; c++) {
    props.setProperty("PERIODIC_TABLE_CHUNK_" + c, chunks[c]);
  }
  props.deleteProperty("PERIODIC_TABLE_JSON"); // Clear single-key version

  Logger.log("Stored periodic table in " + chunks.length + " chunks.");
}

/**
 * Get the periodic table JSON string from ScriptProperties.
 * Supports chunked storage for large JSON (>9KB limit per property).
 *
 * @return {string} JSON string
 */
function getPeriodicTableJson_() {
  // 1. Try bundled data first (most reliable — embedded in PeriodicTableData.gs)
  if (typeof PERIODIC_TABLE_JSON_ !== "undefined" && PERIODIC_TABLE_JSON_) {
    try {
      var test = JSON.parse(PERIODIC_TABLE_JSON_);
      if (test.Table && test.Table.Row && test.Table.Row.length > 0) {
        return PERIODIC_TABLE_JSON_;
      }
    } catch (e) {
      Logger.log("PT bundled data: parse error");
    }
  }

  // 2. Try ScriptProperties (chunked storage)
  var props = PropertiesService.getScriptProperties();
  var nChunks = parseInt(props.getProperty("PERIODIC_TABLE_CHUNKS") || "0", 10);
  if (nChunks > 0) {
    var parts = [];
    for (var i = 0; i < nChunks; i++) {
      parts.push(props.getProperty("PERIODIC_TABLE_CHUNK_" + i) || "");
    }
    var assembled = parts.join("");
    try {
      var test2 = JSON.parse(assembled);
      if (test2.Table && test2.Table.Row && test2.Table.Row.length > 0) {
        return assembled;
      }
    } catch (e) {
      Logger.log("PT ScriptProperties chunked data: invalid — skipping");
    }
  }

  // 3. Try ScriptProperties (single key)
  var json = props.getProperty("PERIODIC_TABLE_JSON");
  if (json) {
    try {
      var test3 = JSON.parse(json);
      if (test3.Table && test3.Table.Row && test3.Table.Row.length > 0) {
        return json;
      }
    } catch (e) {
      Logger.log("PT ScriptProperties single key: invalid — skipping");
    }
  }

  // 4. Return empty (should never reach here if PeriodicTableData.gs is deployed)
  Logger.log("PT: no valid data source found");
  return '{"Table":{"Columns":{"Column":[]},"Row":[]}}';
}

/**
 * Initialize periodic table data from the 'ElementData' sheet.
 * Run this function once after importing the PubChem CSV.
 */
function initPeriodicTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("ElementData");
  if (!sheet) {
    throw new Error(
      "No 'ElementData' sheet found. Please import the PubChem CSV data first.",
    );
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    throw new Error("ElementData sheet appears to be empty.");
  }

  // Clean column names: trim whitespace, remove surrounding quotes
  var columns = data[0].map(function (col) {
    return String(col)
      .trim()
      .replace(/^["']|["']$/g, "");
  });

  var rows = [];
  for (var r = 1; r < data.length; r++) {
    rows.push({
      Cell: data[r].map(function (v) {
        return String(v);
      }),
    });
  }

  var json = JSON.stringify({
    Table: {
      Columns: { Column: columns },
      Row: rows,
    },
  });

  setPeriodicTableJson(json);

  // Clear the script cache so the next read picks up fresh data
  try {
    CacheService.getScriptCache().remove("periodic_table_elements");
  } catch (e) {
    // Ignore cache errors
  }

  Logger.log(
    "Periodic table initialized from ElementData sheet (" +
      (data.length - 1) +
      " elements). Cache cleared.",
  );
  return true;
}
