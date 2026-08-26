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
      passwordHash: "sha256:62e298c6bcbed9b4d7ba91a52b10a460c61f02ca16cc34f6fd2d5c049554ea46"
    },
    {
      id: "izzy",
      email: "izzy@grassdaddy.com",
      aliases: [],
      name: "Izzy",
      role: "owner",
      passwordHash: "sha256:400b56d87080f729d68c7c61244d511b5697cb09a4deaff23ca29be455bacce2"
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

  var LOGIN_PEPPER = "gd-login-v1";

  function fallbackHash(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return "fnv1a:" + (hash >>> 0).toString(16);
  }

  function digestPasscode(value) {
    var text = String(value || "");
    if (window.crypto && window.crypto.subtle && window.isSecureContext !== false) {
      try {
        var data = new TextEncoder().encode(text);
        return window.crypto.subtle
          .digest("SHA-256", data)
          .then(function (buf) {
            var bytes = Array.from(new Uint8Array(buf));
            return "sha256:" + bytes.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
          })
          .catch(function () { return fallbackHash(text); });
      } catch (err) {}
    }
    return Promise.resolve(fallbackHash(text));
  }

  function hashPasscode(text) {
    return digestPasscode(LOGIN_PEPPER + "\0" + String(text || ""));
  }

  function hashPasscodeLegacy(text) {
    return digestPasscode(String(text || ""));
  }

  function hashesEqual(a, b) {
    a = String(a || "");
    b = String(b || "");
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function safeJsonParse(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    try {
      var parsed = JSON.parse(String(raw), function (key, value) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
        return value;
      });
      return parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function accountById(id) {
    if (!id) return null;
    for (var i = 0; i < ACCOUNTS.length; i++) {
      if (ACCOUNTS[i].id === id) return ACCOUNTS[i];
    }
    return null;
  }

  function safePageRedirect(target) {
    var t = String(target || "login.html");
    if (!/^[a-z0-9][a-z0-9._-]*\.html$/i.test(t)) return "login.html";
    return t;
  }

  function copyStringMap(parsed) {
    var out = Object.create(null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    Object.keys(parsed).forEach(function (key) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return;
      if (typeof parsed[key] === "string") out[key] = parsed[key];
    });
    return out;
  }

  function readPasswordMap() {
    var store = ls();
    if (!store) return Object.create(null);
    try {
      return copyStringMap(safeJsonParse(store.getItem(PASSWORDS_KEY) || "{}", {}));
    } catch (err) {
      return Object.create(null);
    }
  }

  function writePasswordMap(map) {
    var store = ls();
    if (!store) return;
    try { store.setItem(PASSWORDS_KEY, JSON.stringify(map)); } catch (err) {}
  }

  function readEmailMap() {
    var store = ls();
    if (!store) return Object.create(null);
    try {
      return copyStringMap(safeJsonParse(store.getItem(EMAILS_KEY) || "{}", {}));
    } catch (err) {
      return Object.create(null);
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
    var expected = stored || account.passwordHash;
    return Promise.all([hashPasscode(candidate), hashPasscodeLegacy(candidate)]).then(function (pair) {
      var peppered = pair[0];
      var legacy = pair[1];
      if (hashesEqual(peppered, expected)) return publicUser(account);
      if (hashesEqual(legacy, expected)) {
        var map = readPasswordMap();
        map[account.id] = peppered;
        writePasswordMap(map);
        return publicUser(account);
      }
      return null;
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
    var parsed = safeJsonParse(store.getItem(USER_KEY), null);
    var account = accountById(parsed && parsed.id);
    return account ? publicUser(account) : null;
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
    var parsed = safeJsonParse(store.getItem(USER_KEY), null);
    return !!(parsed && accountById(parsed.id));
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
    window.location.replace(safePageRedirect(redirectTo));
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
    safeJsonParse: safeJsonParse,
    SESSION_MAX_AGE_MS: SESSION_MAX_AGE_MS
  };

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", function () { logout("login.html"); });
  });
})(window);
