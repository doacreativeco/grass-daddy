(function (window) {
  "use strict";

  var GEO_CACHE_KEY = "gdGeocodeCache";
  var renderSeq = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function streetAddress(address) {
    return String(address || "").trim();
  }

  function propertyQuery(address, town) {
    return [address, town].filter(function (part) {
      return part && String(part).trim();
    }).join(", ");
  }

  function googleSearchUrl(query, zoom) {
    return "https://maps.google.com/maps?q=" + encodeURIComponent(query) +
      "&hl=en&z=" + (zoom || 18) + "&ie=UTF8&iwloc=A&output=embed";
  }

  function osmPinUrl(lat, lng) {
    var pad = 0.0035;
    var west = (lng - pad).toFixed(6);
    var south = (lat - pad).toFixed(6);
    var east = (lng + pad).toFixed(6);
    var north = (lat + pad).toFixed(6);
    return "https://www.openstreetmap.org/export/embed.html?bbox=" +
      encodeURIComponent(west + "," + south + "," + east + "," + north) +
      "&layer=mapnik&marker=" + encodeURIComponent(Number(lat).toFixed(6) + "," + Number(lng).toFixed(6));
  }

  function embedUrl(address, town) {
    var street = streetAddress(address);
    if (!street) return "";
    return googleSearchUrl(propertyQuery(address, town), 18);
  }

  function openUrl(address, town, point) {
    if (point && isFinite(point.lat) && isFinite(point.lng)) {
      return "https://maps.google.com/?q=" + Number(point.lat).toFixed(6) + "," + Number(point.lng).toFixed(6);
    }
    var q = propertyQuery(address, town);
    if (!q) return "";
    return "https://maps.google.com/?q=" + encodeURIComponent(q);
  }

  function readCache() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(GEO_CACHE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      var out = {};
      Object.keys(parsed).forEach(function (key) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return;
        var row = parsed[key];
        if (!row || !isFinite(row.lat) || !isFinite(row.lng)) return;
        if (row.lat < -90 || row.lat > 90 || row.lng < -180 || row.lng > 180) return;
        out[key] = { lat: Number(row.lat), lng: Number(row.lng) };
      });
      return out;
    } catch (err) {
      return {};
    }
  }

  function writeCache(cache) {
    try {
      var keys = Object.keys(cache);
      if (keys.length > 250) {
        var keep = keys.slice(-200);
        var trimmed = {};
        keep.forEach(function (k) { trimmed[k] = cache[k]; });
        cache = trimmed;
      }
      window.localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch (err) {}
  }

  function isAllowedFrameSrc(src) {
    var s = String(src || "");
    return s.indexOf("https://maps.google.com/maps?") === 0 ||
      s.indexOf("https://www.openstreetmap.org/export/embed.html?") === 0;
  }

  function isAllowedOpenUrl(src) {
    var s = String(src || "");
    return s.indexOf("https://maps.google.com/?") === 0;
  }

  function geocode(query) {
    var key = String(query || "").trim().toLowerCase();
    if (!key) return Promise.resolve(null);
    var cache = readCache();
    if (cache[key] && isFinite(cache[key].lat) && isFinite(cache[key].lng)) {
      return Promise.resolve(cache[key]);
    }
    if (!window.fetch) return Promise.resolve(null);
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(query);
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      return res.ok ? res.json() : [];
    }).then(function (rows) {
      if (!rows || !rows[0]) return null;
      var pt = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
      if (!isFinite(pt.lat) || !isFinite(pt.lng)) return null;
      if (pt.lat < -90 || pt.lat > 90 || pt.lng < -180 || pt.lng > 180) return null;
      cache[key] = pt;
      writeCache(cache);
      return pt;
    }).catch(function () {
      return null;
    });
  }

  function paintFrame(container, src, open, title) {
    if (!container) return;
    if (!isAllowedFrameSrc(src)) {
      container.innerHTML = '<p class="crm-empty">Map unavailable.</p>';
      return;
    }
    container.innerHTML =
      '<iframe class="prop-map__frame" title="' + escapeHtml(title || "Property map") +
      '" src="' + escapeHtml(src) +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      (open && isAllowedOpenUrl(open)
        ? '<a class="prop-map__open" href="' + escapeHtml(open) + '" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>'
        : "");
  }

  function renderFrame(container, address, town, opts) {
    if (!container) return;
    opts = opts || {};
    var seq = ++renderSeq;
    var street = streetAddress(address);
    var query = propertyQuery(address, town);
    var title = opts.title || "Property map";
    var empty = opts.empty || "Add a street address to pin this property on the map.";

    if (!query) {
      container.innerHTML = '<p class="crm-empty">' + escapeHtml(empty) + "</p>";
      return;
    }

    if (!street) {
      paintFrame(container, googleSearchUrl(query, 13), openUrl(address, town), title);
      return;
    }

    container.innerHTML = '<p class="crm-empty">Pinning this property…</p>';
    var fallback = googleSearchUrl(query, 18);
    var fallbackOpen = openUrl(address, town);

    geocode(query).then(function (point) {
      if (seq !== renderSeq || !container.parentNode) return;
      if (point) {
        paintFrame(container, osmPinUrl(point.lat, point.lng), openUrl(address, town, point), title);
        return;
      }
      paintFrame(container, fallback, fallbackOpen, title);
    });
  }

  window.GDMaps = {
    propertyQuery: propertyQuery,
    embedUrl: embedUrl,
    openUrl: openUrl,
    renderFrame: renderFrame
  };
})(window);
