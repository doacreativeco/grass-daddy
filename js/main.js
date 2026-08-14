(function () {
  "use strict";

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- nav scroll state ---------- */
  var nav = document.querySelector(".nav");
  var progress = document.querySelector(".mow-progress");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle("is-scrolled", y > 40);

    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? (y / max) * 100 : 0;
    if (progress) progress.style.width = pct + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- back to top ---------- */
  var backToTop = document.getElementById("backToTop");
  if (backToTop) {
    var toggleBackToTop = function () {
      var y = window.scrollY || window.pageYOffset;
      backToTop.classList.toggle("is-visible", y > 600);
    };
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- service detail modal ---------- */
  var serviceInfo = {
    "lawn-maintenance": {
      detail: "Weekly or bi-weekly visits, mowed and edged the same way every time by the same crew. We adjust cutting height by season and always blow off clippings — no shortcuts, no half-finished edges.",
      bullets: [
        "Weekly or bi-weekly mowing schedules",
        "Edging and string trimming every visit",
        "Full clean blow-off — no clippings left behind",
        "Same crew, same day, every time",
        "Custom striping patterns on request"
      ]
    },
    "landscape-design": {
      detail: "From a single overgrown bed to a full front-yard redesign, we plan it around plants that actually make it through a Connecticut winter — then install it right the first time.",
      bullets: [
        "Free on-site design consultation",
        "Native and cold-hardy plant selections",
        "Bed shaping, mulch, and sod installation",
        "Tree and shrub planting",
        "Seasonal color rotations available"
      ]
    },
    "hardscaping": {
      detail: "Patios, walkways, and walls built with proper base prep and drainage, so freeze-thaw cycles don't heave or crack them a few winters in.",
      bullets: [
        "Paver and natural stone patios",
        "Walkways and stone steps",
        "Retaining walls engineered for CT frost lines",
        "Fire pits and seating walls",
        "Drainage built into every install"
      ]
    },
    "seasonal-cleanup": {
      detail: "The reset your property needs twice a year — every leaf, every bed, every downed branch, handled before it becomes next season's problem.",
      bullets: [
        "Full leaf removal and hauling",
        "Bed cleanup and de-thatching",
        "Gutter clean-out add-on available",
        "Early spring pre-emergent treatment option",
        "One call books both spring and fall"
      ]
    },
    "mulch-bed-care": {
      detail: "Fresh mulch and sharp edges make a property look cared for at a glance — and consistent weed control keeps it that way between visits.",
      bullets: [
        "Fresh mulch install — dyed or natural",
        "Sharp, hand-cut bed edges",
        "Ongoing weed control",
        "Pruning and shaping of shrubs",
        "Seasonal touch-up visits"
      ]
    },
    "irrigation-drainage": {
      detail: "We install and service sprinkler systems and fix the grading and drainage issues that send water where it shouldn't go — including toward your foundation.",
      bullets: [
        "Sprinkler system install and repair",
        "Spring start-up and fall winterization",
        "French drains and regrading fixes",
        "Downspout and runoff solutions",
        "Smart controller upgrades"
      ]
    }
  };

  /* ---------- blocky green click burst ---------- */
  function spawnClickBurst(x, y) {
    var palette = ["var(--green)", "var(--green-mid)", "var(--accent)", "var(--accent-2)"];
    var container = document.createElement("div");
    container.className = "click-burst";
    container.style.left = x + "px";
    container.style.top = y + "px";

    var count = 10;
    for (var i = 0; i < count; i++) {
      var block = document.createElement("span");
      block.className = "click-burst__block";
      var angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      var dist = 34 + Math.random() * 46;
      var tx = Math.cos(angle) * dist;
      var ty = Math.sin(angle) * dist;
      var size = 5 + Math.random() * 9;
      var rot = Math.round(Math.random() * 180 - 90);

      block.style.setProperty("--tx", tx.toFixed(1) + "px");
      block.style.setProperty("--ty", ty.toFixed(1) + "px");
      block.style.setProperty("--rot", rot + "deg");
      block.style.setProperty("--size", size.toFixed(1) + "px");
      block.style.setProperty("--delay", (Math.random() * 0.05).toFixed(2) + "s");
      block.style.setProperty("--block-color", palette[i % palette.length]);
      container.appendChild(block);
    }

    document.body.appendChild(container);
    setTimeout(function () {
      container.remove();
    }, 700);
  }

  var serviceModal = document.getElementById("serviceModal");
  if (serviceModal) {
    var modalIcon = document.getElementById("serviceModalIcon");
    var modalTitle = document.getElementById("serviceModalTitle");
    var modalDesc = document.getElementById("serviceModalDesc");
    var modalList = document.getElementById("serviceModalList");
    var lastFocused = null;

    function openServiceModal(card) {
      var id = card.getAttribute("data-service");
      var info = serviceInfo[id];
      if (!info) return;

      var icon = card.querySelector(".service__icon");
      var title = card.querySelector("h3");
      modalIcon.innerHTML = icon ? icon.innerHTML : "";
      modalTitle.textContent = title ? title.textContent : "";
      modalDesc.textContent = info.detail;
      modalList.innerHTML = "";
      info.bullets.forEach(function (b) {
        var li = document.createElement("li");
        var span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.textContent = "\u2713";
        li.appendChild(span);
        li.appendChild(document.createTextNode(b));
        modalList.appendChild(li);
      });

      lastFocused = document.activeElement;
      serviceModal.classList.add("is-open");
      serviceModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      var closeBtn = serviceModal.querySelector(".service-modal__close");
      if (closeBtn) closeBtn.focus();
      if (window.GDModal) window.GDModal.trap(serviceModal);
    }

    function closeServiceModal() {
      serviceModal.classList.remove("is-open");
      serviceModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (window.GDModal) window.GDModal.release();
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    }

    document.querySelectorAll(".service[data-service]").forEach(function (card) {
      card.addEventListener("click", function (e) {
        spawnClickBurst(e.clientX, e.clientY);
        card.classList.remove("is-punched");
        void card.offsetWidth;
        card.classList.add("is-punched");
        setTimeout(function () {
          openServiceModal(card);
        }, 140);
      });
    });

    serviceModal.querySelectorAll("[data-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeServiceModal);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && serviceModal.classList.contains("is-open")) closeServiceModal();
    });
  }

  /* ---------- nav "Info" dropdown ---------- */
  var navDropdownBtn = document.getElementById("navInfoBtn");
  var navDropdownMenu = document.getElementById("navInfoMenu");
  if (navDropdownBtn && navDropdownMenu) {
    function closeNavDropdown() {
      navDropdownMenu.classList.remove("is-open");
      navDropdownBtn.setAttribute("aria-expanded", "false");
    }
    function openNavDropdown() {
      navDropdownMenu.classList.add("is-open");
      navDropdownBtn.setAttribute("aria-expanded", "true");
    }

    navDropdownBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (navDropdownMenu.classList.contains("is-open")) closeNavDropdown();
      else openNavDropdown();
    });

    navDropdownMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNavDropdown);
    });

    document.addEventListener("click", function (e) {
      if (!navDropdownBtn.contains(e.target) && !navDropdownMenu.contains(e.target)) closeNavDropdown();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNavDropdown();
    });
  }

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById("burgerBtn");
  var mobileMenu = document.getElementById("mobileMenu");

  if (burger && mobileMenu) {
    burger.addEventListener("click", function () {
      var open = mobileMenu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileMenu.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 5) * 60 + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- stat count-up ---------- */
  var statEls = document.querySelectorAll(".stat__num");
  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var duration = 1400;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (statEls.length && "IntersectionObserver" in window) {
    var statIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            statIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    statEls.forEach(function (el) { statIo.observe(el); });
  }

  /* ---------- quote form ---------- */
  // NOTE: there's still no server backend here. Submissions are (a) saved into
  // this browser's localStorage under the key the leads dashboard reads from,
  // which only helps if the owner opens the dashboard in this same browser,
  // and (b) handed to the visitor's own email client via a "mailto:" link so
  // the request actually reaches Grass_Daddy@yahoo.com from any device. For
  // silent, guaranteed delivery without relying on the visitor's mail client,
  // swap this for a real POST to Formspree/Netlify Forms/your own API — see
  // README.md for exact steps.
  var LEADS_STORAGE_KEY = "grassDaddyLeads";
  var OWNER_EMAIL = "Grass_Daddy@yahoo.com";
  var MAX_FIELD_LENGTH = 1000;

  function saveLeadToStorage(lead) {
    try {
      var raw = window.localStorage.getItem(LEADS_STORAGE_KEY);
      var leads = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(leads)) leads = [];
      leads.push(lead);
      window.localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
      return true;
    } catch (err) {
      return false;
    }
  }

  function makeLeadId() {
    return "lead-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function clampText(value) {
    return (value || "").toString().trim().slice(0, MAX_FIELD_LENGTH);
  }

  function emailLeadToOwner(lead) {
    var subject = "New quote request — " + (lead.name || "Website visitor");
    var bodyLines = [
      "New free-quote request from the Grass Daddy website:",
      "",
      "Name: " + lead.name,
      "Phone: " + lead.phone,
      "Email: " + lead.email,
      "Town: " + lead.town,
      "Service: " + lead.category,
      "",
      "Message:",
      lead.message || "(none)"
    ];
    var mailto =
      "mailto:" + encodeURIComponent(OWNER_EMAIL) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(bodyLines.join("\n"));

    var fallbackLink = document.getElementById("formMailtoFallback");
    if (fallbackLink) fallbackLink.href = mailto;

    try {
      window.location.href = mailto;
    } catch (err) {
      // Ignored — the visible fallback link in the success message still works.
    }
  }

  var form = document.getElementById("quoteForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var data = new FormData(form);

      // Honeypot: invisible to real visitors, but simple bots tend to fill in
      // every field they find. If it has a value, quietly no-op the "success"
      // state without saving/emailing anything.
      var honeypot = (data.get("company") || "").toString().trim();
      if (honeypot) {
        form.classList.add("is-sent");
        return;
      }

      var lead = {
        id: makeLeadId(),
        createdAt: new Date().toISOString(),
        name: clampText(data.get("name")),
        phone: clampText(data.get("phone")),
        email: clampText(data.get("email")),
        town: clampText(data.get("town")),
        category: clampText(data.get("service")) || "Something else",
        message: clampText(data.get("message")),
        status: "New",
        source: "Website — Free Quote form"
      };

      saveLeadToStorage(lead);
      emailLeadToOwner(lead);

      form.classList.add("is-sent");
      var success = form.querySelector(".form__success");
      if (success && success.focus) success.focus();
    });
  }
})();
