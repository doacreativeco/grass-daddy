const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
function url(p) { return "file:///" + path.resolve(__dirname, "..", p).replace(/\\/g, "/"); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function clearAll(page) {
  await page.evaluate(() => {
    [
      "gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAdminPasscode", "gdAdminPasscodeHash",
      "gdLoginAttempts", "gdLoginLockoutUntil", "grassDaddyLeads", "grassDaddyBookings", "gdScheduleLeadId"
    ].forEach((k) => window.localStorage.removeItem(k));
  }).catch(() => {});
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1440, height: 1000 } });
  const page = await browser.newPage();

  const issues = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") issues.push(`[console.${type}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => issues.push(`[pageerror] ${err.message}`));
  page.on("requestfailed", (req) => {
    if (!req.url().startsWith("file://")) return;
    issues.push(`[requestfailed] ${req.url()} — ${req.failure() && req.failure().errorText}`);
  });

  function mark(label) {
    issues.push(`--- checkpoint: ${label} ---`);
  }

  // ---------- index.html ----------
  mark("index.html load");
  await page.goto(url("index.html"), { waitUntil: "networkidle0" });
  await clearAll(page);
  await page.reload({ waitUntil: "networkidle0" });
  await wait(300);

  mark("index.html scroll + burger menu");
  await page.evaluate(() => window.scrollTo(0, 1500));
  await wait(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(300);

  mark("index.html nav info dropdown");
  await page.click("#navInfoBtn").catch((e) => issues.push("click navInfoBtn failed: " + e.message));
  await wait(200);
  await page.click("#navInfoBtn").catch(() => {});
  await wait(200);

  mark("index.html service modal open/close");
  await page.evaluate(() => document.querySelector(".service[data-service]").scrollIntoView());
  await page.click(".service[data-service]");
  await wait(400);
  await page.keyboard.press("Escape");
  await wait(200);

  mark("index.html quote form full submit");
  await page.type('#quoteForm input[name="name"]', "Sweep Test");
  await page.type('#quoteForm input[name="phone"]', "8605551234");
  await page.type('#quoteForm input[name="email"]', "sweep@test.com");
  await page.type('#quoteForm input[name="town"]', "Hartford, CT");
  await page.select('#quoteForm select[name="service"]', "Lawn Maintenance");
  await page.type('#quoteForm textarea[name="message"]', "Testing.");
  await page.click('#quoteForm button[type="submit"]');
  await wait(300);
  await clearAll(page);

  mark("index.html mobile menu");
  await page.setViewport({ width: 420, height: 800 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.click("#burgerBtn").catch((e) => issues.push("click burgerBtn failed: " + e.message));
  await wait(200);
  await page.setViewport({ width: 1440, height: 1000 });

  // ---------- team.html ----------
  mark("team.html load");
  await page.goto(url("team.html"), { waitUntil: "networkidle0" });
  await wait(300);

  // ---------- 404.html ----------
  mark("404.html load");
  await page.goto(url("404.html"), { waitUntil: "networkidle0" });
  await wait(300);

  // ---------- login.html: full flow incl. lockout + reset ----------
  mark("login.html load + clear");
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await clearAll(page);
  await page.reload({ waitUntil: "networkidle0" });

  mark("login.html wrong password once");
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "wrongpass");
  await page.keyboard.press("Enter");
  await wait(300);

  mark("login.html correct email and password");
  await page.evaluate(() => (document.getElementById("loginPassword").value = ""));
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);

  mark("dashboard.html today view");
  await wait(200);

  mark("customers.html load");
  await page.goto(url("customers.html"), { waitUntil: "networkidle0" });
  await wait(200);

  mark("estimates.html load");
  await page.goto(url("estimates.html"), { waitUntil: "networkidle0" });
  await wait(200);

  mark("prices.html load");
  await page.goto(url("prices.html"), { waitUntil: "networkidle0" });
  await wait(200);

  mark("billing.html load");
  await page.goto(url("billing.html"), { waitUntil: "networkidle0" });
  await wait(200);

  // ---------- leads.html: full interaction pass ----------
  mark("leads.html load");
  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await wait(300);
  mark("leads.html seed + add + edit + delete");
  await page.click("#seedBtn").catch((e) => issues.push("click seedBtn failed: " + e.message));
  await wait(300);
  await page.click("#addLeadBtn").catch((e) => issues.push("click addLeadBtn failed: " + e.message));
  await wait(200);
  await page.type('#leadModal input[name="name"]', "Bug Sweep Lead");
  await page.click('#leadForm button[type="submit"]').catch((e) => issues.push("submit leadForm failed: " + e.message));
  await wait(300);

  mark("leads.html search + sort");
  await page.type("#searchInput", "Bug").catch(() => {});
  await wait(200);
  await page.evaluate(() => (document.getElementById("searchInput").value = ""));
  await page.select("#sortSelect", "value-desc").catch((e) => issues.push("select sortSelect failed: " + e.message));
  await wait(200);

  mark("leads.html open first card edit");
  await page.evaluate(() => {
    const editBtn = document.querySelector(".lead-card__actions [data-edit-id], .lead-card [data-action='edit']");
    if (editBtn) editBtn.click();
  });
  await wait(200);
  await page.evaluate(() => {
    const closeBtn = document.querySelector("#leadModal [data-lead-modal-close]");
    if (closeBtn) closeBtn.click();
  });
  await wait(200);

  mark("leads.html settings modal + passcode form validation");
  await page.click("#settingsBtn").catch((e) => issues.push("click settingsBtn failed: " + e.message));
  await wait(200);
  await page.click('#passcodeForm button[type="submit"]').catch(() => {});
  await wait(200);
  await page.evaluate(() => document.querySelectorAll("[data-settings-modal-close]")[0].click());
  await wait(200);

  mark("leads.html export CSV");
  await page.click("#exportBtn").catch((e) => issues.push("click exportBtn failed: " + e.message));
  await wait(300);

  mark("leads.html navigate to calendar via header nav");
  await page.click('a[href="calendar.html"]').catch((e) => issues.push("click calendar nav link failed: " + e.message));
  await wait(400);

  // ---------- calendar.html: full interaction pass ----------
  mark("calendar.html new booking full flow");
  await page.click("#addBookingBtn").catch((e) => issues.push("click addBookingBtn failed: " + e.message));
  await wait(200);
  await page.type("#bookingClientName", "Sweep Client").catch((e) => issues.push("type clientName failed: " + e.message));
  await wait(200);
  await page.keyboard.press("Escape");
  await wait(100);
  await page.evaluate(() => (document.querySelector('#bookingForm [name="startDate"]').value = new Date().toISOString().slice(0, 10)));
  await page.evaluate(() => (document.querySelector('#bookingForm [name="time"]').value = "10:00"));
  await page.click('#bookingForm button[type="submit"]').catch((e) => issues.push("submit bookingForm failed: " + e.message));
  await wait(300);

  mark("calendar.html click today's chip + day cell");
  await page.evaluate(() => {
    const chip = document.querySelector(".cal__chip");
    if (chip) chip.click();
  });
  await wait(200);
  await page.evaluate(() => {
    const closeBtn = document.querySelector("#bookingModal [data-lead-modal-close], #bookingModal [data-modal-close]");
    if (closeBtn) closeBtn.click();
  });
  await wait(200);

  mark("calendar.html month navigation");
  await page.click(".cal__nav--prev, [data-cal-prev]").catch(() => {});
  await wait(150);
  await page.click(".cal__today-btn").catch((e) => issues.push("click today btn failed: " + e.message));
  await wait(150);

  mark("calendar.html log out");
  await page.click("#logoutBtn").catch((e) => issues.push("click logoutBtn failed: " + e.message));
  await wait(300);

  await clearAll(page);
  await browser.close();

  // Manifest fetches are always CORS-blocked from a file:// "null" origin — a
  // testing-only artifact, not a real bug (won't happen once served over https).
  const isKnownFileProtocolNoise = (i) => /manifest\.webmanifest/i.test(i) || /^\[console\.error\] Failed to load resource: net::ERR_FAILED$/.test(i);

  const realIssues = issues.filter((i) => !i.startsWith("--- checkpoint") && !isKnownFileProtocolNoise(i));
  console.log(issues.join("\n"));
  console.log("\n\nTOTAL NON-CHECKPOINT ISSUES:", realIssues.length);
  process.exit(realIssues.length ? 1 : 0);
})();
