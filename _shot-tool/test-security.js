const fs = require("fs");
const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = path.resolve(__dirname, "..", "assets");

function url(p) {
  return "file:///" + path.resolve(__dirname, "..", p).replace(/\\/g, "/");
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}

function collectCspViolations(page) {
  const violations = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) violations.push(text);
  });
  return violations;
}

async function clearStorage(page) {
  await page.evaluate(() => {
    [
      "gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAccountEmails", "gdAdminPasscode", "gdAdminPasscodeHash",
      "gdLoginAttempts", "gdLoginLockoutUntil", "grassDaddyLeads", "grassDaddyBookings"
    ].forEach((k) => window.localStorage.removeItem(k));
  });
}

(async () => {
  const authSrc = fs.readFileSync(path.resolve(__dirname, "..", "js", "auth-guard.js"), "utf8");
  assert(!/password:\s*["']Denyel08!/.test(authSrc), "auth-guard.js does not ship the admin password in plaintext");
  assert(!/password:\s*["']izzy123/.test(authSrc), "auth-guard.js does not ship the owner password in plaintext");
  assert(/passwordHash:\s*"sha256:/.test(authSrc), "auth-guard.js stores default credentials as SHA-256 hashes");

  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1400, height: 1000 } });
  const page = await browser.newPage();

  // ---------- CSP: no violations across every real page ----------
  const pages = ["index.html", "team.html", "404.html", "login.html", "privacy.html"];
  for (const p of pages) {
    const violations = [];
    const handler = (msg) => { if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text()); };
    page.on("console", handler);
    await page.goto(url(p), { waitUntil: "networkidle0" });
    await wait(200);
    page.off("console", handler);
    assert(violations.length === 0, p + " loads with zero CSP violations" + (violations.length ? (": " + violations.join(" | ")) : ""));
  }

  // ---------- CSP meta tag + referrer meta present ----------
  for (const p of pages) {
    await page.goto(url(p), { waitUntil: "networkidle0" });
    const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (el) => el.getAttribute("content"));
    assert(!!csp && csp.indexOf("default-src 'self'") !== -1, p + " has a Content-Security-Policy meta tag");
    const ref = await page.$eval('meta[name="referrer"]', (el) => el.getAttribute("content"));
    assert(ref === "strict-origin-when-cross-origin", p + " has a Referrer-Policy meta tag");
  }

  // ---------- honeypot present + hidden ----------
  await page.goto(url("index.html"), { waitUntil: "networkidle0" });
  const honeypotHidden = await page.$eval('input[name="company"]', (el) => {
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (box.width <= 4 && box.height <= 4) || cs.clipPath === "inset(100%)" || cs.clip === "rect(0px, 0px, 0px, 0px)";
  });
  assert(honeypotHidden, "quote form honeypot field is visually hidden");

  // ---------- honeypot filled => submission is silently dropped ----------
  {
    const violations = collectCspViolations(page);
    await clearStorage(page);
    await page.reload({ waitUntil: "networkidle0" });
    await page.type('#quoteForm input[name="name"]', "Bot Test");
    await page.type('#quoteForm input[name="phone"]', "8605550000");
    await page.type('#quoteForm input[name="email"]', "bot@example.com");
    await page.type('#quoteForm input[name="town"]', "Hartford, CT");
    await page.select('#quoteForm select[name="service"]', "Lawn Maintenance");
    await page.evaluate(() => { document.querySelector('#quoteForm input[name="company"]').value = "I am a bot"; });
    await page.click('#quoteForm button[type="submit"]');
    await wait(300);
    const leadsAfterHoneypot = await page.evaluate(() => window.localStorage.getItem("grassDaddyLeads"));
    assert(!leadsAfterHoneypot || JSON.parse(leadsAfterHoneypot).length === 0, "honeypot-filled submission does not save a lead");
    assert(violations.length === 0, "no CSP violations while submitting the honeypot-filled form");
  }

  // ---------- normal submission still works and triggers the mailto fallback ----------
  {
    await clearStorage(page);
    await page.reload({ waitUntil: "networkidle0" });
    await page.type('#quoteForm input[name="name"]', "Real Client");
    await page.type('#quoteForm input[name="phone"]', "(860) 555-0100");
    await page.type('#quoteForm input[name="email"]', "real@example.com");
    await page.type('#quoteForm input[name="town"]', "Avon, CT");
    await page.select('#quoteForm select[name="service"]', "Lawn Maintenance");
    await page.type('#quoteForm textarea[name="message"]', "Please quote weekly mowing.");
    await page.click('#quoteForm button[type="submit"]');
    await wait(300);
    const leadsAfterReal = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]"));
    assert(leadsAfterReal.length === 1 && leadsAfterReal[0].name === "Real Client", "real submission saves exactly one lead");
    assert(leadsAfterReal[0].address === "", "optional address is stored empty when the visitor skips it");
    const fallbackHref = await page.$eval("#formMailtoFallback", (el) => el.getAttribute("href"));
    assert(fallbackHref.indexOf("mailto:Grass_Daddy%40yahoo.com") === 0, "mailto fallback link is set with the owner's email: " + fallbackHref);
    assert(fallbackHref.indexOf("Real%20Client") !== -1 || decodeURIComponent(fallbackHref).indexOf("Real Client") !== -1, "mailto body includes the submitted name");
  }
  await clearStorage(page);

  // ---------- service modal: focus trap keeps Tab cycling inside the modal ----------
  await page.goto(url("index.html"), { waitUntil: "networkidle0" });
  await page.evaluate(() => document.querySelector(".service[data-service]").scrollIntoView());
  await page.click(".service[data-service]");
  await wait(400);
  const modalOpen = await page.$eval("#serviceModal", (el) => el.classList.contains("is-open"));
  assert(modalOpen, "clicking a service card opens the service modal");

  await page.evaluate(() => document.querySelector(".service-modal__close").focus());
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  const focusStayedInModal = await page.evaluate(() => !!document.activeElement.closest("#serviceModal"));
  assert(focusStayedInModal, "Shift+Tab from the first focusable element wraps to stay inside the modal (focus trap works)");

  await page.keyboard.press("Escape");
  await wait(200);

  // ---------- login lockout after repeated failed attempts ----------
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await clearStorage(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => (document.getElementById("loginPassword").value = ""));
    await page.type("#loginPassword", "wrong-passcode-" + i);
    await page.keyboard.press("Enter");
    await wait(150);
  }
  const lockedOut = await page.$eval("#loginPassword", (el) => el.disabled);
  assert(lockedOut, "password input is disabled after 5 failed attempts (lockout engaged)");
  const emailLocked = await page.$eval("#loginEmail", (el) => el.disabled);
  assert(emailLocked, "email input is disabled after 5 failed attempts (lockout engaged)");
  const lockoutMsg = await page.$eval("#loginError", (el) => el.textContent);
  assert(/too many attempts/i.test(lockoutMsg), "lockout message is shown: " + lockoutMsg);
  await clearStorage(page);

  // ---------- passwords are hashed, never stored as plaintext, and default admin login still works ----------
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await clearStorage(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "default admin email/password still logs in successfully");
  const plaintextKey = await page.evaluate(() => window.localStorage.getItem("gdAdminPasscode"));
  assert(plaintextKey === null, "no plaintext passcode key is ever written");
  const accountMap = await page.evaluate(() => window.localStorage.getItem("gdAccountPasswords"));
  assert(!accountMap || !/Denyel08!|izzy123/.test(accountMap), "account password map does not store plaintext passwords");
  const authedUser = await page.evaluate(() => JSON.parse(window.localStorage.getItem("gdAuthUser") || "null"));
  assert(authedUser && authedUser.id === "denye" && authedUser.role === "admin", "login stores the signed-in admin user");
  const authedAt = await page.evaluate(() => Number(window.localStorage.getItem("gdAdminAuthedAt")));
  assert(authedAt > 0 && Date.now() - authedAt < 5000, "login records a session timestamp for expiry checks");

  // ---------- session expiry: a stale timestamp bounces back to login ----------
  await page.evaluate(() => window.localStorage.setItem("gdAdminAuthedAt", String(Date.now() - 13 * 60 * 60 * 1000)));
  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await wait(200);
  assert(page.url().includes("login.html"), "an expired session (>12h old) is bounced back to the login page");

  // ---------- log back in, then use the Log out button ----------
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "logs back in after the expiry test");
  await page.click("#logoutBtn");
  await wait(300);
  assert(page.url().includes("login.html"), "clicking Log out returns to the login page");
  const authedAfterLogout = await page.evaluate(() => window.localStorage.getItem("gdAdminAuthed"));
  assert(authedAfterLogout === null, "Log out clears the session flag");
  const userAfterLogout = await page.evaluate(() => window.localStorage.getItem("gdAuthUser"));
  assert(userAfterLogout === null, "Log out clears the signed-in user");
  await clearStorage(page);

  // ---------- leads.html JSON import: hardened against hostile payloads ----------
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await clearStorage(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await wait(200);

  const importResult = await page.evaluate(() => {
    var hostile = [
      { name: "Ok Lead", phone: "123", email: "a@b.com", town: "X", category: "Lawn Maintenance", status: "Won", message: "hi", estimatedValue: 500 },
      { __proto__: { polluted: true }, name: "Proto Test", status: "not-a-real-status", estimatedValue: -50 },
      "not-an-object",
      null,
      { name: "A".repeat(5000), message: "B".repeat(5000) }
    ];
    var blob = new Blob([JSON.stringify(hostile)], { type: "application/json" });
    var file = new File([blob], "hostile.json", { type: "application/json" });
    var input = document.getElementById("importJsonInput");
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await wait(400);

  const pollutionCheck = await page.evaluate(() => ({}).polluted);
  assert(!pollutionCheck, "importing a payload with a __proto__ key does not pollute Object.prototype");

  const importedLeads = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]"));
  assert(importedLeads.length >= 1, "hostile import still imports the well-formed leads: got " + importedLeads.length);
  const longNameLead = importedLeads.filter((l) => l.name && l.name.length > 0).sort((a, b) => b.name.length - a.name.length)[0];
  assert(longNameLead.name.length <= 2000, "imported free-text fields are capped in length (name length " + longNameLead.name.length + ")");
  const badStatusLead = importedLeads.filter((l) => l.name === "Proto Test")[0];
  assert(!badStatusLead || badStatusLead.status === "New", "an invalid status value is coerced to the default 'New'");
  await clearStorage(page);

  // ---------- calendar chip colors still render under CSP (regression check for the innerHTML style-attribute fix) ----------
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await clearStorage(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);

  await page.goto(url("calendar.html"), { waitUntil: "networkidle0" });
  const calViolations = [];
  page.on("console", (msg) => { if (/Content Security Policy/i.test(msg.text())) calViolations.push(msg.text()); });

  await page.evaluate(() => {
    var todayIso = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem("grassDaddyBookings", JSON.stringify([{
      id: "bk-test-1", clientName: "Chip Color Test", phone: "", town: "", service: "Lawn Maintenance",
      startDate: todayIso, time: "09:00", recurrence: "once", endDate: "", notes: ""
    }]));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await wait(300);

  const chipColorApplied = await page.evaluate(() => {
    var chip = document.querySelector(".cal__chip[data-chip-color]");
    if (!chip) return null;
    return {
      dataAttr: chip.getAttribute("data-chip-color"),
      cssVar: chip.style.getPropertyValue("--chip-color"),
      bg: getComputedStyle(chip).backgroundImage || getComputedStyle(chip).backgroundColor
    };
  });
  assert(!!chipColorApplied, "a booking chip renders in today's calendar cell");
  assert(chipColorApplied.cssVar && chipColorApplied.cssVar === chipColorApplied.dataAttr, "chip color CSS variable is applied via CSSOM (not blocked by CSP): " + JSON.stringify(chipColorApplied));
  assert(calViolations.length === 0, "no CSP violations while rendering calendar chips" + (calViolations.length ? (": " + calViolations.join(" | ")) : ""));

  await page.screenshot({ path: path.join(OUT_DIR, "check-security-calendar-chip.png") });
  console.log("captured: check-security-calendar-chip.png");

  await clearStorage(page);
  await browser.close();
  console.log("\nALL SECURITY TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
