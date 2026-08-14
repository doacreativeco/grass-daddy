const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const INDEX_URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const LEADS_URL = "file:///" + path.resolve(__dirname, "..", "leads.html").replace(/\\/g, "/");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();
  page.on("console", (m) => console.log("PAGE LOG:", m.text()));
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

  await page.goto(INDEX_URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.removeItem("grassDaddyLeads"));
  await page.type('#quoteForm input[name="name"]', "Jamie Test Client");
  await page.type('#quoteForm input[name="phone"]', "(860) 555-0134");
  await page.type('#quoteForm input[name="email"]', "jamie.test@example.com");
  await page.type('#quoteForm input[name="town"]', "Farmington, CT");
  await page.select('#quoteForm select[name="service"]', "Hardscaping & Stonework");
  await page.type('#quoteForm textarea[name="message"]', "Testing.");
  await page.click('#quoteForm button[type="submit"]');
  await wait(150);
  const stored = await page.evaluate(() => window.localStorage.getItem("grassDaddyLeads"));
  console.log("stored after submit:", stored);

  await page.goto(LEADS_URL, { waitUntil: "networkidle0" });
  await page.waitForSelector("#leadsTableBody");
  await wait(150);
  console.log("url after goto:", page.url());
  const storedOnLeads = await page.evaluate(() => window.localStorage.getItem("grassDaddyLeads"));
  console.log("stored on leads.html:", storedOnLeads);
  const rowCount = await page.$$eval("#leadsTableBody tr", (rows) => rows.length);
  console.log("row count", rowCount);
  const bodyHtml = await page.$eval("#leadsTableBody", (el) => el.innerHTML.slice(0, 800));
  console.log("body html", bodyHtml);

  await browser.close();
})();
