(function () {
  "use strict";

  if (!window.GDAuth || !window.GDAuth.requireAuth()) return;

  var STORAGE_KEY = "grassDaddyBookings";
  var LEADS_STORAGE_KEY = "grassDaddyLeads";
  var SCHEDULE_HANDOFF_KEY = "gdScheduleLeadId";

  var CATEGORIES = [
    "Lawn Maintenance",
    "Landscape Design & Install",
    "Hardscaping & Stonework",
    "Spring / Fall Cleanup",
    "Irrigation & Drainage",
    "Free Consultation",
    "Something else"
  ];

  var CATEGORY_COLORS = {
    "Lawn Maintenance": "#5FAF3C",
    "Landscape Design & Install": "#2F8FA6",
    "Hardscaping & Stonework": "#B4772E",
    "Spring / Fall Cleanup": "#C9A227",
    "Irrigation & Drainage": "#3B6FB6",
    "Free Consultation": "#7A5FB6",
    "Something else": "#6B6B63"
  };

  var RECURRENCE_LABELS = {
    once: "One-time",
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    monthly: "Monthly"
  };

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var today = new Date();
  var todayIso = toIso(today);
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var editingId = null;
  var pendingDayIso = null;

  var els = {
    calGrid: document.getElementById("calGrid"),
    calMonthLabel: document.getElementById("calMonthLabel"),
    calPrevBtn: document.getElementById("calPrevBtn"),
    calNextBtn: document.getElementById("calNextBtn"),
    calTodayBtn: document.getElementById("calTodayBtn"),
    calStats: document.getElementById("calStats"),
    agendaList: document.getElementById("agendaList"),
    addBookingBtn: document.getElementById("addBookingBtn"),
    bookingModal: document.getElementById("bookingModal"),
    bookingModalTitle: document.getElementById("bookingModalTitle"),
    bookingForm: document.getElementById("bookingForm"),
    bookingServiceSelect: document.getElementById("bookingServiceSelect"),
    bookingRecurrenceSelect: document.getElementById("bookingRecurrenceSelect"),
    bookingPaymentSelect: document.getElementById("bookingPaymentSelect"),
    bookingFromLead: document.getElementById("bookingFromLead"),
    bookingClientName: document.getElementById("bookingClientName"),
    clientSuggestions: document.getElementById("clientSuggestions"),
    deleteBookingBtn: document.getElementById("deleteBookingBtn"),
    dayModal: document.getElementById("dayModal"),
    dayModalTitle: document.getElementById("dayModalTitle"),
    dayModalList: document.getElementById("dayModalList"),
    dayModalAddBtn: document.getElementById("dayModalAddBtn")
  };

  /* ---------- date helpers (UTC-based to dodge DST/timezone drift) ---------- */
  function toIso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseIso(iso) {
    var parts = iso.split("-").map(Number);
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
  function formatMonthDay(iso) {
    var d = parseIso(iso);
    return (MONTH_NAMES[d.getUTCMonth()].slice(0, 3)) + " " + d.getUTCDate();
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

  /* ---------- storage ---------- */
  function getBookings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  function saveBookings(bookings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    } catch (err) {
      // localStorage unavailable
    }
  }
  function getLeads() {
    try {
      var raw = window.localStorage.getItem(LEADS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  function makeId() {
    return "booking-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Chip/dot colors are applied via a data attribute (not an inline "style"
  // attribute) so they work under a strict Content-Security-Policy with no
  // style-src 'unsafe-inline'. Call this after any innerHTML write that
  // includes elements with [data-chip-color].
  function applyChipColors(container) {
    container.querySelectorAll("[data-chip-color]").forEach(function (el) {
      el.style.setProperty("--chip-color", el.getAttribute("data-chip-color"));
    });
  }

  /* ---------- recurrence: does this booking occur on this exact date? ---------- */
  function occursOnDate(booking, dateIso) {
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
    // "once"
    return dateIso === booking.startDate;
  }

  function bookingsOnDate(bookings, dateIso) {
    return bookings.filter(function (b) { return occursOnDate(b, dateIso); }).sort(function (a, b) {
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }

  function isCompletedOn(booking, dateIso) {
    return booking && Array.isArray(booking.completedDates) && booking.completedDates.indexOf(dateIso) !== -1;
  }

  function toggleCompletedOn(bookingId, dateIso) {
    var bookings = getBookings();
    for (var i = 0; i < bookings.length; i++) {
      if (bookings[i].id !== bookingId) continue;
      var list = Array.isArray(bookings[i].completedDates) ? bookings[i].completedDates.slice() : [];
      var idx = list.indexOf(dateIso);
      if (idx === -1) list.push(dateIso);
      else list.splice(idx, 1);
      bookings[i].completedDates = list;
      saveBookings(bookings);
      renderAll();
      return;
    }
  }

  /* ---------- month grid rendering ---------- */
  function renderCalendar() {
    var bookings = getBookings();
    els.calMonthLabel.textContent = MONTH_NAMES[viewMonth] + " " + viewYear;

    var firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
    var startWeekday = firstOfMonth.getUTCDay();
    var totalDaysInMonth = daysInMonthUTC(viewYear, viewMonth);
    var gridStart = new Date(Date.UTC(viewYear, viewMonth, 1 - startWeekday));

    var totalCells = Math.ceil((startWeekday + totalDaysInMonth) / 7) * 7;

    var html = "";
    for (var i = 0; i < totalCells; i++) {
      var cellDate = new Date(gridStart.getTime() + i * 86400000);
      var cellIso = cellDate.getUTCFullYear() + "-" + String(cellDate.getUTCMonth() + 1).padStart(2, "0") + "-" + String(cellDate.getUTCDate()).padStart(2, "0");
      var isOtherMonth = cellDate.getUTCMonth() !== viewMonth;
      var isToday = cellIso === todayIso;
      var dayBookings = bookingsOnDate(bookings, cellIso);

      var chips = dayBookings.slice(0, 3).map(function (b) {
        var color = CATEGORY_COLORS[b.service] || CATEGORY_COLORS["Something else"];
        var done = isCompletedOn(b, cellIso);
        return (
          '<button type="button" class="cal__chip' + (done ? " is-done" : "") + '" data-booking-id="' + escapeHtml(b.id) + '" data-chip-color="' + escapeHtml(color) + '">' +
          (b.time ? '<span class="cal__chip-time">' + escapeHtml(formatTime(b.time)) + '</span>' : "") +
          '<span class="cal__chip-name">' + escapeHtml(b.clientName) + "</span>" +
          "</button>"
        );
      }).join("");
      var overflow = dayBookings.length > 3 ? '<span class="cal__chip-more">+' + (dayBookings.length - 3) + " more</span>" : "";

      html +=
        '<div class="cal__cell' + (isOtherMonth ? " is-outside" : "") + (isToday ? " is-today" : "") + '" data-day-iso="' + cellIso + '">' +
        '<span class="cal__cell-num">' + cellDate.getUTCDate() + "</span>" +
        '<div class="cal__cell-chips">' + chips + overflow + "</div>" +
        "</div>";
    }
    els.calGrid.innerHTML = html;
    applyChipColors(els.calGrid);
  }

  /* ---------- agenda (next 14 days) ---------- */
  function renderAgenda() {
    var bookings = getBookings();
    var days = [];
    for (var i = 0; i < 14; i++) {
      var iso = addDaysIso(todayIso, i);
      var dayBookings = bookingsOnDate(bookings, iso);
      if (dayBookings.length) days.push({ iso: iso, items: dayBookings });
    }

    if (!days.length) {
      els.agendaList.innerHTML = '<p class="cal__agenda-empty">Nothing booked in the next two weeks.</p>';
      return;
    }

    els.agendaList.innerHTML = days.map(function (day) {
      var label = day.iso === todayIso ? "Today · " + formatMonthDay(day.iso) : formatWeekdayMonthDay(day.iso);
      var items = day.items.map(function (b) {
        var color = CATEGORY_COLORS[b.service] || CATEGORY_COLORS["Something else"];
        var done = isCompletedOn(b, day.iso);
        return (
          '<button type="button" class="cal__agenda-item' + (done ? " is-done" : "") + '" data-booking-id="' + escapeHtml(b.id) + '">' +
          '<span class="cal__agenda-time">' + (b.time ? escapeHtml(formatTime(b.time)) : "No time") + "</span>" +
          '<span class="cal__agenda-dot" data-chip-color="' + escapeHtml(color) + '"></span>' +
          '<span class="cal__agenda-info">' +
          '<span class="cal__agenda-name">' + escapeHtml(b.clientName) + "</span>" +
          '<span class="cal__agenda-meta">' + escapeHtml(b.service) + (b.payment === "paid" ? " · Paid" : "") + "</span>" +
          "</span>" +
          '<span class="cal__agenda-freq">' + escapeHtml(RECURRENCE_LABELS[b.recurrence] || "") + "</span>" +
          "</button>"
        );
      }).join("");
      return '<div class="cal__agenda-day"><h4>' + escapeHtml(label) + "</h4>" + items + "</div>";
    }).join("");
    applyChipColors(els.agendaList);
  }

  /* ---------- stats ---------- */
  function renderStats() {
    var bookings = getBookings();
    var weekEnd = addDaysIso(todayIso, 6);
    var jobsThisWeek = 0;
    for (var i = 0; i <= 6; i++) {
      var iso = addDaysIso(todayIso, i);
      jobsThisWeek += bookingsOnDate(bookings, iso).length;
    }

    var recurringClients = {};
    var oneTimeCount = 0;
    bookings.forEach(function (b) {
      if (b.recurrence === "once") oneTimeCount++;
      else recurringClients[b.clientName.toLowerCase().trim()] = true;
    });
    var recurringCount = Object.keys(recurringClients).length;

    var stats = [
      { label: "Jobs this week", num: jobsThisWeek },
      { label: "Recurring clients", num: recurringCount },
      { label: "One-time visits booked", num: oneTimeCount },
      { label: "Total on the books", num: bookings.length }
    ];

    els.calStats.innerHTML = stats.map(function (s) {
      return (
        '<div class="leads__stat"><span class="leads__stat-num">' + escapeHtml(s.num) +
        '</span><span class="leads__stat-label">' + escapeHtml(s.label) + "</span></div>"
      );
    }).join("");
  }

  function renderAll() {
    renderCalendar();
    renderAgenda();
    renderStats();
  }

  /* ---------- lead import dropdown ---------- */
  function populateLeadDropdown(keepLeadId) {
    var leads = getLeads().filter(function (l) {
      if (keepLeadId && l.id === keepLeadId) return true;
      if (window.GDWork) return window.GDWork.isPipelineLead(l);
      return (l.status || "New") !== "Won";
    });
    var options = ['<option value="">— choose a lead to auto-fill —</option>'].concat(
      leads.map(function (l) {
        return '<option value="' + escapeHtml(l.id) + '">' + escapeHtml(l.name || "Unnamed") + (l.town ? " — " + escapeHtml(l.town) : "") + "</option>";
      })
    );
    els.bookingFromLead.innerHTML = options.join("");
  }

  function fillFormFromLead(leadId) {
    var lead = getLeads().filter(function (l) { return l.id === leadId; })[0];
    if (!lead) return;
    var form = els.bookingForm;
    form.querySelector('[name="clientName"]').value = lead.name || "";
    form.querySelector('[name="phone"]').value = lead.phone || "";
    form.querySelector('[name="town"]').value = lead.town || "";
    if (lead.category && CATEGORIES.indexOf(lead.category) !== -1) {
      form.querySelector('[name="service"]').value = lead.category;
    }
    if (lead.message) form.querySelector('[name="notes"]').value = lead.message;
  }

  /* ---------- client name autocomplete ---------- */
  var suggestionState = { items: [], activeIndex: -1 };

  function getClientDirectory() {
    var byKey = {};
    var order = [];

    getLeads().forEach(function (l) {
      if (!l.name) return;
      var key = l.name.toLowerCase().trim();
      if (!byKey[key]) order.push(key);
      byKey[key] = {
        name: l.name,
        phone: l.phone || (byKey[key] ? byKey[key].phone : ""),
        town: l.town || (byKey[key] ? byKey[key].town : ""),
        service: (l.category && CATEGORIES.indexOf(l.category) !== -1) ? l.category : (byKey[key] ? byKey[key].service : ""),
        leadId: l.id,
        tag: l.status === "Won" ? "Client" : "Lead"
      };
    });

    getBookings().forEach(function (b) {
      if (!b.clientName) return;
      var key = b.clientName.toLowerCase().trim();
      if (byKey[key]) {
        // fill in any gaps from the booking without overwriting lead data we already have
        byKey[key].phone = byKey[key].phone || b.phone || "";
        byKey[key].town = byKey[key].town || b.town || "";
        byKey[key].service = byKey[key].service || b.service || "";
        return;
      }
      order.push(key);
      byKey[key] = {
        name: b.clientName,
        phone: b.phone || "",
        town: b.town || "",
        service: b.service || "",
        leadId: b.leadId || null,
        tag: "Client"
      };
    });

    return order.map(function (key) { return byKey[key]; });
  }

  function renderSuggestions(query) {
    var trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      hideSuggestions();
      return;
    }
    var matches = getClientDirectory().filter(function (c) {
      return c.name.toLowerCase().indexOf(trimmed) !== -1;
    }).slice(0, 6);

    suggestionState.items = matches;
    suggestionState.activeIndex = -1;

    if (!matches.length) {
      hideSuggestions();
      return;
    }

    els.clientSuggestions.innerHTML = matches.map(function (c, i) {
      var metaParts = [c.service, c.town].filter(Boolean);
      return (
        '<li class="cal__suggestion" role="option" id="clientSuggestion-' + i + '" data-index="' + i + '">' +
        '<span class="cal__suggestion-name">' + escapeHtml(c.name) + "</span>" +
        (metaParts.length ? '<span class="cal__suggestion-meta">' + escapeHtml(metaParts.join(" · ")) + "</span>" : "") +
        '<span class="cal__suggestion-tag">' + escapeHtml(c.tag) + "</span>" +
        "</li>"
      );
    }).join("");
    els.clientSuggestions.hidden = false;
    els.bookingClientName.setAttribute("aria-expanded", "true");
  }

  function hideSuggestions() {
    els.clientSuggestions.hidden = true;
    els.clientSuggestions.innerHTML = "";
    els.bookingClientName.setAttribute("aria-expanded", "false");
    suggestionState.items = [];
    suggestionState.activeIndex = -1;
  }

  function highlightSuggestion(index) {
    var options = els.clientSuggestions.querySelectorAll(".cal__suggestion");
    options.forEach(function (opt, i) { opt.classList.toggle("is-active", i === index); });
    suggestionState.activeIndex = index;
  }

  function applySuggestion(client) {
    var form = els.bookingForm;
    form.querySelector('[name="clientName"]').value = client.name;
    if (client.phone) form.querySelector('[name="phone"]').value = client.phone;
    if (client.town) form.querySelector('[name="town"]').value = client.town;
    if (client.service) form.querySelector('[name="service"]').value = client.service;
    els.bookingFromLead.value = client.leadId || "";
    hideSuggestions();
  }

  /* ---------- booking modal ---------- */
  function toggleEndDateVisibility() {
    var recurrence = els.bookingRecurrenceSelect.value;
    document.getElementById("bookingEndDateField").style.display = recurrence === "once" ? "none" : "";
  }

  function openBookingModal(booking, defaultDateIso) {
    editingId = booking ? booking.id : null;
    els.bookingModalTitle.textContent = booking ? "Edit booking" : "New booking";
    els.deleteBookingBtn.hidden = !booking;

    els.bookingServiceSelect.innerHTML = CATEGORIES.map(function (c) {
      return '<option value="' + escapeHtml(c) + '"' + (booking && booking.service === c ? " selected" : "") + ">" + escapeHtml(c) + "</option>";
    }).join("");

    populateLeadDropdown(booking && booking.leadId);
    els.bookingForm.reset();
    hideSuggestions();

    if (booking) {
      ["clientName", "phone", "town", "startDate", "time", "endDate", "notes"].forEach(function (field) {
        var input = els.bookingForm.querySelector('[name="' + field + '"]');
        if (input && booking[field] != null) input.value = booking[field];
      });
      els.bookingForm.querySelector('[name="service"]').value = booking.service;
      els.bookingRecurrenceSelect.value = booking.recurrence;
      if (els.bookingPaymentSelect) els.bookingPaymentSelect.value = booking.payment === "paid" ? "paid" : "unpaid";
      // Restore the linked lead (if any) so saving the edit doesn't silently
      // wipe the lead association — the submit handler reads leadId straight
      // from this dropdown's current value, not from the original booking.
      els.bookingFromLead.value = booking.leadId || "";
    } else {
      els.bookingForm.querySelector('[name="startDate"]').value = defaultDateIso || todayIso;
      els.bookingRecurrenceSelect.value = "once";
      if (els.bookingPaymentSelect) els.bookingPaymentSelect.value = "unpaid";
    }
    toggleEndDateVisibility();

    var submitBtn = els.bookingForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = booking ? "Save changes" : "Save booking";

    els.bookingModal.classList.add("is-open");
    els.bookingModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var firstInput = els.bookingModal.querySelector('input[name="clientName"]');
    if (firstInput) firstInput.focus();
    if (window.GDModal) window.GDModal.trap(els.bookingModal);
  }

  function closeBookingModal() {
    editingId = null;
    hideSuggestions();
    if (window.GDModal) window.GDModal.release();
    els.bookingModal.classList.remove("is-open");
    els.bookingModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function deleteBooking(id) {
    var bookings = getBookings();
    var target = bookings.filter(function (b) { return b.id === id; })[0];
    var label = target ? target.clientName : "this booking";
    if (!window.confirm("Delete the booking for " + label + "? This can't be undone.")) return false;
    saveBookings(bookings.filter(function (b) { return b.id !== id; }));
    renderAll();
    return true;
  }

  /* ---------- day modal ---------- */
  function openDayModal(dateIso) {
    pendingDayIso = dateIso;
    var bookings = bookingsOnDate(getBookings(), dateIso);
    els.dayModalTitle.textContent = formatWeekdayMonthDay(dateIso);

    if (!bookings.length) {
      els.dayModalList.innerHTML = '<p class="cal__agenda-empty">Nothing booked this day.</p>';
    } else {
      els.dayModalList.innerHTML = bookings.map(function (b) {
        var color = CATEGORY_COLORS[b.service] || CATEGORY_COLORS["Something else"];
        var done = isCompletedOn(b, dateIso);
        return (
          '<div class="cal__day-item' + (done ? " is-done" : "") + '">' +
          '<span class="cal__agenda-time">' + (b.time ? escapeHtml(formatTime(b.time)) : "No time") + "</span>" +
          '<span class="cal__agenda-dot" data-chip-color="' + escapeHtml(color) + '"></span>' +
          '<span class="cal__agenda-info">' +
          '<span class="cal__agenda-name">' + escapeHtml(b.clientName) + "</span>" +
          '<span class="cal__agenda-meta">' + escapeHtml(b.service) + (b.notes ? " — " + escapeHtml(b.notes) : "") + (b.payment === "paid" ? " · Paid" : "") + "</span>" +
          "</span>" +
          '<button type="button" class="cal__day-done-btn' + (done ? " is-on" : "") + '" data-toggle-done="' + escapeHtml(b.id) + '">' + (done ? "Undo" : "Done") + "</button>" +
          '<button type="button" class="cal__day-edit-btn" data-booking-id="' + escapeHtml(b.id) + '">Edit</button>' +
          "</div>"
        );
      }).join("");
    }
    applyChipColors(els.dayModalList);

    els.dayModal.classList.add("is-open");
    els.dayModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(els.dayModal);
  }

  function closeDayModal() {
    els.dayModal.classList.remove("is-open");
    els.dayModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function findBooking(id) {
    return getBookings().filter(function (b) { return b.id === id; })[0] || null;
  }

  /* ---------- event wiring ---------- */
  els.calPrevBtn.addEventListener("click", function () {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  els.calNextBtn.addEventListener("click", function () {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  });
  els.calTodayBtn.addEventListener("click", function () {
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    renderCalendar();
  });

  els.calGrid.addEventListener("click", function (e) {
    var chip = e.target.closest(".cal__chip");
    if (chip) {
      e.stopPropagation();
      var booking = findBooking(chip.getAttribute("data-booking-id"));
      if (booking) openBookingModal(booking);
      return;
    }
    var cell = e.target.closest(".cal__cell");
    if (cell) openDayModal(cell.getAttribute("data-day-iso"));
  });

  els.agendaList.addEventListener("click", function (e) {
    var item = e.target.closest(".cal__agenda-item");
    if (!item) return;
    var booking = findBooking(item.getAttribute("data-booking-id"));
    if (booking) openBookingModal(booking);
  });

  els.addBookingBtn.addEventListener("click", function () { openBookingModal(null, todayIso); });

  els.bookingRecurrenceSelect.addEventListener("change", toggleEndDateVisibility);

  els.bookingFromLead.addEventListener("change", function () {
    if (els.bookingFromLead.value) fillFormFromLead(els.bookingFromLead.value);
  });

  els.bookingClientName.addEventListener("input", function () {
    renderSuggestions(els.bookingClientName.value);
  });

  els.bookingClientName.addEventListener("keydown", function (e) {
    if (els.clientSuggestions.hidden || !suggestionState.items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightSuggestion((suggestionState.activeIndex + 1) % suggestionState.items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      var count = suggestionState.items.length;
      highlightSuggestion((suggestionState.activeIndex - 1 + count) % count);
    } else if (e.key === "Enter") {
      if (suggestionState.activeIndex !== -1) {
        e.preventDefault();
        applySuggestion(suggestionState.items[suggestionState.activeIndex]);
      }
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  els.clientSuggestions.addEventListener("mousedown", function (e) {
    var item = e.target.closest(".cal__suggestion");
    if (!item) return;
    e.preventDefault();
    var index = Number(item.getAttribute("data-index"));
    applySuggestion(suggestionState.items[index]);
  });

  els.bookingClientName.addEventListener("blur", function () {
    window.setTimeout(hideSuggestions, 120);
  });

  els.bookingModal.querySelectorAll("[data-booking-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeBookingModal);
  });
  els.dayModal.querySelectorAll("[data-day-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeDayModal);
  });

  els.dayModalList.addEventListener("click", function (e) {
    var doneBtn = e.target.closest(".cal__day-done-btn");
    if (doneBtn) {
      toggleCompletedOn(doneBtn.getAttribute("data-toggle-done"), pendingDayIso);
      openDayModal(pendingDayIso);
      return;
    }
    var editBtn = e.target.closest(".cal__day-edit-btn");
    if (!editBtn) return;
    var booking = findBooking(editBtn.getAttribute("data-booking-id"));
    closeDayModal();
    if (booking) openBookingModal(booking);
  });

  els.dayModalAddBtn.addEventListener("click", function () {
    var dateIso = pendingDayIso;
    closeDayModal();
    openBookingModal(null, dateIso);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (els.bookingModal.classList.contains("is-open")) closeBookingModal();
    if (els.dayModal.classList.contains("is-open")) closeDayModal();
  });

  els.deleteBookingBtn.addEventListener("click", function () {
    if (editingId && deleteBooking(editingId)) closeBookingModal();
  });

  els.bookingForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!els.bookingForm.checkValidity()) {
      els.bookingForm.reportValidity();
      return;
    }

    var data = new FormData(els.bookingForm);
    var payload = {
      clientName: (data.get("clientName") || "").toString().trim(),
      phone: (data.get("phone") || "").toString().trim(),
      town: (data.get("town") || "").toString().trim(),
      service: (data.get("service") || CATEGORIES[0]).toString(),
      startDate: (data.get("startDate") || todayIso).toString(),
      time: (data.get("time") || "").toString(),
      recurrence: (data.get("recurrence") || "once").toString(),
      endDate: (data.get("endDate") || "").toString(),
      notes: (data.get("notes") || "").toString().trim(),
      leadId: els.bookingFromLead.value || null,
      payment: (data.get("payment") || "unpaid").toString()
    };
    if (payload.recurrence === "once") payload.endDate = "";

    var bookings = getBookings();
    if (editingId) {
      var idx = -1;
      for (var i = 0; i < bookings.length; i++) {
        if (bookings[i].id === editingId) { idx = i; break; }
      }
      if (idx !== -1) {
        for (var key in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, key)) bookings[idx][key] = payload[key];
        }
      }
    } else {
      payload.id = makeId();
      payload.createdAt = new Date().toISOString();
      payload.completedDates = [];
      bookings.push(payload);
    }

    saveBookings(bookings);
    if (window.GDWork) window.GDWork.convertLeadForBooking(payload);
    closeBookingModal();
    renderAll();
  });

  /* ---------- handoff from the leads dashboard "Schedule" action ---------- */
  function checkScheduleHandoff() {
    var leadId = null;
    try {
      leadId = window.localStorage.getItem(SCHEDULE_HANDOFF_KEY);
      window.localStorage.removeItem(SCHEDULE_HANDOFF_KEY);
    } catch (err) {
      leadId = null;
    }
    if (!leadId) return;
    openBookingModal(null, todayIso);
    els.bookingFromLead.value = leadId;
    fillFormFromLead(leadId);
  }

  if (window.GDWork) window.GDWork.syncLeadsWithBookings();
  renderAll();
  checkScheduleHandoff();
})();
