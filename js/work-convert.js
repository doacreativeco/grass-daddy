(function (window) {
  "use strict";

  var LEADS_KEY = "grassDaddyLeads";
  var BOOKINGS_KEY = "grassDaddyBookings";

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
  function digits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function bookingMatchesLead(booking, lead) {
    if (!booking || !lead) return false;
    if (booking.leadId && booking.leadId === lead.id) return true;
    var bName = String(booking.clientName || "").toLowerCase().trim();
    var lName = String(lead.name || "").toLowerCase().trim();
    if (!bName || bName !== lName) return false;
    var bPhone = digits(booking.phone);
    var lPhone = digits(lead.phone);
    if (bPhone && lPhone) return bPhone === lPhone;
    return true;
  }

  function leadsForBooking(booking, leads) {
    if (!booking) return [];
    if (booking.leadId) {
      return leads.filter(function (l) { return l.id === booking.leadId; });
    }
    var bName = String(booking.clientName || "").toLowerCase().trim();
    if (!bName) return [];
    var named = leads.filter(function (l) {
      return String(l.name || "").toLowerCase().trim() === bName;
    });
    var bPhone = digits(booking.phone);
    if (bPhone) {
      var phoned = named.filter(function (l) {
        var p = digits(l.phone);
        return !p || p === bPhone;
      });
      if (phoned.length) return phoned;
    }
    return named.length === 1 ? named : [];
  }

  function markWon(lead) {
    if (!lead || lead.status === "Won") return false;
    lead.status = "Won";
    lead.followUpDate = "";
    lead.convertedAt = lead.convertedAt || new Date().toISOString();
    var acts = Array.isArray(lead.activities) ? lead.activities.slice() : [];
    acts.push({
      id: "act-" + Date.now().toString(36),
      at: new Date().toISOString(),
      type: "note",
      text: "Job booked — moved off Leads and onto Customers."
    });
    lead.activities = acts;
    return true;
  }

  function convertLeadForBooking(booking) {
    if (!booking) return false;
    var leads = readArray(LEADS_KEY);
    var matches = leadsForBooking(booking, leads);
    var changed = false;
    matches.forEach(function (lead) {
      if (markWon(lead)) changed = true;
    });
    if (changed) writeArray(LEADS_KEY, leads);
    return changed;
  }

  function syncLeadsWithBookings() {
    var bookings = readArray(BOOKINGS_KEY);
    if (!bookings.length) return false;
    var leads = readArray(LEADS_KEY);
    var changed = false;
    leads.forEach(function (lead) {
      var hasWork = bookings.some(function (b) { return bookingMatchesLead(b, lead); });
      if (hasWork && markWon(lead)) changed = true;
    });
    if (changed) writeArray(LEADS_KEY, leads);
    return changed;
  }

  function isPipelineLead(lead) {
    if (!lead || lead.archived) return false;
    return (lead.status || "New") !== "Won";
  }

  window.GDWork = {
    convertLeadForBooking: convertLeadForBooking,
    syncLeadsWithBookings: syncLeadsWithBookings,
    isPipelineLead: isPipelineLead,
    bookingMatchesLead: bookingMatchesLead
  };
})(window);
