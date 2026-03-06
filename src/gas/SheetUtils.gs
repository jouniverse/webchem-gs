/**
 * webchem-gs: Sheet Utilities
 * Functions for injecting chemical data into the active Google Sheet.
 */

// ─── Inject Single Compound ─────────────────────────────────────────────────────

/**
 * Write compound data as columns: property names in col A, values in col B,
 * starting at the active cell position.
 * @param {Object} data - Key-value pairs of compound properties
 */
function injectCompoundData(data) {
  if (!data || typeof data !== "object") return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();
  var startRow = cell.getRow();
  var startCol = cell.getColumn();

  var keys = Object.keys(data);
  if (keys.length === 0) return;

  var values = keys.map(function (k) {
    return data[k] !== null && data[k] !== undefined ? data[k] : "";
  });

  // Build 2D array: each row is [property, value]
  var rows = keys.map(function (k, i) {
    return [k, values[i]];
  });

  // Write property names column + values column
  var range = sheet.getRange(startRow, startCol, rows.length, 2);
  range.setValues(rows);

  // Style the property names column (bold, light blue background)
  var headerCol = sheet.getRange(startRow, startCol, rows.length, 1);
  headerCol.setFontWeight("bold");
  headerCol.setBackground("#e8f0fe");
}

/**
 * Append a compound as a new row at the bottom of the current data region.
 * If the sheet is empty, writes headers first.
 * @param {Object} data - Key-value pairs of compound properties
 */
function appendCompoundRow(data) {
  if (!data || typeof data !== "object") return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var keys = Object.keys(data);
  var values = keys.map(function (k) {
    return data[k] !== null && data[k] !== undefined ? data[k] : "";
  });

  var lastRow = sheet.getLastRow();

  if (lastRow === 0) {
    // Empty sheet: write headers + data
    sheet
      .getRange(1, 1, 1, keys.length)
      .setValues([keys])
      .setFontWeight("bold")
      .setBackground("#e8f0fe");
    sheet.getRange(2, 1, 1, values.length).setValues([values]);
  } else {
    // Check if headers match
    var existingHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    var orderedValues = existingHeaders.map(function (h) {
      return data[h] !== undefined && data[h] !== null ? data[h] : "";
    });
    sheet
      .getRange(lastRow + 1, 1, 1, orderedValues.length)
      .setValues([orderedValues]);
  }
}

// ─── Read Selected Cell ─────────────────────────────────────────────────────────

/**
 * Get the value of the currently selected cell.
 * @return {string} The cell value as a string
 */
function getSelectedCellValue() {
  var cell = SpreadsheetApp.getActiveSpreadsheet().getActiveCell();
  return String(cell.getValue()).trim();
}

// ─── Insert Periodic Table Sheet ────────────────────────────────────────────────

/**
 * Insert a new sheet with the periodic table data in tabular form.
 */
function insertPeriodicTableSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if a "Periodic Table" sheet already exists
  var existing = ss.getSheetByName("Periodic Table");
  if (existing) {
    ss.setActiveSheet(existing);
    SpreadsheetApp.getUi().alert('A "Periodic Table" sheet already exists.');
    return;
  }

  // Delegate to the full formatted periodic table builder
  buildPeriodicTableSheet();
}
