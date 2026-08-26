(function () {
  "use strict";

  // Bounce unauthenticated (or session-expired) visitors back to the login
  // screen before rendering any lead data. See js/auth-guard.js for details.
  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  var STORAGE_KEY = "grassDaddyLeads";

  var CATEGORIES = [
    "Lawn Maintenance",
    "Landscape Design & Install",
    "Hardscaping & Stonework",
    "Spring / Fall Cleanup",
    "Irrigation & Drainage",
    "Free Consultation",
    "Something else"
  ];

  var STATUSES = ["New", "Contacted", "Quoted", "Won", "Lost"];

  var MESSAGE_TRUNCATE_LENGTH = 220;

  var PIPELINE_TABS = ["All", "New", "Contacted", "Quoted", "Lost", "Follow-up", "Hot"];
  var ACTIVITY_LABELS = { call: "Called", text: "Texted", quote: "Quoted", visit: "Site visit", note: "Note" };

  var activeFilter = "All";
  var pipelineFilter = "All";
  var searchQuery = "";
  var sortKey = "createdAt";
  var sortDir = "desc";
  var editingId = null;
  var loggingId = null;
  var selectedNewLeadId = null;

  var els = {
    filterTabs: document.getElementById("categorySelect"),
    cardsWrap: document.getElementById("leadsCards"),
    cardsContainer: document.getElementById("leadsCards"),
    emptyState: document.getElementById("emptyState"),
    totalCount: document.getElementById("leadsTotalCount"),
    seedBtn: document.getElementById("seedBtn"),
    seedBtnEmpty: document.getElementById("seedBtnEmpty"),
    statsRow: document.getElementById("statsRow"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    exportBtn: document.getElementById("exportBtn"),
    addLeadBtn: document.getElementById("addLeadBtn"),
    leadModal: document.getElementById("leadModal"),
    leadModalTitle: document.getElementById("leadModalTitle"),
    leadForm: document.getElementById("leadForm"),
    leadFormCategory: document.getElementById("leadFormCategory"),
    leadFormStatus: document.getElementById("leadFormStatus"),
    pipelineTabs: document.getElementById("pipelineSelect"),
    activityModal: document.getElementById("activityModal"),
    activityForm: document.getElementById("activityForm"),
    activityModalTitle: document.getElementById("activityModalTitle"),
    activityModalHint: document.getElementById("activityModalHint"),
    newSection: document.getElementById("new-leads"),
    newLeadsList: document.getElementById("newLeadsList"),
    newLeadsCount: document.getElementById("newLeadsCount"),
    newLeadsMap: document.getElementById("newLeadsMap"),
    mapModal: document.getElementById("mapModal"),
    mapModalTitle: document.getElementById("mapModalTitle"),
    mapModalBody: document.getElementById("mapModalBody"),
    leadActivitySection: document.getElementById("leadActivitySection"),
    leadActivityList: document.getElementById("leadActivityList")
  };

  function getLeads() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveLeads(leads) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch (err) {
      // localStorage unavailable — nothing more we can do client-side.
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    var timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return datePart + " · " + timePart;
  }

  function formatShortDate(isoDate) {
    if (!isoDate) return "";
    var d = new Date(isoDate + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatMoney(value) {
    if (value === undefined || value === null || value === "") return "—";
    var num = Number(value);
    if (isNaN(num)) return "—";
    return "$" + Math.round(num).toLocaleString();
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

  function todayIso() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function isOpenStatus(status) {
    return status === "New" || status === "Contacted" || status === "Quoted";
  }

  function followUpState(lead) {
    if (!lead.followUpDate || !isOpenStatus(lead.status || "New")) return null;
    var today = todayIso();
    if (lead.followUpDate < today) return "overdue";
    if (lead.followUpDate === today) return "today";
    return "upcoming";
  }

  function optionsHtml(list, selected) {
    var opts = list.slice();
    if (selected && opts.indexOf(selected) === -1) opts.push(selected);
    return opts
      .map(function (opt) {
        var isSelected = opt === (selected || list[0]);
        return '<option value="' + escapeHtml(opt) + '"' + (isSelected ? " selected" : "") + ">" + escapeHtml(opt) + "</option>";
      })
      .join("");
  }

  function optionLabel(name, count) {
    return escapeHtml(name) + " (" + count + ")";
  }

  function buildFilterTabs(leads) {
    if (!els.filterTabs) return;
    var counts = { All: leads.length };
    var extras = [];

    leads.forEach(function (lead) {
      var cat = lead.category || "Uncategorized";
      if (!(cat in counts)) counts[cat] = 0;
      counts[cat]++;
      if (CATEGORIES.indexOf(cat) === -1 && extras.indexOf(cat) === -1) extras.push(cat);
    });

    var canonicalPresent = CATEGORIES.filter(function (c) {
      return counts[c] > 0;
    });
    var order = ["All"].concat(canonicalPresent, extras);

    if (order.indexOf(activeFilter) === -1) activeFilter = "All";

    els.filterTabs.innerHTML = order
      .map(function (cat) {
        var label = cat === "All" ? "All services" : cat;
        return (
          '<option value="' +
          escapeHtml(cat) +
          '"' +
          (cat === activeFilter ? " selected" : "") +
          ">" +
          optionLabel(label, counts[cat]) +
          "</option>"
        );
      })
      .join("");
  }

  function pipelineLeads(leads) {
    return leads.filter(function (l) {
      if (l.archived) return false;
      if (window.GDWork) return window.GDWork.isPipelineLead(l);
      return (l.status || "New") !== "Won";
    });
  }

  function pipelineCount(leads, tab) {
    if (tab === "All") return leads.length;
    if (tab === "Follow-up") {
      return leads.filter(function (l) {
        var s = followUpState(l);
        return s === "overdue" || s === "today";
      }).length;
    }
    if (tab === "Hot") {
      return leads.filter(function (l) { return l.priority === "hot"; }).length;
    }
    return leads.filter(function (l) { return (l.status || "New") === tab; }).length;
  }

  function matchesPipeline(lead, tab) {
    if (!tab || tab === "All") return true;
    if (tab === "Follow-up") {
      var s = followUpState(lead);
      return s === "overdue" || s === "today";
    }
    if (tab === "Hot") return lead.priority === "hot";
    return (lead.status || "New") === tab;
  }

  function buildPipelineTabs(leads) {
    if (!els.pipelineTabs) return;
    if (PIPELINE_TABS.indexOf(pipelineFilter) === -1) pipelineFilter = "All";
    var labels = {
      All: "All statuses",
      New: "New",
      Contacted: "Contacted",
      Quoted: "Quoted",
      Lost: "Lost",
      "Follow-up": "Follow-up due",
      Hot: "Hot"
    };
    els.pipelineTabs.innerHTML = PIPELINE_TABS.map(function (tab) {
      return (
        '<option value="' +
        escapeHtml(tab) +
        '"' +
        (tab === pipelineFilter ? " selected" : "") +
        ">" +
        optionLabel(labels[tab] || tab, pipelineCount(leads, tab)) +
        "</option>"
      );
    }).join("");
  }

  function matchesSearch(lead, query) {
    if (!query) return true;
    var haystack = [lead.name, lead.phone, lead.email, lead.town, lead.address, lead.category, lead.message, lead.propertyNotes]
      .map(function (v) { return (v || "").toString().toLowerCase(); })
      .join(" ");
    return haystack.indexOf(query) !== -1;
  }

  function sortLeads(leads) {
    var dir = sortDir === "asc" ? 1 : -1;
    return leads.slice().sort(function (a, b) {
      var av, bv;
      if (sortKey === "name") {
        av = (a.name || "").toLowerCase();
        bv = (b.name || "").toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      if (sortKey === "estimatedValue") {
        av = Number(a.estimatedValue) || 0;
        bv = Number(b.estimatedValue) || 0;
        return (av - bv) * dir;
      }
      if (sortKey === "status") {
        av = STATUSES.indexOf(a.status || "New");
        bv = STATUSES.indexOf(b.status || "New");
        return (av - bv) * dir;
      }
      if (sortKey === "followUpDate") {
        av = a.followUpDate || "9999-99-99";
        bv = b.followUpDate || "9999-99-99";
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      // default: createdAt
      av = new Date(a.createdAt).getTime() || 0;
      bv = new Date(b.createdAt).getTime() || 0;
      return (av - bv) * dir;
    });
  }

  function renderRows(leads) {
    var filtered = pipelineLeads(leads);
    filtered =
      activeFilter === "All"
        ? filtered
        : filtered.filter(function (l) {
            return (l.category || "Uncategorized") === activeFilter;
          });

    filtered = filtered.filter(function (l) { return matchesPipeline(l, pipelineFilter); });

    var query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(function (l) {
        return matchesSearch(l, query);
      });
    }

    filtered = sortLeads(filtered);

    els.cardsContainer.innerHTML = filtered
      .map(function (lead) {
        var message = lead.message || "";
        var isLong = message.length > MESSAGE_TRUNCATE_LENGTH;
        var shortMessage = isLong ? message.slice(0, MESSAGE_TRUNCATE_LENGTH).trim() + "…" : message;
        var displayMessage = message ? shortMessage : "";

        var fu = followUpState(lead);
        var fuBadge = "";
        if (fu) {
          var fuLabel = fu === "overdue" ? "Overdue" : fu === "today" ? "Today" : formatShortDate(lead.followUpDate);
          fuBadge = '<span class="leads__followup leads__followup--' + fu + '">\u23F0 Follow up ' + escapeHtml(fuLabel) + "</span>";
        }

        var contactBits = [];
        var tel = telHref(lead.phone);
        var sms = smsHref(lead.phone);
        var mail = mailtoHref(lead.email);
        if (tel) contactBits.push('<a href="' + escapeHtml(tel) + '">Call ' + escapeHtml(lead.phone) + "</a>");
        if (sms) contactBits.push('<a href="' + escapeHtml(sms) + '">Text</a>');
        if (mail) contactBits.push('<a href="' + escapeHtml(mail) + '">' + escapeHtml(lead.email) + "</a>");
        if (lead.town) contactBits.push("<span>" + escapeHtml(lead.town) + "</span>");
        if (lead.address) contactBits.push("<span>" + escapeHtml(lead.address) + "</span>");

        var flags = [];
        if (lead.priority === "hot") flags.push('<span class="crm-pill crm-pill--hot">Hot</span>');
        if ((lead.status || "New") === "Won") flags.push('<span class="crm-pill crm-pill--paid">Client</span>');
        if (lead.propertyNotes) flags.push('<span class="crm-pill">Property note</span>');
        var flagsHtml = flags.length ? '<div class="lead-card__flags">' + flags.join("") + "</div>" : "";
        if (fuBadge) flagsHtml += fuBadge;

        return (
          '<article class="lead-card' +
          (lead.priority === "hot" ? " is-hot" : "") +
          '" data-id="' +
          escapeHtml(lead.id) +
          '">' +
          '<div class="lead-card__top">' +
          '<h3 class="lead-card__name">' +
          escapeHtml(lead.name || "Unnamed lead") +
          "</h3>" +
          '<span class="lead-card__value">' +
          formatMoney(lead.estimatedValue) +
          "</span>" +
          "</div>" +
          (contactBits.length ? '<div class="lead-card__contact">' + contactBits.join("") + "</div>" : "") +
          flagsHtml +
          (lead.propertyNotes
            ? '<p class="lead-card__message"><span class="leads__message-text">' + escapeHtml(lead.propertyNotes) + "</span></p>"
            : "") +
          (message
            ? '<p class="lead-card__message">' +
              '<span class="leads__message-text">' +
              escapeHtml(displayMessage) +
              "</span>" +
              (isLong
                ? '<button type="button" class="leads__message-toggle" data-expanded="false" data-full="' +
                  escapeHtml(message) +
                  '" data-short="' +
                  escapeHtml(shortMessage) +
                  '">See more</button>'
                : "") +
              "</p>"
            : "") +
          '<div class="lead-card__footer">' +
          '<div class="lead-card__meta">' +
          '<select class="leads__select leads__select--category" data-field="category">' +
          optionsHtml(CATEGORIES, lead.category) +
          "</select>" +
          '<select class="leads__select leads__select--status" data-field="status">' +
          optionsHtml(STATUSES, lead.status || "New") +
          "</select>" +
          '<span class="lead-card__date">Submitted ' +
          formatDate(lead.createdAt) +
          "</span>" +
          "</div>" +
          '<div class="lead-card__actions">' +
          '<button type="button" class="leads__log-btn" aria-label="Log activity for ' +
          escapeHtml(lead.name || "this lead") +
          '">Log</button>' +
          '<button type="button" class="leads__map-btn" data-map-lead="' +
          escapeHtml(lead.id) +
          '" aria-label="Show map for ' +
          escapeHtml(lead.name || "this lead") +
          '">Map</button>' +
          '<button type="button" class="leads__schedule-btn" aria-label="Schedule ' +
          escapeHtml(lead.name || "this lead") +
          '">Schedule</button>' +
          '<button type="button" class="leads__edit-btn" aria-label="Edit lead for ' +
          escapeHtml(lead.name || "this lead") +
          '">Edit</button>' +
          '<button type="button" class="leads__delete-btn" aria-label="Delete lead for ' +
          escapeHtml(lead.name || "this lead") +
          '">Delete</button>' +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function newLeadsList(leads) {
    return leads.filter(function (l) { return !l.archived && (l.status || "New") === "New"; })
      .sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  }

  function showPropertyMap(container, lead, empty) {
    if (!window.GDMaps) {
      if (container) container.innerHTML = '<p class="crm-empty">Map helper did not load.</p>';
      return;
    }
    window.GDMaps.renderFrame(
      container,
      lead && lead.address,
      lead && lead.town,
      {
        title: lead && lead.name ? lead.name + " property" : "Property map",
        empty: empty || "Add a street address to pin this property on the map."
      }
    );
  }

  function openMapModal(lead) {
    if (!els.mapModal || !lead) return;
    if (els.mapModalTitle) els.mapModalTitle.textContent = (lead.name || "Property") + " — map";
    showPropertyMap(els.mapModalBody, lead);
    els.mapModal.classList.add("is-open");
    els.mapModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.mapModal);
  }

  function closeMapModal() {
    if (!els.mapModal) return;
    els.mapModal.classList.remove("is-open");
    els.mapModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function renderNewLeads(leads) {
    if (!els.newSection || !els.newLeadsList) return;
    var list = newLeadsList(leads);
    if (els.newLeadsCount) els.newLeadsCount.textContent = String(list.length);

    if (!list.length) {
      selectedNewLeadId = null;
      els.newLeadsList.innerHTML = '<p class="crm-empty">No uncontacted leads. New quote requests show up here first.</p>';
      showPropertyMap(els.newLeadsMap, null, "Select a new lead with an address to see the property.");
      return;
    }

    if (!selectedNewLeadId || !list.filter(function (l) { return l.id === selectedNewLeadId; }).length) {
      selectedNewLeadId = list[0].id;
    }

    els.newLeadsList.innerHTML = list.map(function (l) {
      var loc = [l.address, l.town].filter(Boolean).join(", ");
      var tel = telHref(l.phone);
      var sms = smsHref(l.phone);
      return (
        '<article class="leads-new__row' + (l.id === selectedNewLeadId ? " is-active" : "") + '" data-new-lead="' + escapeHtml(l.id) + '">' +
        "<div><p class=\"leads-new__name\">" + escapeHtml(l.name || "Unnamed") +
        (l.priority === "hot" ? ' <span class="crm-pill crm-pill--hot">Hot</span>' : "") +
        "</p><p class=\"leads-new__meta\">" + escapeHtml(l.category || "") +
        (loc ? " · " + escapeHtml(loc) : "") +
        (l.message ? " — " + escapeHtml(String(l.message).slice(0, 90)) : "") +
        "</p></div>" +
        '<div class="leads-new__actions">' +
        (tel ? '<a class="crm-action" href="' + escapeHtml(tel) + '">Call</a>' : "") +
        (sms ? '<a class="crm-action" href="' + escapeHtml(sms) + '">Text</a>' : "") +
        '<button type="button" class="crm-action" data-log-new="' + escapeHtml(l.id) + '">Log</button>' +
        "</div></article>"
      );
    }).join("");

    var selected = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === selectedNewLeadId) { selected = list[i]; break; }
    }
    showPropertyMap(els.newLeadsMap, selected);
  }

  function buildStats(leads) {
    if (!els.statsRow) return;

    var now = Date.now();
    var weekMs = 7 * 24 * 60 * 60 * 1000;
    var today = todayIso();
    var newThisWeek = 0;
    var open = 0;
    var won = 0;
    var pipelineValue = 0;
    var dueFollowUps = 0;

    leads.forEach(function (lead) {
      var status = lead.status || "New";
      var created = new Date(lead.createdAt).getTime();
      if (!isNaN(created) && now - created <= weekMs && status !== "Won") newThisWeek++;
      if (isOpenStatus(status)) {
        open++;
        pipelineValue += Number(lead.estimatedValue) || 0;
      }
      if (status === "Won") won++;

      if (lead.followUpDate && lead.followUpDate <= today && isOpenStatus(status)) dueFollowUps++;
    });

    var winRate = leads.length ? Math.round((won / leads.length) * 100) : 0;

    var stats = [
      { label: "New this week", num: newThisWeek },
      { label: "Open leads", num: open },
      { label: "Jobs won", num: won },
      { label: "Win rate", num: winRate + "%" },
      { label: "Pipeline value", num: formatMoney(pipelineValue) },
      { label: "Follow-ups due", num: dueFollowUps, warn: dueFollowUps > 0 }
    ];

    els.statsRow.innerHTML = stats
      .map(function (s) {
        return (
          '<div class="leads__stat' +
          (s.warn ? " leads__stat--warn" : "") +
          '"><span class="leads__stat-num">' +
          escapeHtml(s.num) +
          '</span><span class="leads__stat-label">' +
          escapeHtml(s.label) +
          "</span></div>"
        );
      })
      .join("");
  }

  function render() {
    if (window.GDWork) window.GDWork.syncLeadsWithBookings();
    var leads = getLeads();
    var visible = pipelineLeads(leads);
    var hasAny = leads.length > 0;
    var hasPipeline = visible.length > 0;

    if (els.totalCount) els.totalCount.textContent = String(visible.length);
    if (els.emptyState) els.emptyState.hidden = hasAny;
    if (els.cardsWrap) els.cardsWrap.hidden = !hasPipeline;
    if (els.statsRow) els.statsRow.hidden = !hasAny;
    if (els.newSection) els.newSection.hidden = !hasAny;

    buildStats(leads);
    buildPipelineTabs(visible);
    buildFilterTabs(visible);
    renderNewLeads(leads);
    renderRows(leads);

    if (hasAny && window.location.hash === "#new-leads" && els.newSection) {
      els.newSection.scrollIntoView({ block: "start" });
    }
  }

  function updateLeadField(id, field, value) {
    var leads = getLeads();
    var idx = -1;
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    leads[idx][field] = value;
    saveLeads(leads);
    render();
  }

  function deleteLead(id) {
    var leads = getLeads();
    var target = null;
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) {
        target = leads[i];
        break;
      }
    }
    var label = target && target.name ? target.name : "this lead";
    if (!window.confirm("Delete lead for " + label + "? This can't be undone.")) return;

    leads = leads.filter(function (l) {
      return l.id !== id;
    });
    saveLeads(leads);
    render();
  }

  function findLead(id) {
    var leads = getLeads();
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) return leads[i];
    }
    return null;
  }

  function makeLeadId() {
    return "lead-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function makeActivityId() {
    return "act-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function csvEscape(value) {
    var str = String(value == null ? "" : value);
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportLeadsAsCsv() {
    var leads = sortLeads(getLeads());

    var columns = ["name", "phone", "email", "town", "address", "category", "status", "priority", "estimatedValue", "followUpDate", "propertyNotes", "message", "createdAt", "source"];
    var header = ["Name", "Phone", "Email", "Town", "Address", "Category", "Status", "Priority", "Estimated Value", "Follow-up Date", "Property Notes", "Message", "Submitted", "Source"];

    var rows = [header.join(",")].concat(
      leads.map(function (lead) {
        return columns.map(function (col) { return csvEscape(lead[col]); }).join(",");
      })
    );

    var stamp = new Date().toISOString().slice(0, 10);
    downloadFile("grass-daddy-leads-" + stamp + ".csv", rows.join("\r\n"), "text/csv;charset=utf-8;");
  }

  function openLeadModal(lead) {
    if (!els.leadModal) return;
    editingId = lead ? lead.id : null;

    if (els.leadModalTitle) els.leadModalTitle.textContent = lead ? "Edit lead" : "Add a lead";
    if (els.leadFormCategory) els.leadFormCategory.innerHTML = optionsHtml(CATEGORIES, lead ? lead.category : CATEGORIES[0]);
    if (els.leadFormStatus) els.leadFormStatus.innerHTML = optionsHtml(STATUSES, lead ? lead.status : "New");

    if (els.leadForm) {
      els.leadForm.reset();
      if (lead) {
        ["name", "phone", "email", "town", "address", "message", "estimatedValue", "followUpDate", "propertyNotes", "priority"].forEach(function (field) {
          var input = els.leadForm.querySelector('[name="' + field + '"]');
          if (input && lead[field] != null) input.value = lead[field];
        });
      }
      var submitBtn = els.leadForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = lead ? "Save changes" : "Save lead";
    }

    renderActivityList(lead);
    if (els.leadActivitySection) els.leadActivitySection.hidden = !lead;

    els.leadModal.classList.add("is-open");
    els.leadModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var firstInput = els.leadModal.querySelector('input[name="name"]');
    if (firstInput) firstInput.focus();
    if (window.GDModal) window.GDModal.trap(els.leadModal);
  }

  function closeLeadModal() {
    if (!els.leadModal) return;
    editingId = null;
    els.leadModal.classList.remove("is-open");
    els.leadModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function formatActivityWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function renderActivityList(lead) {
    if (!els.leadActivityList) return;
    var items = (lead && Array.isArray(lead.activities) ? lead.activities.slice() : []).sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });
    if (!items.length) {
      els.leadActivityList.innerHTML = '<li class="activity-log__empty">No activity logged yet.</li>';
      return;
    }
    els.leadActivityList.innerHTML = items.map(function (item) {
      return (
        "<li class=\"activity-log__item\">" +
        '<span class="activity-log__when">' + escapeHtml(ACTIVITY_LABELS[item.type] || "Note") + " · " + escapeHtml(formatActivityWhen(item.at)) + "</span>" +
        escapeHtml(item.text || "") +
        "</li>"
      );
    }).join("");
  }

  function openActivityModal(lead) {
    if (!els.activityModal || !lead) return;
    loggingId = lead.id;
    if (els.activityModalTitle) els.activityModalTitle.textContent = "Log activity — " + (lead.name || "lead");
    if (els.activityForm) els.activityForm.reset();
    els.activityModal.classList.add("is-open");
    els.activityModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var first = els.activityModal.querySelector("textarea, select");
    if (first) first.focus();
    if (window.GDModal) window.GDModal.trap(els.activityModal);
  }

  function closeActivityModal() {
    loggingId = null;
    if (!els.activityModal) return;
    els.activityModal.classList.remove("is-open");
    els.activityModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function appendActivity(leadId, type, text) {
    var leads = getLeads();
    var idx = -1;
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === leadId) { idx = i; break; }
    }
    if (idx === -1) return;
    var lead = leads[idx];
    var activities = Array.isArray(lead.activities) ? lead.activities.slice() : [];
    activities.push({
      id: makeActivityId(),
      at: new Date().toISOString(),
      type: ACTIVITY_LABELS[type] ? type : "note",
      text: String(text || "").slice(0, 2000)
    });
    lead.activities = activities;
    var status = lead.status || "New";
    if ((type === "call" || type === "text" || type === "visit") && status === "New") lead.status = "Contacted";
    if (type === "quote" && (status === "New" || status === "Contacted")) lead.status = "Quoted";
    saveLeads(leads);
    render();
  }

  function seedSampleLeads() {
    if (window.GDPreviewLeads && window.GDPreviewLeads.reset) window.GDPreviewLeads.reset();
    render();
  }

  if (els.cardsContainer) {
    els.cardsContainer.addEventListener("change", function (e) {
      var select = e.target.closest ? e.target.closest("select[data-field]") : null;
      if (!select) return;
      var card = select.closest("[data-id]");
      if (!card) return;
      updateLeadField(card.getAttribute("data-id"), select.getAttribute("data-field"), select.value);
    });

    els.cardsContainer.addEventListener("click", function (e) {
      var deleteBtn = e.target.closest ? e.target.closest(".leads__delete-btn") : null;
      if (deleteBtn) {
        var card = deleteBtn.closest("[data-id]");
        if (card) deleteLead(card.getAttribute("data-id"));
        return;
      }

      var editBtn = e.target.closest ? e.target.closest(".leads__edit-btn") : null;
      if (editBtn) {
        var editCard = editBtn.closest("[data-id]");
        var lead = editCard ? findLead(editCard.getAttribute("data-id")) : null;
        if (lead) openLeadModal(lead);
        return;
      }

      var logBtn = e.target.closest ? e.target.closest(".leads__log-btn") : null;
      if (logBtn) {
        var logCard = logBtn.closest("[data-id]");
        var logLead = logCard ? findLead(logCard.getAttribute("data-id")) : null;
        if (logLead) openActivityModal(logLead);
        return;
      }

      var mapBtn = e.target.closest ? e.target.closest(".leads__map-btn") : null;
      if (mapBtn) {
        var mapCard = mapBtn.closest("[data-id]");
        var mapLead = mapCard ? findLead(mapCard.getAttribute("data-id")) : null;
        if (mapLead) openMapModal(mapLead);
        return;
      }

      var scheduleBtn = e.target.closest ? e.target.closest(".leads__schedule-btn") : null;
      if (scheduleBtn) {
        var scheduleCard = scheduleBtn.closest("[data-id]");
        var leadId = scheduleCard ? scheduleCard.getAttribute("data-id") : null;
        if (leadId) {
          try { window.localStorage.setItem("gdScheduleLeadId", leadId); } catch (err) {}
          window.location.href = "calendar.html";
        }
        return;
      }

      var toggleBtn = e.target.closest ? e.target.closest(".leads__message-toggle") : null;
      if (toggleBtn) {
        var textEl = toggleBtn.previousElementSibling;
        if (!textEl) return;
        var expanded = toggleBtn.getAttribute("data-expanded") === "true";
        if (expanded) {
          textEl.textContent = toggleBtn.getAttribute("data-short");
          toggleBtn.textContent = "See more";
          toggleBtn.setAttribute("data-expanded", "false");
        } else {
          textEl.textContent = toggleBtn.getAttribute("data-full");
          toggleBtn.textContent = "See less";
          toggleBtn.setAttribute("data-expanded", "true");
        }
      }
    });
  }

  if (els.newLeadsList) {
    els.newLeadsList.addEventListener("click", function (e) {
      var logBtn = e.target.closest ? e.target.closest("[data-log-new]") : null;
      if (logBtn) {
        var logLead = findLead(logBtn.getAttribute("data-log-new"));
        if (logLead) openActivityModal(logLead);
        return;
      }
      var row = e.target.closest ? e.target.closest("[data-new-lead]") : null;
      if (!row) return;
      selectedNewLeadId = row.getAttribute("data-new-lead");
      renderNewLeads(getLeads());
    });
  }

  if (els.mapModal) {
    els.mapModal.querySelectorAll("[data-map-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeMapModal);
    });
  }

  if (els.sortSelect) {
    els.sortSelect.addEventListener("change", function () {
      var parts = els.sortSelect.value.split("-");
      sortKey = parts[0];
      sortDir = parts[1] || "desc";
      renderRows(getLeads());
    });
  }

  if (els.filterTabs) {
    els.filterTabs.addEventListener("change", function () {
      activeFilter = els.filterTabs.value || "All";
      renderRows(getLeads());
    });
  }

  if (els.pipelineTabs) {
    els.pipelineTabs.addEventListener("change", function () {
      pipelineFilter = els.pipelineTabs.value || "All";
      renderRows(getLeads());
    });
  }

  [els.seedBtn, els.seedBtnEmpty].forEach(function (btn) {
    if (btn) btn.addEventListener("click", seedSampleLeads);
  });

  if (els.searchInput) {
    els.searchInput.addEventListener("input", function () {
      searchQuery = els.searchInput.value || "";
      renderRows(getLeads());
    });
  }

  if (els.exportBtn) els.exportBtn.addEventListener("click", exportLeadsAsCsv);
  window.addEventListener("gd-leads-changed", function () { render(); });

  if (els.addLeadBtn) els.addLeadBtn.addEventListener("click", function () { openLeadModal(null); });

  if (els.leadModal) {
    els.leadModal.querySelectorAll("[data-lead-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeLeadModal);
    });
  }

  if (els.activityModal) {
    els.activityModal.querySelectorAll("[data-activity-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeActivityModal);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (els.activityModal && els.activityModal.classList.contains("is-open")) {
      closeActivityModal();
      return;
    }
    if (els.mapModal && els.mapModal.classList.contains("is-open")) {
      closeMapModal();
      return;
    }
    if (els.leadModal && els.leadModal.classList.contains("is-open")) closeLeadModal();
  });

  if (els.leadForm) {
    els.leadForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!els.leadForm.checkValidity()) {
        els.leadForm.reportValidity();
        return;
      }

      var data = new FormData(els.leadForm);
      var leads = getLeads();

      var payload = {
        name: (data.get("name") || "").toString().trim(),
        phone: (data.get("phone") || "").toString().trim(),
        email: (data.get("email") || "").toString().trim(),
        town: (data.get("town") || "").toString().trim(),
        category: (data.get("category") || "Something else").toString(),
        message: (data.get("message") || "").toString().trim(),
        status: (data.get("status") || "New").toString(),
        estimatedValue: (data.get("estimatedValue") || "").toString().trim(),
        followUpDate: (data.get("followUpDate") || "").toString().trim(),
        address: (data.get("address") || "").toString().trim(),
        propertyNotes: (data.get("propertyNotes") || "").toString().trim(),
        priority: (data.get("priority") || "").toString().trim()
      };

      if (editingId) {
        var idx = -1;
        for (var i = 0; i < leads.length; i++) {
          if (leads[i].id === editingId) { idx = i; break; }
        }
        if (idx !== -1) {
          for (var key in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) leads[idx][key] = payload[key];
          }
        }
      } else {
        payload.id = makeLeadId();
        payload.createdAt = new Date().toISOString();
        payload.source = "Manual entry";
        payload.activities = [];
        leads.push(payload);
      }

      saveLeads(leads);
      closeLeadModal();
      render();
    });
  }

  if (els.activityForm) {
    els.activityForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!els.activityForm.checkValidity()) {
        els.activityForm.reportValidity();
        return;
      }
      if (!loggingId) return;
      var data = new FormData(els.activityForm);
      appendActivity(
        loggingId,
        (data.get("type") || "note").toString(),
        (data.get("text") || "").toString().trim()
      );
      closeActivityModal();
    });
  }

  function checkLogHandoff() {
    var leadId = null;
    try {
      leadId = window.localStorage.getItem("gdLogLeadId");
      window.localStorage.removeItem("gdLogLeadId");
    } catch (err) {
      leadId = null;
    }
    if (!leadId) return;
    var lead = findLead(leadId);
    if (lead) openActivityModal(lead);
  }

  render();
  checkLogHandoff();
})();
