/**
 * webchem-gs: Custom Spreadsheet Functions
 * Functions available directly in sheet cells (e.g. =CONST("c"))
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONST — Fundamental Physical Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return the value of a fundamental physical constant.
 * Use =CONST("list") to see all available constants.
 *
 * @param {string} name Constant name or symbol (e.g. "c", "h", "F", "R", "Na")
 * @return {number} The numeric value (SI units unless noted)
 * @customfunction
 */
function CONST(name) {
  if (!name || typeof name !== "string") {
    throw new Error(
      'Provide a constant name, e.g. =CONST("c"). ' +
        'Use =CONST("list") for all available constants.',
    );
  }

  var key = name.trim().toLowerCase();

  // Special: return the full table as a 2D array for the spreadsheet
  if (key === "list" || key === "help") {
    var header = [["Key", "Value", "Unit", "Description"]];
    var rows = CONST_TABLE_.map(function (row) {
      return [row[0], row[1], row[2], row[3]];
    });
    return header.concat(rows);
  }

  for (var i = 0; i < CONST_TABLE_.length; i++) {
    var row = CONST_TABLE_[i];
    // row = [key, value, unit, description, ...aliases]
    if (key === row[0].toLowerCase()) return row[1];
    // Check aliases (index 4+)
    for (var j = 4; j < row.length; j++) {
      if (key === row[j].toLowerCase()) return row[1];
    }
  }

  throw new Error(
    'Unknown constant: "' +
      name +
      '". Use =CONST("list") to see available constants.',
  );
}

/**
 * Table of fundamental physical constants.
 * Each row: [key, value, unit, description, ...aliases]
 *
 * Values from NIST CODATA 2018 recommended constants.
 * Reference: ./notes/chemistry-tables/fundamental-physical-constants.csv
 * @private
 */
var CONST_TABLE_ = [
  // ── Exact constants (2019 SI redefinition) ──
  ["c", 2.99792458e8, "m/s", "Speed of light in vacuum", "speed_of_light"],
  ["h", 6.62607015e-34, "J·s", "Planck constant", "planck"],
  [
    "hbar",
    1.054571817e-34,
    "J·s",
    "Reduced Planck constant (ℏ = h/2π)",
    "h_bar",
  ],
  ["e", 1.602176634e-19, "C", "Elementary charge", "q_e", "q"],
  ["Na", 6.02214076e23, "1/mol", "Avogadro constant", "avogadro", "N_A"],
  ["kB", 1.380649e-23, "J/K", "Boltzmann constant", "k", "boltzmann", "k_B"],

  // ── Derived / measured constants ──
  ["R", 8.314462618, "J/(mol·K)", "Molar gas constant", "R_J", "gas_constant"],
  [
    "R_atm",
    0.08205736608,
    "L·atm/(mol·K)",
    "Gas constant (L·atm units)",
    "R_gas",
  ],
  ["F", 96485.33212, "C/mol", "Faraday constant", "faraday"],
  ["amu", 1.6605390666e-27, "kg", "Atomic mass unit", "u", "Da", "dalton"],
  ["me", 9.1093837015e-31, "kg", "Electron rest mass", "m_e", "electron_mass"],
  ["mp", 1.67262192369e-27, "kg", "Proton rest mass", "m_p", "proton_mass"],
  ["mn", 1.67492749804e-27, "kg", "Neutron rest mass", "m_n", "neutron_mass"],
  ["e_me", 1.75882001076e11, "C/kg", "Electron charge-to-mass ratio", "e/me"],

  // ── Molar volumes ──
  [
    "Vm",
    22.41396954,
    "L/mol",
    "Molar volume, ideal gas (STP: 0 °C, 1 atm)",
    "Vm_stp",
  ],
  ["Vm_bar", 22.71095464, "L/mol", "Molar volume, ideal gas (0 °C, 1 bar)"],

  // ── Spectroscopy / quantum ──
  [
    "Rinf",
    1.097373156816e7,
    "1/m",
    "Rydberg constant",
    "rydberg",
    "R_rydberg",
    "R_inf",
  ],
  ["Ry", 2.1798723611035e-18, "J", "Rydberg energy (hcR∞)", "rydberg_J"],
  ["a0", 5.29177210903e-11, "m", "Bohr radius", "bohr_radius", "bohr"],
  ["alpha", 7.2973525693e-3, "", "Fine-structure constant", "fine_structure"],

  // ── Electromagnetic ──
  [
    "eps0",
    8.8541878128e-12,
    "F/m",
    "Vacuum permittivity",
    "epsilon_0",
    "permittivity",
  ],
  [
    "mu0",
    1.25663706212e-6,
    "N/A²",
    "Vacuum permeability",
    "mu_0",
    "permeability",
  ],
  [
    "sigma",
    5.670374419e-8,
    "W/(m²·K⁴)",
    "Stefan–Boltzmann constant",
    "stefan_boltzmann",
  ],

  // ── Other ──
  [
    "G",
    6.6743e-11,
    "m³/(kg·s²)",
    "Newtonian gravitational constant",
    "gravitational",
  ],
  ["g", 9.80665, "m/s²", "Standard acceleration of gravity", "gravity", "g_n"],
  ["atm", 101325, "Pa", "Standard atmosphere"],
];

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERT_INFO — Unit Conversion Reference
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return a reference table of units available in Google Sheets' built-in CONVERT() function.
 * Use =CONVERT_INFO() to list all units, or =CONVERT_INFO("mass") for a specific category.
 *
 * @param {string} [category] Optional category filter (e.g. "mass", "distance", "temperature")
 * @return {string[][]} A table of unit abbreviations, names, and categories
 * @customfunction
 */
function CONVERT_INFO(category) {
  var header = [["Category", "Unit Code", "Unit Name", "Example"]];

  if (category && typeof category === "string") {
    var key = category.trim().toLowerCase();
    var filtered = CONVERT_UNITS_.filter(function (row) {
      return row[0].toLowerCase() === key;
    });
    if (filtered.length === 0) {
      throw new Error(
        'Unknown category: "' +
          category +
          '". Use =CONVERT_INFO() to see all categories.',
      );
    }
    return header.concat(filtered);
  }

  return header.concat(CONVERT_UNITS_);
}

/**
 * Reference table of units supported by Google Sheets CONVERT() function.
 * Each row: [Category, Unit Code, Unit Name, Example]
 *
 * Source: https://support.google.com/docs/answer/6055540
 * @private
 */
var CONVERT_UNITS_ = [
  // ── Weight / Mass ──
  ["Weight", "u", "Atomic mass unit", '=CONVERT(1,"u","g")'],
  ["Weight", "grain", "Grain", '=CONVERT(1,"grain","g")'],
  ["Weight", "g", "Gram", '=CONVERT(1,"kg","g")'],
  ["Weight", "ozm", "Ounce", '=CONVERT(1,"ozm","g")'],
  ["Weight", "lbm", "Pound", '=CONVERT(1,"lbm","kg")'],
  ["Weight", "stone", "Stone", '=CONVERT(1,"stone","kg")'],
  ["Weight", "sg", "Slug", '=CONVERT(1,"sg","kg")'],
  ["Weight", "cwt", "US hundredweight", '=CONVERT(1,"cwt","kg")'],
  ["Weight", "uk_cwt", "UK hundredweight", '=CONVERT(1,"uk_cwt","kg")'],
  ["Weight", "ton", "US ton (short)", '=CONVERT(1,"ton","kg")'],
  ["Weight", "uk_ton", "UK ton (long)", '=CONVERT(1,"uk_ton","kg")'],

  // ── Distance ──
  ["Distance", "ang", "Ångström", '=CONVERT(1,"ang","m")'],
  ["Distance", "Picapt", "Pica point (1/72 in)", '=CONVERT(1,"Picapt","in")'],
  ["Distance", "pica", "Pica (1/6 in)", '=CONVERT(1,"pica","in")'],
  ["Distance", "in", "Inch", '=CONVERT(1,"in","cm")'],
  ["Distance", "ft", "Foot", '=CONVERT(1,"ft","m")'],
  ["Distance", "yd", "Yard", '=CONVERT(1,"yd","m")'],
  ["Distance", "m", "Metre", '=CONVERT(1,"mi","m")'],
  ["Distance", "ell", "Ell", '=CONVERT(1,"ell","m")'],
  ["Distance", "mi", "Statute mile", '=CONVERT(1,"mi","km")'],
  ["Distance", "survey_mi", "US survey mile", '=CONVERT(1,"survey_mi","m")'],
  ["Distance", "Nmi", "Nautical mile", '=CONVERT(1,"Nmi","km")'],
  ["Distance", "ly", "Light-year", '=CONVERT(1,"ly","m")'],
  ["Distance", "parsec", "Parsec", '=CONVERT(1,"parsec","ly")'],

  // ── Time ──
  ["Time", "sec", "Second", '=CONVERT(1,"hr","sec")'],
  ["Time", "min", "Minute", '=CONVERT(1,"hr","min")'],
  ["Time", "hr", "Hour", '=CONVERT(1,"day","hr")'],
  ["Time", "day", "Day", '=CONVERT(1,"yr","day")'],
  ["Time", "yr", "Year", '=CONVERT(1,"yr","sec")'],

  // ── Pressure ──
  ["Pressure", "Pa", "Pascal", '=CONVERT(1,"atm","Pa")'],
  ["Pressure", "mmHg", "mm of mercury", '=CONVERT(1,"atm","mmHg")'],
  ["Pressure", "Torr", "Torr", '=CONVERT(1,"atm","Torr")'],
  ["Pressure", "psi", "Pounds per sq. inch", '=CONVERT(1,"atm","psi")'],
  ["Pressure", "atm", "Atmosphere", '=CONVERT(1,"Pa","atm")'],

  // ── Force ──
  ["Force", "dyn", "Dyne", '=CONVERT(1,"N","dyn")'],
  ["Force", "pond", "Pond", '=CONVERT(1,"pond","N")'],
  ["Force", "N", "Newton", '=CONVERT(1,"lbf","N")'],
  ["Force", "lbf", "Pound-force", '=CONVERT(1,"N","lbf")'],

  // ── Energy ──
  ["Energy", "eV", "Electron volt", '=CONVERT(1,"eV","J")'],
  ["Energy", "e", "Erg", '=CONVERT(1,"J","e")'],
  ["Energy", "J", "Joule", '=CONVERT(1,"cal","J")'],
  ["Energy", "flb", "Foot-pound", '=CONVERT(1,"J","flb")'],
  ["Energy", "c", "Thermodynamic calorie", '=CONVERT(1,"c","J")'],
  ["Energy", "cal", "IT calorie", '=CONVERT(1,"cal","J")'],
  ["Energy", "BTU", "British thermal unit", '=CONVERT(1,"BTU","J")'],
  ["Energy", "Wh", "Watt-hour", '=CONVERT(1,"Wh","J")'],
  ["Energy", "HPh", "Horsepower-hour", '=CONVERT(1,"HPh","J")'],

  // ── Power ──
  ["Power", "W", "Watt", '=CONVERT(1,"HP","W")'],
  ["Power", "PS", "Pferdestärke (metric HP)", '=CONVERT(1,"PS","W")'],
  ["Power", "HP", "Horsepower", '=CONVERT(1,"HP","W")'],

  // ── Magnetism ──
  ["Magnetism", "ga", "Gauss", '=CONVERT(1,"T","ga")'],
  ["Magnetism", "T", "Tesla", '=CONVERT(1,"ga","T")'],

  // ── Temperature ──
  ["Temperature", "C", "Celsius", '=CONVERT(100,"C","F")'],
  ["Temperature", "F", "Fahrenheit", '=CONVERT(212,"F","C")'],
  ["Temperature", "K", "Kelvin", '=CONVERT(273.15,"K","C")'],
  ["Temperature", "Rank", "Rankine", '=CONVERT(491.67,"Rank","K")'],
  ["Temperature", "Reau", "Réaumur", '=CONVERT(80,"Reau","C")'],

  // ── Volume ──
  ["Volume", "ang^3", "Cubic ångström", '=CONVERT(1,"ang^3","m^3")'],
  ["Volume", "Picapt^3", "Cubic pica point", '=CONVERT(1,"Picapt^3","in^3")'],
  ["Volume", "tsp", "Teaspoon", '=CONVERT(1,"tsp","ml")'],
  ["Volume", "tspm", "Metric teaspoon (5 ml)", '=CONVERT(1,"tspm","ml")'],
  ["Volume", "tbs", "Tablespoon", '=CONVERT(1,"tbs","ml")'],
  ["Volume", "in^3", "Cubic inch", '=CONVERT(1,"in^3","ml")'],
  ["Volume", "oz", "Fluid ounce", '=CONVERT(1,"oz","ml")'],
  ["Volume", "cup", "Cup", '=CONVERT(1,"cup","ml")'],
  ["Volume", "pt", "US pint", '=CONVERT(1,"pt","l")'],
  ["Volume", "uk_pt", "UK pint", '=CONVERT(1,"uk_pt","l")'],
  ["Volume", "qt", "US quart", '=CONVERT(1,"qt","l")'],
  ["Volume", "l", "Litre", '=CONVERT(1,"gal","l")'],
  ["Volume", "uk_qt", "UK quart", '=CONVERT(1,"uk_qt","l")'],
  ["Volume", "gal", "US gallon", '=CONVERT(1,"gal","l")'],
  ["Volume", "uk_gal", "UK gallon", '=CONVERT(1,"uk_gal","l")'],
  ["Volume", "ft^3", "Cubic foot", '=CONVERT(1,"ft^3","l")'],
  ["Volume", "bushel", "Bushel", '=CONVERT(1,"bushel","l")'],
  ["Volume", "barrel", "US oil barrel", '=CONVERT(1,"barrel","l")'],
  ["Volume", "yd^3", "Cubic yard", '=CONVERT(1,"yd^3","l")'],
  ["Volume", "m^3", "Cubic metre", '=CONVERT(1,"m^3","l")'],
  ["Volume", "MTON", "Measurement ton (freight)", '=CONVERT(1,"MTON","ft^3")'],
  ["Volume", "GRT", "Gross registered ton", '=CONVERT(1,"GRT","ft^3")'],
  ["Volume", "mi^3", "Cubic mile", '=CONVERT(1,"mi^3","m^3")'],
  ["Volume", "Nmi^3", "Cubic nautical mile", '=CONVERT(1,"Nmi^3","m^3")'],
  ["Volume", "ly^3", "Cubic light-year", '=CONVERT(1,"ly^3","m^3")'],

  // ── Area ──
  ["Area", "ang^2", "Square ångström", '=CONVERT(1,"ang^2","m^2")'],
  ["Area", "Picapt^2", "Square pica point", '=CONVERT(1,"Picapt^2","in^2")'],
  ["Area", "in^2", "Square inch", '=CONVERT(1,"in^2","cm^2")'],
  ["Area", "ft^2", "Square foot", '=CONVERT(1,"ft^2","m^2")'],
  ["Area", "yd^2", "Square yard", '=CONVERT(1,"yd^2","m^2")'],
  ["Area", "m^2", "Square metre", '=CONVERT(1,"m^2","ft^2")'],
  ["Area", "ar", "Are (100 m²)", '=CONVERT(1,"ar","m^2")'],
  ["Area", "Morgen", "Morgen", '=CONVERT(1,"Morgen","m^2")'],
  ["Area", "uk_acre", "UK acre", '=CONVERT(1,"uk_acre","m^2")'],
  ["Area", "us_acre", "US acre", '=CONVERT(1,"us_acre","m^2")'],
  ["Area", "ha", "Hectare", '=CONVERT(1,"ha","m^2")'],
  ["Area", "mi^2", "Square mile", '=CONVERT(1,"mi^2","km^2")'],
  ["Area", "Nmi^2", "Square nautical mile", '=CONVERT(1,"Nmi^2","km^2")'],
  ["Area", "ly^2", "Square light-year", '=CONVERT(1,"ly^2","m^2")'],

  // ── Information ──
  ["Information", "bit", "Bit", '=CONVERT(1,"byte","bit")'],
  ["Information", "byte", "Byte", '=CONVERT(1024,"byte","kbyte")'],

  // ── Speed ──
  ["Speed", "m/hr", "Metres per hour", '=CONVERT(1,"m/hr","m/s")'],
  ["Speed", "mph", "Miles per hour", '=CONVERT(60,"mph","kn")'],
  ["Speed", "kn", "Knot", '=CONVERT(1,"kn","mph")'],
  ["Speed", "admkn", "Admiralty knot", '=CONVERT(1,"admkn","kn")'],
  ["Speed", "m/s", "Metres per second", '=CONVERT(1,"m/s","mph")'],
];
