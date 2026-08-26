// Shared CRM settings modal: email, password, and leads backup.
// Opens in place on every CRM page so Settings never dumps you onto Leads.
(function (window) {
  "use strict";

  var LEADS_KEY = "grassDaddyLeads";
  var STATUSES = ["New", "Contacted", "Quoted", "Won", "Lost"];
  var CATEGORIES = [
    "Lawn Maintenance",
    "Landscape Design & Install",
    "Hardscaping & Stonework",
    "Spring / Fall Cleanup",
    "Irrigation & Drainage",
    "Free Consultation",
    "Something else"
  ];
  var ACTIVITY_TYPES = { call: true, text: true, quote: true, visit: true, note: true };
  var IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
  var IMPORT_MAX_LEADS_TOTAL = 5000;
  var IMPORT_STRING_MAX = 2000;

  function ensureButton() {
    var btn = document.getElementById("settingsBtn");
    if (btn && btn.tagName === "A") {
      btn.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
      return btn;
    }
    if (btn) return btn;
    var ghost = document.querySelector('.gd-sidebar__foot a[href="leads.html"]');
    if (!ghost) return null;
    ghost.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
    ghost.id = "settingsBtn";
    ghost.setAttribute("role", "button");
    return ghost;
  }

  function ensureModal() {
    if (document.getElementById("settingsModal")) return document.getElementById("settingsModal");
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="lead-modal" id="settingsModal" aria-hidden="true">' +
        '<div class="lead-modal__backdrop" data-settings-modal-close></div>' +
        '<div class="lead-modal__panel" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle">' +
          '<button type="button" class="lead-modal__close" data-settings-modal-close aria-label="Close">&times;</button>' +
          '<h3 id="settingsModalTitle">Settings</h3>' +
          '<div class="settings__section">' +
            "<h4>Change email</h4>" +
            '<p class="settings__hint">This is the email you use to log in. You can change it anytime.</p>' +
            '<form class="form" id="emailForm" novalidate>' +
              '<div class="form__fields"><label><span>Login email</span>' +
              '<input type="email" name="newEmail" id="settingsEmail" maxlength="120" placeholder="you@email.com" autocomplete="username">' +
              "</label></div>" +
              '<p class="settings__msg" id="emailMsg" role="status"></p>' +
              '<button type="submit" class="btn btn--outline btn--block">Update email</button>' +
            "</form>" +
          "</div>" +
          '<div class="settings__section">' +
            "<h4>Change password</h4>" +
            '<p class="settings__hint">Updates the password for the account you\'re signed in with. Other logins stay the same.</p>' +
            '<form class="form" id="passcodeForm" novalidate>' +
              '<div class="form__fields"><div class="form__row">' +
              '<label><span>New password</span><input type="password" name="newPasscode" minlength="6" maxlength="64" placeholder="At least 6 characters" autocomplete="new-password"></label>' +
              '<label><span>Confirm password</span><input type="password" name="confirmPasscode" minlength="6" maxlength="64" placeholder="Re-enter password" autocomplete="new-password"></label>' +
              "</div></div>" +
              '<p class="settings__msg" id="passcodeMsg" role="status"></p>' +
              '<button type="submit" class="btn btn--outline btn--block">Update password</button>' +
            "</form>" +
          "</div>" +
          '<div class="settings__section">' +
            "<h4>Backup &amp; restore</h4>" +
            '<p class="settings__hint">Export a full backup to move your leads to another device or browser, then import it there.</p>' +
            '<div class="settings__backup-actions">' +
              '<button type="button" class="btn btn--outline" id="exportJsonBtn">Export backup (.json)</button>' +
              '<label class="btn btn--outline settings__import-label">Import backup (.json)' +
              '<input type="file" accept="application/json,.json" id="importJsonInput" hidden></label>' +
            "</div>" +
            '<p class="settings__msg" id="importMsg" role="status"></p>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap.firstChild);
    return document.getElementById("settingsModal");
  }

  var modal = ensureModal();
  var btn = ensureButton();
  var emailForm = document.getElementById("emailForm");
  var emailMsg = document.getElementById("emailMsg");
  var settingsEmail = document.getElementById("settingsEmail");
  var passcodeForm = document.getElementById("passcodeForm");
  var passcodeMsg = document.getElementById("passcodeMsg");
  var exportJsonBtn = document.getElementById("exportJsonBtn");
  var importJsonInput = document.getElementById("importJsonInput");
  var importMsg = document.getElementById("importMsg");

  function clearMsg(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("is-error");
  }

  function openModal() {
    if (!modal) return;
    clearMsg(passcodeMsg);
    clearMsg(emailMsg);
    clearMsg(importMsg);
    if (passcodeForm) passcodeForm.reset();
    if (settingsEmail && window.GDAuth && window.GDAuth.currentUser) {
      var signedIn = window.GDAuth.currentUser();
      settingsEmail.value = signedIn && signedIn.email ? signedIn.email : "";
    }
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (window.GDModal) window.GDModal.trap(modal);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (window.GDModal) window.GDModal.release();
  }

  function readLeads() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(LEADS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeLeads(leads) {
    try { window.localStorage.setItem(LEADS_KEY, JSON.stringify(leads)); } catch (err) {}
    try { window.dispatchEvent(new Event("gd-leads-changed")); } catch (err) {}
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

  function makeLeadId() {
    return "lead-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function makeActivityId() {
    return "act-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function sanitizeImportedLead(raw) {
    if (!raw || typeof raw !== "object") return null;
    function str(value) {
      return value === undefined || value === null ? "" : String(value).slice(0, IMPORT_STRING_MAX);
    }
    var status = str(raw.status);
    if (STATUSES.indexOf(status) === -1) status = "New";
    var estimatedValue = Number(raw.estimatedValue);
    if (!isFinite(estimatedValue) || estimatedValue < 0) estimatedValue = undefined;
    var createdAt = str(raw.createdAt);
    if (!createdAt || isNaN(new Date(createdAt).getTime())) createdAt = new Date().toISOString();
    var followUpDate = str(raw.followUpDate);
    if (followUpDate && isNaN(new Date(followUpDate).getTime())) followUpDate = "";
    var priority = str(raw.priority);
    if (priority !== "hot") priority = "";
    var activities = [];
    if (Array.isArray(raw.activities)) {
      raw.activities.slice(0, 200).forEach(function (item) {
        if (!item || typeof item !== "object") return;
        var type = str(item.type);
        if (!ACTIVITY_TYPES[type]) type = "note";
        var at = str(item.at);
        if (!at || isNaN(new Date(at).getTime())) at = new Date().toISOString();
        activities.push({ id: makeActivityId(), at: at, type: type, text: str(item.text) });
      });
    }
    var category = str(raw.category);
    if (CATEGORIES.indexOf(category) === -1) category = "Something else";
    return {
      id: makeLeadId(),
      createdAt: createdAt,
      name: str(raw.name),
      phone: str(raw.phone),
      email: str(raw.email),
      town: str(raw.town),
      address: str(raw.address),
      category: category,
      message: str(raw.message),
      status: status,
      source: str(raw.source) || "Imported backup",
      estimatedValue: estimatedValue,
      followUpDate: followUpDate || undefined,
      propertyNotes: str(raw.propertyNotes),
      priority: priority || undefined,
      activities: activities
    };
  }

  function exportLeadsAsJson() {
    var stamp = new Date().toISOString().slice(0, 10);
    downloadFile("grass-daddy-leads-backup-" + stamp + ".json", JSON.stringify(readLeads(), null, 2), "application/json;charset=utf-8;");
  }

  function importLeadsFromJson(file) {
    if (!file) return;
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      if (importMsg) { importMsg.textContent = "That file is too large (max 5MB)."; importMsg.classList.add("is-error"); }
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result, function (key, value) {
          if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
          return value;
        });
        if (!Array.isArray(parsed)) throw new Error("not-array");
        var existing = readLeads();
        var room = Math.max(IMPORT_MAX_LEADS_TOTAL - existing.length, 0);
        var toImport = parsed.slice(0, room);
        var added = 0;
        toImport.forEach(function (rawLead) {
          var clean = sanitizeImportedLead(rawLead);
          if (!clean) return;
          existing.push(clean);
          added++;
        });
        writeLeads(existing);
        if (importMsg) {
          var truncatedNote = parsed.length > toImport.length ? " (some were skipped — storage limit reached)" : "";
          importMsg.textContent = "Imported " + added + " lead(s)." + truncatedNote;
          importMsg.classList.remove("is-error");
        }
      } catch (err) {
        if (importMsg) {
          importMsg.textContent = "Couldn't read that file — make sure it's a JSON backup exported from this dashboard.";
          importMsg.classList.add("is-error");
        }
      }
    };
    reader.readAsText(file);
  }

  if (btn && btn.tagName !== "A") btn.addEventListener("click", openModal);
  if (modal) {
    modal.querySelectorAll("[data-settings-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && modal.classList.contains("is-open")) closeModal();
  });

  if (emailForm) {
    emailForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var next = ((new FormData(emailForm)).get("newEmail") || "").toString().trim();
      if (!window.GDAuth || !window.GDAuth.setEmail) {
        if (emailMsg) { emailMsg.textContent = "Couldn't save — auth module didn't load."; emailMsg.classList.add("is-error"); }
        return;
      }
      window.GDAuth.setEmail(next).then(function (user) {
        if (emailMsg) { emailMsg.textContent = "Email updated. Use " + (user && user.email ? user.email : next) + " next time you log in."; emailMsg.classList.remove("is-error"); }
        if (settingsEmail && user && user.email) settingsEmail.value = user.email;
      }, function (err) {
        var reason = err && err.message;
        if (!emailMsg) return;
        emailMsg.classList.add("is-error");
        if (reason === "email in use") emailMsg.textContent = "That email is already used by another login.";
        else if (reason === "invalid email") emailMsg.textContent = "Enter a valid email address.";
        else emailMsg.textContent = "Couldn't save — this browser may be blocking storage.";
      });
    });
  }

  if (passcodeForm) {
    passcodeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(passcodeForm);
      var next = (data.get("newPasscode") || "").toString().trim();
      var confirm = (data.get("confirmPasscode") || "").toString().trim();
      if (next.length < 6) {
        if (passcodeMsg) { passcodeMsg.textContent = "Password should be at least 6 characters."; passcodeMsg.classList.add("is-error"); }
        return;
      }
      if (next !== confirm) {
        if (passcodeMsg) { passcodeMsg.textContent = "Passwords don't match."; passcodeMsg.classList.add("is-error"); }
        return;
      }
      if (!window.GDAuth || !window.GDAuth.setPassword) {
        if (passcodeMsg) { passcodeMsg.textContent = "Couldn't save — auth module didn't load."; passcodeMsg.classList.add("is-error"); }
        return;
      }
      window.GDAuth.setPassword(next).then(function () {
        if (passcodeMsg) { passcodeMsg.textContent = "Password updated. Use it next time you log in."; passcodeMsg.classList.remove("is-error"); }
        passcodeForm.reset();
      }, function () {
        if (passcodeMsg) { passcodeMsg.textContent = "Couldn't save — this browser may be blocking storage."; passcodeMsg.classList.add("is-error"); }
      });
    });
  }

  if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportLeadsAsJson);
  if (importJsonInput) {
    importJsonInput.addEventListener("change", function () {
      var file = importJsonInput.files && importJsonInput.files[0];
      importLeadsFromJson(file);
      importJsonInput.value = "";
    });
  }
})(window);
