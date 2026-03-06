/**
 * webchem-gs: Gemini API Integration
 * Molecule identification via Google Gemini multimodal model.
 */

// ─── Configuration ──────────────────────────────────────────────────────────────

var GEMINI_MODEL_ = "gemini-2.5-flash";
var GEMINI_API_URL_ =
  "https://generativelanguage.googleapis.com/v1/models/" +
  GEMINI_MODEL_ +
  ":generateContent";

var GEMINI_IMAGE_PROMPT_ =
  "Act as a chemistry expert. Identify the molecule in the image. " +
  "Return the answer only in pure JSON format without markdown formatting. " +
  "Do not wrap the JSON in code blocks or add any other text before or after. " +
  "JSON structure: " +
  '{"common_name": "...", "iupac_name": "...", "smiles": "...", ' +
  '"molecular_formula": "...", "molecular_weight": "...", ' +
  '"short_description": "A brief description of the molecule, its structure, and key characteristics.", ' +
  '"classification": "The chemical class or family (e.g. alcohol, ketone, amino acid, etc.)", ' +
  '"chemical_behaviour": "Reactivity, functional groups, and notable interactions.", ' +
  '"properties": {"melting_point": "...", "boiling_point": "...", "density": "...", "solubility": "...", "pKa": "..."}, ' +
  '"uses": "Common applications in industry, medicine, research, etc.", ' +
  '"sources": ["https://pubchem.ncbi.nlm.nih.gov/compound/...", "https://en.wikipedia.org/wiki/..."]}. ' +
  "If a field is unknown, use null. Provide numerical values with units where applicable.";

var GEMINI_TEXT_PROMPT_ =
  "Act as a chemistry expert. I will give you a chemical identifier " +
  "(name, formula, SMILES, CAS number, IUPAC name, or a description). " +
  "Identify the molecule and return information about it. " +
  "Return the answer only in pure JSON format without markdown formatting. " +
  "Do not wrap the JSON in code blocks or add any other text before or after. " +
  "JSON structure: " +
  '{"common_name": "...", "iupac_name": "...", "smiles": "...", ' +
  '"molecular_formula": "...", "molecular_weight": "...", ' +
  '"short_description": "A brief description of the molecule, its structure, and key characteristics.", ' +
  '"classification": "The chemical class or family (e.g. alcohol, ketone, amino acid, etc.)", ' +
  '"chemical_behaviour": "Reactivity, functional groups, and notable interactions.", ' +
  '"properties": {"melting_point": "...", "boiling_point": "...", "density": "...", "solubility": "...", "pKa": "..."}, ' +
  '"uses": "Common applications in industry, medicine, research, etc.", ' +
  '"sources": ["https://pubchem.ncbi.nlm.nih.gov/compound/...", "https://en.wikipedia.org/wiki/..."]}. ' +
  "If a field is unknown, use null. Provide numerical values with units where applicable. " +
  "The chemical identifier is: ";

// ─── API Key ────────────────────────────────────────────────────────────────────

/**
 * Get the Gemini API key from Script Properties.
 * @return {string|null}
 */
function getGeminiApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
}

/**
 * Check if the Gemini API key is configured.
 * @return {boolean}
 */
function hasGeminiApiKey() {
  var key = getGeminiApiKey_();
  return key !== null && key !== "";
}

// ─── Image Identification ───────────────────────────────────────────────────────

/**
 * Identify a molecule from a Base64-encoded image using Gemini.
 *
 * @param {string} base64Data - The Base64-encoded image data (without data URI prefix)
 * @param {string} mimeType  - The MIME type (e.g. "image/png", "image/jpeg")
 * @return {Object} Parsed molecule info or { error: "..." }
 */
function identifyMoleculeFromImage(base64Data, mimeType) {
  var apiKey = getGeminiApiKey_();
  if (!apiKey) {
    return {
      error:
        "Gemini API key not configured. Add GEMINI_API_KEY in Script Properties.",
    };
  }

  if (!base64Data || !mimeType) {
    return { error: "No image data provided." };
  }

  var url = GEMINI_API_URL_ + "?key=" + apiKey;

  var payload = {
    contents: [
      {
        parts: [
          { text: GEMINI_IMAGE_PROMPT_ },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  return callGeminiApi_(url, payload);
}

// ─── Text Identification ────────────────────────────────────────────────────────

/**
 * Identify a molecule from a text query using Gemini.
 *
 * @param {string} query - Chemical name, formula, SMILES, CAS, etc.
 * @return {Object} Parsed molecule info or { error: "..." }
 */
function identifyMoleculeFromText(query) {
  var apiKey = getGeminiApiKey_();
  if (!apiKey) {
    return {
      error:
        "Gemini API key not configured. Add GEMINI_API_KEY in Script Properties.",
    };
  }

  if (!query || query.trim() === "") {
    return { error: "No query text provided." };
  }

  var url = GEMINI_API_URL_ + "?key=" + apiKey;

  var payload = {
    contents: [
      {
        parts: [{ text: GEMINI_TEXT_PROMPT_ + query.trim() }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  return callGeminiApi_(url, payload);
}

// ─── Shared API Call ────────────────────────────────────────────────────────────

/**
 * Call the Gemini API and parse the JSON response.
 * @param {string} url
 * @param {Object} payload
 * @return {Object} Parsed molecule info or { error: "..." }
 */
function callGeminiApi_(url, payload) {
  try {
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code !== 200) {
      var errMsg = "Gemini API error (HTTP " + code + ")";
      try {
        var errObj = JSON.parse(body);
        if (errObj.error && errObj.error.message) {
          errMsg += ": " + errObj.error.message;
        }
      } catch (e) {
        // ignore parse failure
      }
      return { error: errMsg };
    }

    var result = JSON.parse(body);

    // Extract text from Gemini response
    if (
      !result.candidates ||
      !result.candidates[0] ||
      !result.candidates[0].content ||
      !result.candidates[0].content.parts
    ) {
      return { error: "No response from Gemini model." };
    }

    var text = result.candidates[0].content.parts[0].text || "";

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    text = text.trim();

    // Parse JSON
    try {
      var molecule = JSON.parse(text);
      return molecule;
    } catch (e) {
      return {
        error: "Failed to parse Gemini response as JSON.",
        rawText: text,
      };
    }
  } catch (e) {
    return { error: "Request failed: " + e.message };
  }
}

// ─── Inject Identification Results ──────────────────────────────────────────────

/**
 * Inject molecule identification results into the active sheet at the active cell.
 * Flattens nested objects into "section.key" format.
 *
 * @param {Object} data - The molecule info object from Gemini
 */
function injectIdentifyResults(data) {
  if (!data || typeof data !== "object") return;

  var rows = [];

  var flattenAndCollect = function (obj, prefix) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      var label = prefix ? prefix + "." + key : key;

      if (val === null || val === undefined) {
        rows.push([label, ""]);
      } else if (Array.isArray(val)) {
        rows.push([label, val.join(", ")]);
      } else if (typeof val === "object") {
        flattenAndCollect(val, label);
      } else {
        rows.push([label, String(val)]);
      }
    }
  };

  flattenAndCollect(data, "");

  if (rows.length === 0) return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();
  var startRow = cell.getRow();
  var startCol = cell.getColumn();

  var range = sheet.getRange(startRow, startCol, rows.length, 2);
  range.setValues(rows);

  // Style the property names column
  var headerCol = sheet.getRange(startRow, startCol, rows.length, 1);
  headerCol.setFontWeight("bold");
  headerCol.setBackground("#e8f0fe");

  // Auto-resize
  sheet.autoResizeColumn(startCol);
  sheet.autoResizeColumn(startCol + 1);
}
