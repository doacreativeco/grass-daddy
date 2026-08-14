(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();

  var catalog = window.GDCatalog;
  var PRICES_KEY = catalog ? catalog.PRICES_KEY : "grassDaddyPriceList";
  var RATES_KEY = "grassDaddyClientRates";
  var BILLS_KEY = "grassDaddyBills";
  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";

  var billsClientKey = "";
  var billsStatus = "All";
  var editingBillId = null;
  var draftLines = [];

  var els = {
    stats: document.getElementById("billStats"),
    newBillBtn: document.getElementById("newBillBtn"),
    billsClientSelect: document.getElementById("billsClientSelect"),
    billsStatusSelect: document.getElementById("billsStatusSelect"),
    billsList: document.getElementById("billsList"),
    billModal: document.getElementById("billModal"),
    billModalTitle: document.getElementById("billModalTitle"),
    billForm: document.getElementById("billForm"),
    billClientSelect: document.getElementById("billClientSelect"),
    billDateInput: document.getElementById("billDateInput"),
    billLines: document.getElementById("billLines"),
    billTotal: document.getElementById("billTotal"),
    addLineBtn: document.getElementById("addLineBtn"),
    deleteBillBtn: document.getElementById("deleteBillBtn")
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
  function billTotal(bill) {
    return (bill.items || []).reduce(function (sum, line) { return sum + lineTotal(line); }, 0);
  }

  function getPrices() { return readArray(PRICES_KEY); }
  function getRates() { return readObject(RATES_KEY); }
  function getBills() { return readArray(BILLS_KEY); }
  function saveBills(list) { writeArray(BILLS_KEY, list); }

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
    getBills().forEach(function (bill) {
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

  function fillClientSelect(select, emptyLabel, selected) {
    if (!select) return;
    var html = '<option value="">' + escapeHtml(emptyLabel) + "</option>";
    html += getClients().map(function (c) {
      return '<option value="' + escapeHtml(c.key) + '"' + (c.key === selected ? " selected" : "") + ">" +
        escapeHtml(c.name) + (c.town ? " — " + escapeHtml(c.town) : "") + "</option>";
    }).join("");
    select.innerHTML = html;
    if (selected) select.value = selected;
  }

  function nextBillNumber() {
    var max = 1000;
    getBills().forEach(function (b) {
      var n = Number(b.number);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function renderStats() {
    var bills = getBills();
    var now = new Date();
    var monthPrefix = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var unpaid = 0;
    var unpaidCount = 0;
    var paidYear = 0;
    var monthCount = 0;
    bills.forEach(function (b) {
      var total = billTotal(b);
      if (b.status !== "paid") {
        unpaid += total;
        unpaidCount++;
      }
      if (b.status === "paid" && String(b.date || "").indexOf(String(now.getFullYear())) === 0) paidYear += total;
      if (String(b.date || "").indexOf(monthPrefix) === 0) monthCount++;
    });
    var stats = [
      { label: "Unpaid on the books", num: formatMoney(unpaid), warn: unpaid > 0 },
      { label: "Open invoices", num: unpaidCount, warn: unpaidCount > 0 },
      { label: "Paid this year", num: formatMoney(paidYear) },
      { label: "Bills this month", num: monthCount }
    ];
    els.stats.innerHTML = stats.map(function (s) {
      return '<div class="leads__stat' + (s.warn ? " leads__stat--warn" : "") + '">' +
        '<span class="leads__stat-num">' + escapeHtml(s.num) + "</span>" +
        '<span class="leads__stat-label">' + escapeHtml(s.label) + "</span></div>";
    }).join("");
  }

  function renderBills() {
    var bills = getBills().slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    if (billsClientKey) {
      bills = bills.filter(function (b) { return b.clientKey === billsClientKey; });
    }
    if (billsStatus !== "All") {
      bills = bills.filter(function (b) { return (b.status || "unpaid") === billsStatus; });
    }

    if (!bills.length) {
      els.billsList.innerHTML = '<p class="crm-empty">No invoices yet for this view. Hit New bill to charge a client, or convert an accepted estimate.</p>';
      return;
    }

    els.billsList.innerHTML = bills.map(function (bill) {
      var total = billTotal(bill);
      var paid = bill.status === "paid";
      var lines = (bill.items || []).map(function (line) {
        return "<li>" + escapeHtml(line.name) + " × " + escapeHtml(line.qty) + " " + escapeHtml(line.unit || "") +
          " — " + formatMoney(lineTotal(line)) + "</li>";
      }).join("");
      return (
        '<article class="bill-card" data-bill-id="' + escapeHtml(bill.id) + '">' +
        '<div class="bill-card__top">' +
        "<div><h3>Bill #" + escapeHtml(bill.number) + " · " + escapeHtml(bill.clientName || "Client") + "</h3>" +
        '<p class="crm-job__meta">' + escapeHtml(formatDate(bill.date)) +
        (bill.town ? " · " + escapeHtml(bill.town) : "") +
        (bill.notes ? " — " + escapeHtml(bill.notes) : "") +
        "</p></div>" +
        '<div class="bill-card__aside">' +
        '<span class="lead-card__value">' + formatMoney(total) + "</span>" +
        '<span class="crm-pill' + (paid ? " crm-pill--paid" : "") + '">' + (paid ? "Paid" : "Unpaid") + "</span>" +
        "</div></div>" +
        '<ul class="bill-card__lines">' + lines + "</ul>" +
        '<div class="lead-card__actions">' +
        (paid ? "" : '<button type="button" class="leads__schedule-btn" data-mark-paid="' + escapeHtml(bill.id) + '">Mark paid</button>') +
        '<button type="button" class="leads__edit-btn" data-edit-bill="' + escapeHtml(bill.id) + '">Edit</button>' +
        '<button type="button" class="leads__delete-btn" data-delete-bill="' + escapeHtml(bill.id) + '">Delete</button>' +
        "</div></article>"
      );
    }).join("");
  }

  function render() {
    fillClientSelect(els.billsClientSelect, "All clients", billsClientKey);
    renderStats();
    renderBills();
  }

  function renderDraftLines() {
    if (!els.billLines) return;
    if (!draftLines.length) {
      els.billLines.innerHTML = '<p class="crm-empty">Add the pieces of work you did.</p>';
    } else {
      var prices = getPrices();
      els.billLines.innerHTML = draftLines.map(function (line, i) {
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
    if (els.billTotal) {
      var total = draftLines.reduce(function (sum, line) { return sum + lineTotal(line); }, 0);
      els.billTotal.textContent = formatMoney(total);
    }
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

  function openBillModal(bill) {
    editingBillId = bill ? bill.id : null;
    els.billModalTitle.textContent = bill ? "Edit bill #" + bill.number : "New bill";
    els.deleteBillBtn.hidden = !bill;
    fillClientSelect(els.billClientSelect, "— pick a client —", bill ? bill.clientKey : "");
    els.billForm.reset();
    els.billDateInput.value = bill ? bill.date : todayIso();
    if (bill) {
      els.billForm.querySelector('[name="status"]').value = bill.status === "paid" ? "paid" : "unpaid";
      els.billForm.querySelector('[name="notes"]').value = bill.notes || "";
      draftLines = (bill.items || []).map(function (line) {
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
    els.billModal.classList.add("is-open");
    els.billModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.billModal);
  }

  function closeBillModal() {
    editingBillId = null;
    draftLines = [];
    els.billModal.classList.remove("is-open");
    els.billModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  els.newBillBtn.addEventListener("click", function () {
    openBillModal(null);
  });

  els.billsClientSelect.addEventListener("change", function () {
    billsClientKey = els.billsClientSelect.value || "";
    renderBills();
  });
  els.billsStatusSelect.addEventListener("change", function () {
    billsStatus = els.billsStatusSelect.value || "All";
    renderBills();
  });

  els.billsList.addEventListener("click", function (e) {
    var paidBtn = e.target.closest ? e.target.closest("[data-mark-paid]") : null;
    if (paidBtn) {
      var bills = getBills();
      bills.forEach(function (b) {
        if (b.id === paidBtn.getAttribute("data-mark-paid")) b.status = "paid";
      });
      saveBills(bills);
      render();
      return;
    }
    var editBtn = e.target.closest ? e.target.closest("[data-edit-bill]") : null;
    if (editBtn) {
      var bill = getBills().filter(function (b) { return b.id === editBtn.getAttribute("data-edit-bill"); })[0];
      if (bill) openBillModal(bill);
      return;
    }
    var delBtn = e.target.closest ? e.target.closest("[data-delete-bill]") : null;
    if (delBtn) {
      if (!window.confirm("Delete this bill? This can't be undone.")) return;
      saveBills(getBills().filter(function (b) { return b.id !== delBtn.getAttribute("data-delete-bill"); }));
      render();
    }
  });

  els.addLineBtn.addEventListener("click", function () {
    var prices = getPrices();
    if (!prices.length) {
      window.alert("Add a price list first — open Price list in the sidebar.");
      return;
    }
    var clientKey = els.billClientSelect.value || "";
    var line = applyLineItem({ qty: 1, unitPrice: 0 }, prices[0].id, clientKey);
    draftLines.push(line);
    renderDraftLines();
  });

  els.billLines.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-remove-line]") : null;
    if (!btn) return;
    draftLines.splice(Number(btn.getAttribute("data-remove-line")), 1);
    renderDraftLines();
  });

  els.billLines.addEventListener("input", function (e) {
    var fieldEl = e.target.closest ? e.target.closest('[data-line-field="name"]') : null;
    if (!fieldEl) return;
    var row = fieldEl.closest("[data-line-index]");
    if (!row) return;
    var idx = Number(row.getAttribute("data-line-index"));
    if (draftLines[idx]) draftLines[idx].name = fieldEl.value;
  });

  els.billLines.addEventListener("change", function (e) {
    var fieldEl = e.target.closest ? e.target.closest("[data-line-field]") : null;
    if (!fieldEl) return;
    var row = fieldEl.closest("[data-line-index]");
    if (!row) return;
    var idx = Number(row.getAttribute("data-line-index"));
    var field = fieldEl.getAttribute("data-line-field");
    if (field === "itemId") {
      applyLineItem(draftLines[idx], fieldEl.value, els.billClientSelect.value || "");
      if (!draftLines[idx].qty) draftLines[idx].qty = 1;
    } else if (field === "qty" || field === "unitPrice") {
      draftLines[idx][field] = Number(fieldEl.value) || 0;
    } else if (field === "name") {
      draftLines[idx].name = fieldEl.value;
      return;
    }
    renderDraftLines();
  });

  els.billClientSelect.addEventListener("change", function () {
    var clientKey = els.billClientSelect.value || "";
    draftLines.forEach(function (line) {
      if (line.itemId) applyLineItem(line, line.itemId, clientKey);
    });
    renderDraftLines();
  });

  els.billForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!els.billForm.checkValidity()) {
      els.billForm.reportValidity();
      return;
    }
    if (!draftLines.length) {
      window.alert("Add at least one piece of work to the bill.");
      return;
    }
    var data = new FormData(els.billForm);
    var client = findClient(data.get("clientKey"));
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
      status: (data.get("status") || "unpaid").toString(),
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

    var bills = getBills();
    if (editingBillId) {
      for (var i = 0; i < bills.length; i++) {
        if (bills[i].id === editingBillId) {
          payload.id = bills[i].id;
          payload.number = bills[i].number;
          payload.createdAt = bills[i].createdAt;
          bills[i] = payload;
          break;
        }
      }
    } else {
      payload.id = makeId("bill");
      payload.number = nextBillNumber();
      payload.createdAt = new Date().toISOString();
      bills.push(payload);
    }
    saveBills(bills);
    closeBillModal();
    billsClientKey = client.key;
    render();
  });

  els.deleteBillBtn.addEventListener("click", function () {
    if (!editingBillId) return;
    if (!window.confirm("Delete this bill? This can't be undone.")) return;
    saveBills(getBills().filter(function (b) { return b.id !== editingBillId; }));
    closeBillModal();
    render();
  });

  els.billModal.querySelectorAll("[data-bill-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeBillModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && els.billModal.classList.contains("is-open")) closeBillModal();
  });

  if (catalog) catalog.ensureStarter();

  try {
    var params = new URLSearchParams(window.location.search);
    var clientParam = params.get("client") || "";
    var wantNew = params.get("new") === "1";
    if (clientParam) billsClientKey = clientParam;
    render();
    if (wantNew) {
      openBillModal(null);
      if (clientParam && els.billClientSelect) els.billClientSelect.value = clientParam;
    }
  } catch (err) {
    render();
  }
})();
