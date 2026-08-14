(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();

  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";
  var BILLS_KEY = "grassDaddyBills";
  var LOG_HANDOFF_KEY = "gdLogLeadId";

  var CATEGORY_COLORS = {
    "Lawn Maintenance": "#5FAF3C",
    "Landscape Design & Install": "#2F8FA6",
    "Hardscaping & Stonework": "#B4772E",
    "Spring / Fall Cleanup": "#C9A227",
    "Irrigation & Drainage": "#3B6FB6",
    "Free Consultation": "#7A5FB6",
    "Something else": "#6B6B63"
  };

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var today = new Date();
  var todayIso = toIso(today);

  var els = {
    title: document.getElementById("crmTitle"),
    subtitle: document.getElementById("crmSubtitle"),
    stats: document.getElementById("crmStats"),
    todayJobs: document.getElementById("todayJobs"),
    todayJobsCount: document.getElementById("todayJobsCount"),
    followUps: document.getElementById("followUps"),
    followUpsCount: document.getElementById("followUpsCount"),
    weekJobs: document.getElementById("weekJobs"),
    weekJobsCount: document.getElementById("weekJobsCount"),
    printBtn: document.getElementById("printTodayBtn")
  };

  function toIso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseIso(iso) {
    var parts = String(iso || "").split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }
  function daysInMonthUTC(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }
  function daysBetweenIso(aIso, bIso) {
    return Math.round((parseIso(bIso).getTime() - parseIso(aIso).getTime()) / 86400000);
  }
  function addDaysIso(iso, days) {
    var d = parseIso(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function formatWeekdayMonthDay(iso) {
    var d = parseIso(iso);
    return WEEKDAY_SHORT[d.getUTCDay()] + ", " + MONTH_NAMES[d.getUTCMonth()].slice(0, 3) + " " + d.getUTCDate();
  }
  function formatTime(hhmm) {
    if (!hhmm) return "";
    var parts = hhmm.split(":").map(Number);
    var h = parts[0], m = parts[1] || 0;
    var period = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + String(m).padStart(2, "0") + " " + period;
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function telHref(phone) {
    var digits = String(phone || "").replace(/[^\d+]/g, "");
    return digits ? "tel:" + digits : "";
  }
  function smsHref(phone) {
    var digits = String(phone || "").replace(/[^\d+]/g, "");
    return digits ? "sms:" + digits : "";
  }
  function formatMoney(value) {
    if (value === undefined || value === null || value === "") return "";
    var num = Number(value);
    if (isNaN(num)) return "";
    return "$" + Math.round(num).toLocaleString();
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
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
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

  function bookingsOnDate(bookings, dateIso) {
    return bookings.filter(function (b) { return occursOnDate(b, dateIso); }).sort(function (a, b) {
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }

  function isCompleted(booking, dateIso) {
    return booking && Array.isArray(booking.completedDates) && booking.completedDates.indexOf(dateIso) !== -1;
  }

  function toggleComplete(bookingId, dateIso) {
    var bookings = readArray(BOOKINGS_KEY);
    for (var i = 0; i < bookings.length; i++) {
      if (bookings[i].id !== bookingId) continue;
      var list = Array.isArray(bookings[i].completedDates) ? bookings[i].completedDates.slice() : [];
      var idx = list.indexOf(dateIso);
      if (idx === -1) list.push(dateIso);
      else list.splice(idx, 1);
      bookings[i].completedDates = list;
      writeArray(BOOKINGS_KEY, bookings);
      return;
    }
  }

  function isOpenStatus(status) {
    return status === "New" || status === "Contacted" || status === "Quoted";
  }

  function followUpState(lead) {
    if (lead.archived) return null;
    if (!lead.followUpDate || !isOpenStatus(lead.status || "New")) return null;
    if (lead.followUpDate < todayIso) return "overdue";
    if (lead.followUpDate === todayIso) return "today";
    return "upcoming";
  }

  function colorFor(service) {
    return CATEGORY_COLORS[service] || CATEGORY_COLORS["Something else"];
  }

  function applyChipColors(container) {
    if (!container) return;
    container.querySelectorAll("[data-chip-color]").forEach(function (el) {
      el.style.setProperty("--chip-color", el.getAttribute("data-chip-color"));
    });
  }

  function contactButtons(phone, extraClass) {
    var cls = extraClass || "";
    var bits = [];
    var tel = telHref(phone);
    var sms = smsHref(phone);
    if (tel) bits.push('<a class="crm-action ' + cls + '" href="' + tel + '">Call</a>');
    if (sms) bits.push('<a class="crm-action ' + cls + '" href="' + sms + '">Text</a>');
    return bits.join("");
  }

  function emptyHtml(message) {
    return '<p class="crm-empty">' + escapeHtml(message) + "</p>";
  }

  function billTotal(bill) {
    return (bill.items || []).reduce(function (sum, line) {
      return sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
    }, 0);
  }

  function renderStats(leads, bookings) {
    var todayList = bookingsOnDate(bookings, todayIso);
    var doneToday = todayList.filter(function (b) { return isCompleted(b, todayIso); }).length;
    var dueFollow = leads.filter(function (l) {
      var s = followUpState(l);
      return s === "overdue" || s === "today";
    }).length;
    var newCount = leads.filter(function (l) { return !l.archived && (l.status || "New") === "New"; }).length;
    var monthPrefix = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
    var yearPrefix = String(today.getFullYear());
    var completedMonth = 0;
    bookings.forEach(function (b) {
      (b.completedDates || []).forEach(function (iso) {
        if (String(iso).indexOf(monthPrefix) === 0) completedMonth++;
      });
    });
    var bills = readArray(BILLS_KEY);
    var revenue = 0;
    var outstanding = 0;
    bills.forEach(function (bill) {
      var total = billTotal(bill);
      if (bill.status === "paid" && String(bill.date || "").indexOf(yearPrefix) === 0) revenue += total;
      if (bill.status !== "paid") outstanding += total;
    });

    var stats = [
      { label: "Revenue (paid YTD)", num: formatMoney(revenue) || "$0" },
      { label: "Outstanding invoices", num: formatMoney(outstanding) || "$0", warn: outstanding > 0 },
      { label: "Jobs today", num: todayList.length ? doneToday + "/" + todayList.length : "0" },
      { label: "Jobs completed this month", num: completedMonth },
      { label: "Follow-ups due", num: dueFollow, warn: dueFollow > 0 },
      { label: "New leads", num: newCount, href: "leads.html#new-leads" }
    ];

    els.stats.innerHTML = stats.map(function (s) {
      var inner =
        '<span class="leads__stat-num">' + escapeHtml(s.num) + "</span>" +
        '<span class="leads__stat-label">' + escapeHtml(s.label) + "</span>";
      var cls = "leads__stat" + (s.warn ? " leads__stat--warn" : "");
      if (s.href) {
        return '<a class="' + cls + '" href="' + escapeHtml(s.href) + '">' + inner + "</a>";
      }
      return "<div class=\"" + cls + "\">" + inner + "</div>";
    }).join("");
  }

  function renderTodayJobs(bookings) {
    var list = bookingsOnDate(bookings, todayIso);
    els.todayJobsCount.textContent = String(list.length);
    if (!list.length) {
      els.todayJobs.innerHTML = emptyHtml("Nothing booked today. Add a booking from the calendar.");
      return;
    }
    els.todayJobs.innerHTML = list.map(function (b) {
      var done = isCompleted(b, todayIso);
      var color = colorFor(b.service);
      var paid = b.payment === "paid";
      return (
        '<article class="crm-job' + (done ? " is-done" : "") + '" data-booking-id="' + escapeHtml(b.id) + '">' +
        '<span class="crm-job__time">' + (b.time ? escapeHtml(formatTime(b.time)) : "—") + "</span>" +
        '<div class="crm-job__body">' +
        '<span class="crm-job__dot" data-chip-color="' + escapeHtml(color) + '"></span>' +
        '<div>' +
        '<p class="crm-job__name">' + escapeHtml(b.clientName || "Unnamed") + "</p>" +
        '<p class="crm-job__meta">' + escapeHtml(b.service || "") +
        (b.town ? " · " + escapeHtml(b.town) : "") +
        (b.notes ? " — " + escapeHtml(b.notes) : "") +
        (paid ? ' <span class="crm-pill crm-pill--paid">Paid</span>' : ' <span class="crm-pill">Unpaid</span>') +
        "</p></div></div>" +
        '<div class="crm-job__actions crm-print-hide">' +
        '<button type="button" class="crm-action crm-action--solid" data-toggle-done="' + escapeHtml(b.id) + '">' +
        (done ? "Undo" : "Done") + "</button>" +
        contactButtons(b.phone) +
        "</div></article>"
      );
    }).join("");
    applyChipColors(els.todayJobs);
  }

  function renderFollowUps(leads) {
    var list = leads.filter(function (l) {
      var s = followUpState(l);
      return s === "overdue" || s === "today";
    }).sort(function (a, b) {
      return String(a.followUpDate).localeCompare(String(b.followUpDate));
    });
    els.followUpsCount.textContent = String(list.length);
    if (!list.length) {
      els.followUps.innerHTML = emptyHtml("You're caught up — no follow-ups due.");
      return;
    }
    els.followUps.innerHTML = list.map(function (l) {
      var state = followUpState(l);
      var label = state === "overdue" ? "Overdue" : "Today";
      return (
        '<article class="crm-lead">' +
        '<div>' +
        '<p class="crm-job__name">' + escapeHtml(l.name || "Unnamed") +
        (l.priority === "hot" ? ' <span class="crm-pill crm-pill--hot">Hot</span>' : "") +
        "</p>" +
        '<p class="crm-job__meta"><span class="leads__followup leads__followup--' + state + '">' + label + "</span> " +
        escapeHtml(l.category || "") +
        (l.town ? " · " + escapeHtml(l.town) : "") +
        (formatMoney(l.estimatedValue) ? " · " + formatMoney(l.estimatedValue) : "") +
        "</p></div>" +
        '<div class="crm-job__actions crm-print-hide">' +
        contactButtons(l.phone) +
        '<button type="button" class="crm-action" data-log-lead="' + escapeHtml(l.id) + '">Log</button>' +
        '<a class="crm-action" href="leads.html">Open</a>' +
        "</div></article>"
      );
    }).join("");
  }

  function renderWeek(bookings) {
    var days = [];
    for (var i = 1; i <= 6; i++) {
      var iso = addDaysIso(todayIso, i);
      var items = bookingsOnDate(bookings, iso);
      if (items.length) days.push({ iso: iso, items: items });
    }
    var total = days.reduce(function (n, d) { return n + d.items.length; }, 0);
    els.weekJobsCount.textContent = String(total);
    if (!days.length) {
      els.weekJobs.innerHTML = emptyHtml("No more jobs booked through the rest of this week.");
      return;
    }
    els.weekJobs.innerHTML = days.map(function (day) {
      var rows = day.items.map(function (b) {
        var color = colorFor(b.service);
        return (
          '<div class="crm-week-row">' +
          '<span class="crm-job__time">' + (b.time ? escapeHtml(formatTime(b.time)) : "—") + "</span>" +
          '<span class="crm-job__dot" data-chip-color="' + escapeHtml(color) + '"></span>' +
          '<span class="crm-job__name">' + escapeHtml(b.clientName || "Unnamed") + "</span>" +
          '<span class="crm-job__meta">' + escapeHtml(b.service || "") + (b.town ? " · " + escapeHtml(b.town) : "") + "</span>" +
          "</div>"
        );
      }).join("");
      return '<div class="crm-week-day"><h3>' + escapeHtml(formatWeekdayMonthDay(day.iso)) + "</h3>" + rows + "</div>";
    }).join("");
    applyChipColors(els.weekJobs);
  }

  function render() {
    var leads = readArray(LEADS_KEY);
    var bookings = readArray(BOOKINGS_KEY);
    els.title.textContent = WEEKDAY_SHORT[today.getDay()] + " · " + MONTH_NAMES[today.getMonth()] + " " + today.getDate();
    els.subtitle.textContent = "Revenue, today's route, follow-ups, and new quote requests.";
    renderStats(leads, bookings);
    renderTodayJobs(bookings);
    renderFollowUps(leads);
    renderWeek(bookings);
  }

  if (els.todayJobs) {
    els.todayJobs.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-toggle-done]") : null;
      if (!btn) return;
      toggleComplete(btn.getAttribute("data-toggle-done"), todayIso);
      render();
    });
  }

  document.addEventListener("click", function (e) {
    var logBtn = e.target.closest ? e.target.closest("[data-log-lead]") : null;
    if (!logBtn) return;
    try { window.localStorage.setItem(LOG_HANDOFF_KEY, logBtn.getAttribute("data-log-lead")); } catch (err) {}
    window.location.href = "leads.html";
  });

  if (els.printBtn) {
    els.printBtn.addEventListener("click", function () { window.print(); });
  }

  render();
})();
