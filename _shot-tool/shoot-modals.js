const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const LOGIN_URL = "file:///" + path.resolve(__dirname, "..", "login.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 900, height: 900 } });
  const page = await browser.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAdminPasscode", "grassDaddyLeads"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
  await page.goto("file:///" + path.resolve(__dirname, "..", "leads.html").replace(/\\/g, "/"), { waitUntil: "networkidle0" });
  await wait(200);
  await page.click("#seedBtn");
  await wait(200);
  await page.evaluate(() => document.getElementById("addLeadBtn").click());
  await wait(200);
  await page.screenshot({ path: path.join(OUT_DIR, "check-lead-modal-fields.png") });
  await page.evaluate(() => document.querySelectorAll("[data-lead-modal-close]")[0].click());
  await wait(300);
  await page.evaluate(() => document.getElementById("settingsBtn").click());
  await wait(200);
  await page.screenshot({ path: path.join(OUT_DIR, "check-settings-modal.png") });
  await page.evaluate(() => {
    ["grassDaddyLeads", "gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser"].forEach((k) => window.localStorage.removeItem(k));
  });
  await browser.close();
  console.log("done");
})();
