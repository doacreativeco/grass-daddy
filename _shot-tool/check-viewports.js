const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = path.resolve(__dirname, "..", "assets");
const BASE = "http://127.0.0.1:5173/";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "phone-se", width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: "tablet", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false }
];

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
    await wait(400);

    const metrics = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      callDisplay: getComputedStyle(document.querySelector(".mobile-call")).display,
      burgerDisplay: getComputedStyle(document.getElementById("burgerBtn")).display,
      formFont: getComputedStyle(document.querySelector('#quoteForm input[name="phone"]')).fontSize
    }));

    assert(metrics.scroll <= metrics.inner + 1, vp.name + " has no horizontal overflow (scroll " + metrics.scroll + " vs inner " + metrics.inner + ")");
    if (vp.width <= 980) {
      assert(metrics.callDisplay === "grid", vp.name + " shows sticky Call/Text bar");
      assert(metrics.burgerDisplay === "flex", vp.name + " shows hamburger menu");
    } else {
      assert(metrics.callDisplay === "none", vp.name + " hides sticky Call/Text bar");
    }
    const fontPx = parseFloat(metrics.formFont);
    assert(fontPx >= 16, vp.name + " quote inputs are >= 16px (got " + metrics.formFont + ")");

    await page.screenshot({ path: path.join(OUT_DIR, "check-viewport-" + vp.name + ".png"), fullPage: false });
    console.log("captured: check-viewport-" + vp.name + ".png");
    await page.close();
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(BASE + "login.html", { waitUntil: "load" });
  const loginOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(loginOverflow, "login page has no horizontal overflow on phone");
  await page.screenshot({ path: path.join(OUT_DIR, "check-viewport-login-phone.png") });

  await page.goto(BASE, { waitUntil: "load" });
  await page.click("#burgerBtn");
  await wait(200);
  const menuOpen = await page.evaluate(() => document.getElementById("mobileMenu").classList.contains("is-open"));
  assert(menuOpen, "phone hamburger opens the mobile menu");
  await page.screenshot({ path: path.join(OUT_DIR, "check-viewport-phone-menu.png") });

  await page.goto(BASE + "login.html", { waitUntil: "load" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(700);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const crm = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    menu: getComputedStyle(document.getElementById("gdMenuBtn")).display
  }));
  assert(crm.overflow, "CRM dashboard has no horizontal overflow on phone");
  assert(crm.menu === "flex", "CRM shows the mobile menu button on phone");
  await page.screenshot({ path: path.join(OUT_DIR, "check-viewport-crm-phone.png") });

  await browser.close();
  console.log("\nALL VIEWPORT CHECKS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
