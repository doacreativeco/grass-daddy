// Owner login gate for the internal admin area.
//
// IMPORTANT: This is a static site with no backend/server, so there is no real
// authentication here. This is just a lightweight client-side deterrent — see
// js/auth-guard.js for the full set of caveats.
(function () {
  "use strict";

  var REDIRECT_TARGET = "dashboard.html";
  var auth = window.GDAuth;

  var form = document.getElementById("loginForm");
  var emailInput = document.getElementById("loginEmail");
  var passInput = document.getElementById("loginPassword");
  var errorEl = document.getElementById("loginError");
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  if (!form || !emailInput || !passInput || !errorEl || !auth) return;

  if (auth.isAuthed()) {
    window.location.replace(REDIRECT_TARGET);
    return;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("is-visible");
    passInput.classList.remove("is-shake");
    void passInput.offsetWidth;
    passInput.classList.add("is-shake");
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("is-visible");
    passInput.classList.remove("is-shake");
  }

  var lockoutTimer = null;

  function refreshLockoutState() {
    var remaining = auth.getLockoutRemainingMs();
    if (remaining <= 0) {
      if (submitBtn) submitBtn.disabled = false;
      emailInput.disabled = false;
      passInput.disabled = false;
      if (lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null; }
      return false;
    }

    emailInput.disabled = true;
    passInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    var seconds = Math.ceil(remaining / 1000);
    showError("Too many attempts. Try again in " + seconds + "s.");

    if (!lockoutTimer) {
      lockoutTimer = setInterval(function () {
        if (!refreshLockoutState()) clearError();
      }, 1000);
    }
    return true;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (refreshLockoutState()) return;

    var email = (emailInput.value || "").trim();
    var password = passInput.value || "";
    if (!email || !password) {
      showError("Enter your email and password.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    auth.checkLogin(email, password).then(function (user) {
      if (user) {
        auth.clearFailedAttempts();
        auth.markLoggedIn(user);
        window.location.href = REDIRECT_TARGET;
        return;
      }

      auth.recordFailedAttempt();
      if (submitBtn) submitBtn.disabled = false;
      if (!refreshLockoutState()) showError("Incorrect email or password. Try again.");
      passInput.value = "";
      passInput.focus();
    }, function () {
      if (submitBtn) submitBtn.disabled = false;
      showError("Something went wrong checking that login. Try again.");
    });
  });

  emailInput.addEventListener("input", function () {
    if (!auth.getLockoutRemainingMs()) clearError();
  });
  passInput.addEventListener("input", function () {
    if (!auth.getLockoutRemainingMs()) clearError();
  });

  refreshLockoutState();
})();
