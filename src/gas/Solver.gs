/**
 * webchem-gs: Chemistry Solver Suite
 *
 * Solvers: Equation Balancer, Molar Mass Calculator, Dilution Calculator,  Empirical Formula, Combustion Analysis, Theoretical Yield, Hess Law, Ideal Gas Law, Dynamic Equilibrium, Solubility/Ksp, Solution pH, Henderson-Hasselbach, Buffer solution, Titration, Nernst equation, Carbon dating/Decay 
 *
// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Balance a chemical equation.
 *
 * @param {string} equationStr - e.g. "Fe2O3 + C = Fe + CO2"
 * @return {Object} { balanced, lhs, rhs, coefficients, html } or { error }
 */
function balanceEquation(equationStr) {
  if (!equationStr || !equationStr.trim()) {
    return { error: "Please enter a chemical equation." };
  }

  try {
    var eqn = parseEquation_(equationStr);
    var coefs = null;
    var solverNote = null;

    // Try the standard matrix solver first
    try {
      var matrix = buildMatrix_(eqn);
      solveMatrix_(matrix);
      coefs = extractCoefficients_(matrix);
      checkAnswer_(eqn, coefs);
    } catch (solverErr) {
      // If "Multiple independent solutions", try brute-force over free variables
      if (
        solverErr.message &&
        solverErr.message.indexOf("Multiple independent") !== -1
      ) {
        coefs = solveMultiFreeVar_(eqn);
        if (coefs) {
          // Verify the brute-force solution
          try {
            checkAnswer_(eqn, coefs);
            solverNote =
              "This equation has multiple valid balancings. " +
              "The solution shown uses the smallest positive integer coefficients.";
          } catch (verifyErr) {
            coefs = null; // verification failed
          }
        }
      }

      // If still no solution, check the known equations table
      if (!coefs) {
        var known = lookupKnownEquation_(equationStr);
        if (known) {
          var result = {
            balanced: known.balanced,
            html: known.html,
            coefficients: known.coefficients,
          };
          if (known.note) {
            result.warnings = [known.note];
          }
          return result;
        }
        // Re-throw the original error
        throw solverErr;
      }
    }

    // Check for negative coefficients — warn but still show the result
    var hasNegative = false;
    for (var ni = 0; ni < coefs.length; ni++) {
      if (coefs[ni] < 0) {
        hasNegative = true;
        break;
      }
    }

    // Check for unknown element symbols (warning, not error)
    var warnings = [];
    if (hasNegative) {
      warnings.push(
        "Negative coefficients found — the equation may be written " +
          "incorrectly or may require additional species (e.g. H\u207A, OH\u207B, H\u2082O) " +
          "to balance properly.",
      );
    }
    if (solverNote) warnings.push(solverNote);
    try {
      var ptElements = getElementsData_();
      if (ptElements && ptElements.length > 0) {
        var validSymbols = {};
        for (var vi = 0; vi < ptElements.length; vi++) {
          if (ptElements[vi].Symbol) validSymbols[ptElements[vi].Symbol] = true;
        }
        var usedElems = getElements_(eqn);
        for (var wi = 0; wi < usedElems.length; wi++) {
          if (usedElems[wi] !== "e" && !validSymbols[usedElems[wi]]) {
            warnings.push(
              '"' + usedElems[wi] + '" is not a recognised element symbol',
            );
          }
        }
      }
    } catch (ptErr) {
      // Non-fatal — skip warning if periodic table unavailable
    }

    // Format output
    var lhsTerms = eqn.leftSide;
    var rhsTerms = eqn.rightSide;
    var lhsStr = [];
    var rhsStr = [];
    for (var i = 0; i < lhsTerms.length; i++) {
      var c = coefs[i];
      lhsStr.push(formatCoefText_(c) + termToString_(lhsTerms[i]));
    }
    for (var i = 0; i < rhsTerms.length; i++) {
      var c = coefs[lhsTerms.length + i];
      rhsStr.push(formatCoefText_(c) + termToString_(rhsTerms[i]));
    }

    var balanced = lhsStr.join(" + ") + " → " + rhsStr.join(" + ");

    // Build HTML with subscripts
    var lhsHtml = [];
    var rhsHtml = [];
    for (var i = 0; i < lhsTerms.length; i++) {
      var c = coefs[i];
      lhsHtml.push(formatCoefHtml_(c) + termToHtml_(lhsTerms[i]));
    }
    for (var i = 0; i < rhsTerms.length; i++) {
      var c = coefs[lhsTerms.length + i];
      rhsHtml.push(formatCoefHtml_(c) + termToHtml_(rhsTerms[i]));
    }
    var html = lhsHtml.join(" + ") + " → " + rhsHtml.join(" + ");

    return {
      balanced: balanced,
      html: html,
      coefficients: coefs,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    return {
      error: e.message || "Could not balance this equation.",
    };
  }
}

/**
 * Calculate the molar mass of a molecular formula.
 *
 * @param {string} formula - e.g. "H2O", "Ca(OH)2", "C6H12O6"
 * @return {Object} { formula, molarMass, breakdown, html } or { error }
 */
function calculateMolarMass(formula) {
  if (!formula || !formula.trim()) {
    return { error: "Please enter a molecular formula." };
  }

  try {
    // Parse the formula into element counts
    var counts = parseFormulaCounts_(formula.trim());

    // Get element data for masses
    var elements = getElementsData_();
    if (!elements || elements.length === 0) {
      return { error: "Could not load element data." };
    }

    // Build lookup by symbol
    var bySymbol = {};
    for (var i = 0; i < elements.length; i++) {
      bySymbol[elements[i].Symbol] = elements[i];
    }

    var totalMass = 0;
    var breakdown = [];
    var symbols = Object.keys(counts);
    symbols.sort(); // alphabetical

    for (var i = 0; i < symbols.length; i++) {
      var sym = symbols[i];
      var count = counts[sym];
      var el = bySymbol[sym];
      if (!el) {
        return { error: 'Unknown element: "' + sym + '"' };
      }
      var mass = parseFloat(el.AtomicMass);
      if (isNaN(mass)) {
        return { error: "No atomic mass data for " + sym };
      }
      var contrib = mass * count;
      totalMass += contrib;
      breakdown.push({
        symbol: sym,
        name: el.Name,
        count: count,
        atomicMass: mass,
        contribution: contrib,
      });
    }

    // Build HTML breakdown
    var html =
      '<table class="result-props">' +
      "<tr><td><b>Element</b></td><td><b>Count</b></td>" +
      "<td><b>Mass</b></td><td><b>Subtotal</b></td></tr>";
    for (var i = 0; i < breakdown.length; i++) {
      var b = breakdown[i];
      html +=
        "<tr><td>" +
        b.symbol +
        " (" +
        b.name +
        ")</td>" +
        "<td>" +
        b.count +
        "</td>" +
        "<td>" +
        b.atomicMass.toFixed(4) +
        "</td>" +
        "<td>" +
        b.contribution.toFixed(4) +
        "</td></tr>";
    }
    html += "</table>";

    return {
      formula: formula.trim(),
      molarMass: Math.round(totalMass * 10000) / 10000,
      breakdown: breakdown,
      html: html,
    };
  } catch (e) {
    return { error: e.message || "Could not parse this formula." };
  }
}

/**
 * Look up a molecular formula on PubChem.
 * Returns the first match's name, CID and image URL.
 * Since molecular formulas are not unique (e.g. C2H6O can be ethanol or
 * dimethyl ether), this returns data for the most common compound.
 *
 * @param {string} formula - e.g. "H2O", "C6H12O6"
 * @return {Object|null} { name, cid, imageUrl, url, totalCids }
 */
function lookupFormulaPubChem(formula) {
  if (!formula || !formula.trim()) return null;

  try {
    var f = formula.trim();
    var cids = pubchem_getCid(f, "formula");
    if (!cids || cids.length === 0) return null;

    var cid = cids[0];
    var props = pubchem_getProperties(cid, [
      "IUPACName",
      "MolecularFormula",
      "MolecularWeight",
    ]);

    var name = "";
    if (props) {
      name = props.IUPACName || "";
    }

    // Get synonyms: first synonym is often the common name
    var synonyms = pubchem_getSynonyms(cid, 5);
    var commonName = synonyms.length > 0 ? synonyms[0] : "";

    return {
      name: commonName || name,
      iupacName: name,
      cid: cid,
      imageUrl: pubchem_getImageUrl(cid),
      url: "https://pubchem.ncbi.nlm.nih.gov/compound/" + cid,
      totalCids: cids.length,
    };
  } catch (e) {
    Logger.log("PubChem formula lookup error: " + e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMULA PARSER (for molar mass)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a molecular formula into a map of element → total count.
 * Handles nested parentheses: Ca(OH)2 → { Ca: 1, O: 2, H: 2 }
 *
 * @param {string} formula
 * @return {Object} Map of element symbol → count
 * @private
 */
function parseFormulaCounts_(formula) {
  var i = 0;

  function parseGroup(closeChar) {
    var counts = {};
    while (i < formula.length) {
      if (formula[i] === "(" || formula[i] === "[") {
        var close = formula[i] === "(" ? ")" : "]";
        i++; // skip opening bracket
        var inner = parseGroup(close);
        if (i < formula.length && formula[i] === close) {
          i++; // skip closing bracket
        }
        var mult = parseNumber();
        var keys = Object.keys(inner);
        for (var k = 0; k < keys.length; k++) {
          counts[keys[k]] = (counts[keys[k]] || 0) + inner[keys[k]] * mult;
        }
      } else if (formula[i] === ")" || formula[i] === "]") {
        break;
      } else if (formula[i] >= "A" && formula[i] <= "Z") {
        var sym = formula[i];
        i++;
        while (i < formula.length && formula[i] >= "a" && formula[i] <= "z") {
          sym += formula[i];
          i++;
        }
        var num = parseNumber();
        counts[sym] = (counts[sym] || 0) + num;
      } else {
        throw new Error('Unexpected character: "' + formula[i] + '"');
      }
    }
    return counts;
  }

  function parseNumber() {
    var start = i;
    while (i < formula.length && formula[i] >= "0" && formula[i] <= "9") {
      i++;
    }
    if (i === start) return 1;
    return parseInt(formula.substring(start, i), 10);
  }

  var result = parseGroup();
  if (i < formula.length) {
    throw new Error(
      "Unexpected character at position " + (i + 1) + ': "' + formula[i] + '"',
    );
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKENIZER (regex-based, handles multi-character tokens)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Regex-based tokenizer that emits multi-character tokens:
 *  - Element symbols: [A-Z][a-z]* (e.g. "Fe", "O", "Ca")
 *  - Lowercase "e" for electron
 *  - Numbers: [0-9]+
 *  - Single chars: + - ^ = ( ) [ ]
 *
 * This approach lets the parser handle "+" in charge notation (e.g. Fe^3+)
 * without confusing it with the "+" that separates terms.
 * @private
 */
function Tokenizer_(str) {
  this.str = str.replace(/\u2212/g, "-"); // normalise Unicode minus
  this.pos = 0;
  this.skipSpaces_();
}

Tokenizer_.prototype.skipSpaces_ = function () {
  while (
    this.pos < this.str.length &&
    (this.str[this.pos] === " " || this.str[this.pos] === "\t")
  ) {
    this.pos++;
  }
};

Tokenizer_.prototype.peek = function () {
  if (this.pos >= this.str.length) return null;
  var match = /^([A-Za-z][a-z]*|[0-9]+|[+\-^=()\[\]])/.exec(
    this.str.substring(this.pos),
  );
  if (match === null) {
    throw new Error(
      "Invalid symbol at position " +
        (this.pos + 1) +
        ': "' +
        this.str[this.pos] +
        '"',
    );
  }
  return match[0];
};

Tokenizer_.prototype.take = function () {
  var result = this.peek();
  if (result === null) throw new Error("Unexpected end of input");
  this.pos += result.length;
  this.skipSpaces_();
  return result;
};

Tokenizer_.prototype.consume = function (expected) {
  var tok = this.take();
  if (tok !== expected) {
    throw new Error('Expected "' + expected + '" but got "' + tok + '"');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EQUATION PARSER (charge-aware, ported from chembalancer-plugin)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a chemical equation string into an Equation object.
 *
 * Supports charged species (e.g. Fe^3+, SO4^2-, e^-) and electrons.
 * The tokenizer-based approach naturally disambiguates "+" as a charge sign
 * from "+" as a term separator — the charge parser consumes the "+" in
 * "Fe^3+" before the equation-level parser ever sees it.
 *
 * @param {string} str  e.g. "Fe + Cl2 = FeCl3" or "Fe^3+ + e = Fe^2+"
 * @return {{ leftSide: Object[], rightSide: Object[] }}
 * @private
 */
function parseEquation_(str) {
  // Normalise arrow/separator — support →, ⟶, ➔, ->, =, >>
  var normalized = str
    .replace(/\u2192/g, "=") // →
    .replace(/\u27F6/g, "=") // ⟶
    .replace(/\u2794/g, "=") // ➔
    .replace(/->/g, "=")
    .replace(/>>/g, "=");

  var tok = new Tokenizer_(normalized);

  // Parse left-hand side
  var lhs = [parseTerm_(tok)];
  while (true) {
    var next = tok.peek();
    if (next === "+") {
      tok.consume("+");
      lhs.push(parseTerm_(tok));
    } else if (next === "=") {
      tok.consume("=");
      break;
    } else {
      throw new Error(
        'Expected "+" or "=" but got "' + (next || "end of input") + '"',
      );
    }
  }

  // Parse right-hand side
  var rhs = [parseTerm_(tok)];
  while (true) {
    var next2 = tok.peek();
    if (next2 === null) break;
    if (next2 === "+") {
      tok.consume("+");
      rhs.push(parseTerm_(tok));
    } else {
      throw new Error(
        'Expected "+" or end of equation but got "' + next2 + '"',
      );
    }
  }

  return { leftSide: lhs, rightSide: rhs };
}

/**
 * Parse a single term from the token stream.
 *
 * A term is: [elements/groups]  [^ charge]
 * Special case: bare "e" is an electron with default charge −1.
 *
 * @param {Tokenizer_} tok
 * @return {{ items: Object[], charge: number }}
 * @private
 */
function parseTerm_(tok) {
  var items = [];
  var electron = false;
  var next;

  while (true) {
    next = tok.peek();
    if (next === "(" || next === "[") {
      items.push(parseGroup_(tok));
    } else if (next === "e") {
      tok.consume("e");
      electron = true;
    } else if (next !== null && /^[A-Z][a-z]*$/.test(next)) {
      items.push(parseElement_(tok));
    } else if (next !== null && /^[0-9]+$/.test(next)) {
      // Skip leading coefficient — we solve for all coefficients
      tok.take();
    } else {
      break;
    }
  }

  // Parse optional charge: ^[number][+|-]
  var charge = null;
  next = tok.peek();
  if (next === "^") {
    tok.consume("^");
    charge = parseOptionalNumber_(tok);
    next = tok.peek();
    if (next === "+") {
      // charge stays positive
      tok.take();
    } else if (next === "-") {
      charge = -charge;
      tok.take();
    } else {
      throw new Error(
        'Expected "+" or "-" after charge but got "' +
          (next || "end of input") +
          '"',
      );
    }
  }

  // Validate and set defaults
  if (electron) {
    if (items.length > 0) {
      throw new Error('Electron "e" must stand alone in a term');
    }
    if (charge === null) charge = -1; // default charge for bare "e"
    if (charge !== -1) {
      throw new Error("Electron must have charge \u22121");
    }
  } else {
    if (items.length === 0) {
      throw new Error("Empty term in equation");
    }
    if (charge === null) charge = 0;
  }

  return { items: items, charge: charge };
}

/**
 * Parse a parenthesised group, e.g. "(OH)2".
 * @private
 */
function parseGroup_(tok) {
  var open = tok.take(); // '(' or '['
  var close = open === "[" ? "]" : ")";
  var items = [];
  while (true) {
    var next = tok.peek();
    if (next === "(" || next === "[") {
      items.push(parseGroup_(tok));
    } else if (next !== null && /^[A-Z][a-z]*$/.test(next)) {
      items.push(parseElement_(tok));
    } else if (next === close) {
      tok.take();
      if (items.length === 0) throw new Error("Empty group");
      break;
    } else {
      throw new Error(
        'Expected element, group, or "' +
          close +
          '" but got "' +
          (next || "end of input") +
          '"',
      );
    }
  }
  return {
    type: "group",
    items: items,
    count: parseOptionalNumber_(tok),
    bracket: open,
  };
}

/**
 * Parse an element symbol and optional subscript, e.g. "Fe2", "O".
 * The tokenizer already emits multi-character element tokens.
 * @private
 */
function parseElement_(tok) {
  var name = tok.take();
  if (!/^[A-Z][a-z]*$/.test(name)) {
    throw new Error('Expected element symbol but got "' + name + '"');
  }
  return { type: "element", name: name, count: parseOptionalNumber_(tok) };
}

/**
 * Parse an optional number (subscript / count). Returns 1 if no number follows.
 * @private
 */
function parseOptionalNumber_(tok) {
  var next = tok.peek();
  if (next !== null && /^[0-9]+$/.test(next)) {
    var n = parseInt(tok.take(), 10);
    if (n === 0) throw new Error("Subscript or count cannot be zero");
    return n;
  }
  return 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EQUATION OBJECTS — element counting (with charge as pseudo-element "e")
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all unique element names from an equation.
 * If any term carries a charge, the pseudo-element "e" is included so that
 * the matrix solver balances charges alongside atoms.
 * @private
 */
function getElements_(eqn) {
  var set = {};
  var hasCharge = false;
  var allTerms = eqn.leftSide.concat(eqn.rightSide);
  for (var i = 0; i < allTerms.length; i++) {
    collectElements_(allTerms[i].items, set);
    if (allTerms[i].charge !== 0) hasCharge = true;
  }
  if (hasCharge) set["e"] = true;
  return Object.keys(set);
}

/**
 * Collect element names from a list of items (elements and groups).
 * @private
 */
function collectElements_(items, set) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.type === "element") {
      set[item.name] = true;
    } else if (item.type === "group") {
      collectElements_(item.items, set);
    }
  }
}

/**
 * Count occurrences of a specific element in a term.
 * For the pseudo-element "e", returns −charge (so e.g. Fe^3+ contributes −3
 * electrons and e^− contributes +1 electron).
 * @private
 */
function countElement_(term, elemName) {
  if (elemName === "e") {
    return -term.charge;
  }
  return countInItems_(term.items, elemName);
}

/**
 * Count occurrences of an element in a list of items.
 * @private
 */
function countInItems_(items, elemName) {
  var sum = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.type === "element") {
      if (item.name === elemName) sum += item.count;
    } else if (item.type === "group") {
      sum += countInItems_(item.items, elemName) * item.count;
    }
  }
  return sum;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRING / HTML CONVERSION (with charge notation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a coefficient for plain text output.
 * 1 → "" (omitted), −3 → "−3 ", 5 → "5 "
 * @private
 */
function formatCoefText_(c) {
  if (c === 1) return "";
  if (c === -1) return "\u22121 ";
  if (c < 0) return "\u2212" + Math.abs(c) + " ";
  return c + " ";
}

/**
 * Format a coefficient for HTML output.
 * 1 → "", −3 → '<b style="color:#c00">−3</b> ', 5 → '<b>5</b> '
 * @private
 */
function formatCoefHtml_(c) {
  if (c === 1) return "";
  if (c < 0) {
    return '<b style="color:#c00">\u2212' + Math.abs(c) + "</b> ";
  }
  return "<b>" + c + "</b> ";
}

/**
 * Convert a term to a plain-text string.
 * @private
 */
function termToString_(term) {
  // Electron special case
  if (term.items.length === 0 && term.charge === -1) {
    return "e^-";
  }
  var s = "";
  for (var i = 0; i < term.items.length; i++) {
    s += itemToString_(term.items[i]);
  }
  if (term.charge !== 0) {
    s += "^";
    if (Math.abs(term.charge) !== 1) s += Math.abs(term.charge);
    s += term.charge > 0 ? "+" : "-";
  }
  return s;
}

function itemToString_(item) {
  if (item.type === "element") {
    return item.name + (item.count > 1 ? item.count : "");
  } else if (item.type === "group") {
    var open = item.bracket === "[" ? "[" : "(";
    var close = item.bracket === "[" ? "]" : ")";
    var inner = "";
    for (var i = 0; i < item.items.length; i++) {
      inner += itemToString_(item.items[i]);
    }
    return open + inner + close + (item.count > 1 ? item.count : "");
  }
  return "";
}

/**
 * Convert a term to HTML with subscripts and superscript charges.
 * @private
 */
function termToHtml_(term) {
  // Electron special case
  if (term.items.length === 0 && term.charge === -1) {
    return "e<sup>\u2212</sup>";
  }
  var s = "";
  for (var i = 0; i < term.items.length; i++) {
    s += itemToHtml_(term.items[i]);
  }
  if (term.charge !== 0) {
    var chargeStr = "";
    if (Math.abs(term.charge) !== 1) chargeStr += Math.abs(term.charge);
    chargeStr += term.charge > 0 ? "+" : "\u2212";
    s += "<sup>" + chargeStr + "</sup>";
  }
  return s;
}

function itemToHtml_(item) {
  if (item.type === "element") {
    return item.name + (item.count > 1 ? "<sub>" + item.count + "</sub>" : "");
  } else if (item.type === "group") {
    var open = item.bracket === "[" ? "[" : "(";
    var close = item.bracket === "[" ? "]" : ")";
    var inner = "";
    for (var i = 0; i < item.items.length; i++) {
      inner += itemToHtml_(item.items[i]);
    }
    return (
      open +
      inner +
      close +
      (item.count > 1 ? "<sub>" + item.count + "</sub>" : "")
    );
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATRIX SOLVER (ported from chembalancer-plugin)
// ═══════════════════════════════════════════════════════════════════════════════

var SOLVER_INT_MAX_ = 9007199254740992; // 2^53

function checkedAdd_(x, y) {
  var r = x + y;
  if (Math.abs(r) >= SOLVER_INT_MAX_) throw new Error("Arithmetic overflow");
  return r;
}

function checkedMultiply_(x, y) {
  var r = x * y;
  if (Math.abs(r) >= SOLVER_INT_MAX_) throw new Error("Arithmetic overflow");
  return r;
}

function gcd_(x, y) {
  x = Math.abs(x);
  y = Math.abs(y);
  while (y !== 0) {
    var z = x % y;
    x = y;
    y = z;
  }
  return x;
}

/**
 * Build the matrix from the parsed equation.
 * @private
 */
function buildMatrix_(eqn) {
  var elems = getElements_(eqn);
  var lhs = eqn.leftSide;
  var rhs = eqn.rightSide;
  var numRows = elems.length + 1;
  var numCols = lhs.length + rhs.length + 1;

  // Create zero-filled matrix
  var cells = [];
  for (var r = 0; r < numRows; r++) {
    var row = [];
    for (var c = 0; c < numCols; c++) row.push(0);
    cells.push(row);
  }

  for (var i = 0; i < elems.length; i++) {
    var j = 0;
    for (var t = 0; t < lhs.length; t++) {
      cells[i][j] = countElement_(lhs[t], elems[i]);
      j++;
    }
    for (var t = 0; t < rhs.length; t++) {
      cells[i][j] = -countElement_(rhs[t], elems[i]);
      j++;
    }
  }

  return { cells: cells, numRows: numRows, numCols: numCols };
}

// ─── Row operations ─────────────────────────────────────────────────────────────

function addRows_(x, y) {
  var z = [];
  for (var i = 0; i < x.length; i++) z.push(checkedAdd_(x[i], y[i]));
  return z;
}

function multiplyRow_(x, c) {
  var z = [];
  for (var i = 0; i < x.length; i++) z.push(checkedMultiply_(x[i], c));
  return z;
}

function gcdRow_(x) {
  var result = 0;
  for (var i = 0; i < x.length; i++) result = gcd_(x[i], result);
  return result;
}

function simplifyRow_(x) {
  var sign = 0;
  for (var i = 0; i < x.length; i++) {
    if (x[i] !== 0) {
      sign = x[i] > 0 ? 1 : -1;
      break;
    }
  }
  if (sign === 0) return x.slice();
  var g = gcdRow_(x) * sign;
  var z = [];
  for (var i = 0; i < x.length; i++) z.push(x[i] / g);
  return z;
}

/**
 * Gauss-Jordan elimination to reduced row echelon form.
 * @private
 */
function gaussJordanEliminate_(m) {
  var cells = m.cells;
  // Simplify all rows
  for (var r = 0; r < m.numRows; r++) {
    cells[r] = simplifyRow_(cells[r]);
  }

  // REF
  var numPivots = 0;
  for (var col = 0; col < m.numCols; col++) {
    var pivotRow = numPivots;
    while (pivotRow < m.numRows && cells[pivotRow][col] === 0) pivotRow++;
    if (pivotRow === m.numRows) continue;

    var pivot = cells[pivotRow][col];
    // Swap
    var tmp = cells[numPivots];
    cells[numPivots] = cells[pivotRow];
    cells[pivotRow] = tmp;
    numPivots++;

    // Eliminate below
    for (var j = numPivots; j < m.numRows; j++) {
      var g = gcd_(pivot, cells[j][col]);
      cells[j] = simplifyRow_(
        addRows_(
          multiplyRow_(cells[j], pivot / g),
          multiplyRow_(cells[numPivots - 1], -cells[j][col] / g),
        ),
      );
    }
  }

  // RREF (back substitution)
  for (var i = m.numRows - 1; i >= 0; i--) {
    var pivotCol = -1;
    for (var c = 0; c < m.numCols; c++) {
      if (cells[i][c] !== 0) {
        pivotCol = c;
        break;
      }
    }
    if (pivotCol === -1) continue;
    var pv = cells[i][pivotCol];
    for (var j = i - 1; j >= 0; j--) {
      var g = gcd_(pv, cells[j][pivotCol]);
      cells[j] = simplifyRow_(
        addRows_(
          multiplyRow_(cells[j], pv / g),
          multiplyRow_(cells[i], -cells[j][pivotCol] / g),
        ),
      );
    }
  }
}

/**
 * Solve the matrix system.
 * @private
 */
function solveMatrix_(matrix) {
  gaussJordanEliminate_(matrix);

  // Count non-zero coefficients per row
  function countNonzero(row) {
    var count = 0;
    for (var i = 0; i < matrix.numCols; i++) {
      if (matrix.cells[row][i] !== 0) count++;
    }
    return count;
  }

  // Find row with more than one non-zero coefficient
  var i;
  for (i = 0; i < matrix.numRows - 1; i++) {
    if (countNonzero(i) > 1) break;
  }
  if (i === matrix.numRows - 1) {
    throw new Error(
      "No valid balancing exists — the equation may be trivial, " +
        "or the chemical formulas (subscripts) may be incorrect.",
    );
  }

  // Add inhomogeneous equation
  matrix.cells[matrix.numRows - 1][i] = 1;
  matrix.cells[matrix.numRows - 1][matrix.numCols - 1] = 1;

  gaussJordanEliminate_(matrix);
}

/**
 * Extract integer coefficients from the solved matrix.
 * @private
 */
function extractCoefficients_(matrix) {
  var rows = matrix.numRows;
  var cols = matrix.numCols;

  if (cols - 1 > rows || matrix.cells[cols - 2][cols - 2] === 0) {
    throw new Error("Multiple independent solutions");
  }

  var lcm = 1;
  for (var i = 0; i < cols - 1; i++) {
    var d = matrix.cells[i][i];
    lcm = checkedMultiply_(lcm / gcd_(lcm, d), d);
  }

  var coefs = [];
  for (var i = 0; i < cols - 1; i++) {
    coefs.push(
      checkedMultiply_(lcm / matrix.cells[i][i], matrix.cells[i][cols - 1]),
    );
  }

  // All coefficients must be positive
  var allNeg = coefs.every(function (x) {
    return x <= 0;
  });
  if (allNeg) {
    for (var i = 0; i < coefs.length; i++) coefs[i] = -coefs[i];
  }

  if (
    coefs.every(function (x) {
      return x === 0;
    })
  ) {
    throw new Error(
      "No valid balancing exists — check that all chemical formulas " +
        "(subscripts) are correct.",
    );
  }

  // Negative coefficients are allowed — the caller adds a warning.
  // This lets the user see the algebraic solution even for equations
  // that cannot be properly balanced as written.
  return coefs;
}

/**
 * Verify the solution is correct.
 * @private
 */
function checkAnswer_(eqn, coefs) {
  if (coefs.length !== eqn.leftSide.length + eqn.rightSide.length) {
    throw new Error("Coefficient count mismatch");
  }

  var elems = getElements_(eqn);
  for (var e = 0; e < elems.length; e++) {
    var sum = 0;
    var j = 0;
    for (var t = 0; t < eqn.leftSide.length; t++) {
      sum = checkedAdd_(
        sum,
        checkedMultiply_(countElement_(eqn.leftSide[t], elems[e]), coefs[j]),
      );
      j++;
    }
    for (var t = 0; t < eqn.rightSide.length; t++) {
      sum = checkedAdd_(
        sum,
        checkedMultiply_(countElement_(eqn.rightSide[t], elems[e]), -coefs[j]),
      );
      j++;
    }
    if (sum !== 0) {
      throw new Error("Verification failed — incorrect balance");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-FREE-VARIABLE SOLVER (brute-force for underdetermined systems)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * When the standard solver reports "Multiple independent solutions", this
 * function rebuilds the RREF matrix, identifies the free variables, and
 * searches for the smallest positive integer solution by brute-force
 * enumeration over free variable values.
 *
 * @param {Object} eqn - Parsed equation
 * @return {number[]|null} Positive integer coefficients, or null
 * @private
 */
function solveMultiFreeVar_(eqn) {
  var elems = getElements_(eqn);
  var lhs = eqn.leftSide;
  var rhs = eqn.rightSide;
  var numTerms = lhs.length + rhs.length;
  var numElems = elems.length;

  // Build element × term matrix (homogeneous system: Ax = 0)
  // columns = terms (LHS positive, RHS negative)
  var A = [];
  for (var r = 0; r < numElems; r++) {
    var row = [];
    for (var t = 0; t < lhs.length; t++) {
      row.push(countElement_(lhs[t], elems[r]));
    }
    for (var t = 0; t < rhs.length; t++) {
      row.push(-countElement_(rhs[t], elems[r]));
    }
    A.push(row);
  }

  // Gaussian elimination to RREF (on the coefficient matrix, no augmented column)
  var numRows = A.length;
  var numCols = numTerms;
  var pivotCols = [];
  var pivotRow = 0;

  for (var col = 0; col < numCols && pivotRow < numRows; col++) {
    // Find pivot
    var maxRow = -1;
    for (var r = pivotRow; r < numRows; r++) {
      if (A[r][col] !== 0) {
        maxRow = r;
        break;
      }
    }
    if (maxRow === -1) continue; // no pivot in this column — it's free

    // Swap
    var tmp = A[pivotRow];
    A[pivotRow] = A[maxRow];
    A[maxRow] = tmp;

    pivotCols.push(col);

    // Eliminate all other rows
    for (var r = 0; r < numRows; r++) {
      if (r === pivotRow || A[r][col] === 0) continue;
      var g = gcd_(Math.abs(A[pivotRow][col]), Math.abs(A[r][col]));
      var scale1 = A[pivotRow][col] / g;
      var scale2 = A[r][col] / g;
      for (var c = 0; c < numCols; c++) {
        A[r][c] = A[r][c] * scale1 - A[pivotRow][c] * scale2;
      }
      // Simplify
      var rg = 0;
      for (var c = 0; c < numCols; c++) rg = gcd_(rg, Math.abs(A[r][c]));
      if (rg > 1) {
        for (var c = 0; c < numCols; c++) A[r][c] /= rg;
      }
    }
    pivotRow++;
  }

  // Identify free columns (not pivot columns)
  var pivotSet = {};
  for (var p = 0; p < pivotCols.length; p++) pivotSet[pivotCols[p]] = true;
  var freeCols = [];
  for (var c = 0; c < numCols; c++) {
    if (!pivotSet[c]) freeCols.push(c);
  }

  if (freeCols.length === 0) return null; // only trivial solution
  if (freeCols.length > 4) return null; // too many free variables, impractical

  // Map pivot row index → pivot column
  var pivotRowForCol = {};
  for (var p = 0; p < pivotCols.length; p++) {
    pivotRowForCol[pivotCols[p]] = p;
  }

  // Brute-force: try all combinations of free variable values 1..MAX_VAL
  var MAX_VAL = 12;
  var bestCoefs = null;
  var bestSum = Infinity;

  // Generate combinations recursively
  var freeVals = new Array(freeCols.length);

  function search(depth) {
    if (bestSum <= numTerms) return; // already found a very good solution
    if (depth === freeCols.length) {
      // Compute pivot variable values
      var x = new Array(numCols);
      for (var f = 0; f < freeCols.length; f++) {
        x[freeCols[f]] = freeVals[f];
      }

      for (var p = pivotCols.length - 1; p >= 0; p--) {
        var pc = pivotCols[p];
        var row = A[p];
        var sum = 0;
        for (var c = 0; c < numCols; c++) {
          if (c !== pc && row[c] !== 0) {
            sum += row[c] * x[c];
          }
        }
        // row[pc] * x[pc] + sum = 0  =>  x[pc] = -sum / row[pc]
        if (row[pc] === 0) return;
        if (sum % row[pc] !== 0 && -sum % row[pc] !== 0) return;
        x[pc] = -sum / row[pc];
      }

      // Check all positive
      var total = 0;
      for (var c = 0; c < numCols; c++) {
        if (x[c] <= 0 || x[c] !== Math.floor(x[c])) return;
        total += x[c];
      }
      if (total < bestSum) {
        bestSum = total;
        bestCoefs = x.slice();
      }
      return;
    }

    for (var v = 1; v <= MAX_VAL; v++) {
      freeVals[depth] = v;
      search(depth + 1);
    }
  }

  search(0);
  return bestCoefs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWN EQUATIONS LOOKUP TABLE (fallback for algorithmically difficult cases)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalise an equation string for lookup:
 * remove spaces, lowercase, normalise arrows.
 * @private
 */
function normaliseForLookup_(str) {
  return str
    .replace(/\s+/g, "")
    .replace(/\u2192|->|>>|\u27F6|\u2794/g, "=")
    .toLowerCase();
}

/**
 * Table of known equations that are difficult for the algebraic solver.
 * Keys are normalised equation strings, values are the balanced result.
 * @private
 */
var KNOWN_EQUATIONS_ = {
  // Disproportionation: ClO2 in base
  "clo2+oh^-=clo3^-+cl^-+h2o": {
    balanced: "6 ClO2 + 6 OH^- → 5 ClO3^- + Cl^- + 3 H2O",
    html:
      "<b>6</b> ClO<sub>2</sub> + <b>6</b> OH<sup>\u2212</sup> → " +
      "<b>5</b> ClO<sub>3</sub><sup>\u2212</sup> + Cl<sup>\u2212</sup> + <b>3</b> H<sub>2</sub>O",
    coefficients: [6, 6, 5, 1, 3],
  },
};

/**
 * Look up an equation in the known equations table.
 * @param {string} equationStr
 * @return {Object|null}
 * @private
 */
function lookupKnownEquation_(equationStr) {
  var key = normaliseForLookup_(equationStr);
  return KNOWN_EQUATIONS_[key] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DILUTION CALCULATOR  (C₁V₁ = C₂V₂)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve the dilution equation C₁V₁ = C₂V₂ for whichever variable is blank.
 *
 * @param {Object} p - { c1, v1, c2, v2 } – numbers or empty strings
 * @return {Object} { variable, value, unit, equation, detail } or { error }
 */
function solveDilution(p) {
  var c1 = parseNumeric_(p.c1);
  var v1 = parseNumeric_(p.v1);
  var c2 = parseNumeric_(p.c2);
  var v2 = parseNumeric_(p.v2);
  var blanks =
    (c1 === null ? 1 : 0) +
    (v1 === null ? 1 : 0) +
    (c2 === null ? 1 : 0) +
    (v2 === null ? 1 : 0);

  if (blanks !== 1) {
    return {
      error:
        "Leave exactly one field blank — that is the variable to solve for.",
    };
  }

  var variable, value;
  if (c1 === null) {
    variable = "C₁";
    value = (c2 * v2) / v1;
  } else if (v1 === null) {
    variable = "V₁";
    value = (c2 * v2) / c1;
  } else if (c2 === null) {
    variable = "C₂";
    value = (c1 * v1) / v2;
  } else {
    variable = "V₂";
    value = (c1 * v1) / c2;
  }

  if (!isFinite(value)) {
    return { error: "Division by zero — check your input values." };
  }

  return {
    variable: variable,
    value: roundSig_(value, 6),
    equation: "C₁V₁ = C₂V₂",
    detail:
      formatVal_(c1, "C₁") +
      " × " +
      formatVal_(v1, "V₁") +
      " = " +
      formatVal_(c2, "C₂") +
      " × " +
      formatVal_(v2, "V₂"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IDEAL GAS LAW  (PV = nRT)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve PV = nRT for whichever variable is blank.
 *
 * @param {Object} p - { P, V, n, T, units }
 *   units: "SI" (Pa, m³, mol, K, R = 8.314) or "atm" (atm, L, mol, K, R = 0.08206)
 * @return {Object} { variable, value, unit, equation, R } or { error }
 */
function solveIdealGas(p) {
  var P = parseNumeric_(p.P);
  var V = parseNumeric_(p.V);
  var n = parseNumeric_(p.n);
  var T = parseNumeric_(p.T);
  var units = (p.units || "SI").toUpperCase();

  var R, pressureUnit, volumeUnit;
  if (units === "ATM") {
    R = 0.082057;
    pressureUnit = "atm";
    volumeUnit = "L";
  } else {
    R = 8.3145;
    pressureUnit = "Pa";
    volumeUnit = "m³";
  }

  var blanks =
    (P === null ? 1 : 0) +
    (V === null ? 1 : 0) +
    (n === null ? 1 : 0) +
    (T === null ? 1 : 0);
  if (blanks !== 1) {
    return {
      error:
        "Leave exactly one field blank — that is the variable to solve for.",
    };
  }

  var variable, value, unit;
  if (P === null) {
    variable = "P";
    value = (n * R * T) / V;
    unit = pressureUnit;
  } else if (V === null) {
    variable = "V";
    value = (n * R * T) / P;
    unit = volumeUnit;
  } else if (n === null) {
    variable = "n";
    value = (P * V) / (R * T);
    unit = "mol";
  } else {
    variable = "T";
    value = (P * V) / (n * R);
    unit = "K";
  }

  if (!isFinite(value)) {
    return { error: "Division by zero — check your input values." };
  }

  return {
    variable: variable,
    value: roundSig_(value, 6),
    unit: unit,
    equation: "PV = nRT",
    R: R,
    unitsLabel: units === "ATM" ? "atm·L·mol⁻¹·K⁻¹" : "J·mol⁻¹·K⁻¹",
  };
}

/**
 * Solve the Van der Waals equation:
 *   (P + a·n²/V²)(V − n·b) = nRT
 *
 * Solve for whichever of P, V, n, T is blank.
 * a, b are substance-specific constants.
 *
 * @param {Object} p - { P, V, n, T, a, b, units }
 * @return {Object} { variable, value, unit, equation, R } or { error }
 */
function solveVanDerWaals(p) {
  var P = parseNumeric_(p.P);
  var V = parseNumeric_(p.V);
  var n = parseNumeric_(p.n);
  var T = parseNumeric_(p.T);
  var a = parseNumeric_(p.a);
  var b = parseNumeric_(p.b);
  var units = (p.units || "SI").toUpperCase();

  if (a === null || b === null) {
    return { error: "Van der Waals constants a and b are required." };
  }
  if (a < 0) return { error: "Constant a must be non-negative." };
  if (b < 0) return { error: "Constant b must be non-negative." };

  var R;
  var pressureUnit, volumeUnit;
  if (units === "ATM") {
    R = 0.082057;
    pressureUnit = "atm";
    volumeUnit = "L";
  } else {
    R = 8.3145;
    pressureUnit = "Pa";
    volumeUnit = "m³";
  }

  var blanks =
    (P === null ? 1 : 0) +
    (V === null ? 1 : 0) +
    (n === null ? 1 : 0) +
    (T === null ? 1 : 0);
  if (blanks !== 1) {
    return { error: "Leave exactly one of P, V, n, T blank to solve for it." };
  }

  var variable, value, unit;

  if (P === null) {
    // P = nRT/(V − nb) − a·n²/V²
    var Vnb = V - n * b;
    if (Vnb <= 0)
      return {
        error: "V − nb ≤ 0. Volume is too small for this amount of gas.",
      };
    if (V === 0) return { error: "Volume cannot be zero." };
    variable = "P";
    value = (n * R * T) / Vnb - (a * n * n) / (V * V);
    unit = pressureUnit;
  } else if (T === null) {
    // T = (P + a·n²/V²)(V − nb) / (nR)
    var Vnb = V - n * b;
    if (Vnb <= 0)
      return {
        error: "V − nb ≤ 0. Volume is too small for this amount of gas.",
      };
    if (n === 0) return { error: "n cannot be zero." };
    variable = "T";
    value = ((P + (a * n * n) / (V * V)) * Vnb) / (n * R);
    unit = "K";
  } else if (V === null) {
    // Solve numerically: (P + a·n²/V²)(V − nb) = nRT for V
    // Search in range (n·b + ε, large V)
    var lo = n * b + 1e-10;
    var hi = ((n * R * T) / P) * 10; // generous upper bound
    if (hi < lo) hi = lo + 100;
    var nrt = n * R * T;
    var nn = n * n;
    value = bisect_(
      function (Vx) {
        return (P + (a * nn) / (Vx * Vx)) * (Vx - n * b) - nrt;
      },
      lo,
      hi,
      1e-10,
      500,
    );
    if (value === null)
      return { error: "Could not converge on V. Check inputs." };
    variable = "V";
    unit = volumeUnit;
  } else {
    // n is unknown — solve numerically
    // (P + a·n²/V²)(V − nb) = nRT
    // This is a cubic in n; use bisection
    var lo = 1e-12;
    var hi = ((P * V) / (R * T)) * 10; // generous upper bound
    if (hi < lo) hi = 1000;
    value = bisect_(
      function (nx) {
        return (P + (a * nx * nx) / (V * V)) * (V - nx * b) - nx * R * T;
      },
      lo,
      hi,
      1e-10,
      500,
    );
    if (value === null)
      return { error: "Could not converge on n. Check inputs." };
    variable = "n";
    unit = "mol";
  }

  if (!isFinite(value)) {
    return {
      error: "Calculation resulted in an invalid number. Check your inputs.",
    };
  }

  return {
    variable: variable,
    value: roundSig_(value, 6),
    unit: unit,
    equation: "(P + an²/V²)(V − nb) = nRT",
    R: R,
    unitsLabel: units === "ATM" ? "atm·L·mol⁻¹·K⁻¹" : "J·mol⁻¹·K⁻¹",
    vdwA: a,
    vdwB: b,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLUTION pH  (weak acid / weak base Ka or Kb)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the pH of a weak acid or weak base solution.
 *
 * For a weak acid:  Ka·(c − x) = x²  →  find x by bisection, pH = −log₁₀(x)
 * For a weak base:  Kb·(c − x) = x²  →  find x by bisection, pH = 14 + log₁₀(x)
 *
 * @param {Object} p - { concentration, Ka, Kb }
 *   Provide Ka for acid or Kb for base (not both).
 * @return {Object} { pH, type, concentration, Kvalue, x } or { error }
 */
function solveSolutionPH(p) {
  var conc = parseNumeric_(p.concentration);
  var Ka = parseNumeric_(p.Ka);
  var Kb = parseNumeric_(p.Kb);

  if (conc === null || conc <= 0) {
    return { error: "Enter a positive concentration." };
  }
  if ((Ka === null && Kb === null) || (Ka !== null && Kb !== null)) {
    return { error: "Provide either Ka or Kb (not both, not neither)." };
  }

  var isAcid = Ka !== null;
  var Kval = isAcid ? Ka : Kb;
  if (Kval <= 0) {
    return { error: "K must be a positive number." };
  }

  // Solve  K·(c − x) − x² = 0  for x in (0, c)
  var x = bisect_(
    function (x) {
      return Kval * (conc - x) - x * x;
    },
    1e-15,
    conc,
    1e-12,
    200,
  );

  if (x === null) {
    return { error: "Could not converge on a solution. Check inputs." };
  }

  var pH;
  if (isAcid) {
    pH = -Math.log(x) / Math.LN10;
  } else {
    pH = 14 + Math.log(x) / Math.LN10;
  }

  return {
    pH: roundSig_(pH, 5),
    type: isAcid ? "Weak acid" : "Weak base",
    concentration: conc,
    Kvalue: Kval,
    x: roundSig_(x, 6),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HENDERSON-HASSELBALCH  (pH = pKa + log([A⁻]/[HA]))
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Henderson-Hasselbalch equation — supports acid and base buffer modes.
 *
 * Acid buffer:  pH  = pKa + log([A⁻] / [HA])
 * Base buffer:  pOH = pKb + log([B]  / [BH⁺])
 *
 * @param {Object} p - { mode, pK, phOrPoh, acidConc, baseConc }
 *   mode: "acid" or "base"
 *   pK: pKa (acid mode) or pKb (base mode)
 *   phOrPoh: pH (acid) or pOH (base)
 *   Leave exactly one of { pK, phOrPoh, acidConc, baseConc } blank.
 * @return {Object} { variable, value, unit, equation, ratio, ratioLabel } or { error }
 */
function solveHendersonHasselbalch(p) {
  var mode = (p.mode || "acid").toLowerCase();
  var solveFor = (p.solveFor || "ph").toLowerCase();
  var pK = parseNumeric_(p.pK);
  var phOrPoh = parseNumeric_(p.phOrPoh);
  var acid = parseNumeric_(p.acidConc);
  var base = parseNumeric_(p.baseConc);

  var isAcid = mode === "acid";
  var pKLabel = isAcid ? "pKa" : "pKb";
  var phLabel = isAcid ? "pH" : "pOH";
  var acidLabel = isAcid ? "[HA]" : "[BH⁺]";
  var baseLabel = isAcid ? "[A⁻]" : "[B]";
  var equation = isAcid
    ? "pH = pKa + log([A⁻] / [HA])"
    : "pOH = pKb + log([B] / [BH⁺])";

  var variable, value, unit, ratio, ratioLabel;

  if (solveFor === "ratio") {
    // Ratio from pK and pH/pOH only
    if (pK === null || phOrPoh === null)
      return { error: "Enter both " + pKLabel + " and " + phLabel + "." };
    ratio = Math.pow(10, phOrPoh - pK);
    variable = baseLabel + " / " + acidLabel;
    value = ratio;
    unit = "";
  } else if (solveFor === "ph") {
    // Solve for pH/pOH
    if (pK === null || acid === null || base === null)
      return {
        error:
          "Enter " + pKLabel + ", " + acidLabel + ", and " + baseLabel + ".",
      };
    if (acid <= 0 || base <= 0)
      return { error: acidLabel + " and " + baseLabel + " must be positive." };
    variable = phLabel;
    value = pK + Math.log(base / acid) / Math.LN10;
    unit = "";
    ratio = base / acid;
    ratioLabel = baseLabel + " / " + acidLabel;
  } else if (solveFor === "pk") {
    // Solve for pKa/pKb
    if (phOrPoh === null || acid === null || base === null)
      return {
        error:
          "Enter " + phLabel + ", " + acidLabel + ", and " + baseLabel + ".",
      };
    if (acid <= 0 || base <= 0)
      return { error: acidLabel + " and " + baseLabel + " must be positive." };
    variable = pKLabel;
    value = phOrPoh - Math.log(base / acid) / Math.LN10;
    unit = "";
    ratio = base / acid;
    ratioLabel = baseLabel + " / " + acidLabel;
  } else if (solveFor === "acid") {
    // Solve for [HA] or [BH⁺]
    if (pK === null || phOrPoh === null || base === null)
      return {
        error: "Enter " + pKLabel + ", " + phLabel + ", and " + baseLabel + ".",
      };
    variable = acidLabel;
    value = base / Math.pow(10, phOrPoh - pK);
    unit = "M";
    ratio = base / value;
    ratioLabel = baseLabel + " / " + acidLabel;
  } else {
    // solveFor === 'base': Solve for [A⁻] or [B]
    if (pK === null || phOrPoh === null || acid === null)
      return {
        error: "Enter " + pKLabel + ", " + phLabel + ", and " + acidLabel + ".",
      };
    variable = baseLabel;
    value = acid * Math.pow(10, phOrPoh - pK);
    unit = "M";
    ratio = value / acid;
    ratioLabel = baseLabel + " / " + acidLabel;
  }

  if (!isFinite(value)) {
    return {
      error: "Calculation resulted in an invalid number. Check your inputs.",
    };
  }

  var result = {
    variable: variable,
    value: roundSig_(value, 6),
    unit: unit,
    equation: equation,
  };

  // Add the conjugate ratio (skip when ratio IS the main result)
  if (ratio !== undefined && isFinite(ratio) && solveFor !== "ratio") {
    result.ratio = roundSig_(ratio, 4);
    result.ratioLabel = ratioLabel;
  }

  // In base buffer mode, also show the corresponding pH = 14 − pOH
  if (!isAcid) {
    var pOHValue = solveFor === "ph" ? value : phOrPoh;
    if (pOHValue !== null && isFinite(pOHValue)) {
      result.derivedPH = roundSig_(14 - pOHValue, 5);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NERNST EQUATION  (E = E° − (RT / nF) · ln Q)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Nernst equation solver.  Solve for whichever variable is blank.
 *
 * @param {Object} p - { E0, E, n, T, Q }
 *   E0 = standard cell potential (V), E = cell potential (V),
 *   n  = moles of electrons, T = temperature (K), Q = reaction quotient
 * @return {Object} { variable, value, unit } or { error }
 */
function solveNernst(p) {
  var E0 = parseNumeric_(p.E0);
  var E = parseNumeric_(p.E);
  var n = parseNumeric_(p.n);
  var T = parseNumeric_(p.T);
  var Q = parseNumeric_(p.Q);

  // Default T to 298.15 K if not provided and not the unknown
  var blanks =
    (E0 === null ? 1 : 0) +
    (E === null ? 1 : 0) +
    (n === null ? 1 : 0) +
    (T === null ? 1 : 0) +
    (Q === null ? 1 : 0);

  if (blanks !== 1) {
    return {
      error:
        "Leave exactly one field blank — that is the variable to solve for.",
    };
  }

  var F = 96485.33212; // Faraday constant (C/mol)
  var R = 8.3145; // Gas constant (J/(mol·K))

  var variable, value, unit;

  if (E === null) {
    if (n <= 0) return { error: "n must be a positive integer." };
    if (Q <= 0) return { error: "Q must be positive." };
    variable = "E";
    value = E0 - ((R * T) / (n * F)) * Math.log(Q);
    unit = "V";
  } else if (E0 === null) {
    if (n <= 0) return { error: "n must be a positive integer." };
    if (Q <= 0) return { error: "Q must be positive." };
    variable = "E°";
    value = E + ((R * T) / (n * F)) * Math.log(Q);
    unit = "V";
  } else if (Q === null) {
    if (n <= 0) return { error: "n must be a positive integer." };
    // Q = exp( (E0 - E) · nF / RT )
    variable = "Q";
    value = Math.exp(((E0 - E) * n * F) / (R * T));
    unit = "";
  } else if (n === null) {
    if (Q <= 0) return { error: "Q must be positive." };
    if (E0 === E) return { error: "E° and E are equal — cannot determine n." };
    // n = (RT · ln(Q)) / (F · (E0 - E))
    variable = "n";
    value = (R * T * Math.log(Q)) / (F * (E0 - E));
    unit = "mol e⁻";
  } else {
    // T is unknown
    if (n <= 0) return { error: "n must be a positive integer." };
    if (Q <= 0) return { error: "Q must be positive." };
    if (E0 === E) return { error: "E° and E are equal — cannot determine T." };
    // T = (E0 - E) · nF / (R · ln(Q))
    variable = "T";
    value = ((E0 - E) * n * F) / (R * Math.log(Q));
    unit = "K";
  }

  if (!isFinite(value)) {
    return {
      error: "Calculation resulted in an invalid number. Check your inputs.",
    };
  }

  return {
    variable: variable,
    value: roundSig_(value, 6),
    unit: unit,
    equation: "E = E° − (RT / nF) · ln Q",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPIRICAL FORMULA  (element mass percentages → formula)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine empirical (and optionally molecular) formula from element mass
 * percentages.
 *
 * @param {Object} p - { entries: [{symbol, massPercent}], molarMass }
 *   entries: array of {symbol: "C", massPercent: 40.0}
 *   molarMass: optional — if provided, returns molecular formula too
 * @return {Object} { empirical, molecular, steps } or { error }
 */
function solveEmpiricalFormula(p) {
  var entries = p.entries;
  if (!entries || entries.length === 0) {
    return { error: "Add at least one element." };
  }

  // Validate and look up atomic masses
  var elements = getElementsData_();
  if (!elements || elements.length === 0) {
    return { error: "Could not load element data." };
  }
  var bySymbol = {};
  for (var i = 0; i < elements.length; i++) {
    bySymbol[elements[i].Symbol] = elements[i];
  }

  var symbols = [];
  var massPercents = [];
  var atomicMasses = [];

  for (var i = 0; i < entries.length; i++) {
    var sym = (entries[i].symbol || "").trim();
    var pct = parseFloat(entries[i].massPercent);
    if (!sym)
      return { error: "Element symbol is blank in row " + (i + 1) + "." };
    if (isNaN(pct) || pct <= 0)
      return { error: "Invalid mass % for " + sym + "." };

    // Accept case-insensitive: normalise to title case
    var symNorm = sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();
    var el = bySymbol[symNorm];
    if (!el) return { error: 'Unknown element: "' + sym + '".' };

    symbols.push(symNorm);
    massPercents.push(pct);
    atomicMasses.push(el.AtomicMass);
  }

  var total = 0;
  for (var i = 0; i < massPercents.length; i++) total += massPercents[i];
  // Allow a small tolerance — normalise to 100 if close
  if (Math.abs(total - 100) > 0.5) {
    return {
      error:
        "Mass percentages sum to " +
        roundSig_(total, 5) +
        "%, but should sum to 100%.",
    };
  }

  // Step 1: moles of each element per 100 g sample
  var moles = [];
  for (var i = 0; i < symbols.length; i++) {
    moles.push(massPercents[i] / atomicMasses[i]);
  }

  // Step 2: divide by the smallest
  var minMol = Infinity;
  for (var i = 0; i < moles.length; i++) {
    if (moles[i] < minMol) minMol = moles[i];
  }
  var ratios = [];
  for (var i = 0; i < moles.length; i++) {
    ratios.push(moles[i] / minMol);
  }

  // Step 3: multiply until all are integers (try multipliers 1–12)
  var empiricalCoefs = null;
  var multiplier = 1;
  for (var m = 1; m <= 12; m++) {
    var scaled = [];
    var allInt = true;
    for (var i = 0; i < ratios.length; i++) {
      var v = ratios[i] * m;
      var rounded = Math.round(v);
      if (Math.abs(v - rounded) > 0.1) {
        allInt = false;
        break;
      }
      scaled.push(rounded);
    }
    if (allInt) {
      empiricalCoefs = scaled;
      multiplier = m;
      break;
    }
  }

  if (!empiricalCoefs) {
    return {
      error: "Could not determine integer ratio — check your mass percentages.",
    };
  }

  // Build empirical formula string (Hill order: C first, H second, then alphabetical)
  var empirical = buildFormulaString_(symbols, empiricalCoefs);

  // Empirical molar mass
  var empMass = 0;
  for (var i = 0; i < symbols.length; i++) {
    empMass += empiricalCoefs[i] * atomicMasses[i];
  }

  var result = {
    empirical: empirical,
    empiricalMass: roundSig_(empMass, 6),
    steps: {
      moles: moles.map(function (v) {
        return roundSig_(v, 5);
      }),
      ratios: ratios.map(function (v) {
        return roundSig_(v, 4);
      }),
      multiplier: multiplier,
      coefficients: empiricalCoefs,
    },
  };

  // Molecular formula
  var mm = parseNumeric_(p.molarMass);
  if (mm !== null && mm > 0) {
    var factor = Math.round(mm / empMass);
    if (factor < 1) factor = 1;
    var molCoefs = [];
    for (var i = 0; i < empiricalCoefs.length; i++) {
      molCoefs.push(empiricalCoefs[i] * factor);
    }
    result.molecular = buildFormulaString_(symbols, molCoefs);
    result.molecularFactor = factor;
    result.molecularMass = roundSig_(empMass * factor, 6);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HESS'S LAW  (ΔH target from known reactions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve for the enthalpy of a target reaction using Hess's Law.
 *
 * @param {Object} p - { reactions: [{equation, dH}], target }
 * @return {Object} { dH, multipliers, steps } or { error }
 */
function solveHessLaw(p) {
  var reactions = p.reactions;
  var target = p.target;
  if (!reactions || reactions.length === 0)
    return { error: "Add at least one known reaction." };
  if (!target || !target.trim()) return { error: "Enter a target reaction." };

  // Parse each known reaction into compound→coefficient map
  var reactionMaps = [];
  var enthalpies = [];
  for (var i = 0; i < reactions.length; i++) {
    if (!reactions[i].equation || !reactions[i].equation.trim())
      return { error: "Reaction " + (i + 1) + " equation is blank." };
    var dH = parseNumeric_(reactions[i].dH);
    if (dH === null) return { error: "Enter ΔH for reaction " + (i + 1) + "." };
    var map = parseReactionCoeffMap_(reactions[i].equation);
    if (map.error) return { error: "Reaction " + (i + 1) + ": " + map.error };
    reactionMaps.push(map);
    enthalpies.push(dH);
  }

  var targetMap = parseReactionCoeffMap_(target);
  if (targetMap.error) return { error: "Target: " + targetMap.error };

  // Collect all unique compounds
  var compSet = {};
  for (var i = 0; i < reactionMaps.length; i++) {
    var keys = Object.keys(reactionMaps[i]);
    for (var j = 0; j < keys.length; j++) compSet[keys[j]] = true;
  }
  var tKeys = Object.keys(targetMap);
  for (var j = 0; j < tKeys.length; j++) compSet[tKeys[j]] = true;
  var compounds = Object.keys(compSet);

  var m = compounds.length; // rows
  var n = reactionMaps.length; // cols

  // Build matrix A (m×n) and vector b (m×1)
  var A = [];
  var b = [];
  for (var j = 0; j < m; j++) {
    var row = [];
    for (var i = 0; i < n; i++) {
      row.push(reactionMaps[i][compounds[j]] || 0);
    }
    A.push(row);
    b.push(targetMap[compounds[j]] || 0);
  }

  // Solve using least squares: x = (AᵀA)⁻¹ Aᵀb
  var x = leastSquaresSolve_(A, b);
  if (!x)
    return {
      error:
        "Could not determine reaction multipliers — check the reactions and target.",
    };

  // Compute ΔH
  var dHTarget = 0;
  var steps = [];
  for (var i = 0; i < n; i++) {
    dHTarget += x[i] * enthalpies[i];
    steps.push({
      multiplier: roundSig_(x[i], 4),
      dH: enthalpies[i],
      contribution: roundSig_(x[i] * enthalpies[i], 6),
    });
  }

  return {
    dH: roundSig_(dHTarget, 6),
    multipliers: x.map(function (v) {
      return roundSig_(v, 4);
    }),
    steps: steps,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEORETICAL YIELD  (limiting reagent & product mass)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate theoretical yield, identify limiting reagent, and compute
 * excess reagent masses.
 *
 * @param {Object} p - { equation, product, reagents: [{formula, mass}], yieldPercent }
 * @return {Object} { limitingReagent, theoreticalYield, actualYield,
 *                     yieldPercent, excess, productFormula } or { error }
 */
function solveTheoreticalYield(p) {
  if (!p.equation || !p.equation.trim())
    return { error: "Enter a chemical equation." };
  if (!p.product || !p.product.trim())
    return { error: "Enter the product formula." };
  if (!p.reagents || p.reagents.length === 0)
    return { error: "Add at least one reagent." };

  // Balance the equation
  var balanced = balanceEquation(p.equation);
  if (balanced.error) return { error: "Could not balance: " + balanced.error };

  var eqn = parseEquation_(p.equation);
  var coefs = balanced.coefficients;
  var allTerms = eqn.leftSide.concat(eqn.rightSide);

  // Build element-count maps for each term in the equation
  var termMaps = [];
  var termFormulas = [];
  for (var i = 0; i < allTerms.length; i++) {
    var formula = termToString_(allTerms[i]);
    termFormulas.push(formula);
    termMaps.push(termToElementCount_(allTerms[i]));
  }

  // Find the product in the equation
  var productCounts = parseFormulaCounts_(p.product.trim());
  var productIdx = -1;
  for (var i = 0; i < allTerms.length; i++) {
    if (elementMapsEqual_(termMaps[i], productCounts)) {
      productIdx = i;
      break;
    }
  }
  if (productIdx === -1)
    return {
      error:
        'Product "' +
        p.product.trim() +
        '" not found in the equation. Check the formula.',
    };

  var productCoef = coefs[productIdx];

  // Compute product molar mass
  var elements = getElementsData_();
  var bySymbol = {};
  for (var i = 0; i < elements.length; i++)
    bySymbol[elements[i].Symbol] = elements[i];

  var productMM = computeMolarMass_(productCounts, bySymbol);
  if (productMM === null)
    return { error: "Unknown element in product formula." };

  // Match each reagent to an equation term and compute scaled amounts
  var scaledAmounts = [];
  var reagentInfo = [];
  for (var ri = 0; ri < p.reagents.length; ri++) {
    var rForm = (p.reagents[ri].formula || "").trim();
    var rMass = parseNumeric_(p.reagents[ri].mass);
    if (!rForm) return { error: "Reagent " + (ri + 1) + " formula is blank." };
    if (rMass === null || rMass <= 0)
      return { error: "Enter a positive mass for " + rForm + "." };

    var reagentCounts = parseFormulaCounts_(rForm);
    var termIdx = -1;
    for (var ti = 0; ti < allTerms.length; ti++) {
      if (elementMapsEqual_(termMaps[ti], reagentCounts)) {
        termIdx = ti;
        break;
      }
    }
    if (termIdx === -1)
      return {
        error: '"' + rForm + '" not found in the equation. Check the formula.',
      };
    if (termIdx >= eqn.leftSide.length)
      return {
        error: '"' + rForm + '" is a product, not a reactant.',
      };

    var reagentMM = computeMolarMass_(reagentCounts, bySymbol);
    if (reagentMM === null)
      return { error: "Unknown element in " + rForm + "." };

    var moles = rMass / reagentMM;
    var scaled = (moles / coefs[termIdx]) * productCoef;
    scaledAmounts.push(scaled);
    reagentInfo.push({
      formula: rForm,
      mass: rMass,
      molarMass: reagentMM,
      moles: moles,
      coef: coefs[termIdx],
      scaled: scaled,
      termIdx: termIdx,
    });
  }

  // Find limiting reagent (smallest scaled amount)
  var minScaled = Infinity;
  var limIdx = 0;
  for (var i = 0; i < scaledAmounts.length; i++) {
    if (scaledAmounts[i] < minScaled) {
      minScaled = scaledAmounts[i];
      limIdx = i;
    }
  }

  var theoYield = minScaled * productMM;

  // Yield factor
  var yieldPct = parseNumeric_(p.yieldPercent);
  var actualYield = null;
  if (yieldPct !== null) {
    if (yieldPct <= 0 || yieldPct > 100)
      return { error: "Yield percent must be between 0 and 100." };
    actualYield = theoYield * (yieldPct / 100);
  }

  // Excess reagent masses
  var excess = [];
  for (var i = 0; i < reagentInfo.length; i++) {
    if (i === limIdx) {
      excess.push({ formula: reagentInfo[i].formula, excess: 0 });
    } else {
      var usedMoles = (minScaled / productCoef) * reagentInfo[i].coef;
      var excessMass =
        (reagentInfo[i].moles - usedMoles) * reagentInfo[i].molarMass;
      excess.push({
        formula: reagentInfo[i].formula,
        excess: roundSig_(excessMass, 6),
      });
    }
  }

  var result = {
    limitingReagent: reagentInfo[limIdx].formula,
    theoreticalYield: roundSig_(theoYield, 6),
    productFormula: p.product.trim(),
    productMolarMass: roundSig_(productMM, 6),
    excess: excess,
    reagentDetails: reagentInfo.map(function (r) {
      return {
        formula: r.formula,
        mass: r.mass,
        moles: roundSig_(r.moles, 6),
        coef: r.coef,
      };
    }),
  };

  if (actualYield !== null) {
    result.actualYield = roundSig_(actualYield, 6);
    result.yieldPercent = yieldPct;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBUSTION ANALYSIS  (product masses → empirical / molecular formula)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the empirical/molecular formula from combustion product masses.
 *
 * @param {Object} p - { co2Mass, h2oMass, n2Mass, so2Mass, sampleMass, molarMass }
 * @return {Object} { empirical, molecular, elementBreakdown } or { error }
 */
function solveCombustion(p) {
  var co2 = parseNumeric_(p.co2Mass);
  var h2o = parseNumeric_(p.h2oMass);
  var n2 = parseNumeric_(p.n2Mass);
  var so2 = parseNumeric_(p.so2Mass);
  var sampleMass = parseNumeric_(p.sampleMass);
  var mm = parseNumeric_(p.molarMass);

  if (co2 === null && h2o === null)
    return { error: "Enter at least one product mass (CO₂ or H₂O)." };

  // Product → [atoms_of_element, compound_molar_mass, element_atomic_mass, element_symbol]
  var products = [];
  if (co2 !== null && co2 > 0) products.push([1, 44.009, 12.011, "C", co2]);
  if (h2o !== null && h2o > 0) products.push([2, 18.015, 1.008, "H", h2o]);
  if (n2 !== null && n2 > 0) products.push([2, 28.014, 14.007, "N", n2]);
  if (so2 !== null && so2 > 0) products.push([1, 64.066, 32.065, "S", so2]);

  if (products.length === 0)
    return { error: "All product masses are zero or blank." };

  // Calculate element masses and moles
  var symbols = [];
  var elementMasses = [];
  var moles = [];
  var totalElementMass = 0;

  for (var i = 0; i < products.length; i++) {
    var atoms = products[i][0];
    var compMM = products[i][1];
    var elemAM = products[i][2];
    var sym = products[i][3];
    var prodMass = products[i][4];

    var molesOfCompound = prodMass / compMM;
    var molesOfElement = molesOfCompound * atoms;
    var massOfElement = molesOfElement * elemAM;

    symbols.push(sym);
    elementMasses.push(massOfElement);
    moles.push(molesOfElement);
    totalElementMass += massOfElement;
  }

  // Oxygen by difference
  if (sampleMass !== null && sampleMass > 0) {
    var oxygenMass = sampleMass - totalElementMass;
    if (oxygenMass > 0.0001) {
      var oMoles = oxygenMass / 15.999;
      symbols.push("O");
      elementMasses.push(oxygenMass);
      moles.push(oMoles);
    } else if (oxygenMass < -0.01) {
      return {
        error:
          "Sum of element masses (" +
          roundSig_(totalElementMass, 5) +
          " g) exceeds sample mass (" +
          sampleMass +
          " g).",
      };
    }
  }

  // Divide by smallest moles to get ratios
  var minMol = Infinity;
  for (var i = 0; i < moles.length; i++) {
    if (moles[i] < minMol) minMol = moles[i];
  }
  var ratios = [];
  for (var i = 0; i < moles.length; i++) {
    ratios.push(moles[i] / minMol);
  }

  // Multiply until all integers (try 1–12)
  var empiricalCoefs = null;
  var multiplier = 1;
  for (var m = 1; m <= 12; m++) {
    var scaled = [];
    var allInt = true;
    for (var i = 0; i < ratios.length; i++) {
      var v = ratios[i] * m;
      var rounded = Math.round(v);
      if (Math.abs(v - rounded) > 0.1) {
        allInt = false;
        break;
      }
      scaled.push(rounded);
    }
    if (allInt) {
      empiricalCoefs = scaled;
      multiplier = m;
      break;
    }
  }

  if (!empiricalCoefs)
    return {
      error: "Could not determine integer ratio — check your masses.",
    };

  var empirical = buildFormulaString_(symbols, empiricalCoefs);

  // Empirical molar mass
  var atomicMasses = { C: 12.011, H: 1.008, N: 14.007, O: 15.999, S: 32.065 };
  var empMass = 0;
  for (var i = 0; i < symbols.length; i++) {
    empMass += empiricalCoefs[i] * atomicMasses[symbols[i]];
  }

  var result = {
    empirical: empirical,
    empiricalMass: roundSig_(empMass, 6),
    breakdown: [],
    steps: {
      moles: moles.map(function (v) {
        return roundSig_(v, 5);
      }),
      ratios: ratios.map(function (v) {
        return roundSig_(v, 4);
      }),
      multiplier: multiplier,
      coefficients: empiricalCoefs,
    },
  };

  for (var i = 0; i < symbols.length; i++) {
    result.breakdown.push({
      symbol: symbols[i],
      mass: roundSig_(elementMasses[i], 5),
      moles: roundSig_(moles[i], 5),
      ratio: roundSig_(ratios[i], 4),
      subscript: empiricalCoefs[i],
    });
  }

  // Molecular formula
  if (mm !== null && mm > 0) {
    var factor = Math.round(mm / empMass);
    if (factor < 1) factor = 1;
    var molCoefs = [];
    for (var i = 0; i < empiricalCoefs.length; i++) {
      molCoefs.push(empiricalCoefs[i] * factor);
    }
    result.molecular = buildFormulaString_(symbols, molCoefs);
    result.molecularFactor = factor;
    result.molecularMass = roundSig_(empMass * factor, 6);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLUBILITY / Ksp  (molar solubility, precipitation test)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solubility and Ksp calculations.
 *
 * Modes:
 *   "sFromKsp"  — molar solubility from Ksp
 *   "kspFromS"  — Ksp from molar solubility
 *   "precipTest" — compare Q to Ksp
 *   "phSolubility" — pH-dependent solubility
 *
 * @param {Object} p - { mode, nuCat, nuAn, Ksp, solubility,
 *                        c1, v1, c2, v2, pH }
 * @return {Object} result or { error }
 */
function solveSolubility(p) {
  var mode = (p.mode || "sFromKsp").trim();

  // Henry's Law doesn't use stoichiometric coefficients — handle early
  if (mode === "henry") {
    return solveHenryLaw_(p);
  }

  var nuCat = parseNumeric_(p.nuCat);
  var nuAn = parseNumeric_(p.nuAn);

  if (nuCat === null || nuAn === null || nuCat < 1 || nuAn < 1)
    return {
      error: "Enter positive integer stoichiometric coefficients (ν₊ and ν₋).",
    };
  nuCat = Math.round(nuCat);
  nuAn = Math.round(nuAn);
  var nuTotal = nuCat + nuAn;

  if (mode === "sFromKsp") {
    var Ksp = parseNumeric_(p.Ksp);
    if (Ksp === null || Ksp <= 0)
      return { error: "Enter a positive Ksp value." };

    // s = (Ksp / (nuCat^nuCat · nuAn^nuAn))^(1/nuTotal)
    var denom = Math.pow(nuCat, nuCat) * Math.pow(nuAn, nuAn);
    var s = Math.pow(Ksp / denom, 1 / nuTotal);

    return {
      mode: "Molar solubility from Ksp",
      solubility: roundSig_(s, 6),
      unit: "mol/L",
      Ksp: Ksp,
      formula: "s = (Ksp / ν₊^ν₊ · ν₋^ν₋)^(1/(ν₊+ν₋))",
      catConc: roundSig_(nuCat * s, 6),
      anConc: roundSig_(nuAn * s, 6),
      solNote: classifySolubility_(s),
      kspNote: classifyKsp_(Ksp),
    };
  }

  if (mode === "kspFromS") {
    var sol = parseNumeric_(p.solubility);
    if (sol === null || sol <= 0)
      return { error: "Enter a positive molar solubility." };

    // Ksp = (nuCat·s)^nuCat · (nuAn·s)^nuAn
    var Ksp = Math.pow(nuCat * sol, nuCat) * Math.pow(nuAn * sol, nuAn);

    return {
      mode: "Ksp from molar solubility",
      Ksp: roundSig_(Ksp, 6),
      KspSci: Ksp.toExponential(4),
      solubility: sol,
      formula: "Ksp = (ν₊·s)^ν₊ · (ν₋·s)^ν₋",
      solNote: classifySolubility_(sol),
      kspNote: classifyKsp_(Ksp),
    };
  }

  if (mode === "precipTest") {
    var Ksp = parseNumeric_(p.Ksp);
    var c1 = parseNumeric_(p.c1);
    var v1 = parseNumeric_(p.v1);
    var c2 = parseNumeric_(p.c2);
    var v2 = parseNumeric_(p.v2);
    if (Ksp === null || Ksp <= 0)
      return { error: "Enter a positive Ksp value." };
    if (c1 === null || v1 === null || c2 === null || v2 === null)
      return { error: "Enter all concentrations and volumes." };

    var vTot = v1 + v2;
    if (vTot <= 0) return { error: "Total volume must be positive." };

    var concCat = (c1 * v1) / vTot;
    var concAn = (c2 * v2) / vTot;
    var Q = Math.pow(concCat, nuCat) * Math.pow(concAn, nuAn);

    var verdict;
    if (Q > Ksp * 1.001) verdict = "Q > Ksp → Precipitate forms";
    else if (Q < Ksp * 0.999) verdict = "Q < Ksp → No precipitate";
    else verdict = "Q ≈ Ksp → At saturation";

    return {
      mode: "Precipitation test",
      Q: roundSig_(Q, 6),
      QSci: Q.toExponential(4),
      Ksp: Ksp,
      KspSci: Ksp.toExponential(4),
      verdict: verdict,
      concCat: roundSig_(concCat, 6),
      concAn: roundSig_(concAn, 6),
      formula: "Q = [cat]^ν₊ · [an]^ν₋",
    };
  }

  if (mode === "phSolubility") {
    var Ksp = parseNumeric_(p.Ksp);
    var pH = parseNumeric_(p.pH);
    if (Ksp === null || Ksp <= 0)
      return { error: "Enter a positive Ksp value." };
    if (pH === null) return { error: "Enter a pH value." };

    // [OH⁻] = 10^(-(14-pH))
    var Kw = 1.008e-14;
    var ohConc = Math.pow(10, -(14 - pH));

    // s = (Ksp / (nuCat^nuCat · [OH⁻]^nuAn))^(1/nuCat)
    var s = Math.pow(
      Ksp / (Math.pow(nuCat, nuCat) * Math.pow(ohConc, nuAn)),
      1 / nuCat,
    );

    if (!isFinite(s) || s < 0)
      return { error: "No valid solubility at this pH." };

    return {
      mode: "pH-dependent solubility",
      solubility: roundSig_(s, 6),
      unit: "mol/L",
      pH: pH,
      ohConc: roundSig_(ohConc, 6),
      Ksp: Ksp,
      formula: "s = (Ksp / (ν₊^ν₊ · [OH⁻]^ν₋))^(1/ν₊)",
      solNote: classifySolubility_(s),
    };
  }

  return { error: 'Unknown mode: "' + mode + '".' };
}

/**
 * Henry's Law: solubility of gas in liquid.
 * c = kH · p  or  c = p / KH
 */
function solveHenryLaw_(p) {
  var kH = parseNumeric_(p.kH);
  var pGas = parseNumeric_(p.pGas);
  var cGas = parseNumeric_(p.cGas);
  var kHUnit = (p.kHUnit || "mol_L_atm").trim();

  if (kH !== null && kH > 0 && pGas !== null && pGas > 0) {
    var c;
    if (kHUnit === "L_atm_mol") {
      c = pGas / kH;
    } else {
      c = kH * pGas;
    }
    return {
      mode: "Henry's Law — dissolved concentration",
      concentration: roundSig_(c, 6),
      unit: "mol/L",
      kH: kH,
      pGas: pGas,
      formula: kHUnit === "L_atm_mol" ? "c = p / KH" : "c = kH · p",
      note: "Valid for dilute solutions at moderate pressures with no solute-solvent reaction.",
    };
  } else if (cGas !== null && cGas > 0 && pGas !== null && pGas > 0) {
    var kHCalc = cGas / pGas;
    return {
      mode: "Henry's Law — kH from data",
      kH: roundSig_(kHCalc, 6),
      unit: "mol/(L·atm)",
      concentration: cGas,
      pGas: pGas,
      formula: "kH = c / p",
      note: "Valid for dilute solutions at moderate pressures with no solute-solvent reaction.",
    };
  } else {
    return {
      error: "Enter either (kH + p) to find c, or (c + p) to find kH.",
    };
  }
}

/**
 * Classify molar solubility into a descriptive range.
 */
function classifySolubility_(s) {
  if (s >= 1) return "Highly soluble (s ≥ 1 mol/L)";
  if (s >= 0.1) return "Soluble (s ≥ 0.1 mol/L)";
  if (s >= 0.01) return "Moderately soluble (0.01–0.1 mol/L)";
  if (s >= 1e-4) return "Slightly soluble (10⁻⁴–10⁻² mol/L)";
  if (s >= 1e-6) return "Sparingly soluble (10⁻⁶–10⁻⁴ mol/L)";
  return "Practically insoluble (s < 10⁻⁶ mol/L)";
}

/**
 * Classify Ksp into a descriptive range.
 */
function classifyKsp_(Ksp) {
  if (Ksp >= 1) return "Very high Ksp — highly soluble";
  if (Ksp >= 1e-3) return "High Ksp — soluble";
  if (Ksp >= 1e-6) return "Moderate Ksp";
  if (Ksp >= 1e-12) return "Low Ksp — poorly soluble";
  if (Ksp >= 1e-20) return "Very low Ksp — nearly insoluble";
  return "Extremely low Ksp — essentially insoluble";
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC EQUILIBRIUM  (equilibrium concentrations from K)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute equilibrium concentrations given an equation, initial
 * concentrations, and the equilibrium constant K.
 *
 * @param {Object} p - { equation, concentrations (comma-separated), K }
 *   concentrations: in the order they appear in the equation
 *   (reactants first, then products)
 * @return {Object} { species: [{formula, initial, equilibrium, coef}], K } or { error }
 */
function solveEquilibrium(p) {
  if (!p.equation || !p.equation.trim())
    return { error: "Enter a chemical equation." };

  var mode = (p.mode || "concentrations").trim();

  // Parse equation
  var eqn;
  try {
    eqn = parseEquation_(p.equation);
  } catch (e) {
    return { error: "Could not parse equation: " + e.message };
  }

  var nReact = eqn.leftSide.length;
  var nProd = eqn.rightSide.length;
  var nTotal = nReact + nProd;

  // Balance to get stoichiometric coefficients
  var balanced = balanceEquation(p.equation);
  if (balanced.error) return { error: "Could not balance: " + balanced.error };
  var coefs = balanced.coefficients;

  // Build species names
  var allTerms = eqn.leftSide.concat(eqn.rightSide);
  var speciesNames = [];
  for (var i = 0; i < nTotal; i++)
    speciesNames.push(termToString_(allTerms[i]));

  // Build Kc expression string
  var exprNum = [];
  var exprDen = [];
  for (var i = nReact; i < nTotal; i++) {
    exprNum.push(
      "[" + speciesNames[i] + "]" + (coefs[i] > 1 ? "^" + coefs[i] : ""),
    );
  }
  for (var i = 0; i < nReact; i++) {
    exprDen.push(
      "[" + speciesNames[i] + "]" + (coefs[i] > 1 ? "^" + coefs[i] : ""),
    );
  }
  var exprStr =
    "Kc = " + exprNum.join(" · ") + " / (" + exprDen.join(" · ") + ")";

  // ─── Qc mode ──────────────────────────────────────────
  if (mode === "qc") {
    var concStr = (p.concentrations || "").trim();
    if (!concStr)
      return {
        error:
          "Enter current concentrations (" +
          nTotal +
          " values, comma-separated).",
      };
    var concParts = concStr.split(/[,;\s]+/);
    if (concParts.length !== nTotal)
      return {
        error:
          "Expected " + nTotal + " values but got " + concParts.length + ".",
      };

    var concs = [];
    for (var i = 0; i < nTotal; i++) {
      var c = parseNumeric_(concParts[i]);
      if (c === null || c < 0)
        return { error: "Invalid concentration: " + concParts[i] };
      concs.push(c);
    }

    // Compute Qc = Π(products^coef) / Π(reactants^coef)
    var numProd = 1,
      denProd = 1;
    for (var i = nReact; i < nTotal; i++)
      numProd *= Math.pow(concs[i], coefs[i]);
    for (var i = 0; i < nReact; i++) denProd *= Math.pow(concs[i], coefs[i]);
    var Qc = denProd > 0 ? numProd / denProd : Infinity;

    var species = [];
    for (var i = 0; i < nTotal; i++) {
      species.push({
        formula: speciesNames[i],
        concentration: concs[i],
        coef: coefs[i],
      });
    }

    var result = {
      Qc: roundSig_(Qc, 6),
      species: species,
      expression: exprStr.replace("Kc", "Qc"),
    };

    // Compare with K if provided
    var K = parseNumeric_(p.K);
    if (K !== null && K > 0) {
      result.K = K;
      if (Math.abs(Qc - K) / Math.max(K, 1e-30) < 0.01) {
        result.direction = "System is at equilibrium (Qc ≈ K).";
      } else if (Qc < K) {
        result.direction =
          "Qc < K → reaction proceeds to the right (towards products).";
      } else {
        result.direction =
          "Qc > K → reaction proceeds to the left (towards reactants).";
      }
    }
    return result;
  }

  // ─── Kc mode ──────────────────────────────────────────
  if (mode === "kc") {
    var concStr = (p.concentrations || "").trim();
    if (!concStr)
      return {
        error:
          "Enter equilibrium concentrations (" +
          nTotal +
          " values, comma-separated).",
      };
    var concParts = concStr.split(/[,;\s]+/);
    if (concParts.length !== nTotal)
      return {
        error:
          "Expected " + nTotal + " values but got " + concParts.length + ".",
      };

    var concs = [];
    for (var i = 0; i < nTotal; i++) {
      var c = parseNumeric_(concParts[i]);
      if (c === null || c < 0)
        return { error: "Invalid concentration: " + concParts[i] };
      concs.push(c);
    }

    var numProd = 1,
      denProd = 1;
    for (var i = nReact; i < nTotal; i++)
      numProd *= Math.pow(concs[i], coefs[i]);
    for (var i = 0; i < nReact; i++) denProd *= Math.pow(concs[i], coefs[i]);
    var Kc = denProd > 0 ? numProd / denProd : Infinity;

    var species = [];
    for (var i = 0; i < nTotal; i++) {
      species.push({
        formula: speciesNames[i],
        concentration: concs[i],
        coef: coefs[i],
      });
    }

    return {
      Kc: roundSig_(Kc, 6),
      species: species,
      expression: exprStr,
    };
  }

  // ─── Concentrations mode (ICE table) ──────────────────
  var K = parseNumeric_(p.K);
  if (K === null || K <= 0) return { error: "Enter a positive K value." };

  // Parse initial concentrations
  var concStr = (p.concentrations || "").trim();
  if (!concStr)
    return {
      error:
        "Enter initial concentrations (comma-separated, " +
        nTotal +
        " values).",
    };
  var concParts = concStr.split(/[,;\s]+/);
  if (concParts.length !== nTotal)
    return {
      error:
        "Expected " +
        nTotal +
        " concentration values but got " +
        concParts.length +
        ".",
    };

  var initConc = [];
  for (var i = 0; i < nTotal; i++) {
    var c = parseNumeric_(concParts[i]);
    if (c === null || c < 0)
      return { error: "Invalid concentration value: " + concParts[i] };
    initConc.push(c);
  }

  // Build species list
  var allTerms = eqn.leftSide.concat(eqn.rightSide);
  var species = [];
  for (var i = 0; i < nTotal; i++) {
    species.push({
      formula: termToString_(allTerms[i]),
      initial: initConc[i],
      coef: coefs[i],
      isProduct: i >= nReact,
    });
  }

  // Equilibrium expression (ICE table approach):
  // Reactants: [R_i]_eq = C_i - coef_i * x
  // Products:  [P_j]_eq = C_j + coef_j * x
  // K = Π([P_j]^coef_j) / Π([R_i]^coef_i)
  // Solve f(x) = K · Π(reactant_eq^coef) - Π(product_eq^coef) = 0

  // Determine x range: x must be >= 0 and reactant concentrations must stay >= 0
  var maxX = Infinity;
  for (var i = 0; i < nReact; i++) {
    var limit = initConc[i] / coefs[i];
    if (limit < maxX) maxX = limit;
  }
  if (maxX <= 0)
    return { error: "No reactant concentration available for reaction." };

  var x = bisect_(
    function (x) {
      var reactProd = 1;
      var prodProd = 1;
      for (var i = 0; i < nReact; i++) {
        var ceq = initConc[i] - coefs[i] * x;
        if (ceq < 0) return -1e30;
        reactProd *= Math.pow(ceq, coefs[i]);
      }
      for (var i = nReact; i < nTotal; i++) {
        var ceq = initConc[i] + coefs[i] * x;
        prodProd *= Math.pow(ceq, coefs[i]);
      }
      return K * reactProd - prodProd;
    },
    0,
    maxX - 1e-15,
    1e-12,
    500,
  );

  if (x === null)
    return {
      error: "Could not converge — check the equation and concentrations.",
    };

  // Compute equilibrium concentrations
  for (var i = 0; i < nTotal; i++) {
    if (i < nReact) {
      species[i].equilibrium = roundSig_(
        Math.max(0, initConc[i] - coefs[i] * x),
        6,
      );
    } else {
      species[i].equilibrium = roundSig_(initConc[i] + coefs[i] * x, 6);
    }
  }

  // Verify K
  var reactProd = 1;
  var prodProd = 1;
  for (var i = 0; i < nReact; i++)
    reactProd *= Math.pow(species[i].equilibrium, coefs[i]);
  for (var i = nReact; i < nTotal; i++)
    prodProd *= Math.pow(species[i].equilibrium, coefs[i]);
  var Kcheck = reactProd > 0 ? prodProd / reactProd : Infinity;

  return {
    species: species,
    K: K,
    Kcheck: roundSig_(Kcheck, 4),
    x: roundSig_(x, 6),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUFFER SOLUTION  (pH, addition, capacity, range, preparation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Buffer solution calculations.
 *
 * Modes:
 *   "ph"          — Calculate buffer pH
 *   "addition"    — pH after adding strong acid/base
 *   "capacity"    — Van Slyke buffer capacity β
 *   "range"       — Effective buffer range
 *   "preparation" — How to prepare a buffer at target pH
 *
 * Buffer types:
 *   "wa-cb"  — Weak acid + conjugate base (salt)
 *   "wa-sb"  — Weak acid + strong base (partial neutralisation → buffer)
 *   "wb-ca"  — Weak base + conjugate acid (salt)
 *   "wb-sa"  — Weak base + strong acid (partial neutralisation → buffer)
 *
 * @param {Object} p - { mode, type, Ka, cAcid, cBase, vAcid, vBase,
 *                        addType, addConc, addVol, addN,
 *                        targetPH, totalConc, totalVol }
 */
function solveBuffer(p) {
  var mode = (p.mode || "ph").trim();
  var bufType = (p.type || "wa-cb").trim();
  var Ka = parseNumeric_(p.Ka);
  var Kw = 1.008e-14;

  // Is this an acid buffer or a base buffer?
  var isAcid = bufType === "wa-cb" || bufType === "wa-sb";

  // ─── Buffer Range ─────────────────────────────────────
  if (mode === "range") {
    if (Ka === null || Ka <= 0)
      return { error: "Enter a positive Ka (or Kb) value." };
    var pK = -Math.log(Ka) / Math.LN10;
    return {
      mode: "Buffer range",
      pKa: roundSig_(pK, 4),
      rangeLow: roundSig_(pK - 1, 4),
      rangeHigh: roundSig_(pK + 1, 4),
      formula: isAcid
        ? "Effective range: pKa ± 1"
        : "Effective pH range: (14 − pKb) ± 1",
    };
  }

  // ─── Buffer Preparation ───────────────────────────────
  if (mode === "preparation") {
    if (Ka === null || Ka <= 0)
      return { error: "Enter a positive Ka (or Kb) value." };
    var targetPH = parseNumeric_(p.targetPH);
    var totalConc = parseNumeric_(p.totalConc);
    var totalVol = parseNumeric_(p.totalVol);
    if (targetPH === null) return { error: "Enter the target pH." };
    if (totalConc === null || totalConc <= 0)
      return { error: "Enter a positive total concentration." };
    if (totalVol === null || totalVol <= 0)
      return { error: "Enter a positive total volume." };

    var pK = -Math.log(Ka) / Math.LN10;
    var ratio, cConjugate, cWeak;
    if (isAcid) {
      // ratio = [A-]/[HA] = 10^(pH - pKa)
      ratio = Math.pow(10, targetPH - pK);
      cConjugate = (totalConc * ratio) / (1 + ratio);
      cWeak = totalConc - cConjugate;
    } else {
      // For base buffer: pOH = 14 - pH; ratio = [BH+]/[B] = 10^(pOH - pKb)
      var pOHTarget = 14 - targetPH;
      ratio = Math.pow(10, pOHTarget - pK);
      cConjugate = (totalConc * ratio) / (1 + ratio);
      cWeak = totalConc - cConjugate;
    }
    var nWeak = cWeak * totalVol;
    var nConj = cConjugate * totalVol;

    return {
      mode: "Buffer preparation",
      targetPH: targetPH,
      pKa: roundSig_(pK, 4),
      cAcid: roundSig_(isAcid ? cWeak : cConjugate, 6),
      cBase: roundSig_(isAcid ? cConjugate : cWeak, 6),
      nAcid: roundSig_(isAcid ? nWeak : nConj, 6),
      nBase: roundSig_(isAcid ? nConj : nWeak, 6),
      totalConc: totalConc,
      totalVol: totalVol,
      ratio: roundSig_(ratio, 4),
      formula: isAcid
        ? "ratio [A⁻]/[HA] = 10^(pH − pKa); cBase = Ctot · ratio / (1 + ratio)"
        : "ratio [BH⁺]/[B] = 10^(pOH − pKb); cAcid = Ctot · ratio / (1 + ratio)",
    };
  }

  // ─── Buffer Capacity ──────────────────────────────────
  if (mode === "capacity") {
    if (Ka === null || Ka <= 0)
      return { error: "Enter a positive Ka (or Kb) value." };
    var cAcid = parseNumeric_(p.cAcid);
    var cBase = parseNumeric_(p.cBase);
    if (cAcid === null || cBase === null || cAcid <= 0 || cBase <= 0)
      return { error: "Enter positive concentrations." };

    var Kval = Ka;
    var cTotal = cAcid + cBase;
    var hPlus;
    if (isAcid) {
      // Ka·(cAcid - x) = (cBase + x)·x
      hPlus = bisect_(
        function (x) {
          return Kval * (cAcid - x) - (cBase + x) * x;
        },
        1e-15,
        cAcid,
        1e-14,
        300,
      );
      if (hPlus === null) return { error: "Could not solve for [H⁺]." };
    } else {
      // Kb·(cBase - x) = (cAcid + x)·x  →  x = [OH⁻]
      var ohMinus = bisect_(
        function (x) {
          return Kval * (cBase - x) - (cAcid + x) * x;
        },
        1e-15,
        cBase,
        1e-14,
        300,
      );
      if (ohMinus === null) return { error: "Could not solve for [OH⁻]." };
      hPlus = Kw / ohMinus;
    }

    // Van Slyke: β = 2.303·(Kw/[H⁺] + [H⁺] + Ctot·Ka_eff·[H⁺]/(Ka_eff+[H⁺])²)
    var Ka_eff = isAcid ? Ka : Kw / Ka; // Convert Kb to Ka for Van Slyke
    var beta =
      2.303 *
      (Kw / hPlus +
        hPlus +
        (cTotal * Ka_eff * hPlus) / Math.pow(Ka_eff + hPlus, 2));
    var pH = -Math.log(hPlus) / Math.LN10;

    return {
      mode: "Buffer capacity (Van Slyke)",
      beta: roundSig_(beta, 6),
      pH: roundSig_(pH, 5),
      formula: "β = 2.303·(Kw/[H⁺] + [H⁺] + Ctot·Ka·[H⁺]/(Ka+[H⁺])²)",
    };
  }

  // ─── Buffer pH & Addition (shared parsing) ────────────
  if (Ka === null || Ka <= 0)
    return { error: "Enter a positive Ka (or Kb) value." };

  var cAcid = parseNumeric_(p.cAcid); // acid component (or base component for wb-*)
  var cBase = parseNumeric_(p.cBase); // conjugate base (or conjugate acid for wb-*)
  if (cAcid === null || cBase === null || cAcid <= 0 || cBase <= 0)
    return { error: "Enter positive concentrations." };

  var vAcid = parseNumeric_(p.vAcid);
  var vBase = parseNumeric_(p.vBase);

  // Compute effective concentrations after mixing / neutralisation
  // For the protolysis equation, we need:
  //   acid buffer:  ca (weak acid), cb (conjugate base)
  //   base buffer:  cb (weak base), ca (conjugate acid)
  var ca, cb; // ca = weak acid (or conj. acid), cb = conj. base (or weak base)
  var vTot; // total volume in L

  if (isAcid) {
    // Input: cAcid = weak acid conc, cBase = conj. base (or strong base) conc
    if (vAcid !== null && vBase !== null && vAcid > 0 && vBase > 0) {
      var nA = cAcid * vAcid;
      var nB = cBase * vBase;
      vTot = vAcid + vBase;
      if (bufType === "wa-sb") {
        // Strong base neutralises weak acid:
        // Remaining weak acid = nA - nB; Conjugate base formed = nB
        if (nB >= nA)
          return {
            error:
              "Strong base exceeds weak acid — not a buffer. Reduce base amount.",
          };
        ca = (nA - nB) / vTot;
        cb = nB / vTot;
      } else {
        // wa-cb: just dilute
        ca = nA / vTot;
        cb = nB / vTot;
      }
    } else {
      // No volumes or single common volume
      vTot = vAcid !== null && vAcid > 0 ? vAcid : 1;
      ca = cAcid;
      cb = cBase;
    }
  } else {
    // Base buffer:  cAcid input = weak base conc,  cBase input = conj. acid (or strong acid) conc
    if (vAcid !== null && vBase !== null && vAcid > 0 && vBase > 0) {
      var nB = cAcid * vAcid; // moles of weak base
      var nA = cBase * vBase; // moles of conj. acid or strong acid
      vTot = vAcid + vBase;
      if (bufType === "wb-sa") {
        // Strong acid neutralises weak base:
        // Remaining weak base = nB - nA; Conjugate acid formed = nA
        if (nA >= nB)
          return {
            error:
              "Strong acid exceeds weak base — not a buffer. Reduce acid amount.",
          };
        cb = (nB - nA) / vTot; // weak base remaining
        ca = nA / vTot; // conjugate acid formed
      } else {
        // wb-ca: just dilute
        cb = nB / vTot;
        ca = nA / vTot;
      }
    } else {
      vTot = vAcid !== null && vAcid > 0 ? vAcid : 1;
      cb = cAcid; // weak base
      ca = cBase; // conjugate acid
    }
  }

  // Solve protolysis for buffer pH
  var pH, pOH;
  if (isAcid) {
    // Ka·(ca - x) = (cb + x)·x,  where x = [H₃O⁺]
    var hPlus = bisect_(
      function (x) {
        return Ka * (ca - x) - (cb + x) * x;
      },
      1e-15,
      ca,
      1e-14,
      300,
    );
    if (hPlus === null)
      return { error: "Could not solve for [H⁺]. Check concentrations." };
    pH = -Math.log(hPlus) / Math.LN10;
    pOH = 14 - pH;
  } else {
    // Kb·(cb - x) = (ca + x)·x,  where x = [OH⁻]
    var ohMinus = bisect_(
      function (x) {
        return Ka * (cb - x) - (ca + x) * x;
      },
      1e-15,
      cb,
      1e-14,
      300,
    );
    if (ohMinus === null)
      return { error: "Could not solve for [OH⁻]. Check concentrations." };
    pOH = -Math.log(ohMinus) / Math.LN10;
    pH = 14 - pOH;
  }

  if (mode === "ph") {
    return {
      mode: "Buffer pH",
      pH: roundSig_(pH, 5),
      pOH: roundSig_(pOH, 5),
      effAcid: roundSig_(ca, 6),
      effBase: roundSig_(cb, 6),
      type: isAcid
        ? bufType === "wa-sb"
          ? "Acid buffer (wa + sb → buffer)"
          : "Acid buffer (wa + salt)"
        : bufType === "wb-sa"
          ? "Base buffer (wb + sa → buffer)"
          : "Base buffer (wb + salt)",
      formula: isAcid
        ? "Ka·([HA] − x) = ([A⁻] + x)·x → pH = −log₁₀(x)"
        : "Kb·([B] − x) = ([BH⁺] + x)·x → pOH = −log₁₀(x); pH = 14 − pOH",
    };
  }

  // ─── Addition to Buffer ───────────────────────────────
  if (mode === "addition") {
    var addType = (p.addType || "acid").trim(); // "acid" or "base"
    var addConc = parseNumeric_(p.addConc);
    var addVol = parseNumeric_(p.addVol);
    var addN = parseNumeric_(p.addN);

    var nAdd, volAdd;
    if (addN !== null && addN > 0) {
      // Addition by moles (solid or pure substance)
      nAdd = addN;
      volAdd = 0;
    } else if (
      addConc !== null &&
      addVol !== null &&
      addConc > 0 &&
      addVol > 0
    ) {
      nAdd = addConc * addVol;
      volAdd = addVol;
    } else {
      return {
        error: "Enter either n(added) in mol, or both c(added) and V(added).",
      };
    }

    // Current moles from the effective concentrations
    var nCaOrig = ca * vTot; // moles of acid component
    var nCbOrig = cb * vTot; // moles of base component
    var vTotNew = vTot + volAdd;

    // Apply addition
    var nCaNew, nCbNew;
    if (isAcid) {
      if (addType === "acid") {
        // Adding strong acid to acid buffer: acid ↑, conj base ↓
        nCaNew = nCaOrig + nAdd;
        nCbNew = nCbOrig - nAdd;
      } else {
        // Adding strong base to acid buffer: acid ↓, conj base ↑
        nCaNew = nCaOrig - nAdd;
        nCbNew = nCbOrig + nAdd;
      }
    } else {
      if (addType === "acid") {
        // Adding strong acid to base buffer: conj acid ↑, weak base ↓
        nCaNew = nCaOrig + nAdd;
        nCbNew = nCbOrig - nAdd;
      } else {
        // Adding strong base to base buffer: conj acid ↓, weak base ↑
        nCaNew = nCaOrig - nAdd;
        nCbNew = nCbOrig + nAdd;
      }
    }

    // Check buffer not exhausted
    if (nCaNew <= 0 || nCbNew <= 0) {
      var excessPH;
      if (isAcid) {
        if (nCbNew <= 0) {
          // All conjugate base consumed → excess strong acid
          var cExcess = (nAdd - nCbOrig) / vTotNew;
          excessPH = -Math.log(cExcess) / Math.LN10;
        } else {
          // All weak acid consumed → excess strong base
          var cExcess = (nAdd - nCaOrig) / vTotNew;
          excessPH = 14 + Math.log(cExcess) / Math.LN10;
        }
      } else {
        if (nCbNew <= 0) {
          // All weak base consumed → excess strong acid
          var cExcess = (nAdd - nCbOrig) / vTotNew;
          excessPH = -Math.log(cExcess) / Math.LN10;
        } else {
          // All conjugate acid consumed → excess strong base
          var cExcess = (nAdd - nCaOrig) / vTotNew;
          excessPH = 14 + Math.log(cExcess) / Math.LN10;
        }
      }
      return {
        mode: "Buffer addition (BROKEN)",
        pHOriginal: roundSig_(pH, 5),
        pHNew: roundSig_(excessPH, 5),
        deltaPH: roundSig_(excessPH - pH, 5),
        warning: "Buffer capacity exceeded — one component fully consumed.",
      };
    }

    var caNew = nCaNew / vTotNew;
    var cbNew = nCbNew / vTotNew;

    // Solve for new pH
    var pHNew, pOHNew;
    if (isAcid) {
      var hNew = bisect_(
        function (x) {
          return Ka * (caNew - x) - (cbNew + x) * x;
        },
        1e-15,
        caNew,
        1e-14,
        300,
      );
      if (hNew === null) return { error: "Could not solve for new [H⁺]." };
      pHNew = -Math.log(hNew) / Math.LN10;
      pOHNew = 14 - pHNew;
    } else {
      var ohNew = bisect_(
        function (x) {
          return Ka * (cbNew - x) - (caNew + x) * x;
        },
        1e-15,
        cbNew,
        1e-14,
        300,
      );
      if (ohNew === null) return { error: "Could not solve for new [OH⁻]." };
      pOHNew = -Math.log(ohNew) / Math.LN10;
      pHNew = 14 - pOHNew;
    }

    return {
      mode: "Buffer addition",
      pHOriginal: roundSig_(pH, 5),
      pHNew: roundSig_(pHNew, 5),
      pOHNew: roundSig_(pOHNew, 5),
      deltaPH: roundSig_(pHNew - pH, 5),
      newAcid: roundSig_(caNew, 6),
      newBase: roundSig_(cbNew, 6),
      addType: addType === "acid" ? "Acid" : "Base",
    };
  }

  return { error: 'Unknown buffer mode: "' + mode + '".' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TITRATION  (acid-base, redox, polyprotic)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate pH (or E) at a given titrant volume during a titration.
 *
 * Types: "sa-sb", "sb-sa", "wa-sb", "wb-sa", "redox", "polyprotic"
 *
 * @param {Object} p - { type, cAnalyte, vAnalyte, cTitrant, vTitrant,
 *                        Ka, Kb, E0analyte, E0titrant, kaList }
 * @return {Object} { pH, pOH, region, vEquiv } or { error }
 */
function solveTitration(p) {
  var type = (p.type || "sa-sb").trim().toLowerCase();
  var cA = parseNumeric_(p.cAnalyte);
  var vA = parseNumeric_(p.vAnalyte);
  var cT = parseNumeric_(p.cTitrant);
  var vT = parseNumeric_(p.vTitrant);

  if (cA === null || cA <= 0)
    return { error: "Enter a positive analyte concentration." };
  if (vA === null || vA <= 0)
    return { error: "Enter a positive analyte volume." };
  if (cT === null || cT <= 0)
    return { error: "Enter a positive titrant concentration." };
  if (vT === null || vT < 0)
    return { error: "Enter a non-negative titrant volume." };

  var nA = cA * vA;
  var nT = cT * vT;
  var vTot = vA + vT;
  var Kw = 1.008e-14;

  // Equivalence volume
  var vEquiv = nA / cT;

  // ─── Strong Acid + Strong Base ────────────────────────
  if (type === "sa-sb") {
    var pH;
    var region;
    if (Math.abs(nA - nT) < 1e-15 * nA) {
      pH = 7.0;
      region = "At equivalence";
    } else if (nA > nT) {
      pH = -Math.log((nA - nT) / vTot) / Math.LN10;
      region = "Before equivalence (excess acid)";
    } else {
      pH = 14 + Math.log((nT - nA) / vTot) / Math.LN10;
      region = "After equivalence (excess base)";
    }
    return {
      pH: roundSig_(pH, 5),
      pOH: roundSig_(14 - pH, 5),
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Strong acid + Strong base",
    };
  }

  // ─── Strong Base + Strong Acid ────────────────────────
  if (type === "sb-sa") {
    var pH;
    var region;
    if (Math.abs(nA - nT) < 1e-15 * nA) {
      pH = 7.0;
      region = "At equivalence";
    } else if (nA > nT) {
      pH = 14 + Math.log((nA - nT) / vTot) / Math.LN10;
      region = "Before equivalence (excess base)";
    } else {
      pH = -Math.log((nT - nA) / vTot) / Math.LN10;
      region = "After equivalence (excess acid)";
    }
    return {
      pH: roundSig_(pH, 5),
      pOH: roundSig_(14 - pH, 5),
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Strong base + Strong acid",
    };
  }

  // ─── Weak Acid + Strong Base ──────────────────────────
  // Uses exact charge-balance bisection for a smooth, continuous curve.
  // [Na⁺] + [H⁺] = [A⁻] + [OH⁻]
  // => C_HA · Ka/(h+Ka) + Kw/h − h − C_base = 0
  if (type === "wa-sb") {
    var Ka = parseNumeric_(p.Ka);
    if (Ka === null || Ka <= 0) return { error: "Enter a positive Ka value." };

    var cHA = nA / vTot;
    var cBase = nT / vTot;

    var chargeBalance = function (pHval) {
      var h = Math.pow(10, -pHval);
      return (cHA * Ka) / (h + Ka) + Kw / h - h - cBase;
    };

    var pHlo = -0.5;
    var pHhi = 15.0;
    for (var iter = 0; iter < 80; iter++) {
      var pHmid = (pHlo + pHhi) / 2;
      if (chargeBalance(pHmid) > 0) {
        pHhi = pHmid;
      } else {
        pHlo = pHmid;
      }
    }
    var pH = (pHlo + pHhi) / 2;

    // Region label for display
    var region;
    if (vT === 0 || nT === 0) {
      region = "Initial (no titrant)";
    } else if (Math.abs(nA - nT) < 1e-15 * nA) {
      region = "At equivalence (conjugate base)";
    } else if (nT < nA) {
      region = "Buffer region (before equivalence)";
    } else {
      region = "After equivalence (excess base)";
    }

    return {
      pH: roundSig_(pH, 5),
      pOH: roundSig_(14 - pH, 5),
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Weak acid + Strong base",
      pKa: roundSig_(-Math.log(Ka) / Math.LN10, 4),
    };
  }

  // ─── Weak Base + Strong Acid ──────────────────────────
  // Uses exact charge-balance bisection for a smooth, continuous curve.
  // [BH⁺] + [H⁺] = [Cl⁻] + [OH⁻]
  // => C_acid + Kw/h − h − C_B · h/(h+Ka_conj) = 0
  if (type === "wb-sa") {
    var Kb = parseNumeric_(p.Kb);
    if (Kb === null || Kb <= 0) return { error: "Enter a positive Kb value." };

    var KaConj = Kw / Kb;
    var cBaseAn = nA / vTot; // analytical concentration of weak base
    var cAcid = nT / vTot; // [Cl⁻] from strong-acid titrant

    var chargeBalance = function (pHval) {
      var h = Math.pow(10, -pHval);
      return cAcid + Kw / h - h - (cBaseAn * h) / (h + KaConj);
    };

    var pHlo = -0.5;
    var pHhi = 15.0;
    for (var iter = 0; iter < 80; iter++) {
      var pHmid = (pHlo + pHhi) / 2;
      if (chargeBalance(pHmid) > 0) {
        pHhi = pHmid;
      } else {
        pHlo = pHmid;
      }
    }
    var pH = (pHlo + pHhi) / 2;

    // Region label for display
    var region;
    if (vT === 0 || nT === 0) {
      region = "Initial (no titrant)";
    } else if (Math.abs(nA - nT) < 1e-15 * nA) {
      region = "At equivalence (conjugate acid)";
    } else if (nT < nA) {
      region = "Buffer region (before equivalence)";
    } else {
      region = "After equivalence (excess acid)";
    }

    return {
      pH: roundSig_(pH, 5),
      pOH: roundSig_(14 - pH, 5),
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Weak base + Strong acid",
      pKb: roundSig_(-Math.log(Kb) / Math.LN10, 4),
    };
  }

  // ─── Redox Titration ──────────────────────────────────
  if (type === "redox") {
    var E0a = parseNumeric_(p.E0analyte);
    var E0t = parseNumeric_(p.E0titrant);
    if (E0a === null || E0t === null)
      return {
        error: "Enter E° for both analyte and titrant.",
      };

    // Assumes 1:1 stoichiometry, n=1 electron
    var E;
    var region;
    var factor = 0.05916; // RT/(nF)·ln(10) at 25 °C

    if (Math.abs(nA - nT) < 1e-15 * nA) {
      E = (E0a + E0t) / 2;
      region = "At equivalence";
    } else if (nT < nA) {
      if (nT === 0) {
        E = null;
        region = "Initial (no titrant)";
        return {
          E: "undefined (no titrant added)",
          region: region,
          vEquiv: roundSig_(vEquiv, 6),
          type: "Redox titration",
        };
      }
      E = E0a + (factor * Math.log(nT / (nA - nT))) / Math.LN10;
      region = "Before equivalence";
    } else {
      E = E0t + (factor * Math.log((nT - nA) / nA)) / Math.LN10;
      region = "After equivalence";
    }

    return {
      E: roundSig_(E, 5),
      unit: "V",
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Redox titration",
      E0analyte: E0a,
      E0titrant: E0t,
    };
  }

  // ─── Polyprotic Acid Titration ────────────────────────
  // Uses exact charge-balance bisection for a smooth, continuous curve.
  // [Na⁺] + [H⁺] = Σ i·[H_{n-i}A^{i−}] + [OH⁻]
  // => C_acid · Σ(i·αᵢ) + Kw/h − h − C_base = 0
  if (type === "polyprotic") {
    var kaListStr = (p.kaList || "").trim();
    if (!kaListStr)
      return { error: "Enter Ka values (comma-separated, e.g. 1e-3, 1e-7)." };
    var kaParts = kaListStr.split(/[,;\s]+/);
    var kaList = [];
    for (var i = 0; i < kaParts.length; i++) {
      var kv = parseNumeric_(kaParts[i]);
      if (kv === null || kv <= 0)
        return { error: "Invalid Ka value: " + kaParts[i] };
      kaList.push(kv);
    }
    var nProt = kaList.length;

    // Analytical concentrations after mixing
    var cAcid = nA / vTot;
    var cBase = nT / vTot; // [Na⁺] from strong-base titrant

    // Charge-balance residual as a function of pH
    // Positive when pH is too high (h too small).
    var chargeBalance = function (pHval) {
      var h = Math.pow(10, -pHval);
      // Denominator terms: h^n, Ka1·h^(n-1), Ka1·Ka2·h^(n-2), …, ΠKa
      var terms = new Array(nProt + 1);
      var kaProd = 1;
      for (var i = 0; i <= nProt; i++) {
        if (i === 0) {
          terms[0] = Math.pow(h, nProt);
        } else {
          kaProd *= kaList[i - 1];
          terms[i] = kaProd * Math.pow(h, nProt - i);
        }
      }
      var D = 0;
      for (var i = 0; i <= nProt; i++) D += terms[i];
      var asum = 0;
      for (var i = 1; i <= nProt; i++) asum += i * terms[i];
      asum /= D;
      return cAcid * asum + Kw / h - h - cBase;
    };

    // Bisection: 80 iterations → precision ≈ 15.5 / 2^80 ≈ 1.3 × 10⁻²³
    var pHlo = -0.5;
    var pHhi = 15.0;
    for (var iter = 0; iter < 80; iter++) {
      var pHmid = (pHlo + pHhi) / 2;
      if (chargeBalance(pHmid) > 0) {
        pHhi = pHmid;
      } else {
        pHlo = pHmid;
      }
    }
    var pH = (pHlo + pHhi) / 2;

    // Region label for display
    var region;
    if (vT === 0 || nT === 0) {
      region = "Initial (no titrant)";
    } else {
      var foundEq = false;
      for (var i = 0; i < nProt; i++) {
        var neq = (i + 1) * nA;
        if (Math.abs(nT - neq) < 1e-12 * nA) {
          region =
            i < nProt - 1
              ? "At equivalence point " + (i + 1) + " (amphoteric)"
              : "At last equivalence point (conjugate base)";
          foundEq = true;
          break;
        }
      }
      if (!foundEq) {
        if (nT > nProt * nA) {
          region = "After all equivalence points (excess base)";
        } else {
          var bufIdx = 0;
          for (var i = 0; i < nProt; i++) {
            if (nT < (i + 1) * nA) {
              bufIdx = i;
              break;
            }
          }
          region = "Buffer region (pKa" + (bufIdx + 1) + ")";
        }
      }
    }

    return {
      pH: roundSig_(pH, 5),
      pOH: roundSig_(14 - pH, 5),
      region: region,
      vEquiv: roundSig_(vEquiv, 6),
      type: "Polyprotic acid titration",
      nProtons: nProt,
    };
  }

  return { error: 'Unknown titration type: "' + type + '".' };
}

// ─── Titration Curve Injection ──────────────────────────────────────────────

/**
 * Generate a full titration curve and write it to the active sheet
 * starting at the selected cell.  Volume is output in mL, y-axis is pH
 * (or E for redox titrations).
 *
 * @param {Object} p - Same parameters as solveTitration (vTitrant ignored)
 * @return {Object} { ok, rows } or { error }
 */
function injectTitrationCurve(p) {
  var type = (p.type || "sa-sb").trim().toLowerCase();
  var cA = parseNumeric_(p.cAnalyte);
  var vA = parseNumeric_(p.vAnalyte);
  var cT = parseNumeric_(p.cTitrant);

  if (cA === null || cA <= 0)
    return { error: "Enter a positive analyte concentration." };
  if (vA === null || vA <= 0)
    return { error: "Enter a positive analyte volume." };
  if (cT === null || cT <= 0)
    return { error: "Enter a positive titrant concentration." };

  // Type-specific validation
  if (type === "wa-sb") {
    var Ka = parseNumeric_(p.Ka);
    if (Ka === null || Ka <= 0) return { error: "Enter a positive Ka value." };
  }
  if (type === "wb-sa") {
    var Kb = parseNumeric_(p.Kb);
    if (Kb === null || Kb <= 0) return { error: "Enter a positive Kb value." };
  }
  if (type === "redox") {
    if (
      parseNumeric_(p.E0analyte) === null ||
      parseNumeric_(p.E0titrant) === null
    )
      return { error: "Enter E° for both analyte and titrant." };
  }

  var nA = cA * vA;
  var vEquiv = nA / cT; // single equivalence volume (L)

  // Number of equivalence points
  var nProt = 1;
  if (type === "polyprotic") {
    var kaListStr = (p.kaList || "").trim();
    if (!kaListStr) return { error: "Enter Ka values (comma-separated)." };
    var parts = kaListStr.split(/[,;\s]+/);
    for (var i = 0; i < parts.length; i++) {
      var kv = parseNumeric_(parts[i]);
      if (kv === null || kv <= 0)
        return { error: "Invalid Ka value: " + parts[i] };
    }
    nProt = parts.length;
  }

  var vMaxEquiv = nProt * vEquiv; // last equivalence (L)
  var vEnd = 1.5 * vMaxEquiv; // curve end (L)

  // ── Build volume array: 100 uniform + dense cluster near equivalence ──
  var nUniform = 100;
  var step = vEnd / nUniform;
  var vSet = {};
  for (var i = 0; i <= nUniform; i++) {
    var v = i * step;
    vSet[v.toFixed(14)] = v;
  }

  // Extra points near each equivalence point (fractional offsets)
  var offsets = [
    -0.1, -0.05, -0.02, -0.01, -0.005, -0.002, -0.001, 0, 0.001, 0.002, 0.005,
    0.01, 0.02, 0.05, 0.1,
  ];
  for (var j = 1; j <= nProt; j++) {
    var veq = j * vEquiv;
    for (var k = 0; k < offsets.length; k++) {
      var vp = veq * (1 + offsets[k]);
      if (vp >= 0 && vp <= vEnd) vSet[vp.toFixed(14)] = vp;
    }
  }

  // Sort
  var volumes = [];
  for (var key in vSet) volumes.push(vSet[key]);
  volumes.sort(function (a, b) {
    return a - b;
  });

  // ── Compute pH / E at each volume ────────────────────────────────────
  var isRedox = type === "redox";
  var yLabel = isRedox ? "E (V)" : "pH";
  var rows = [["V(titrant) (mL)", yLabel]];

  for (var i = 0; i < volumes.length; i++) {
    var vt = volumes[i];
    var params = {
      type: p.type,
      cAnalyte: p.cAnalyte,
      vAnalyte: p.vAnalyte,
      cTitrant: p.cTitrant,
      vTitrant: String(vt),
      Ka: p.Ka,
      Kb: p.Kb,
      E0analyte: p.E0analyte,
      E0titrant: p.E0titrant,
      kaList: p.kaList,
    };

    var result = solveTitration(params);
    if (result.error) continue;

    var yVal;
    if (isRedox) {
      if (result.E === undefined || typeof result.E === "string") continue;
      yVal = result.E;
    } else {
      if (result.pH === undefined) continue;
      yVal = result.pH;
    }

    rows.push([roundSig_(vt * 1000, 6), yVal]); // L → mL
  }

  if (rows.length <= 1) return { error: "No valid data points generated." };

  // ── Write to sheet ───────────────────────────────────────────────────
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();
  var startRow = cell.getRow();
  var startCol = cell.getColumn();

  var range = sheet.getRange(startRow, startCol, rows.length, 2);
  range.setValues(rows);

  // Style header row
  var headerRange = sheet.getRange(startRow, startCol, 1, 2);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#e8f0fe");

  // Auto-resize columns
  sheet.autoResizeColumn(startCol);
  sheet.autoResizeColumn(startCol + 1);

  return { ok: true, rows: rows.length - 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RADIOACTIVE DECAY / CARBON DATING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Radioactive decay and carbon dating calculations.
 *
 * Modes:
 *   "age"       — Calculate age from remaining fraction (or activity)
 *   "remaining" — Calculate remaining fraction from age
 *   "activity"  — Calculate current activity from age and initial activity
 *   "halflife"  — Calculate half-life from two measurements
 *
 * @param {Object} p - { mode, fractionRemaining, age,
 *                        initialActivity, currentActivity,
 *                        halfLife, isotope,
 *                        activityAtT1, activityAtT2, t1, t2 }
 * @return {Object} result or { error }
 */
function solveRadiocarbon(p) {
  var mode = (p.mode || "age").trim();
  var isotope = (p.isotope || "C-14").trim();

  // Known half-lives (years)
  var HALF_LIVES = {
    "C-14": 5730,
    "K-40": 1.248e9,
    "U-235": 7.038e8,
    "U-238": 4.468e9,
    "Rb-87": 4.81e10,
    "I-131": 0.02197, // 8.0197 days in years
    "Co-60": 5.2714,
    "Cs-137": 30.17,
    "Sr-90": 28.79,
    "H-3": 12.32, // Tritium
    "Ra-226": 1600,
  };

  var halfLife = parseNumeric_(p.halfLife);
  if (halfLife === null && HALF_LIVES[isotope]) {
    halfLife = HALF_LIVES[isotope];
  }
  if (halfLife === null || halfLife <= 0)
    return { error: "Enter a positive half-life, or select a known isotope." };

  var lambda = Math.LN2 / halfLife; // decay constant (1/year)

  // ─── Age from remaining fraction ──────────────────────
  if (mode === "age") {
    var frac = parseNumeric_(p.fractionRemaining);
    var a0 = parseNumeric_(p.initialActivity);
    var a1 = parseNumeric_(p.currentActivity);

    // Allow ratio via activities
    if (frac === null && a0 !== null && a1 !== null && a0 > 0 && a1 > 0) {
      frac = a1 / a0;
    }
    // Allow percentage input (> 1 means %)
    if (frac !== null && frac > 1) {
      frac = frac / 100;
    }
    if (frac === null || frac <= 0 || frac >= 1)
      return {
        error:
          "Enter a remaining fraction between 0 and 1 (or 0%–100%), or initial & current activity.",
      };

    var t = -Math.log(frac) / lambda;

    return {
      mode: "Age from remaining fraction",
      age: roundSig_(t, 6),
      ageUnit: "years",
      fractionRemaining: roundSig_(frac, 6),
      percentRemaining: roundSig_(frac * 100, 4),
      halfLife: halfLife,
      isotope: isotope,
      lambda: roundSig_(lambda, 6),
      nHalfLives: roundSig_(t / halfLife, 4),
      formula: "t = −ln(N/N₀) / λ = (t½ / ln 2) · ln(N₀/N)",
    };
  }

  // ─── Remaining fraction from age ──────────────────────
  if (mode === "remaining") {
    var age = parseNumeric_(p.age);
    if (age === null || age < 0)
      return { error: "Enter a non-negative age in years." };

    var frac = Math.exp(-lambda * age);

    return {
      mode: "Remaining fraction from age",
      fractionRemaining: roundSig_(frac, 6),
      percentRemaining: roundSig_(frac * 100, 4),
      age: age,
      ageUnit: "years",
      halfLife: halfLife,
      isotope: isotope,
      nHalfLives: roundSig_(age / halfLife, 4),
      formula: "N/N₀ = e^(−λt)",
    };
  }

  // ─── Activity at age ──────────────────────────────────
  if (mode === "activity") {
    var age = parseNumeric_(p.age);
    var a0 = parseNumeric_(p.initialActivity);
    if (age === null || age < 0)
      return { error: "Enter a non-negative age in years." };
    if (a0 === null || a0 <= 0)
      return { error: "Enter a positive initial activity." };

    var a1 = a0 * Math.exp(-lambda * age);

    return {
      mode: "Activity at given age",
      currentActivity: roundSig_(a1, 6),
      initialActivity: a0,
      age: age,
      ageUnit: "years",
      fractionRemaining: roundSig_(a1 / a0, 6),
      halfLife: halfLife,
      isotope: isotope,
      formula: "A = A₀ · e^(−λt)",
    };
  }

  // ─── Half-life from two measurements ──────────────────
  if (mode === "halflife") {
    var a1 = parseNumeric_(p.activityAtT1);
    var a2 = parseNumeric_(p.activityAtT2);
    var t1 = parseNumeric_(p.t1);
    var t2 = parseNumeric_(p.t2);
    if (a1 === null || a2 === null || a1 <= 0 || a2 <= 0)
      return { error: "Enter positive activities at both times." };
    if (t1 === null || t2 === null) return { error: "Enter both time values." };
    if (t1 === t2 || a1 === a2)
      return { error: "Times and activities must differ." };

    var dt = Math.abs(t2 - t1);
    var ratio = t2 > t1 ? a1 / a2 : a2 / a1;
    var lambdaCalc = Math.log(ratio) / dt;
    var halfLifeCalc = Math.LN2 / lambdaCalc;

    return {
      mode: "Half-life from measurements",
      halfLife: roundSig_(halfLifeCalc, 6),
      lambda: roundSig_(lambdaCalc, 6),
      formula: "t½ = ln(2) / λ = ln(2) · Δt / ln(A₁/A₂)",
    };
  }

  return { error: 'Unknown mode: "' + mode + '".' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLVER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bisection root finder.  Finds x in [a, b] where f(x) ≈ 0.
 * Ported from ti-chemistry.py rootsIteration().
 *
 * @param {Function} f - function(x) → number
 * @param {number} a - lower bound
 * @param {number} b - upper bound
 * @param {number} eps - tolerance (default 1e-12)
 * @param {number} maxIter - max iterations (default 200)
 * @return {number|null} root or null if not found
 * @private
 */
function bisect_(f, a, b, eps, maxIter) {
  eps = eps || 1e-12;
  maxIter = maxIter || 200;
  var fa = f(a);
  var fb = f(b);

  // If same sign, try to find a sign change by splitting into 100 sub-intervals
  if (fa * fb > 0) {
    var found = false;
    var step = (b - a) / 100;
    for (var probe = a; probe < b; probe += step) {
      if (f(probe) * f(probe + step) <= 0) {
        a = probe;
        b = probe + step;
        fa = f(a);
        fb = f(b);
        found = true;
        break;
      }
    }
    if (!found) return null;
  }

  for (var i = 0; i < maxIter; i++) {
    var mid = (a + b) / 2;
    var fm = f(mid);
    if (fm === 0 || (b - a) / 2 < eps) return mid;
    if (fa * fm < 0) {
      b = mid;
      fb = fm;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/**
 * Parse a string as a number.  Returns null if blank or not a valid number.
 * @param {*} v
 * @return {number|null}
 * @private
 */
function parseNumeric_(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Round a number to N significant figures.
 * @private
 */
function roundSig_(val, sig) {
  if (val === 0) return 0;
  var d = Math.ceil(
    Math.log(Math.abs(val) < 1e-300 ? 1e-300 : Math.abs(val)) / Math.LN10,
  );
  var power = sig - d;
  var magnitude = Math.pow(10, power);
  return Math.round(val * magnitude) / magnitude;
}

/**
 * Format a value for display, showing the variable name if null.
 * @private
 */
function formatVal_(v, label) {
  return v === null ? "?" : String(v);
}

/**
 * Build a formula string in Hill order (C first, H second, rest alphabetical).
 * @param {string[]} symbols
 * @param {number[]} coefs
 * @return {string}
 * @private
 */
function buildFormulaString_(symbols, coefs) {
  // Build pairs and sort in Hill order
  var pairs = [];
  for (var i = 0; i < symbols.length; i++) {
    pairs.push({ sym: symbols[i], n: coefs[i] });
  }
  pairs.sort(function (a, b) {
    // C first, H second, rest alphabetical
    var order = function (s) {
      if (s === "C") return 0;
      if (s === "H") return 1;
      return 2;
    };
    var oa = order(a.sym),
      ob = order(b.sym);
    if (oa !== ob) return oa - ob;
    return a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0;
  });

  var formula = "";
  for (var i = 0; i < pairs.length; i++) {
    formula += pairs[i].sym;
    if (pairs[i].n > 1) formula += pairs[i].n;
  }
  return formula;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HESS'S LAW / YIELD / EQUILIBRIUM HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a balanced reaction equation into a map of compound → signed coefficient.
 * Reactants get negative coefficients, products get positive.
 * e.g. "2H2 + O2 = 2H2O" → { "H2": -2, "O2": -1, "H2O": 2 }
 *
 * @param {string} str
 * @return {Object} map or { error: string }
 * @private
 */
function parseReactionCoeffMap_(str) {
  try {
    // Normalise separators
    var norm = str
      .replace(/\u2192/g, "=")
      .replace(/\u27F6/g, "=")
      .replace(/\u2794/g, "=")
      .replace(/->/g, "=")
      .replace(/>>/g, "=");

    var eqIdx = norm.indexOf("=");
    if (eqIdx === -1) return { error: 'No "=" or "→" found.' };

    var left = norm.substring(0, eqIdx).trim();
    var right = norm.substring(eqIdx + 1).trim();
    if (!left || !right) return { error: "Empty side of equation." };

    var map = {};

    function parseSide(sideStr, sign) {
      var parts = sideStr.split("+");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p) continue;
        // Extract optional leading coefficient (integer or decimal)
        var m = p.match(/^(\d+(?:\.\d+)?)\s*([A-Z\(\[\{].*)$/);
        var coef = 1;
        var formula = p;
        if (m) {
          coef = parseFloat(m[1]);
          formula = m[2].trim();
        }
        // Normalise formula: remove spaces
        formula = formula.replace(/\s+/g, "");
        map[formula] = (map[formula] || 0) + sign * coef;
      }
    }

    parseSide(left, -1);
    parseSide(right, 1);
    return map;
  } catch (e) {
    return { error: e.message || "Parse error." };
  }
}

/**
 * Solve an overdetermined linear system Ax = b using least squares.
 * x = (AᵀA)⁻¹ Aᵀb
 *
 * @param {number[][]} A - m×n matrix
 * @param {number[]}   b - m-vector
 * @return {number[]|null} n-vector x, or null on failure
 * @private
 */
function leastSquaresSolve_(A, b) {
  var m = A.length;
  var n = A[0].length;

  // AᵀA (n×n)
  var AtA = [];
  for (var i = 0; i < n; i++) {
    AtA.push([]);
    for (var j = 0; j < n; j++) {
      var s = 0;
      for (var k = 0; k < m; k++) s += A[k][i] * A[k][j];
      AtA[i].push(s);
    }
  }

  // Aᵀb (n-vector)
  var Atb = [];
  for (var i = 0; i < n; i++) {
    var s = 0;
    for (var k = 0; k < m; k++) s += A[k][i] * b[k];
    Atb.push(s);
  }

  // Solve AtA · x = Atb by Gaussian elimination with partial pivoting
  return gaussSolve_(AtA, Atb);
}

/**
 * Solve Ax = b by Gaussian elimination with partial pivoting.
 * Modifies A and b in place.
 *
 * @param {number[][]} A - n×n matrix
 * @param {number[]}   b - n-vector
 * @return {number[]|null} solution x or null
 * @private
 */
function gaussSolve_(A, b) {
  var n = A.length;

  // Forward elimination
  for (var col = 0; col < n; col++) {
    // Partial pivoting
    var maxRow = col;
    var maxVal = Math.abs(A[col][col]);
    for (var row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-14) return null; // singular

    // Swap rows
    if (maxRow !== col) {
      var tmp = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tmp;
      var tb = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tb;
    }

    // Eliminate
    for (var row = col + 1; row < n; row++) {
      var factor = A[row][col] / A[col][col];
      for (var j = col; j < n; j++) {
        A[row][j] -= factor * A[col][j];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back substitution
  var x = new Array(n);
  for (var i = n - 1; i >= 0; i--) {
    var s = b[i];
    for (var j = i + 1; j < n; j++) {
      s -= A[i][j] * x[j];
    }
    if (Math.abs(A[i][i]) < 1e-14) return null;
    x[i] = s / A[i][i];
  }
  return x;
}

/**
 * Convert a parsed term object to an element-count map.
 * e.g. { items: [{type:"element", name:"H", count:2}, ...] } → { H: 2, O: 1 }
 *
 * @param {Object} term - parsed term from parseEquation_
 * @return {Object} map of element → count
 * @private
 */
function termToElementCount_(term) {
  var counts = {};
  function walk(items, mult) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === "element") {
        counts[it.name] = (counts[it.name] || 0) + it.count * mult;
      } else if (it.type === "group") {
        walk(it.items, mult * it.count);
      }
    }
  }
  walk(term.items, 1);
  return counts;
}

/**
 * Check if two element-count maps are identical.
 * @param {Object} a
 * @param {Object} b
 * @return {boolean}
 * @private
 */
function elementMapsEqual_(a, b) {
  var ka = Object.keys(a);
  var kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) {
    if (a[ka[i]] !== b[ka[i]]) return false;
  }
  return true;
}

/**
 * Compute the molar mass from an element-count map.
 * @param {Object} counts - { H: 2, O: 1 }
 * @param {Object} bySymbol - element lookup { Symbol: AtomicMass }
 * @return {number|null}
 * @private
 */
function computeMolarMass_(counts, bySymbol) {
  var total = 0;
  var keys = Object.keys(counts);
  for (var i = 0; i < keys.length; i++) {
    var el = bySymbol[keys[i]];
    if (!el) return null;
    total += parseFloat(el.AtomicMass) * counts[keys[i]];
  }
  return total;
}

/**
 * Solve the weak electrolyte equilibrium: K·(C − x) = x²
 * Returns x (the equilibrium concentration of H⁺ or OH⁻).
 *
 * Uses the quadratic formula: x = (−K + √(K² + 4KC)) / 2
 *
 * @param {number} K - dissociation constant
 * @param {number} C - initial concentration
 * @return {number} x
 * @private
 */
function solveWeakEq_(K, C) {
  if (C <= 0) return 0;
  return (-K + Math.sqrt(K * K + 4 * K * C)) / 2;
}
