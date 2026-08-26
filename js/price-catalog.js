(function (window) {
  "use strict";

  var PRICES_KEY = "grassDaddyPriceList";

  var SECTIONS = [
    "Lawn Maintenance",
    "Landscape Design & Install",
    "Hardscaping & Stonework",
    "Spring / Fall Cleanup",
    "Irrigation & Drainage",
    "Extra / one-off"
  ];

  var STARTER_PRICES = [
    { section: "Lawn Maintenance", name: "Weekly mow, edge & blow-off", unit: "visit", defaultPrice: 55 },
    { section: "Lawn Maintenance", name: "Bi-weekly mow, edge & blow-off", unit: "visit", defaultPrice: 70 },
    { section: "Lawn Maintenance", name: "Small lot mow (under 1/4 acre)", unit: "visit", defaultPrice: 40 },
    { section: "Lawn Maintenance", name: "Large lot mow (over 1 acre)", unit: "visit", defaultPrice: 95 },
    { section: "Landscape Design & Install", name: "Mulch install", unit: "yard", defaultPrice: 65 },
    { section: "Landscape Design & Install", name: "Bed edging & refresh", unit: "job", defaultPrice: 180 },
    { section: "Landscape Design & Install", name: "Shrub / plant install", unit: "each", defaultPrice: 45 },
    { section: "Hardscaping & Stonework", name: "Paver patio", unit: "sq ft", defaultPrice: 22 },
    { section: "Hardscaping & Stonework", name: "Retaining wall", unit: "linear ft", defaultPrice: 55 },
    { section: "Hardscaping & Stonework", name: "Walkway / steps", unit: "sq ft", defaultPrice: 18 },
    { section: "Spring / Fall Cleanup", name: "Spring cleanup", unit: "job", defaultPrice: 225 },
    { section: "Spring / Fall Cleanup", name: "Fall leaf cleanup", unit: "job", defaultPrice: 275 },
    { section: "Spring / Fall Cleanup", name: "Gutter clean-out", unit: "job", defaultPrice: 85 },
    { section: "Irrigation & Drainage", name: "Spring start-up", unit: "job", defaultPrice: 95 },
    { section: "Irrigation & Drainage", name: "Winterization", unit: "job", defaultPrice: 95 },
    { section: "Irrigation & Drainage", name: "Repair / service", unit: "hour", defaultPrice: 85 },
    { section: "Extra / one-off", name: "Site visit / consult", unit: "visit", defaultPrice: 0 },
    { section: "Extra / one-off", name: "Custom", unit: "job", defaultPrice: 0, custom: true, id: "work-custom" }
  ];

  function readArray(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = (window.GDAuth && window.GDAuth.safeJsonParse) ? window.GDAuth.safeJsonParse(raw, []) : (raw ? JSON.parse(raw) : []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  function writeArray(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) {}
  }
  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function isCustom(item) {
    if (!item) return false;
    if (item.custom || item.id === "work-custom") return true;
    return /^\s*custom(\s*\/\s*other)?\s*$/i.test(String(item.name || ""));
  }

  function customItem() {
    return {
      id: "work-custom",
      section: "Extra / one-off",
      name: "Custom",
      unit: "job",
      defaultPrice: 0,
      custom: true
    };
  }

  function ensureCustom(list) {
    var items = Array.isArray(list) ? list : [];
    var found = null;
    items.forEach(function (p) {
      if (!isCustom(p)) return;
      p.custom = true;
      if (/custom \/ other/i.test(p.name || "")) p.name = "Custom";
      found = p;
    });
    if (!found) items.push(customItem());
    return items;
  }

  function starterList() {
    return STARTER_PRICES.map(function (item) {
      return {
        id: item.id || makeId("work"),
        section: item.section,
        name: item.name,
        unit: item.unit,
        defaultPrice: item.defaultPrice,
        custom: !!item.custom
      };
    });
  }

  function ensureStarter() {
    var list = readArray(PRICES_KEY);
    if (!list.length) list = starterList();
    list = ensureCustom(list);
    writeArray(PRICES_KEY, list);
    return list;
  }

  window.GDCatalog = {
    PRICES_KEY: PRICES_KEY,
    SECTIONS: SECTIONS,
    starterList: starterList,
    ensureStarter: ensureStarter,
    ensureCustom: ensureCustom,
    isCustom: isCustom,
    customItem: customItem
  };
})(window);
