(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();
  if (window.GDCatalog) window.GDCatalog.ensureStarter();

  var PRICES_KEY = "grassDaddyPriceList";
  var RATES_KEY = "grassDaddyClientRates";
  var ESTIMATES_KEY = "grassDaddyEstimates";
  var BILLS_KEY = "grassDaddyBills";
  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";

  var filterClient = "";
  var filterStatus = "All";
  var editingId = null;
  var draftLines = [];
  var pendingClientKey = "";
  var pendingOpenNew = false;

  var els = {
    stats: document.getElementById("estStats"),
    list: document.getElementById("estList"),
    clientFilter: document.getElementById("estClientFilter"),
    statusFilter: document.getElementById("estStatusFilter"),
    newBtn: document.getElementById("newEstBtn"),
    modal: document.getElementById("estModal"),
    modalTitle: document.getElementById("estModalTitle"),
    form: document.getElementById("estForm"),
    clientSelect: document.getElementById("estClientSelect"),
    dateInput: document.getElementById("estDateInput"),
    lines: document.getElementById("estLines"),
    total: document.getElementById("estTotal"),
    addLineBtn: document.getElementById("addEstLineBtn"),
    deleteBtn: document.getElementById("deleteEstBtn")
  };

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
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function formatMoney(value) {
    var num = Number(value);
    if (!isFinite(num)) num = 0;
    return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function clientKeyFrom(name, phone, leadId) {
    if (leadId) return "lead:" + leadId;
    return "name:" + String(name || "").toLowerCase().trim() + "|" + String(phone || "").replace(/[^\d]/g, "");
  }
  function lineTotal(line) {
    return (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
  }
  function docTotal(doc) {
    return (doc.items || []).reduce(function (sum, line) { return sum + lineTotal(line); }, 0);
  }

  function getPrices() { return readArray(PRICES_KEY); }
  function getEstimates() { return readArray(ESTIMATES_KEY); }
  function saveEstimates(list) { writeArray(ESTIMATES_KEY, list); }
  function getBills() { return readArray(BILLS_KEY); }
  function saveBills(list) { writeArray(BILLS_KEY, list); }

  function priceForClient(item, clientKey) {
    if (!item) return 0;
    if (clientKey) {
      var rates = readObject(RATES_KEY);
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
    readArray(LEADS_KEY).forEach(function (l) { upsert(l.name, l.phone, l.town, l.id); });
    readArray(BOOKINGS_KEY).forEach(function (b) { upsert(b.clientName, b.phone, b.town, b.leadId); });
    getBills().forEach(function (bill) { upsert(bill.clientName, bill.phone, bill.town, bill.leadId); });
    getEstimates().forEach(function (est) { upsert(est.clientName, est.phone, est.town, est.leadId); });
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
  function fillClientSelect(select, includeAll, selected) {
    if (!select) return;
    var html = includeAll
      ? '<option value="">All clients</option>'
      : '<option value="">— pick a client —</option>';
    html += getClients().map(function (c) {
      return '<option value="' + escapeHtml(c.key) + '"' + (c.key === selected ? " selected" : "") + ">" +
        escapeHtml(c.name) + (c.town ? " — " + escapeHtml(c.town) : "") + "</option>";
    }).join("");
    select.innerHTML = html;
    if (selected) select.value = selected;
  }
  function nextNumber(list, fallback) {
    var max = fallback;
    list.forEach(function (item) {
      var n = Number(item.number);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function renderStats() {
    var list = getEstimates();
    var open = 0;
    var accepted = 0;
    var draft = 0;
    list.forEach(function (e) {
      var total = docTotal(e);
      if (e.status === "accepted") accepted += total;
      else if (e.status === "draft") draft += 1;
      else if (e.status !== "declined") open += total;
    });
    var stats = [
      { label: "Open estimates", num: formatMoney(open) },
      { label: "Accepted value", num: formatMoney(accepted) },
      { label: "Drafts", num: draft },
      { label: "Total estimates", num: list.length }
    ];
    els.stats.innerHTML = stats.map(function (s) {
      return '<div class="leads__stat"><span class="leads__stat-num">' + escapeHtml(s.num) +
        '</span><span class="leads__stat-label">' + escapeHtml(s.label) + "</span></div>";
    }).join("");
  }

  function renderList() {
    var list = getEstimates().filter(function (e) {
      if (filterClient && e.clientKey !== filterClient) return false;
      if (filterStatus !== "All" && e.status !== filterStatus) return false;
      return true;
    }).sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });

    if (!list.length) {
      els.list.innerHTML = '<p class="crm-empty">No estimates yet. Build one from the price list, then convert it to an invoice when they say yes.</p>';
      return;
    }
    els.list.innerHTML = list.map(function (e) {
      var status = e.status || "draft";
      return (
        '<article class="est-card">' +
        "<div><p class=\"est-card__num\">Estimate #" + escapeHtml(e.number) + " · " + escapeHtml(formatDate(e.date)) +
        '</p><p class="est-card__name">' + escapeHtml(e.clientName || "Unnamed") +
        '</p><p class="est-card__meta">' + escapeHtml((e.items || []).length + " line item(s)") +
        (e.notes ? " — " + escapeHtml(e.notes) : "") +
        '</p><p style="margin-top:8px"><span class="est-status est-status--' + escapeHtml(status) + '">' +
        escapeHtml(status) + "</span></p></div>" +
        '<div><p class="est-card__total">' + formatMoney(docTotal(e)) + '</p>' +
        '<div class="est-card__actions">' +
        '<button type="button" class="crm-action" data-edit-est="' + escapeHtml(e.id) + '">Edit</button>' +
        (status !== "accepted" && status !== "declined"
          ? '<button type="button" class="crm-action" data-mark-sent="' + escapeHtml(e.id) + '">Mark sent</button>'
          : "") +
        (status !== "accepted"
          ? '<button type="button" class="crm-action crm-action--solid" data-convert-est="' + escapeHtml(e.id) + '">Convert to invoice</button>'
          : '<a class="crm-action" href="billing.html?client=' + encodeURIComponent(e.clientKey) + '">View invoices</a>') +
        "</div></div></article>"
      );
    }).join("");
  }

  function render() {
    fillClientSelect(els.clientFilter, true, filterClient);
    renderStats();
    renderList();
  }

  function isCustomItem(item) {
    return window.GDCatalog && window.GDCatalog.isCustom ? window.GDCatalog.isCustom(item) : !!(item && item.custom);
  }

  function applyLineItem(line, itemId, clientKey) {
    var prices = getPrices();
    var item = null;
    for (var i = 0; i < prices.length; i++) {
      if (prices[i].id === itemId) { item = prices[i]; break; }
    }
    if (!item) return line;
    if (isCustomItem(item)) {
      var switching = line.itemId !== item.id;
      line.itemId = item.id;
      line.section = item.section;
      line.unit = item.unit || "job";
      line.custom = true;
      if (switching) {
        line.name = "";
        line.unitPrice = 0;
      }
      return line;
    }
    line.custom = false;
    line.itemId = item.id;
    line.name = item.name;
    line.section = item.section;
    line.unit = item.unit;
    line.unitPrice = priceForClient(item, clientKey);
    return line;
  }

  function renderDraftLines() {
    if (!draftLines.length) {
      els.lines.innerHTML = '<p class="crm-empty">Add the pieces of work you\'re quoting.</p>';
    } else {
      var prices = getPrices();
      els.lines.innerHTML = draftLines.map(function (line, i) {
        var item = null;
        for (var p = 0; p < prices.length; p++) {
          if (prices[p].id === line.itemId) { item = prices[p]; break; }
        }
        var custom = !!(line.custom || isCustomItem(item));
        var options = prices.map(function (pr) {
          return '<option value="' + escapeHtml(pr.id) + '"' + (pr.id === line.itemId ? " selected" : "") + ">" +
            escapeHtml(pr.section) + " — " + escapeHtml(pr.name) + "</option>";
        }).join("");
        var workCell =
          '<select class="leads__sort-select bill-line__work" data-line-field="itemId">' + options + "</select>" +
          (custom
            ? '<input type="text" class="bill-line__name" data-line-field="name" maxlength="120" placeholder="What you did" value="' +
              escapeHtml(line.name || "") + '" aria-label="Custom work name">'
            : "");
        return (
          '<div class="bill-line' + (custom ? " is-custom" : "") + '" data-line-index="' + i + '">' +
          workCell +
          '<input type="number" min="0" step="0.01" class="bill-line__qty" data-line-field="qty" value="' +
          escapeHtml(line.qty) + '" aria-label="Quantity">' +
          '<input type="number" min="0" step="0.01" class="bill-line__price" data-line-field="unitPrice" value="' +
          escapeHtml(line.unitPrice) + '" aria-label="Unit price">' +
          '<span class="bill-line__sum">' + formatMoney(lineTotal(line)) + "</span>" +
          '<button type="button" class="leads__delete-btn" data-remove-line="' + i + '">×</button>' +
          "</div>"
        );
      }).join("");
    }
    var total = draftLines.reduce(function (sum, line) { return sum + lineTotal(line); }, 0);
    els.total.textContent = formatMoney(total);
  }

  function openModal(est) {
    editingId = est ? est.id : null;
    els.modalTitle.textContent = est ? "Edit estimate #" + est.number : "New estimate";
    els.deleteBtn.hidden = !est;
    fillClientSelect(els.clientSelect, false, est ? est.clientKey : pendingClientKey);
    els.form.reset();
    els.dateInput.value = est ? est.date : todayIso();
    if (est) {
      els.form.querySelector('[name="status"]').value = est.status || "draft";
      els.form.querySelector('[name="notes"]').value = est.notes || "";
      draftLines = (est.items || []).map(function (line) {
        return {
          itemId: line.itemId || "",
          name: line.name,
          section: line.section,
          unit: line.unit,
          qty: line.qty,
          unitPrice: line.unitPrice,
          custom: !!line.custom
        };
      });
    } else {
      draftLines = [];
    }
    renderDraftLines();
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.modal);
  }

  function closeModal() {
    editingId = null;
    draftLines = [];
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function convertToInvoice(est) {
    var bills = getBills();
    var payload = {
      id: makeId("bill"),
      number: nextNumber(bills, 1000),
      clientKey: est.clientKey,
      clientName: est.clientName,
      phone: est.phone,
      town: est.town,
      leadId: est.leadId || "",
      date: todayIso(),
      status: "unpaid",
      notes: "From estimate #" + est.number + (est.notes ? " — " + est.notes : ""),
      items: (est.items || []).map(function (line) {
        return {
          itemId: line.itemId,
          name: line.name,
          section: line.section,
          unit: line.unit,
          qty: line.qty,
          unitPrice: line.unitPrice,
          custom: !!line.custom
        };
      }),
      createdAt: new Date().toISOString()
    };
    bills.push(payload);
    saveBills(bills);
    var estimates = getEstimates();
    estimates.forEach(function (e) {
      if (e.id === est.id) e.status = "accepted";
    });
    saveEstimates(estimates);
    window.location.href = "billing.html?client=" + encodeURIComponent(est.clientKey);
  }

  els.newBtn.addEventListener("click", function () { openModal(null); });
  els.clientFilter.addEventListener("change", function () {
    filterClient = els.clientFilter.value || "";
    renderList();
  });
  els.statusFilter.addEventListener("change", function () {
    filterStatus = els.statusFilter.value || "All";
    renderList();
  });

  els.addLineBtn.addEventListener("click", function () {
    var prices = getPrices();
    if (!prices.length) {
      window.alert("Add work items on the Price list first.");
      return;
    }
    var clientKey = els.clientSelect.value || "";
    var line = { qty: 1 };
    applyLineItem(line, prices[0].id, clientKey);
    draftLines.push(line);
    renderDraftLines();
  });

  els.lines.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-remove-line]") : null;
    if (!btn) return;
    draftLines.splice(Number(btn.getAttribute("data-remove-line")), 1);
    renderDraftLines();
  });
  els.lines.addEventListener("change", function (e) {
    var field = e.target.getAttribute && e.target.getAttribute("data-line-field");
    if (!field) return;
    var row = e.target.closest("[data-line-index]");
    if (!row) return;
    var i = Number(row.getAttribute("data-line-index"));
    var line = draftLines[i];
    if (!line) return;
    if (field === "itemId") applyLineItem(line, e.target.value, els.clientSelect.value || "");
    else if (field === "qty") line.qty = Number(e.target.value) || 0;
    else if (field === "unitPrice") line.unitPrice = Number(e.target.value) || 0;
    else if (field === "name") {
      line.name = e.target.value;
      return;
    }
    renderDraftLines();
  });
  els.lines.addEventListener("input", function (e) {
    var field = e.target.getAttribute && e.target.getAttribute("data-line-field");
    if (field !== "name") return;
    var row = e.target.closest("[data-line-index]");
    if (!row) return;
    var i = Number(row.getAttribute("data-line-index"));
    if (draftLines[i]) draftLines[i].name = e.target.value;
  });

  els.list.addEventListener("click", function (e) {
    var edit = e.target.closest ? e.target.closest("[data-edit-est]") : null;
    if (edit) {
      var est = getEstimates().filter(function (item) { return item.id === edit.getAttribute("data-edit-est"); })[0];
      if (est) openModal(est);
      return;
    }
    var sent = e.target.closest ? e.target.closest("[data-mark-sent]") : null;
    if (sent) {
      var all = getEstimates();
      all.forEach(function (item) {
        if (item.id === sent.getAttribute("data-mark-sent") && item.status === "draft") item.status = "sent";
      });
      saveEstimates(all);
      render();
      return;
    }
    var conv = e.target.closest ? e.target.closest("[data-convert-est]") : null;
    if (conv) {
      var found = getEstimates().filter(function (item) { return item.id === conv.getAttribute("data-convert-est"); })[0];
      if (found) convertToInvoice(found);
    }
  });

  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!els.form.checkValidity()) {
      els.form.reportValidity();
      return;
    }
    if (!draftLines.length) {
      window.alert("Add at least one line item.");
      return;
    }
    var data = new FormData(els.form);
    var client = findClient((data.get("clientKey") || "").toString());
    if (!client) {
      window.alert("Pick a client.");
      return;
    }
    var payload = {
      clientKey: client.key,
      clientName: client.name,
      phone: client.phone,
      town: client.town,
      leadId: client.leadId || "",
      date: (data.get("date") || todayIso()).toString(),
      status: (data.get("status") || "draft").toString(),
      notes: (data.get("notes") || "").toString().trim(),
      items: draftLines.map(function (line) {
        return {
          itemId: line.itemId,
          name: line.name,
          section: line.section,
          unit: line.unit,
          qty: Number(line.qty) || 0,
          unitPrice: Number(line.unitPrice) || 0,
          custom: !!line.custom
        };
      })
    };
    var list = getEstimates();
    if (editingId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === editingId) {
          payload.id = list[i].id;
          payload.number = list[i].number;
          payload.createdAt = list[i].createdAt;
          list[i] = payload;
          break;
        }
      }
    } else {
      payload.id = makeId("est");
      payload.number = nextNumber(list, 2000);
      payload.createdAt = new Date().toISOString();
      list.push(payload);
    }
    saveEstimates(list);
    closeModal();
    filterClient = client.key;
    render();
  });

  els.deleteBtn.addEventListener("click", function () {
    if (!editingId) return;
    if (!window.confirm("Delete this estimate? This can't be undone.")) return;
    saveEstimates(getEstimates().filter(function (e) { return e.id !== editingId; }));
    closeModal();
    render();
  });

  els.modal.querySelectorAll("[data-est-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && els.modal.classList.contains("is-open")) closeModal();
  });

  try {
    var params = new URLSearchParams(window.location.search);
    pendingClientKey = params.get("client") || "";
    pendingOpenNew = params.get("new") === "1";
    if (pendingClientKey) filterClient = pendingClientKey;
  } catch (err) {}

  render();
  if (pendingOpenNew) openModal(null);
})();
