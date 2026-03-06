/**
 * webchem-gs: Input Validators
 * Ported from webchem R package utils.R: is.cas(), is.inchikey_format(), as.cas()
 * Plus identifier type auto-detection.
 */

// ─── CAS Number Validation ──────────────────────────────────────────────────────

/**
 * Check if a string is a valid CAS Registry Number.
 * Rules: 3 parts separated by 2 hyphens; first part 2–7 digits;
 * second part 2 digits; third part 1 check digit; checksum must match.
 * Ported from webchem is.cas().
 *
 * @param {string} x - Input string
 * @return {boolean}
 */
function isCas(x) {
  if (!x || typeof x !== "string") return false;
  x = x.trim();

  // Must not contain letters or whitespace
  if (/[a-zA-Z]/.test(x)) return false;
  if (/\s/.test(x)) return false;

  // Must have exactly 2 hyphens
  var parts = x.split("-");
  if (parts.length !== 3) return false;

  var first = parts[0];
  var second = parts[1];
  var third = parts[2];

  // First part: 2–7 digits
  if (first.length < 2 || first.length > 7 || !/^\d+$/.test(first))
    return false;
  // Second part: exactly 2 digits
  if (second.length !== 2 || !/^\d+$/.test(second)) return false;
  // Third part: exactly 1 digit (check digit)
  if (third.length !== 1 || !/^\d+$/.test(third)) return false;

  // Verify checksum
  var digits = (first + second).split("").map(Number);
  var sum = 0;
  for (var i = 0; i < digits.length; i++) {
    sum += digits[digits.length - 1 - i] * (i + 1);
  }
  return sum % 10 === Number(third);
}

/**
 * Format a number or raw string as a CAS number (inserting hyphens).
 * Returns the CAS string if valid, or null otherwise.
 * Ported from webchem as.cas().
 *
 * @param {string|number} x
 * @return {string|null}
 */
function formatCas(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  if (isCas(s)) return s;

  // Try inserting hyphens: digits → NNNNN-NN-N
  s = s.replace(/[^0-9]/g, "");
  if (s.length < 5) return null;
  var formatted = s.slice(0, -3) + "-" + s.slice(-3, -1) + "-" + s.slice(-1);
  return isCas(formatted) ? formatted : null;
}

// ─── InChIKey Validation ────────────────────────────────────────────────────────

/**
 * Check if a string is a valid InChIKey by format.
 * Rules: 27 chars, all uppercase letters, hyphens at positions 15 & 26,
 * flag char (pos 24) is 'S' or 'N', version char (pos 25) is 'A'.
 * Ported from webchem is.inchikey_format().
 *
 * @param {string} x
 * @return {boolean}
 */
function isInchiKey(x) {
  if (!x || typeof x !== "string") return false;
  x = x.trim();
  if (x.length !== 27) return false;
  if (x !== x.toUpperCase()) return false;

  // Check hyphens at positions 14 and 25 (0-indexed)
  if (x.charAt(14) !== "-" || x.charAt(25) !== "-") return false;

  // No digits allowed
  if (/\d/.test(x)) return false;

  // Flag character (position 23, 0-indexed) must be S or N
  var flag = x.charAt(23);
  if (flag !== "S" && flag !== "N") return false;

  // Version character (position 24, 0-indexed) must be A
  if (x.charAt(24) !== "A") return false;

  return true;
}

// ─── InChI Detection ────────────────────────────────────────────────────────────

/**
 * Check if a string looks like an InChI string.
 * @param {string} x
 * @return {boolean}
 */
function isInchi(x) {
  if (!x || typeof x !== "string") return false;
  return x.trim().indexOf("InChI=") === 0;
}

// ─── SMILES Detection ───────────────────────────────────────────────────────────

/**
 * Basic heuristic to detect if a string is likely a SMILES notation.
 * Not a full parser — just checks for SMILES-like characters.
 * @param {string} x
 * @return {boolean}
 */
function isLikelySmiles(x) {
  if (!x || typeof x !== "string") return false;
  x = x.trim();
  if (x.length === 0) return false;

  // Reject molecular formulas — they should be caught by isFormula() instead
  if (isFormula(x)) return false;

  // SMILES shouldn't contain spaces (unless it's a name)
  if (/\s/.test(x)) return false;

  // Must contain at least one SMILES-specific character
  if (/[=#()[\]@+\\\/]/.test(x)) return true;

  // Short strings of only atoms and bonds: C, N, O, S, etc.
  if (
    /^[A-Za-z0-9=#()[\]@+\-\\\/\.\:]+$/.test(x) &&
    /[cnos]/.test(x.toLowerCase()) &&
    x.length > 1
  ) {
    // Avoid matching plain words — require at least one lowercase atom or ring notation
    if (/[0-9]/.test(x) || /[=#()]/.test(x)) return true;
  }

  return false;
}

// ─── Numeric CID Detection ──────────────────────────────────────────────────────

/**
 * Check if a string is a pure positive integer (potential PubChem CID).
 * @param {string} x
 * @return {boolean}
 */
function isNumericId(x) {
  if (!x || typeof x !== "string") return false;
  return /^\d+$/.test(x.trim()) && Number(x.trim()) > 0;
}

// ─── Molecular Formula Detection ────────────────────────────────────────────────

/**
 * Check if a string looks like a molecular formula.
 * Matches patterns like H2O, NaCl, C9H8O4, Ca(OH)2, C6H12O6, Fe2O3.
 *
 * Must start with an uppercase letter (element), contain at least one digit
 * or a second element symbol, and consist only of element-like tokens and digits.
 * Single-element symbols like "C" or "N" are NOT matched (too ambiguous).
 *
 * @param {string} x
 * @return {boolean}
 */
function isFormula(x) {
  if (!x || typeof x !== "string") return false;
  x = x.trim();

  // Must only contain uppercase, lowercase, digits, parentheses, brackets, dots, middot
  if (!/^[A-Z][A-Za-z0-9()\[\]·.]+$/.test(x)) return false;

  // Must contain at least one digit OR at least two uppercase letters
  // (so "NaCl" matches but "C" or "N" alone don't)
  var hasDigit = /\d/.test(x);
  var upperCount = (x.match(/[A-Z]/g) || []).length;
  if (!hasDigit && upperCount < 2) return false;

  // All-uppercase strings without digits are almost certainly names (IMATINIB, ASPIRIN)
  // not formulas. Real no-digit formulas are short: CO, NO, NaCl (has lowercase).
  var hasLower = /[a-z]/.test(x);
  if (!hasDigit && !hasLower) return false;

  // Validate structure: sequence of element symbols (uppercase + optional lowercase)
  // followed by optional digits, with optional parenthesized groups
  // This regex matches valid molecular formula patterns
  var formulaPattern = /^(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*|[·.])+$/;
  return formulaPattern.test(x);
}

// ─── Auto-Detect Identifier Type ────────────────────────────────────────────────

/**
 * Detect the type of a chemical identifier.
 * Returns one of: 'cas', 'inchikey', 'inchi', 'smiles', 'formula', 'cid', 'name'
 *
 * @param {string} input
 * @return {string} The detected identifier type
 */
function detectIdentifierType(input) {
  if (!input || typeof input !== "string") return "name";
  input = input.trim();

  if (isCas(input)) return "cas";
  if (isInchiKey(input)) return "inchikey";
  if (isInchi(input)) return "inchi";
  // Formula must be checked BEFORE SMILES because molecular formulas
  // like C9H8O4 can false-positive as SMILES (contain digits + c/o atoms).
  if (isFormula(input)) return "formula";
  if (isLikelySmiles(input)) return "smiles";
  if (isNumericId(input)) return "cid";

  return "name";
}

// ─── Molecular Formula Subscript Rendering ──────────────────────────────────────

/**
 * Convert a molecular formula to HTML with subscript numbers.
 * E.g., "C9H8O4" → "C<sub>9</sub>H<sub>8</sub>O<sub>4</sub>"
 *
 * @param {string} formula
 * @return {string} HTML string
 */
function formulaToHtml(formula) {
  if (!formula) return "";
  return formula.replace(/(\d+)/g, "<sub>$1</sub>");
}
