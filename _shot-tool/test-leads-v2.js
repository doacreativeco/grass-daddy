const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const LOGIN_URL = "file:///" + path.resolve(__dirname, "..", "login.html").replace(/\\/g, "/");
const LEADS_URL = "file:///" + path.resolve(__dirname, "..", "leads.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");
const DOWNLOAD_DIR = path.resolve(__dirname, "downloads");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}

(async () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1500, height: 1100 },
  });
  const page = await browser.newPage();

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });

  // ---------- authenticate via the real login flow (sets gdAdminAuthed correctly) ----------
  await page.goto(LOGIN_URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAccountEmails", "gdAdminPasscode", "gdAdminPasscodeHash", "grassDaddyLeads"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "admin email/password logs in and redirects to dashboard.html");
  await page.goto(LEADS_URL, { waitUntil: "networkidle0" });
  await wait(200);

  // ---------- seed sample leads (now include estimatedValue / followUpDate) ----------
  await page.click("#seedBtn");
  await wait(150);

  let rowCount = await page.$$eval("#leadsCards .lead-card", (rows) => rows.length);
  assert(rowCount === 1, "card list shows 1 preview lead after reset");
  const previewName = await page.$eval(".lead-card__name", (el) => el.textContent.trim());
  assert(previewName === "Karen Whitfield", "preview lead is Karen Whitfield");
  const storedAfterSeed = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]").length);
  assert(storedAfterSeed === 1, "storage holds only the 1 preview lead");
  const previewStatus = await page.evaluate(() => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    return leads[0] ? leads[0].status : null;
  });
  assert(previewStatus === "New", "preview lead is a New lead");

  // ---------- extended stats: pipeline value + follow-ups due ----------
  const statLabels = await page.$$eval(".leads__stat-label", (els) => els.map((e) => e.textContent.trim()));
  assert(statLabels.includes("Pipeline value"), "stats row includes Pipeline value");
  assert(statLabels.includes("Follow-ups due"), "stats row includes Follow-ups due");

  const badgeCount = await page.$$eval(".leads__followup", (els) => els.length);
  assert(badgeCount >= 1, "the preview lead shows a follow-up badge");

  // ---------- sort control: highest value first ----------
  await page.select("#sortSelect", "estimatedValue-desc");
  await wait(120);
  let sortedValuesText = await page.$$eval(".lead-card__value", (els) => els.map((e) => e.textContent.trim()));
  const parseMoney = (s) => (s === "—" ? -1 : Number(s.replace(/[$,]/g, "")));
  let sortedValues = sortedValuesText.map(parseMoney);
  let isDescending = sortedValues.every((v, i) => i === 0 || v <= sortedValues[i - 1]);
  assert(isDescending, "sort select 'Highest value' sorts cards descending by estimated value");

  // lowest value first
  await page.select("#sortSelect", "estimatedValue-asc");
  await wait(120);
  sortedValuesText = await page.$$eval(".lead-card__value", (els) => els.map((e) => e.textContent.trim()));
  sortedValues = sortedValuesText.map(parseMoney);
  let isAscending = sortedValues.every((v, i) => i === 0 || v >= sortedValues[i - 1]);
  assert(isAscending, "sort select 'Lowest value' sorts cards ascending by estimated value");

  // back to default sort (Submitted, newest first) for consistent ids going forward
  await page.select("#sortSelect", "createdAt-desc");
  await wait(120);

  // ---------- edit an existing lead via the Edit button + modal ----------
  const idToEdit = await page.$eval("#leadsCards .lead-card[data-id]", (el) => el.getAttribute("data-id"));
  await page.evaluate((id) => {
    document.querySelector('.lead-card[data-id="' + id + '"] .leads__edit-btn').click();
  }, idToEdit);
  await wait(150);

  const modalTitle = await page.$eval("#leadModalTitle", (el) => el.textContent.trim());
  assert(modalTitle === "Edit lead", "edit modal shows 'Edit lead' title");

  const prefilledName = await page.$eval('#leadForm input[name="name"]', (el) => el.value);
  assert(prefilledName.length > 0, "edit modal pre-fills the existing lead's name");

  await page.evaluate(() => {
    const input = document.querySelector('#leadForm input[name="name"]');
    input.value = "";
  });
  await page.type('#leadForm input[name="name"]', "Edited Name QA");
  await page.click('#leadForm button[type="submit"]');
  await wait(500);

  const rowCountAfterEdit = await page.$$eval("#leadsCards .lead-card", (rows) => rows.length);
  assert(rowCountAfterEdit === 1, "editing a lead does not create a new card (still 1 preview lead)");

  const editedNameExists = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".lead-card__name")).some((el) => el.textContent.indexOf("Edited Name QA") !== -1);
  });
  assert(editedNameExists, "edited lead's new name appears in the card list");

  const editedInStorage = await page.evaluate((id) => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    const lead = leads.find((l) => l.id === id);
    return lead ? lead.name : null;
  }, idToEdit);
  assert(editedInStorage === "Edited Name QA", "edit persisted to localStorage under the same lead id");

  // ---------- settings modal: password change validation ----------
  await page.evaluate(() => document.getElementById("settingsBtn").click());
  await wait(150);
  const settingsOpen = await page.$eval("#settingsModal", (el) => el.classList.contains("is-open"));
  assert(settingsOpen, "settings modal opens from the header button");

  await page.type('#passcodeForm input[name="newPasscode"]', "abc");
  await page.type('#passcodeForm input[name="confirmPasscode"]', "abc");
  await page.click('#passcodeForm button[type="submit"]');
  await wait(100);
  let passcodeMsg = await page.$eval("#passcodeMsg", (el) => el.textContent.trim());
  assert(passcodeMsg.indexOf("6 characters") !== -1, "short password is rejected with a helpful message");

  await page.evaluate(() => {
    document.querySelector('#passcodeForm input[name="newPasscode"]').value = "";
    document.querySelector('#passcodeForm input[name="confirmPasscode"]').value = "";
  });
  await page.type('#passcodeForm input[name="newPasscode"]', "newpass123");
  await page.type('#passcodeForm input[name="confirmPasscode"]', "newpass456");
  await page.click('#passcodeForm button[type="submit"]');
  await wait(100);
  passcodeMsg = await page.$eval("#passcodeMsg", (el) => el.textContent.trim());
  assert(passcodeMsg.indexOf("match") !== -1, "mismatched passwords are rejected");

  await page.evaluate(() => {
    document.querySelector('#passcodeForm input[name="newPasscode"]').value = "";
    document.querySelector('#passcodeForm input[name="confirmPasscode"]').value = "";
  });
  await page.type('#passcodeForm input[name="newPasscode"]', "newpass123");
  await page.type('#passcodeForm input[name="confirmPasscode"]', "newpass123");
  await page.click('#passcodeForm button[type="submit"]');
  await wait(150);
  passcodeMsg = await page.$eval("#passcodeMsg", (el) => el.textContent.trim());
  assert(passcodeMsg.indexOf("updated") !== -1, "valid matching password is accepted");

  const storedPasswordMap = await page.evaluate(() => {
    const raw = window.localStorage.getItem("gdAccountPasswords");
    try { return JSON.parse(raw || "{}"); } catch (err) { return {}; }
  });
  const storedHash = storedPasswordMap.denye || "";
  assert(!!storedHash && (storedHash.indexOf("sha256:") === 0 || storedHash.indexOf("fnv1a:") === 0), "new password is saved as a hash: " + storedHash);
  const storedPlaintext = await page.evaluate(() => window.localStorage.getItem("gdAdminPasscode"));
  assert(storedPlaintext === null, "password is never stored in plaintext");
  assert(!JSON.stringify(storedPasswordMap).toLowerCase().includes("newpass123"), "password map does not contain the plaintext password");

  // ---------- JSON export ----------
  await page.click("#exportJsonBtn");
  await wait(500);
  const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith(".json"));
  assert(files.length >= 1, "clicking Export backup downloads a .json file");
  const jsonPath = path.join(DOWNLOAD_DIR, files[files.length - 1]);
  const exportedLeads = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert(Array.isArray(exportedLeads) && exportedLeads.length === 1, "exported JSON backup contains the 1 preview lead");

  await page.evaluate(() => {
    document.querySelectorAll("[data-settings-modal-close]")[0].click();
  });
  await wait(150);

  // ---------- JSON import: clear leads, then restore from the backup file ----------
  await page.evaluate(() => window.localStorage.removeItem("grassDaddyLeads"));
  await page.reload({ waitUntil: "networkidle0" });
  await wait(150);
  rowCount = await page.$$eval("#leadsCards .lead-card", (rows) => rows.length).catch(() => 0);
  assert(rowCount === 0, "leads cleared before import test");

  await page.click("#settingsBtn");
  await wait(150);
  const importInput = await page.$("#importJsonInput");
  await importInput.uploadFile(jsonPath);
  await wait(400);

  const importMsg = await page.$eval("#importMsg", (el) => el.textContent.trim());
  assert(importMsg.indexOf("Imported") !== -1, "import shows a confirmation message: " + importMsg);

  await page.evaluate(() => {
    document.querySelectorAll("[data-settings-modal-close]")[0].click();
  });
  await wait(150);

  rowCount = await page.$$eval("#leadsCards .lead-card", (rows) => rows.length);
  assert(rowCount === 1, "pipeline cards are restored after importing the backup");
  const storedAfterImport = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]").length);
  assert(storedAfterImport === 1, "imported backup still contains the 1 preview lead in storage");

  // screenshot: final state with new columns/badges/stats
  await page.screenshot({ path: path.join(OUT_DIR, "check-leads-dashboard-v2.png"), fullPage: true });
  console.log("captured: check-leads-dashboard-v2.png");

  // ---------- verify the new password actually works on the login screen ----------
  await page.evaluate(() => {
    window.localStorage.removeItem("gdAdminAuthed");
    window.localStorage.removeItem("gdAdminAuthedAt");
    window.localStorage.removeItem("gdAuthUser");
  });
  await page.goto(LOGIN_URL, { waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "newpass123");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "newly-set admin password successfully logs in");

  await page.click("#logoutBtn");
  await wait(400);
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("login.html"), "old admin password no longer works after change");

  await page.evaluate(() => {
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
  });
  await page.type("#loginEmail", "izzy@grassdaddy.com");
  await page.type("#loginPassword", "izzy123");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "Izzy's owner login is unchanged after the admin password change");

  await page.goto(LEADS_URL, { waitUntil: "networkidle0" });
  await wait(200);
  await page.click("#settingsBtn");
  await wait(150);
  const starterEmail = await page.$eval("#settingsEmail", (el) => el.value);
  assert(starterEmail === "izzy@grassdaddy.com", "settings shows Izzy's starter email");
  await page.evaluate(() => { document.getElementById("settingsEmail").value = ""; });
  await page.type("#settingsEmail", "izzy.new@test.com");
  await page.click('#emailForm button[type="submit"]');
  await wait(150);
  const emailMsg = await page.$eval("#emailMsg", (el) => el.textContent.trim());
  assert(/updated/i.test(emailMsg), "Izzy can change the starter email from settings: " + emailMsg);

  await page.evaluate(() => {
    const closeBtn = document.querySelector("[data-settings-modal-close]");
    if (closeBtn) closeBtn.click();
  });
  await wait(150);
  await page.click("#logoutBtn");
  await page.waitForSelector("#loginEmail", { timeout: 5000 });
  await page.type("#loginEmail", "izzy.new@test.com");
  await page.type("#loginPassword", "izzy123");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "Izzy can log in with the email he just set");

  // ---------- clean up ----------
  await page.evaluate(() => {
    ["grassDaddyLeads", "gdAdminPasscode", "gdAdminPasscodeHash", "gdAccountPasswords",
      "gdAccountEmails", "gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser"].forEach((k) => window.localStorage.removeItem(k));
  });
  files.forEach((f) => {
    try { fs.unlinkSync(path.join(DOWNLOAD_DIR, f)); } catch (e) {}
  });

  await browser.close();
  console.log("\nALL V2 TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
