(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();

  var catalog = window.GDCatalog;
  var PRICES_KEY = catalog ? catalog.PRICES_KEY : "grassDaddyPriceList";
  var SECTIONS = catalog ? catalog.SECTIONS : [];
  var RATES_KEY = "grassDaddyClientRates";
  var BILLS_KEY = "grassDaddyBills";
  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";

  var sectionFilter = "All";
  var ratesClientKey = "";

  var els = {
    stats: document.getElementById("priceStats"),
    ratesClientSelect: document.getElementById("ratesClientSelect"),
    ratesHint: document.getElementById("ratesHint"),
    sectionTabs: document.getElementById("sectionTabs"),
    priceTable: document.getElementById("priceTable"),
    addWorkBtn: document.getElementById("addWorkBtn"),
    addWorkModal: document.getElementById("addWorkModal"),
    addPriceForm: document.getElementById("addPriceForm"),
    addPriceSection: document.getElementById("addPriceSection"),
    seedPricesBtn: document.getElementById("seedPricesBtn")
  };

  function isCustomItem(item) {
    return catalog && catalog.isCustom ? catalog.isCustom(item) : !!(item && item.custom);
  }

  function readArray(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  function writeArray(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) {}
  }
  function readObject(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  function writeObject(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) {}
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function formatMoney(value) {
    var num = Number(value);
    if (!isFinite(num)) num = 0;
    return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function clientKeyFrom(name, phone, leadId) {
    if (leadId) return "lead:" + leadId;
    return "name:" + String(name || "").toLowerCase().trim() + "|" + String(phone || "").replace(/[^\d]/g, "");
  }

  function getPrices() { return readArray(PRICES_KEY); }
  function savePrices(list) { writeArray(PRICES_KEY, list); }
  function getRates() { return readObject(RATES_KEY); }
  function saveRates(obj) { writeObject(RATES_KEY, obj); }

  function priceForClient(item, clientKey) {
    if (!item) return 0;
    if (clientKey) {
      var rates = getRates();
      var map = rates[clientKey];
      if (map && map[item.id] != null && map[item.id] !== "") {
        var override = Number(map[item.id]);
        if (isFinite(override)) return override;
      }
    }
    return Number(item.defaultPrice) || 0;
  }

  function getClients() {
    var byKey = {};
    var order = [];
    function upsert(name, phone, town, leadId) {
      if (!name) return;
      var key = clientKeyFrom(name, phone, leadId);
      if (!byKey[key]) {
        order.push(key);
        byKey[key] = { key: key, name: name, phone: phone || "", town: town || "", leadId: leadId || "" };
        return;
      }
      byKey[key].phone = byKey[key].phone || phone || "";
      byKey[key].town = byKey[key].town || town || "";
    }
    readArray(LEADS_KEY).forEach(function (l) {
      upsert(l.name, l.phone, l.town, l.id);
    });
    readArray(BOOKINGS_KEY).forEach(function (b) {
      upsert(b.clientName, b.phone, b.town, b.leadId);
    });
    readArray(BILLS_KEY).forEach(function (bill) {
      upsert(bill.clientName, bill.phone, bill.town, bill.leadId);
    });
    return order.map(function (key) { return byKey[key]; }).sort(function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  function findClient(key) {
    var list = getClients();
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function fillClientSelect(select, selected) {
    if (!select) return;
    var html = '<option value="">Default shop rates</option>';
    html += getClients().map(function (c) {
      return '<option value="' + escapeHtml(c.key) + '"' + (c.key === selected ? " selected" : "") + ">" +
        escapeHtml(c.name) + (c.town ? " — " + escapeHtml(c.town) : "") + "</option>";
    }).join("");
    select.innerHTML = html;
    if (selected) select.value = selected;
  }

  function renderStats() {
    var items = getPrices();
    var rates = getRates();
    var customClients = 0;
    Object.keys(rates).forEach(function (key) {
      if (rates[key] && Object.keys(rates[key]).length) customClients++;
    });
    var stats = [
      { label: "Work items on the list", num: items.length },
      { label: "Sections", num: SECTIONS.length },
      { label: "Clients with custom rates", num: customClients }
    ];
    els.stats.innerHTML = stats.map(function (s) {
      return '<div class="leads__stat"><span class="leads__stat-num">' + escapeHtml(s.num) + "</span>" +
        '<span class="leads__stat-label">' + escapeHtml(s.label) + "</span></div>";
    }).join("");
  }

  function renderSectionTabs() {
    var tabs = ["All"].concat(SECTIONS);
    els.sectionTabs.innerHTML = tabs.map(function (sec) {
      var count = sec === "All"
        ? getPrices().length
        : getPrices().filter(function (p) { return p.section === sec; }).length;
      var active = sec === sectionFilter;
      return '<button type="button" class="leads__filter' + (active ? " is-active" : "") +
        '" data-section="' + escapeHtml(sec) + '" role="tab" aria-selected="' + (active ? "true" : "false") + '">' +
        escapeHtml(sec === "All" ? "All sections" : sec) +
        ' <span class="leads__filter-count">' + count + "</span></button>";
    }).join("");
  }

  function renderPriceTable() {
    var items = getPrices().filter(function (p) {
      return sectionFilter === "All" || p.section === sectionFilter;
    });
    var client = findClient(ratesClientKey);
    els.ratesHint.textContent = client
      ? "Prices for " + client.name + ". Change a number to set their rate — leave it matching the default to use the shop rate."
      : "Default shop rates. Pick a client above to set what you charge that person.";

    if (!items.length) {
      els.priceTable.innerHTML = '<p class="crm-empty">No work items yet. Load the starter price list or add a piece of work.</p>';
      return;
    }

    var rows = items.map(function (item) {
      var custom = isCustomItem(item);
      var shop = Number(item.defaultPrice) || 0;
      var shown = priceForClient(item, ratesClientKey);
      var isOverride = ratesClientKey && shown !== shop;
      var priceCell = custom
        ? '<td><span class="bill-price-note">Set on each job</span></td>'
        : (
          '<td class="bill-price-cell">' +
          '<input type="number" min="0" max="1000000" step="0.01" class="bill-price-input" value="' +
          escapeHtml(shown) + '" aria-label="Price for ' + escapeHtml(item.name) + '">' +
          (ratesClientKey
            ? '<span class="bill-price-note">' + (isOverride ? "custom" : "shop " + formatMoney(shop)) + "</span>"
            : "") +
          "</td>"
        );
      var nameCell = escapeHtml(item.name) + (custom ? ' <span class="crm-pill">Custom</span>' : "");
      var removeCell = custom
        ? "<td></td>"
        : '<td><button type="button" class="leads__delete-btn" data-delete-item="' + escapeHtml(item.id) + '">Remove</button></td>';
      return (
        '<tr data-item-id="' + escapeHtml(item.id) + '"' + (custom ? ' class="is-custom"' : "") + ">" +
        "<td>" + nameCell + "</td>" +
        "<td>" + escapeHtml(item.section) + "</td>" +
        "<td>" + escapeHtml(item.unit) + "</td>" +
        priceCell +
        removeCell +
        "</tr>"
      );
    }).join("");

    els.priceTable.innerHTML =
      '<div class="bill-table-wrap"><table class="bill-table">' +
      "<thead><tr><th>Work</th><th>Section</th><th>Unit</th><th>Price</th><th></th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function fillSectionSelect() {
    if (!els.addPriceSection) return;
    els.addPriceSection.innerHTML = SECTIONS.map(function (s) {
      return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + "</option>";
    }).join("");
  }

  function openAddWorkModal() {
    fillSectionSelect();
    if (els.addPriceForm) els.addPriceForm.reset();
    els.addWorkModal.classList.add("is-open");
    els.addWorkModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.addWorkModal);
    var first = els.addWorkModal.querySelector('input[name="name"]');
    if (first) first.focus();
  }

  function closeAddWorkModal() {
    els.addWorkModal.classList.remove("is-open");
    els.addWorkModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function render() {
    fillClientSelect(els.ratesClientSelect, ratesClientKey);
    fillSectionSelect();
    renderStats();
    renderSectionTabs();
    renderPriceTable();
  }

  function seedStarterPrices() {
    var existing = getPrices();
    if (existing.length) {
      if (!window.confirm("Replace the current price list with the starter landscaping list?")) return;
    }
    savePrices(catalog ? catalog.ensureCustom(catalog.starterList()) : []);
    render();
  }

  els.ratesClientSelect.addEventListener("change", function () {
    ratesClientKey = els.ratesClientSelect.value || "";
    renderPriceTable();
  });

  els.sectionTabs.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-section]") : null;
    if (!btn) return;
    sectionFilter = btn.getAttribute("data-section");
    renderSectionTabs();
    renderPriceTable();
  });

  els.priceTable.addEventListener("change", function (e) {
    var input = e.target.closest ? e.target.closest(".bill-price-input") : null;
    if (!input) return;
    var row = input.closest("[data-item-id]");
    if (!row) return;
    var id = row.getAttribute("data-item-id");
    var value = Number(input.value);
    if (!isFinite(value) || value < 0) value = 0;

    if (!ratesClientKey) {
      var prices = getPrices();
      prices.forEach(function (p) {
        if (p.id === id) p.defaultPrice = value;
      });
      savePrices(prices);
    } else {
      var rates = getRates();
      if (!rates[ratesClientKey]) rates[ratesClientKey] = {};
      var shop = 0;
      getPrices().forEach(function (p) { if (p.id === id) shop = Number(p.defaultPrice) || 0; });
      if (value === shop) delete rates[ratesClientKey][id];
      else rates[ratesClientKey][id] = value;
      saveRates(rates);
    }
    renderPriceTable();
    renderStats();
  });

  els.priceTable.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-delete-item]") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-delete-item");
    var target = getPrices().filter(function (p) { return p.id === id; })[0];
    if (isCustomItem(target)) return;
    if (!window.confirm("Remove this piece of work from the price list?")) return;
    savePrices(getPrices().filter(function (p) { return p.id !== id; }));
    if (catalog) catalog.ensureStarter();
    render();
  });

  els.addPriceForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!els.addPriceForm.checkValidity()) {
      els.addPriceForm.reportValidity();
      return;
    }
    var data = new FormData(els.addPriceForm);
    var name = (data.get("name") || "").toString().trim();
    if (isCustomItem({ name: name })) {
      window.alert("Custom is already on the list. Use that row when you need a one-off amount.");
      return;
    }
    var prices = getPrices();
    prices.push({
      id: makeId("work"),
      section: (data.get("section") || SECTIONS[0]).toString(),
      name: name,
      unit: (data.get("unit") || "job").toString().trim(),
      defaultPrice: Number(data.get("defaultPrice")) || 0
    });
    savePrices(prices);
    els.addPriceForm.reset();
    closeAddWorkModal();
    render();
  });

  if (els.addWorkBtn) {
    els.addWorkBtn.addEventListener("click", openAddWorkModal);
  }
  if (els.addWorkModal) {
    els.addWorkModal.querySelectorAll("[data-add-work-close]").forEach(function (el) {
      el.addEventListener("click", closeAddWorkModal);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && els.addWorkModal && els.addWorkModal.classList.contains("is-open")) {
      closeAddWorkModal();
    }
  });

  els.seedPricesBtn.addEventListener("click", seedStarterPrices);

  if (catalog) catalog.ensureStarter();

  try {
    var params = new URLSearchParams(window.location.search);
    var clientParam = params.get("client") || "";
    if (clientParam) ratesClientKey = clientParam;
  } catch (err) {}

  render();
})();
