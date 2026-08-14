// Shared owner-login helpers used by login.html and every CRM page
// (dashboard, leads, calendar, billing, prices, customers, estimates).
//
// IMPORTANT: This is a static site with no backend/server, so there is no real
// authentication here — anyone who opens devtools can flip localStorage flags
// and bypass this entirely. This module exists to raise the bar above "trivial"
// (hashed passwords, session expiry, lockout on repeated failed attempts) but
// it should never guard anything actually sensitive.
(function (window) {
  "use strict";

  var AUTHED_KEY = "gdAdminAuthed";
  var AUTHED_AT_KEY = "gdAdminAuthedAt";
  var USER_KEY = "gdAuthUser";
  var PASSWORDS_KEY = "gdAccountPasswords";
  var EMAILS_KEY = "gdAccountEmails";
  var LEGACY_PASSCODE_KEY = "gdAdminPasscode";
  var LEGACY_HASH_KEY = "gdAdminPasscodeHash";
  var ATTEMPTS_KEY = "gdLoginAttempts";
  var LOCKOUT_UNTIL_KEY = "gdLoginLockoutUntil";

  var SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  var MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
  var LOCKOUT_BASE_MS = 15 * 1000;

  var ACCOUNTS = [
    {
      id: "denye",
      email: "doacreativeco@gmail.com",
      aliases: [],
      name: "Denye",
      role: "admin",
      password: "Denyel08!"
    },
    {
      id: "izzy",
      email: "izzy@grassdaddy.com",
      aliases: [],
      name: "Izzy",
      role: "owner",
      password: "izzy123"
    }
  ];

  function ls() {
    try {
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function findAccount(email) {
    var needle = normalizeEmail(email);
    if (!needle) return null;
    var emailMap = readEmailMap();
    for (var i = 0; i < ACCOUNTS.length; i++) {
      var acct = ACCOUNTS[i];
      if (normalizeEmail(emailMap[acct.id] || "") === needle) return acct;
      if (normalizeEmail(acct.email) === needle) return acct;
      var aliases = acct.aliases || [];
      for (var a = 0; a < aliases.length; a++) {
        if (normalizeEmail(aliases[a]) === needle) return acct;
      }
    }
    return null;
  }

  function isValidEmail(email) {
    var n = normalizeEmail(email);
    return n.length >= 5 && n.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n);
  }

  function fallbackHash(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return "fnv1a:" + (hash >>> 0).toString(16);
  }

  function hashPasscode(text) {
    var value = String(text || "");
    if (window.crypto && window.crypto.subtle && window.isSecureContext !== false) {
      try {
        var data = new TextEncoder().encode(value);
        return window.crypto.subtle
          .digest("SHA-256", data)
          .then(function (buf) {
            var bytes = Array.from(new Uint8Array(buf));
            return "sha256:" + bytes.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
          })
          .catch(function () { return fallbackHash(value); });
      } catch (err) {}
    }
    return Promise.resolve(fallbackHash(value));
  }

  function readPasswordMap() {
    var store = ls();
    if (!store) return {};
    try {
      var parsed = JSON.parse(store.getItem(PASSWORDS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writePasswordMap(map) {
    var store = ls();
    if (!store) return;
    try { store.setItem(PASSWORDS_KEY, JSON.stringify(map)); } catch (err) {}
  }

  function readEmailMap() {
    var store = ls();
    if (!store) return {};
    try {
      var parsed = JSON.parse(store.getItem(EMAILS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeEmailMap(map) {
    var store = ls();
    if (!store) return;
    try { store.setItem(EMAILS_KEY, JSON.stringify(map)); } catch (err) {}
  }

  function effectiveEmail(account) {
    if (!account) return "";
    var map = readEmailMap();
    return map[account.id] || account.email;
  }

  function storedHashFor(account) {
    if (!account) return null;
    var map = readPasswordMap();
    return map[account.id] || map[normalizeEmail(account.email)] || map[normalizeEmail(effectiveEmail(account))] || null;
  }

  function publicUser(account) {
    if (!account) return null;
    return {
      id: account.id,
      email: effectiveEmail(account),
      name: account.name,
      role: account.role
    };
  }

  function checkLogin(email, password) {
    var account = findAccount(email);
    if (!account) return Promise.resolve(null);
    var candidate = String(password || "");
    var stored = storedHashFor(account);
    var expected = stored ? Promise.resolve(stored) : hashPasscode(account.password);
    return Promise.all([hashPasscode(candidate), expected]).then(function (pair) {
      return pair[0] === pair[1] ? publicUser(account) : null;
    });
  }

  function setPassword(newPassword) {
    var user = currentUser();
    if (!user) return Promise.reject(new Error("not signed in"));
    return hashPasscode(newPassword).then(function (h) {
      var map = readPasswordMap();
      map[user.id] = h;
      writePasswordMap(map);
      var store = ls();
      if (store) {
        try {
          store.removeItem(LEGACY_PASSCODE_KEY);
          store.removeItem(LEGACY_HASH_KEY);
        } catch (err) {}
      }
      return true;
    });
  }

  function setEmail(newEmail) {
    var user = currentUser();
    if (!user) return Promise.reject(new Error("not signed in"));
    var next = normalizeEmail(newEmail);
    if (!isValidEmail(next)) return Promise.reject(new Error("invalid email"));
    var taken = findAccount(next);
    if (taken && taken.id !== user.id) return Promise.reject(new Error("email in use"));
    var map = readEmailMap();
    map[user.id] = next;
    writeEmailMap(map);
    var updated = {
      id: user.id,
      email: next,
      name: user.name,
      role: user.role
    };
    var store = ls();
    if (store) {
      try { store.setItem(USER_KEY, JSON.stringify(updated)); } catch (err) {}
    }
    return Promise.resolve(updated);
  }

  function getLockoutRemainingMs() {
    var store = ls();
    if (!store) return 0;
    var until = Number(store.getItem(LOCKOUT_UNTIL_KEY));
    if (!until || isNaN(until)) return 0;
    var remaining = until - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  function recordFailedAttempt() {
    var store = ls();
    if (!store) return;
    var attempts = (Number(store.getItem(ATTEMPTS_KEY)) || 0) + 1;
    try { store.setItem(ATTEMPTS_KEY, String(attempts)); } catch (err) {}

    if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
      var extraLockouts = attempts - MAX_ATTEMPTS_BEFORE_LOCKOUT;
      var duration = Math.min(LOCKOUT_BASE_MS * Math.pow(2, extraLockouts), 10 * 60 * 1000);
      try { store.setItem(LOCKOUT_UNTIL_KEY, String(Date.now() + duration)); } catch (err) {}
    }
  }

  function clearFailedAttempts() {
    var store = ls();
    if (!store) return;
    try {
      store.removeItem(ATTEMPTS_KEY);
      store.removeItem(LOCKOUT_UNTIL_KEY);
    } catch (err) {}
  }

  function currentUser() {
    if (!isAuthed()) return null;
    var store = ls();
    if (!store) return null;
    try {
      var parsed = JSON.parse(store.getItem(USER_KEY) || "null");
      if (!parsed || !parsed.id || !parsed.role) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function isAdmin() {
    var user = currentUser();
    return !!(user && user.role === "admin");
  }

  function canPurgePastClients() {
    return isAdmin();
  }

  function isAuthed() {
    var store = ls();
    if (!store) return false;
    if (store.getItem(AUTHED_KEY) !== "1") return false;
    var at = Number(store.getItem(AUTHED_AT_KEY));
    if (!at || isNaN(at)) return false;
    if (Date.now() - at > SESSION_MAX_AGE_MS) return false;
    try {
      var parsed = JSON.parse(store.getItem(USER_KEY) || "null");
      if (!parsed || !parsed.id) return false;
    } catch (err) {
      return false;
    }
    return true;
  }

  function markLoggedIn(user) {
    var store = ls();
    if (!store || !user) return;
    try {
      store.setItem(AUTHED_KEY, "1");
      store.setItem(AUTHED_AT_KEY, String(Date.now()));
      store.setItem(USER_KEY, JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }));
      store.removeItem(LEGACY_PASSCODE_KEY);
      store.removeItem(LEGACY_HASH_KEY);
    } catch (err) {}
  }

  function logout(redirectTo) {
    var store = ls();
    if (store) {
      try {
        store.removeItem(AUTHED_KEY);
        store.removeItem(AUTHED_AT_KEY);
        store.removeItem(USER_KEY);
      } catch (err) {}
    }
    window.location.replace(redirectTo || "login.html");
  }

  function requireAuth() {
    if (isAuthed()) return true;
    logout("login.html");
    return false;
  }

  window.GDAuth = {
    isAuthed: isAuthed,
    requireAuth: requireAuth,
    markLoggedIn: markLoggedIn,
    logout: logout,
    checkLogin: checkLogin,
    setPassword: setPassword,
    setPasscode: setPassword,
    setEmail: setEmail,
    currentUser: currentUser,
    isAdmin: isAdmin,
    canPurgePastClients: canPurgePastClients,
    getLockoutRemainingMs: getLockoutRemainingMs,
    recordFailedAttempt: recordFailedAttempt,
    clearFailedAttempts: clearFailedAttempts,
    SESSION_MAX_AGE_MS: SESSION_MAX_AGE_MS
  };

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", function () { logout("login.html"); });
  });
})(window);
