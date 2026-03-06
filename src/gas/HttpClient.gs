/**
 * webchem-gs: HTTP Client
 * Centralized HTTP with retry, rate limiting, and caching.
 * Adapted from webchem R package patterns (httr::RETRY + webchem_sleep).
 */

// ─── Core Fetch ─────────────────────────────────────────────────────────────────

/**
 * Fetch a URL with retry logic, rate limiting, and optional caching.
 *
 * @param {string} url - The URL to fetch
 * @param {Object} [options] - UrlFetchApp options (method, headers, payload, etc.)
 * @param {Object} [config] - Additional config
 * @param {number} [config.retries=3] - Number of retry attempts
 * @param {number} [config.delay=200] - Delay between requests in ms
 * @param {boolean} [config.useCache=true] - Whether to use CacheService
 * @param {number} [config.cacheTtl=21600] - Cache TTL in seconds
 * @param {boolean} [config.parseJson=true] - Whether to parse response as JSON
 * @return {Object|string|null} Parsed JSON, raw text, or null on failure
 */
function fetchUrl(url, options, config) {
  options = options || {};
  config = config || {};

  var retries = config.retries !== undefined ? config.retries : 3;
  var delay = config.delay !== undefined ? config.delay : RATE_LIMIT.API;
  var useCache = config.useCache !== undefined ? config.useCache : true;
  var cacheTtl = config.cacheTtl !== undefined ? config.cacheTtl : CACHE_TTL;
  var parseJson = config.parseJson !== undefined ? config.parseJson : true;

  // Always mute HTTP exceptions so we can inspect status codes
  options.muteHttpExceptions = true;

  // ── Check cache ──
  if (useCache) {
    var cacheKey = buildCacheKey_(url, options);
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached !== null) {
      return parseJson ? JSON.parse(cached) : cached;
    }
  }

  // ── Fetch with retry ──
  var lastError = null;
  for (var i = 0; i < retries; i++) {
    try {
      Utilities.sleep(delay);
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();

      if (code === 200 || code === 202) {
        var text = response.getContentText();

        if (parseJson) {
          try {
            var parsed = JSON.parse(text);
            // Cache AFTER successful JSON parse — skip 202 (async in-progress)
            if (useCache && code === 200 && text.length < 100000) {
              try {
                CacheService.getScriptCache().put(cacheKey, text, cacheTtl);
              } catch (e) {
                // Cache put can fail silently
              }
            }
            return parsed;
          } catch (parseErr) {
            Logger.log(
              "fetchUrl JSON parse error for " +
                url +
                ": " +
                text.substring(0, 300),
            );
            return null;
          }
        }

        // Non-JSON response: cache and return raw text (skip 202)
        if (useCache && code === 200 && text.length < 100000) {
          try {
            CacheService.getScriptCache().put(cacheKey, text, cacheTtl);
          } catch (e) {
            // Cache put can fail silently
          }
        }
        return text;
      }

      // Client error (4xx): don't retry
      if (code >= 400 && code < 500) {
        Logger.log(
          "fetchUrl " +
            code +
            " for " +
            url +
            ": " +
            response.getContentText().substring(0, 300),
        );
        return null;
      }

      // Server error (5xx): log and retry after backoff
      Logger.log(
        "fetchUrl " +
          code +
          " (server error) for " +
          url +
          ": " +
          response.getContentText().substring(0, 200),
      );
    } catch (e) {
      lastError = e;
    }

    // Exponential backoff
    Utilities.sleep(1000 * (i + 1));
  }

  Logger.log(
    "fetchUrl failed after " +
      retries +
      " retries: " +
      url +
      (lastError ? " Error: " + lastError.message : ""),
  );
  return null;
}

// ─── Convenience: GET ────────────────────────────────────────────────────────────

/**
 * Perform a GET request.
 * @param {string} url
 * @param {Object} [headers] - Additional headers
 * @param {Object} [config] - fetchUrl config overrides
 * @return {Object|string|null}
 */
function httpGet(url, headers, config) {
  var options = { method: "get" };
  if (headers) {
    options.headers = headers;
  }
  return fetchUrl(url, options, config);
}

// ─── Convenience: POST JSON ──────────────────────────────────────────────────────

/**
 * Perform a POST request with JSON body.
 * @param {string} url
 * @param {Object} body - Will be JSON-stringified
 * @param {Object} [headers] - Additional headers
 * @param {Object} [config] - fetchUrl config overrides
 * @return {Object|string|null}
 */
function httpPostJson(url, body, headers, config) {
  var allHeaders = {};
  if (headers) {
    for (var key in headers) {
      allHeaders[key] = headers[key];
    }
  }
  var options = {
    method: "post",
    contentType: "application/json",
    headers: allHeaders,
    payload: JSON.stringify(body),
  };
  return fetchUrl(url, options, config);
}

// ─── Convenience: POST with raw payload ──────────────────────────────────────────

/**
 * Perform a POST request with a raw string payload.
 * @param {string} url
 * @param {string} payload - Raw string body
 * @param {Object} [headers]
 * @param {Object} [config]
 * @return {Object|string|null}
 */
function httpPostRaw(url, payload, headers, config) {
  var options = {
    method: "post",
    payload: payload,
  };
  if (headers) {
    options.headers = headers;
  }
  return fetchUrl(url, options, config);
}

// ─── Convenience: GET returning raw text ─────────────────────────────────────────

/**
 * Perform a request returning raw text (not JSON-parsed).
 * Can accept either headers (for GET) or a full UrlFetchApp options object.
 *
 * @param {string} url
 * @param {Object} [optionsOrHeaders] - If it has 'method' key, used as full options;
 *   otherwise treated as headers for a GET request. null for simple GET.
 * @param {Object} [config]
 * @return {string|null}
 */
function httpGetText(url, optionsOrHeaders, config) {
  config = config || {};
  config.parseJson = false;

  if (optionsOrHeaders && optionsOrHeaders.method) {
    // Full options object (e.g. for POST requests)
    return fetchUrl(url, optionsOrHeaders, config);
  }

  return httpGet(url, optionsOrHeaders, config);
}

// ─── Internal: Cache Key Builder ─────────────────────────────────────────────────

/**
 * Build a cache key from URL and options.
 * @param {string} url
 * @param {Object} options
 * @return {string}
 * @private
 */
function buildCacheKey_(url, options) {
  var raw = url;
  if (options.payload) {
    raw +=
      "|" +
      (typeof options.payload === "string"
        ? options.payload
        : JSON.stringify(options.payload));
  }
  // MD5 digest produces a short, fixed-length key
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return digest
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}
