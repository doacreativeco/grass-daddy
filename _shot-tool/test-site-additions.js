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

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();

  // ---------- 404 page renders ----------
  await page.goto(url("404.html"), { waitUntil: "networkidle0" });
  const title = await page.title();
  assert(title.indexOf("Page Not Found") !== -1, "404 page has correct title");
  const h1Text = await page.$eval(".not-found__title", (el) => el.textContent.trim());
  assert(h1Text.length > 0, "404 page shows a heading: " + h1Text);
  await page.screenshot({ path: path.join(OUT_DIR, "check-404.png") });
  console.log("captured: check-404.png");

  // ---------- index.html: skip link + back to top ----------
  await page.goto(url("index.html"), { waitUntil: "networkidle0" });

  const skipLinkExists = await page.$(".skip-link");
  assert(!!skipLinkExists, "index.html has a skip link");

  let backToTopVisible = await page.$eval("#backToTop", (el) => el.classList.contains("is-visible"));
  assert(!backToTopVisible, "back-to-top button hidden at top of page");

  await page.evaluate(() => window.scrollTo(0, 1200));
  await wait(200);
  backToTopVisible = await page.$eval("#backToTop", (el) => el.classList.contains("is-visible"));
  assert(backToTopVisible, "back-to-top button appears after scrolling down");

  await page.evaluate(() => document.getElementById("backToTop").click());
  await wait(500);
  const scrollYAfterClick = await page.evaluate(() => window.scrollY);
  assert(scrollYAfterClick < 50, "clicking back-to-top scrolls back near the top (scrollY=" + scrollYAfterClick + ")");

  // ---------- JSON-LD present and valid ----------
  const ldJson = await page.evaluate(() => {
    const el = document.querySelector('script[type="application/ld+json"]');
    return el ? el.textContent : null;
  });
  assert(!!ldJson, "index.html has a JSON-LD script tag");
  const parsedLd = JSON.parse(ldJson);
  assert(parsedLd["@type"] === "LandscapingBusiness", "JSON-LD @type is LandscapingBusiness");
  assert(parsedLd.telephone === "+1-860-877-8362", "JSON-LD has correct phone number");
  assert(parsedLd.aggregateRating.ratingValue === "5", "JSON-LD aggregateRating is 5");

  // ---------- meta tags present ----------
  const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.getAttribute("content"));
  assert(!!ogTitle, "og:title meta tag present: " + ogTitle);
  const themeColor = await page.$eval('meta[name="theme-color"]', (el) => el.getAttribute("content"));
  assert(themeColor === "#0A0B09", "theme-color meta tag present");
  const appleIcon = await page.$('link[rel="apple-touch-icon"]');
  assert(!!appleIcon, "apple-touch-icon link present");

  // ---------- team.html: skip link + back to top + aria-current ----------
  await page.goto(url("team.html"), { waitUntil: "networkidle0" });
  const teamSkipLink = await page.$(".skip-link");
  assert(!!teamSkipLink, "team.html has a skip link");

  await page.evaluate(() => window.scrollTo(0, 1000));
  await wait(200);
  const teamBackToTopVisible = await page.$eval("#backToTop", (el) => el.classList.contains("is-visible"));
  assert(teamBackToTopVisible, "team.html back-to-top appears after scroll");

  await browser.close();
  console.log("\nALL SITE-ADDITIONS TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
