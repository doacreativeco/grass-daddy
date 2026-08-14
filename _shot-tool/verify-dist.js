const puppeteer = require("puppeteer-core");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = "http://localhost:8123";

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkPage(browser, urlPath, label) {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.url()} -- ${req.failure()?.errorText}`);
  });

  const url = BASE_URL + urlPath;
  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 20000 });
  await page.evaluate(() => {
    return Promise.all(
      Array.from(document.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : new Promise((res) => {
          img.addEventListener("load", res, { once: true });
          img.addEventListener("error", res, { once: true });
        })
      )
    );
  });
  await wait(300);

  const status = response ? response.status() : null;
  const title = await page.title();

  const imgInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    return {
      total: imgs.length,
      broken: imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src),
    };
  });

  console.log(`\n=== ${label} (${url}) ===`);
  console.log("HTTP status:", status);
  console.log("Title:", title);
  console.log("Images total:", imgInfo.total, "| broken:", imgInfo.broken.length);
  if (imgInfo.broken.length) console.log("Broken image URLs:", imgInfo.broken);
  console.log("Console errors:", consoleErrors.length ? consoleErrors : "none");
  console.log("Page errors:", pageErrors.length ? pageErrors : "none");
  console.log("Failed requests:", failedRequests.length ? failedRequests : "none");

  await page.close();
  return { status, consoleErrors, pageErrors, failedRequests, imgInfo };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1400, height: 1000 },
  });

  const results = {};
  results.home = await checkPage(browser, "/index.html", "Homepage");
  results.team = await checkPage(browser, "/team.html", "Team page");
  results.login = await checkPage(browser, "/login.html", "Login page");
  results.leads = await checkPage(browser, "/leads.html", "Leads dashboard (direct, unauthenticated)");

  // Navigation check: click the Team link from the homepage nav.
  const page = await browser.newPage();
  const navErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") navErrors.push(msg.text()); });
  await page.goto(BASE_URL + "/index.html", { waitUntil: "networkidle0" });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }),
    page.click('a.nav__team-link'),
  ]);
  const navUrl = page.url();
  console.log("\n=== Navigation check ===");
  console.log("After clicking Team link, URL is:", navUrl);
  console.log("Console errors during nav:", navErrors.length ? navErrors : "none");
  await page.close();

  await browser.close();

  const allConsoleErrors = [
    ...results.home.consoleErrors,
    ...results.team.consoleErrors,
    ...results.login.consoleErrors,
    ...results.leads.consoleErrors,
  ];
  const allPageErrors = [
    ...results.home.pageErrors,
    ...results.team.pageErrors,
    ...results.login.pageErrors,
    ...results.leads.pageErrors,
  ];
  const allBrokenImgs = [
    ...results.home.imgInfo.broken,
    ...results.team.imgInfo.broken,
  ];

  console.log("\n=== SUMMARY ===");
  console.log("Total console errors across pages:", allConsoleErrors.length);
  console.log("Total page (JS) errors across pages:", allPageErrors.length);
  console.log("Total broken images across pages:", allBrokenImgs.length);
  console.log(navUrl.includes("team.html") ? "Navigation: OK" : "Navigation: FAILED");
})().catch((err) => {
  console.error("VERIFY SCRIPT FAILED:", err);
  process.exit(1);
});
