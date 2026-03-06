/**
 * webchem-gs: OPSIN Module
 * REST API — no auth required.
 * Adapted from webchem R package opsin.R
 *
 * Converts IUPAC names to chemical identifiers.
 */

/**
 * Query OPSIN to convert an IUPAC name to chemical identifiers.
 *
 * @param {string} name - IUPAC chemical name
 * @return {Object|null} Result with smiles, inchi, inchikey, stdinchi, stdinchikey, etc.
 */
function opsin_search(name) {
  if (!name) return null;

  var url = API.OPSIN + "/" + encodeURIComponent(name) + ".json";
  var data = httpGet(url);

  if (!data || data.status === "FAILURE") return null;

  return {
    source: "OPSIN",
    name: name,
    smiles: data.smiles || null,
    cml: data.cml || null,
    inchi: data.inchi || null,
    stdinchi: data.stdinchi || null,
    stdinchikey: data.stdinchikey || null,
    message: data.message || null,
    status: data.status || null,
    url: "https://www.ebi.ac.uk/opsin/?#convert/" + encodeURIComponent(name),
  };
}
