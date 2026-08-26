(function () {
  "use strict";

  var PREVIEW_FLAG = "gdPreviewLeadsV1";
  var LEADS_KEY = "grassDaddyLeads";

  function addDaysIso(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function previewTemplates() {
    return [
      {
        name: "Karen Whitfield",
        phone: "(860) 555-0148",
        email: "karen.whitfield@gmail.com",
        town: "Glastonbury, CT",
        address: "42 Fernwood Dr",
        category: "Lawn Maintenance",
        message: "Looking for weekly mowing starting in April — half-acre lot with a slope out back.",
        status: "New",
        estimatedValue: 2400,
        followUpDate: addDaysIso(1),
        propertyNotes: "Side gate latch sticks. Park on the street."
      }
    ];
  }

  function buildPreviewLeads() {
    var now = Date.now();
    return previewTemplates().map(function (sample, i) {
      var lead = {
        id: "preview-" + (i + 1),
        createdAt: new Date(now - (i + 1) * 3 * 60 * 60 * 1000).toISOString()
      };
      Object.keys(sample).forEach(function (key) {
        lead[key] = sample[key];
      });
      if (Array.isArray(lead.activities)) {
        lead.activities = lead.activities.map(function (item, a) {
          return {
            id: "preview-act-" + (i + 1) + "-" + (a + 1),
            type: item.type || "note",
            text: item.text || "",
            at: item.at || new Date().toISOString()
          };
        });
      }
      return lead;
    });
  }

  function writePreviewLeads() {
    try {
      window.localStorage.setItem(LEADS_KEY, JSON.stringify(buildPreviewLeads()));
      window.localStorage.setItem(PREVIEW_FLAG, "1");
    } catch (err) {}
  }

  function ensurePreviewLeads() {
    try {
      if (window.localStorage.getItem(PREVIEW_FLAG) === "1") return;
      var existing = window.localStorage.getItem(LEADS_KEY);
      if (existing) {
        window.localStorage.setItem(PREVIEW_FLAG, "1");
        return;
      }
      var host = window.location.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") {
        window.localStorage.setItem(PREVIEW_FLAG, "1");
        return;
      }
      writePreviewLeads();
    } catch (err) {}
  }

  window.GDPreviewLeads = {
    reset: writePreviewLeads,
    ensure: ensurePreviewLeads
  };
  ensurePreviewLeads();

  var menuBtn = document.getElementById("gdMenuBtn");
  var backdrop = document.getElementById("gdSidebarBackdrop");
  var searchForm = document.getElementById("gdSearchForm");
  var searchInput = document.getElementById("gdSearch");

  function setNavOpen(open) {
    document.body.classList.toggle("is-nav-open", open);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (backdrop) {
      if (open) backdrop.removeAttribute("hidden");
      else backdrop.setAttribute("hidden", "");
    }
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      setNavOpen(!document.body.classList.contains("is-nav-open"));
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", function () { setNavOpen(false); });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("is-nav-open")) setNavOpen(false);
  });
  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 901px)").matches) setNavOpen(false);
  });

  function isCustomersPage() {
    return /customers\.html/i.test(window.location.href);
  }

  var foot = document.querySelector(".gd-sidebar__foot");
  var user = window.GDAuth && window.GDAuth.currentUser ? window.GDAuth.currentUser() : null;
  if (foot && user && !document.getElementById("gdSignedIn")) {
    var who = document.createElement("p");
    who.id = "gdSignedIn";
    who.className = "gd-sidebar__user";
    who.textContent = user.name + (user.role === "admin" ? " · Admin" : " · Owner");
    foot.insertBefore(who, foot.firstChild);
  }

  if (searchForm && searchInput) {
    if (isCustomersPage()) {
      try {
        var params = new URLSearchParams(window.location.search);
        var q = params.get("q");
        if (q) searchInput.value = q;
      } catch (err) {}
    }
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (searchInput.value || "").trim();
      if (isCustomersPage()) {
        var local = document.getElementById("custSearch");
        if (local) {
          local.value = q;
          local.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      window.location.href = "customers.html" + (q ? "?q=" + encodeURIComponent(q) : "");
    });
  }
})();
