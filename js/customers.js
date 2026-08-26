(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();

  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";
  var BILLS_KEY = "grassDaddyBills";
  var ESTIMATES_KEY = "grassDaddyEstimates";
  var PAST_KEY = "grassDaddyPastClients";
  var RATES_KEY = "grassDaddyClientRates";

  var ACTIVITY_LABELS = { call: "Called", text: "Texted", quote: "Quoted", visit: "Site visit", note: "Note" };

  var filter = "all";
  var searchQuery = "";
  var selectedKey = "";
  var detailTab = "overview";
  var viewingPast = false;
  var pendingDeleteKey = "";
  var pendingPurgeKey = "";

  var els = {
    list: document.getElementById("custList"),
    detail: document.getElementById("custDetail"),
    search: document.getElementById("custSearch"),
    count: document.getElementById("custCount"),
    pastBtn: document.getElementById("pastClientsBtn"),
    deleteModal: document.getElementById("deleteClientModal"),
    deleteMsg: document.getElementById("deleteClientMsg"),
    deleteConfirm: document.getElementById("deleteClientConfirm"),
    purgeModal: document.getElementById("purgeClientModal"),
    purgeMsg: document.getElementById("purgeClientMsg"),
    purgeConfirm: document.getElementById("purgeClientConfirm")
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
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseIso(iso) {
    var parts = String(iso || "").split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }
  function daysBetweenIso(aIso, bIso) {
    return Math.round((parseIso(bIso).getTime() - parseIso(aIso).getTime()) / 86400000);
  }
  function addDaysIso(iso, days) {
    var d = parseIso(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function daysInMonthUTC(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }
  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function formatMoney(value) {
    var num = Number(value);
    if (!isFinite(num)) num = 0;
    return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function formatTime(hhmm) {
    if (!hhmm) return "";
    var parts = String(hhmm).split(":").map(Number);
    var h = parts[0], m = parts[1] || 0;
    var period = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + String(m).padStart(2, "0") + " " + period;
  }
  function digits(phone) {
    return String(phone || "").replace(/[^\d]/g, "");
  }
  function telHref(phone) {
    var raw = String(phone || "").trim();
    var plus = raw.charAt(0) === "+";
    var d = raw.replace(/[^\d]/g, "");
    if (d.length < 7 || d.length > 15) return "";
    return "tel:" + (plus ? "+" : "") + d;
  }
  function smsHref(phone) {
    var href = telHref(phone);
    return href ? "sms:" + href.slice(4) : "";
  }
  function mailtoHref(email) {
    var e = String(email || "").trim();
    if (/[\u0000-\u001F\u007F<>\"']/.test(e)) return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 120) return "";
    return "mailto:" + encodeURIComponent(e).replace(/%40/g, "@");
  }
  function clientKeyFrom(name, phone, leadId) {
    if (leadId) return "lead:" + leadId;
    return "name:" + String(name || "").toLowerCase().trim() + "|" + digits(phone);
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function lineTotal(line) {
    return (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
  }
  function docTotal(doc) {
    return (doc.items || []).reduce(function (sum, line) { return sum + lineTotal(line); }, 0);
  }
  function occursOnDate(booking, dateIso) {
    if (!booking || !booking.startDate) return false;
    if (dateIso < booking.startDate) return false;
    if (booking.endDate && dateIso > booking.endDate) return false;
    if (booking.recurrence === "weekly" || booking.recurrence === "biweekly") {
      var step = booking.recurrence === "weekly" ? 7 : 14;
      return daysBetweenIso(booking.startDate, dateIso) % step === 0;
    }
    if (booking.recurrence === "monthly") {
      var start = parseIso(booking.startDate);
      var d = parseIso(dateIso);
      var targetDay = Math.min(start.getUTCDate(), daysInMonthUTC(d.getUTCFullYear(), d.getUTCMonth()));
      return d.getUTCDate() === targetDay;
    }
    return dateIso === booking.startDate;
  }
  function isCompleted(booking, dateIso) {
    return booking && Array.isArray(booking.completedDates) && booking.completedDates.indexOf(dateIso) !== -1;
  }

  function getCustomers() {
    var byKey = {};
    var order = [];
    function upsert(fields) {
      if (!fields.name) return;
      var key = clientKeyFrom(fields.name, fields.phone, fields.leadId);
      if (!byKey[key]) {
        order.push(key);
        byKey[key] = {
          key: key,
          name: fields.name,
          phone: fields.phone || "",
          email: fields.email || "",
          town: fields.town || "",
          address: fields.address || "",
          leadId: fields.leadId || "",
          status: fields.status || "",
          category: fields.category || "",
          priority: fields.priority || "",
          propertyNotes: fields.propertyNotes || "",
          message: fields.message || "",
          activities: fields.activities || [],
          estimatedValue: fields.estimatedValue
        };
        return;
      }
      var c = byKey[key];
      c.phone = c.phone || fields.phone || "";
      c.email = c.email || fields.email || "";
      c.town = c.town || fields.town || "";
      c.address = c.address || fields.address || "";
      c.leadId = c.leadId || fields.leadId || "";
      c.status = c.status || fields.status || "";
      c.category = c.category || fields.category || "";
      c.priority = c.priority || fields.priority || "";
      c.propertyNotes = c.propertyNotes || fields.propertyNotes || "";
      c.message = c.message || fields.message || "";
      if (fields.activities && fields.activities.length) c.activities = fields.activities;
    }
    readArray(LEADS_KEY).forEach(function (l) {
      upsert({
        name: l.name, phone: l.phone, email: l.email, town: l.town, address: l.address,
        leadId: l.id, status: l.status, category: l.category, priority: l.priority,
        propertyNotes: l.propertyNotes, message: l.message, activities: l.activities,
        estimatedValue: l.estimatedValue
      });
    });
    readArray(BOOKINGS_KEY).forEach(function (b) {
      upsert({ name: b.clientName, phone: b.phone, town: b.town, leadId: b.leadId });
    });
    readArray(BILLS_KEY).forEach(function (b) {
      upsert({ name: b.clientName, phone: b.phone, town: b.town, leadId: b.leadId });
    });
    readArray(ESTIMATES_KEY).forEach(function (e) {
      upsert({ name: e.clientName, phone: e.phone, town: e.town, leadId: e.leadId });
    });
    return order.map(function (key) { return byKey[key]; }).sort(function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  function getPastClients() {
    return readArray(PAST_KEY);
  }
  function savePastClients(list) {
    writeArray(PAST_KEY, list);
  }
  function pastKeySet() {
    var set = {};
    getPastClients().forEach(function (p) {
      if (p && p.key) set[p.key] = true;
    });
    return set;
  }
  function isPastCustomer(c) {
    if (!c) return false;
    return !!pastKeySet()[c.key];
  }

  function setLeadArchived(leadId, archived) {
    if (!leadId) return;
    var leads = readArray(LEADS_KEY);
    var changed = false;
    leads.forEach(function (l) {
      if (l.id !== leadId) return;
      if (archived) {
        if (!l.archived) { l.archived = true; l.archivedAt = new Date().toISOString(); changed = true; }
      } else if (l.archived) {
        l.archived = false;
        l.archivedAt = "";
        changed = true;
      }
    });
    if (changed) writeArray(LEADS_KEY, leads);
  }

  function archiveCustomer(c) {
    if (!c) return;
    var past = getPastClients().filter(function (p) { return p.key !== c.key; });
    past.push({
      key: c.key,
      name: c.name,
      phone: c.phone || "",
      town: c.town || "",
      leadId: c.leadId || "",
      archivedAt: new Date().toISOString()
    });
    savePastClients(past);
    setLeadArchived(c.leadId, true);
  }

  function restoreCustomer(key) {
    var past = getPastClients();
    var match = null;
    past.forEach(function (p) { if (p.key === key) match = p; });
    savePastClients(past.filter(function (p) { return p.key !== key; }));
    if (match && match.leadId) setLeadArchived(match.leadId, false);
    var live = getCustomers().filter(function (c) { return c.key === key; })[0];
    if (live && live.leadId) setLeadArchived(live.leadId, false);
  }

  function canPurge() {
    return !!(window.GDAuth && window.GDAuth.canPurgePastClients && window.GDAuth.canPurgePastClients());
  }

  function purgeCustomer(c) {
    if (!c || !canPurge()) return;
    writeArray(LEADS_KEY, readArray(LEADS_KEY).filter(function (l) {
      if (c.leadId && l.id === c.leadId) return false;
      return true;
    }));
    writeArray(BOOKINGS_KEY, readArray(BOOKINGS_KEY).filter(function (b) { return !matchesCustomer(b, c); }));
    writeArray(BILLS_KEY, readArray(BILLS_KEY).filter(function (b) { return !matchesCustomer(b, c); }));
    writeArray(ESTIMATES_KEY, readArray(ESTIMATES_KEY).filter(function (e) { return !matchesCustomer(e, c); }));
    savePastClients(getPastClients().filter(function (p) { return p.key !== c.key; }));
    try {
      var raw = window.localStorage.getItem(RATES_KEY);
      var rates = raw ? JSON.parse(raw) : {};
      if (rates && typeof rates === "object") {
        delete rates[c.key];
        window.localStorage.setItem(RATES_KEY, JSON.stringify(rates));
      }
    } catch (err) {}
  }

  function matchesCustomer(record, customer) {
    if (customer.leadId && record.leadId === customer.leadId) return true;
    if (record.clientKey && record.clientKey === customer.key) return true;
    var n1 = String(record.clientName || "").toLowerCase().trim();
    var n2 = String(customer.name || "").toLowerCase().trim();
    var p1 = digits(record.phone);
    var p2 = digits(customer.phone);
    if (n1 && n1 === n2) return true;
    if (p1 && p2 && p1 === p2 && p1.length >= 10) return true;
    return false;
  }

  function jobsFor(customer) {
    return readArray(BOOKINGS_KEY).filter(function (b) { return matchesCustomer(b, customer); });
  }
  function billsFor(customer) {
    return readArray(BILLS_KEY).filter(function (b) { return matchesCustomer(b, customer); });
  }
  function estimatesFor(customer) {
    return readArray(ESTIMATES_KEY).filter(function (e) { return matchesCustomer(e, customer); });
  }
  function balanceFor(customer) {
    return billsFor(customer).reduce(function (sum, b) {
      return sum + (b.status === "paid" ? 0 : docTotal(b));
    }, 0);
  }
  function nextJob(customer) {
    var jobs = jobsFor(customer);
    var today = todayIso();
    var found = null;
    for (var i = 0; i <= 120; i++) {
      var iso = addDaysIso(today, i);
      for (var j = 0; j < jobs.length; j++) {
        if (!occursOnDate(jobs[j], iso) || isCompleted(jobs[j], iso)) continue;
        if (!found || iso < found.iso || (iso === found.iso && (jobs[j].time || "") < (found.booking.time || ""))) {
          found = { iso: iso, booking: jobs[j] };
        }
      }
      if (found && found.iso === iso) break;
    }
    return found;
  }

  function isCustomerRecord(c) {
    return c.status === "Won" || jobsFor(c).length > 0 || billsFor(c).length > 0;
  }
  function isOpenLead(c) {
    var s = c.status || "New";
    return s === "New" || s === "Contacted" || s === "Quoted";
  }

  function filteredList() {
    var q = searchQuery.toLowerCase();
    var past = pastKeySet();
    return getCustomers().filter(function (c) {
      var archived = !!past[c.key];
      if (viewingPast ? !archived : archived) return false;
      if (!viewingPast) {
        if (filter === "customers" && !isCustomerRecord(c)) return false;
        if (filter === "leads" && !isOpenLead(c)) return false;
        if (filter === "balance" && balanceFor(c) <= 0) return false;
      }
      if (!q) return true;
      var hay = [c.name, c.phone, c.email, c.town, c.address, c.category].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function emptyDetail(message) {
    els.detail.innerHTML =
      '<div class="cust-detail__empty"><p class="crm-empty">' + escapeHtml(message) + "</p></div>";
  }

  function renderList() {
    var list = filteredList();
    els.count.textContent = list.length + (list.length === 1 ? " person" : " people");
    if (!list.length) {
      els.list.innerHTML = viewingPast
        ? '<p class="crm-empty" style="padding:18px">No past clients yet. Deleted clients show up here.</p>'
        : '<p class="crm-empty" style="padding:18px">No matches. Add a lead or booking and they\'ll show up here.</p>';
      if (!selectedKey) emptyDetail(viewingPast ? "Past clients keep their jobs and invoices on file." : "Select someone from the list to open their record.");
      return;
    }
    if (!selectedKey || !list.filter(function (c) { return c.key === selectedKey; }).length) {
      selectedKey = list[0].key;
    }
    els.list.innerHTML = list.map(function (c) {
      var bal = balanceFor(c);
      var next = nextJob(c);
      var meta = c.town || c.address || c.status || "";
      if (next) meta = (meta ? meta + " · " : "") + "Next " + formatDate(next.iso);
      return (
        '<button type="button" class="cust-row' + (c.key === selectedKey ? " is-active" : "") + '" data-cust-key="' + escapeHtml(c.key) + '">' +
        '<span class="cust-row__avatar">' + escapeHtml(initials(c.name)) + "</span>" +
        '<span><span class="cust-row__name">' + escapeHtml(c.name) + '</span><span class="cust-row__meta">' + escapeHtml(meta) + "</span></span>" +
        '<span class="cust-row__bal' + (bal > 0 ? " is-due" : "") + '">' + (bal > 0 ? formatMoney(bal) : "") + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function findSelected() {
    var list = getCustomers();
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === selectedKey) return list[i];
    }
    return null;
  }

  function actionBtn(href, label, extraClass) {
    if (!href) return "";
    return '<a class="crm-action ' + (extraClass || "") + '" href="' + escapeHtml(href) + '">' + escapeHtml(label) + "</a>";
  }

  function contactMenu(c) {
    var call = telHref(c.phone);
    var text = smsHref(c.phone);
    if (!call && !text) return "";
    return (
      '<div class="cust-menu-wrap">' +
      '<button type="button" class="crm-action" data-contact-menu aria-expanded="false" aria-haspopup="true">Contact</button>' +
      '<div class="cust-menu" role="menu">' +
      (call ? '<a role="menuitem" href="' + escapeHtml(call) + '">Call</a>' : "") +
      (text ? '<a role="menuitem" href="' + escapeHtml(text) + '">Text</a>' : "") +
      "</div></div>"
    );
  }

  function closeContactMenus() {
    document.querySelectorAll(".cust-menu-wrap.is-open").forEach(function (wrap) {
      wrap.classList.remove("is-open");
      var toggle = wrap.querySelector("[data-contact-menu]");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  }

  function renderOverview(c) {
    var next = nextJob(c);
    var jobs = jobsFor(c);
    var bills = billsFor(c);
    var ests = estimatesFor(c);
    var bal = balanceFor(c);
    var paid = bills.filter(function (b) { return b.status === "paid"; }).length;
    return (
      '<div class="cust-kpis">' +
      '<div class="cust-kpi"><span class="cust-kpi__num">' + formatMoney(bal) + '</span><span class="cust-kpi__label">Balance due</span></div>' +
      '<div class="cust-kpi"><span class="cust-kpi__num">' + jobs.length + '</span><span class="cust-kpi__label">Jobs on books</span></div>' +
      '<div class="cust-kpi"><span class="cust-kpi__num">' + ests.length + '</span><span class="cust-kpi__label">Estimates</span></div>' +
      '<div class="cust-kpi"><span class="cust-kpi__num">' + paid + '</span><span class="cust-kpi__label">Paid invoices</span></div>' +
      "</div>" +
      '<div class="cust-grid">' +
      '<div class="cust-card"><h3>Contact</h3>' +
      (c.phone ? "<p><a href=\"" + escapeHtml(telHref(c.phone)) + "\">" + escapeHtml(c.phone) + "</a></p>" : "<p>—</p>") +
      (mailtoHref(c.email) ? "<p><a href=\"" + escapeHtml(mailtoHref(c.email)) + "\">" + escapeHtml(c.email) + "</a></p>" : "") +
      "</div>" +
      '<div class="cust-card"><h3>Property</h3>' +
      "<p>" + escapeHtml([c.address, c.town].filter(Boolean).join(", ") || "—") + "</p>" +
      "</div>" +
      '<div class="cust-card"><h3>Next job</h3>' +
      "<p>" + (next ? escapeHtml(formatDate(next.iso) + (next.booking.time ? " · " + formatTime(next.booking.time) : "") + " — " + (next.booking.service || "Job")) : "Nothing scheduled") + "</p>" +
      "</div>" +
      '<div class="cust-card"><h3>Property notes</h3>' +
      "<p>" + escapeHtml(c.propertyNotes || "No gate codes, dogs, or parking notes yet.") + "</p>" +
      "</div></div>" +
      '<div class="cust-card cust-card--map"><h3>Map</h3><div class="prop-map prop-map--detail" id="custPropertyMap"></div></div>' +
      (c.message ? '<div class="cust-card cust-card--request"><h3>Original request</h3><p>' + escapeHtml(c.message) + "</p></div>" : "")
    );
  }

  function renderTable(headers, rowsHtml, empty) {
    if (!rowsHtml) return '<p class="crm-empty">' + escapeHtml(empty) + "</p>";
    return "<table class=\"cust-table\"><thead><tr>" + headers.map(function (h) {
      return "<th>" + escapeHtml(h) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";
  }

  function renderJobs(c) {
    var jobs = jobsFor(c);
    var rows = jobs.map(function (b) {
      return "<tr><td>" + escapeHtml(formatDate(b.startDate)) + "</td><td>" + escapeHtml(b.service || "—") +
        "</td><td>" + escapeHtml(b.recurrence && b.recurrence !== "once" ? b.recurrence : "One-time") +
        "</td><td>" + escapeHtml(b.payment === "paid" ? "Paid" : "Unpaid") + "</td></tr>";
    }).join("");
    return renderTable(["Date", "Service", "Repeat", "Payment"], rows, "No jobs on the calendar yet.");
  }

  function renderInvoices(c) {
    var bills = billsFor(c).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var rows = bills.map(function (b) {
      return "<tr><td>#" + escapeHtml(b.number) + "</td><td>" + escapeHtml(formatDate(b.date)) +
        "</td><td>" + escapeHtml(formatMoney(docTotal(b))) +
        "</td><td>" + escapeHtml(b.status === "paid" ? "Paid" : "Unpaid") + "</td></tr>";
    }).join("");
    return renderTable(["Invoice", "Date", "Total", "Status"], rows, "No invoices yet.");
  }

  function renderEstimates(c) {
    var list = estimatesFor(c).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var rows = list.map(function (e) {
      return "<tr><td>#" + escapeHtml(e.number) + "</td><td>" + escapeHtml(formatDate(e.date)) +
        "</td><td>" + escapeHtml(formatMoney(docTotal(e))) +
        "</td><td>" + escapeHtml(e.status || "draft") + "</td></tr>";
    }).join("");
    return renderTable(["Estimate", "Date", "Total", "Status"], rows, "No estimates yet.");
  }

  function renderNotes(c) {
    var acts = (c.activities || []).slice().sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });
    var form = c.leadId
      ? '<form class="cust-note-form" id="custNoteForm"><textarea name="text" required maxlength="2000" placeholder="Add a note to this record…"></textarea><button type="submit" class="leads__add-btn">Save note</button></form>'
      : '<p class="crm-empty">Add this person as a lead to keep an activity log. <a href="leads.html">Open Leads</a></p>';
    var log = acts.length
      ? '<ul class="activity-log">' + acts.map(function (a) {
        return '<li class="activity-log__item"><span class="activity-log__when">' +
          escapeHtml(a.at ? new Date(a.at).toLocaleString() : "") + " · " +
          escapeHtml(ACTIVITY_LABELS[a.type] || a.type || "Note") +
          "</span>" + escapeHtml(a.text || "") + "</li>";
      }).join("") + "</ul>"
      : '<p class="crm-empty">No notes yet.</p>';
    return form + log;
  }

  function renderDetail() {
    var c = findSelected();
    if (!c) {
      emptyDetail("Select someone from the list to open their record.");
      return;
    }
    var tags = "";
    if (c.status === "Won") tags += '<span class="cust-tag cust-tag--won">Customer</span>';
    else if (isOpenLead(c)) tags += '<span class="cust-tag cust-tag--lead">' + escapeHtml(c.status || "Lead") + "</span>";
    if (viewingPast || isPastCustomer(c)) tags += '<span class="cust-tag">Past client</span>';
    if (c.priority === "hot") tags += '<span class="cust-tag cust-tag--hot">Hot</span>';
    if (c.category) tags += '<span class="cust-tag">' + escapeHtml(c.category) + "</span>";

    var scheduleHref = "calendar.html";
    var invoiceHref = "billing.html?client=" + encodeURIComponent(c.key) + "&new=1";
    var estimateHref = "estimates.html?client=" + encodeURIComponent(c.key) + "&new=1";
    var leadHref = c.leadId ? "leads.html" : "";

    var tabHtml = ["overview", "jobs", "invoices", "estimates", "notes"].map(function (tab) {
      var label = tab.charAt(0).toUpperCase() + tab.slice(1);
      return '<button type="button" class="cust-tab' + (detailTab === tab ? " is-active" : "") + '" data-cust-tab="' + tab + '">' + label + "</button>";
    }).join("");

    var body = "";
    if (detailTab === "jobs") body = renderJobs(c);
    else if (detailTab === "invoices") body = renderInvoices(c);
    else if (detailTab === "estimates") body = renderEstimates(c);
    else if (detailTab === "notes") body = renderNotes(c);
    else body = renderOverview(c);

    els.detail.innerHTML =
      '<div class="cust-detail__head"><div><h2 class="cust-detail__name">' + escapeHtml(c.name) +
      '</h2><div class="cust-detail__tags">' + tags + "</div></div>" +
      '<div class="cust-detail__actions">' +
      '<div class="cust-action-group">' +
      '<p class="cust-action-group__label">Job</p>' +
      '<div class="cust-action-group__btns">' +
      contactMenu(c) +
      '<button type="button" class="crm-action crm-action--solid" data-schedule="' + escapeHtml(c.leadId || "") + '">Schedule</button>' +
      "</div></div>" +
      '<div class="cust-action-group">' +
      '<p class="cust-action-group__label">Billing</p>' +
      '<div class="cust-action-group__btns">' +
      actionBtn(estimateHref, "Estimate") +
      actionBtn(invoiceHref, "Invoice", "crm-action--solid") +
      "</div></div>" +
      '<div class="cust-action-group">' +
      '<p class="cust-action-group__label">Record</p>' +
      '<div class="cust-action-group__btns">' +
      (leadHref && !viewingPast ? actionBtn(leadHref, "Open in Leads") : "") +
      (viewingPast
        ? '<button type="button" class="crm-action crm-action--solid" data-restore-client="' + escapeHtml(c.key) + '">Restore client</button>' +
          (canPurge() ? '<button type="button" class="crm-action crm-action--danger" data-purge-client="' + escapeHtml(c.key) + '">Delete forever</button>' : "")
        : '<button type="button" class="crm-action crm-action--danger" data-delete-client="' + escapeHtml(c.key) + '">Delete client</button>') +
      "</div></div></div></div>" +
      '<div class="cust-tabs">' + tabHtml + "</div>" +
      '<div class="cust-detail__body">' + body + "</div>";
    if (detailTab === "overview" && window.GDMaps) {
      window.GDMaps.renderFrame(
        document.getElementById("custPropertyMap"),
        c.address,
        c.town,
        { title: (c.name || "Property") + " map" }
      );
    }
  }

  function render() {
    renderList();
    renderDetail();
    if (els.pastBtn) {
      var n = getPastClients().length;
      els.pastBtn.textContent = n ? "Past clients (" + n + ")" : "Past clients";
      els.pastBtn.classList.toggle("is-active", viewingPast);
    }
  }

  function applyQuery() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (err) { return; }
    var q = params.get("q");
    var id = params.get("id");
    var key = params.get("key");
    if (q) {
      searchQuery = q;
      if (els.search) els.search.value = q;
    }
    if (key) selectedKey = key;
    else if (id) selectedKey = "lead:" + id;
  }

  document.querySelector(".cust-list__filters").addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-filter]") : null;
    if (!btn) return;
    viewingPast = false;
    filter = btn.getAttribute("data-filter");
    document.querySelectorAll(".cust-list__filter").forEach(function (el) {
      el.classList.toggle("is-active", el === btn);
    });
    render();
  });

  if (els.search) {
    els.search.addEventListener("input", function () {
      searchQuery = els.search.value || "";
      render();
    });
  }

  els.list.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-cust-key]") : null;
    if (!btn) return;
    selectedKey = btn.getAttribute("data-cust-key");
    detailTab = "overview";
    render();
  });

  els.detail.addEventListener("click", function (e) {
    var contactToggle = e.target.closest ? e.target.closest("[data-contact-menu]") : null;
    if (contactToggle) {
      e.stopPropagation();
      var wrap = contactToggle.closest(".cust-menu-wrap");
      var open = wrap && wrap.classList.contains("is-open");
      closeContactMenus();
      if (!open && wrap) {
        wrap.classList.add("is-open");
        contactToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }
    var tab = e.target.closest ? e.target.closest("[data-cust-tab]") : null;
    if (tab) {
      detailTab = tab.getAttribute("data-cust-tab");
      renderDetail();
      return;
    }
    var sched = e.target.closest ? e.target.closest("[data-schedule]") : null;
    if (sched) {
      var leadId = sched.getAttribute("data-schedule");
      if (leadId) {
        try { window.localStorage.setItem("gdScheduleLeadId", leadId); } catch (err) {}
      }
      window.location.href = "calendar.html";
      return;
    }
    var del = e.target.closest ? e.target.closest("[data-delete-client]") : null;
    if (del) {
      openDeleteModal(del.getAttribute("data-delete-client"));
      return;
    }
    var restore = e.target.closest ? e.target.closest("[data-restore-client]") : null;
    if (restore) {
      restoreCustomer(restore.getAttribute("data-restore-client"));
      viewingPast = getPastClients().length > 0;
      if (!viewingPast) {
        document.querySelectorAll(".cust-list__filter").forEach(function (el) {
          el.classList.toggle("is-active", el.getAttribute("data-filter") === filter);
        });
      }
      selectedKey = "";
      render();
      return;
    }
    var purge = e.target.closest ? e.target.closest("[data-purge-client]") : null;
    if (purge) {
      openPurgeModal(purge.getAttribute("data-purge-client"));
    }
  });

  els.detail.addEventListener("submit", function (e) {
    if (!e.target || e.target.id !== "custNoteForm") return;
    e.preventDefault();
    var c = findSelected();
    if (!c || !c.leadId) return;
    var text = (e.target.querySelector("[name=text]").value || "").trim();
    if (!text) return;
    var leads = readArray(LEADS_KEY);
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id !== c.leadId) continue;
      var acts = Array.isArray(leads[i].activities) ? leads[i].activities.slice() : [];
      acts.push({
        id: "act-" + Date.now().toString(36),
        at: new Date().toISOString(),
        type: "note",
        text: text
      });
      leads[i].activities = acts;
      writeArray(LEADS_KEY, leads);
      break;
    }
    render();
  });

  function openDeleteModal(key) {
    var c = getCustomers().filter(function (item) { return item.key === key; })[0];
    pendingDeleteKey = key || "";
    if (els.deleteMsg) {
      els.deleteMsg.textContent = c
        ? "Remove " + c.name + " from Customers? They'll move to Past clients. Jobs and invoices stay on file."
        : "They'll move to Past clients. Jobs and invoices stay on file.";
    }
    if (!els.deleteModal) return;
    els.deleteModal.classList.add("is-open");
    els.deleteModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.deleteModal);
  }

  function closeDeleteModal() {
    pendingDeleteKey = "";
    if (!els.deleteModal) return;
    els.deleteModal.classList.remove("is-open");
    els.deleteModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function openPurgeModal(key) {
    if (!canPurge()) return;
    var c = getCustomers().filter(function (item) { return item.key === key; })[0];
    pendingPurgeKey = key || "";
    if (els.purgeMsg) {
      els.purgeMsg.textContent = c
        ? "Permanently delete " + c.name + "? This wipes their record, jobs, invoices, and estimates. This cannot be undone."
        : "This permanently deletes the client and all related work. This cannot be undone.";
    }
    if (!els.purgeModal) return;
    els.purgeModal.classList.add("is-open");
    els.purgeModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.purgeModal);
  }

  function closePurgeModal() {
    pendingPurgeKey = "";
    if (!els.purgeModal) return;
    els.purgeModal.classList.remove("is-open");
    els.purgeModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  if (els.pastBtn) {
    els.pastBtn.addEventListener("click", function () {
      viewingPast = !viewingPast;
      if (viewingPast) {
        document.querySelectorAll(".cust-list__filter").forEach(function (el) {
          el.classList.remove("is-active");
        });
      } else {
        document.querySelectorAll(".cust-list__filter").forEach(function (el) {
          el.classList.toggle("is-active", el.getAttribute("data-filter") === filter);
        });
      }
      selectedKey = "";
      render();
    });
  }

  if (els.deleteConfirm) {
    els.deleteConfirm.addEventListener("click", function () {
      var key = pendingDeleteKey;
      var c = getCustomers().filter(function (item) { return item.key === key; })[0];
      closeDeleteModal();
      if (c) archiveCustomer(c);
      selectedKey = "";
      render();
    });
  }
  if (els.deleteModal) {
    els.deleteModal.querySelectorAll("[data-delete-client-close]").forEach(function (el) {
      el.addEventListener("click", closeDeleteModal);
    });
  }
  if (els.purgeConfirm) {
    els.purgeConfirm.addEventListener("click", function () {
      if (!canPurge()) { closePurgeModal(); return; }
      var key = pendingPurgeKey;
      var c = getCustomers().filter(function (item) { return item.key === key; })[0];
      closePurgeModal();
      if (c) purgeCustomer(c);
      selectedKey = "";
      viewingPast = getPastClients().length > 0;
      if (!viewingPast) {
        document.querySelectorAll(".cust-list__filter").forEach(function (el) {
          el.classList.toggle("is-active", el.getAttribute("data-filter") === filter);
        });
      }
      render();
    });
  }
  if (els.purgeModal) {
    els.purgeModal.querySelectorAll("[data-purge-client-close]").forEach(function (el) {
      el.addEventListener("click", closePurgeModal);
    });
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".cust-menu-wrap")) return;
    closeContactMenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (document.querySelector(".cust-menu-wrap.is-open")) {
      closeContactMenus();
      return;
    }
    if (els.purgeModal && els.purgeModal.classList.contains("is-open")) closePurgeModal();
    else if (els.deleteModal && els.deleteModal.classList.contains("is-open")) closeDeleteModal();
  });

  applyQuery();
  render();
})();
