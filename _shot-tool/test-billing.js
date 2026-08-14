const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function url(p) { return "file:///" + path.resolve(__dirname, "..", p).replace(/\\/g, "/"); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1440, height: 1100 } });
  const page = await browser.newPage();
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  page.on("pageerror", (err) => console.error("PAGEERROR:", err.message));

  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "grassDaddyLeads", "grassDaddyBookings",
      "grassDaddyPriceList", "grassDaddyClientRates", "grassDaddyBills"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);

  await page.goto(url("prices.html"), { waitUntil: "networkidle0" });
  await wait(250);

  const priceNav = await page.$eval('a[href="prices.html"]', (el) => el.classList.contains("is-active"));
  assert(priceNav, "Price list sidebar tab is active on prices.html");

  const priceCount = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyPriceList") || "[]").length);
  assert(priceCount >= 10, "starter price list loads automatically, got " + priceCount);

  const sectionTabs = await page.$$eval("#sectionTabs [data-section]", (els) => els.map((e) => e.getAttribute("data-section")));
  assert(sectionTabs.indexOf("Lawn Maintenance") !== -1, "section tabs include Lawn Maintenance");

  const allRows = await page.$$eval(".bill-table tbody tr", (els) => els.length);
  await page.click('#sectionTabs [data-section="Lawn Maintenance"]');
  await wait(150);
  const lawnRows = await page.$$eval(".bill-table tbody tr", (els) => els.length);
  assert(lawnRows > 0 && lawnRows < allRows, "Lawn Maintenance tab shows a subset of work items (" + lawnRows + " of " + allRows + ")");

  await page.evaluate(() => {
    window.localStorage.setItem("grassDaddyLeads", JSON.stringify([
      { id: "lead-bill-1", name: "Tab Client", phone: "8605552222", town: "Avon, CT", status: "Won", createdAt: new Date().toISOString() }
    ]));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await wait(250);

  await page.select("#ratesClientSelect", "lead:lead-bill-1");
  await wait(150);
  const hint = await page.$eval("#ratesHint", (el) => el.textContent);
  assert(/Tab Client/.test(hint), "rates hint names the selected client");

  await page.click('#sectionTabs [data-section="All"]');
  await wait(100);
  const firstItemId = await page.$eval(".bill-table tbody tr", (el) => el.getAttribute("data-item-id"));
  await page.evaluate(() => {
    const input = document.querySelector(".bill-price-input");
    input.value = "77";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(150);
  const rates = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyClientRates") || "{}"));
  assert(rates["lead:lead-bill-1"] && Number(rates["lead:lead-bill-1"][firstItemId]) === 77, "per-client rate override is saved");

  const customProtected = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll(".bill-table tbody tr")).find((tr) => tr.classList.contains("is-custom"));
    return row && /Custom/.test(row.textContent) && /Set on each job/.test(row.textContent) && !row.querySelector("[data-delete-item]");
  });
  assert(customProtected, "Custom row stays on the list, is priced per job, and cannot be removed");

  await page.click("#addWorkBtn");
  await wait(150);
  const addOpen = await page.$eval("#addWorkModal", (el) => el.classList.contains("is-open"));
  assert(addOpen, "Add a piece of work opens a popup");

  await page.type('#addPriceForm input[name="name"]', "QA Extra Edge");
  await page.evaluate(() => {
    document.querySelector('#addPriceForm input[name="unit"]').value = "job";
    document.querySelector('#addPriceForm input[name="defaultPrice"]').value = "40";
  });
  await page.click('#addPriceForm button[type="submit"]');
  await wait(250);
  const addClosed = await page.$eval("#addWorkModal", (el) => !el.classList.contains("is-open"));
  assert(addClosed, "popup closes after adding work");
  const extraExists = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".bill-table tbody tr")).some((tr) => tr.textContent.indexOf("QA Extra Edge") !== -1);
  });
  assert(extraExists, "new work item appears on the price list");

  await page.goto(url("billing.html"), { waitUntil: "networkidle0" });
  await wait(250);

  const invoiceNav = await page.$eval('a[href="billing.html"]', (el) => el.classList.contains("is-active"));
  assert(invoiceNav, "Invoices sidebar tab is active on billing.html");
  const noPriceTabs = await page.$("#tabRatesBtn");
  assert(!noPriceTabs, "Invoices page no longer has a Price list tab");
  const noAddWork = await page.$("#addPriceForm");
  assert(!noAddWork, "Add a piece of work lives on Price list, not Invoices");

  await page.click("#newBillBtn");
  await wait(200);
  const modalOpen = await page.$eval("#billModal", (el) => el.classList.contains("is-open"));
  assert(modalOpen, "New bill opens the bill modal");

  await page.select("#billClientSelect", "lead:lead-bill-1");
  await page.evaluate(() => {
    var d = new Date();
    document.getElementById("billDateInput").value =
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  await page.click("#addLineBtn");
  await wait(150);
  const lineCount = await page.$$eval(".bill-line", (els) => els.length);
  assert(lineCount === 1, "adding work creates a line item");

  await page.click("#addLineBtn");
  await wait(150);
  await page.select('.bill-line[data-line-index="1"] [data-line-field="itemId"]', "work-custom");
  await wait(120);
  await page.type('.bill-line[data-line-index="1"] [data-line-field="name"]', "Haul away debris");
  await page.evaluate(() => {
    const price = document.querySelector('.bill-line[data-line-index="1"] [data-line-field="unitPrice"]');
    price.value = "150";
    price.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(120);

  await page.click('#billForm button[type="submit"]');
  await wait(300);

  const bills = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBills") || "[]"));
  assert(bills.length === 1, "bill is saved");
  assert(bills[0].clientName === "Tab Client", "bill is stored under the selected client");
  assert(bills[0].status === "unpaid", "new bill starts unpaid");
  assert(bills[0].items.length >= 2, "bill has line items");
  const customLine = bills[0].items.find((item) => item.custom || item.itemId === "work-custom");
  assert(customLine && customLine.name === "Haul away debris", "custom line stores the typed work name");
  assert(customLine && Number(customLine.unitPrice) === 150, "custom line stores the typed dollar amount");

  const cardText = await page.$eval(".bill-card", (el) => el.textContent);
  assert(/Tab Client/.test(cardText), "past billing list shows the client bill");
  assert(/Unpaid/.test(cardText), "bill card shows Unpaid");

  await page.click("[data-mark-paid]");
  await wait(200);
  const paid = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBills"))[0].status);
  assert(paid === "paid", "Mark paid updates the stored bill");

  await page.select("#billsClientSelect", "lead:lead-bill-1");
  await wait(100);
  const filtered = await page.$$eval(".bill-card", (els) => els.length);
  assert(filtered === 1, "client filter still shows that client's past bill");

  await browser.close();
  console.log("\nALL BILLING TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
