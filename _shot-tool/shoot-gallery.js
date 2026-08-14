const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PAGE_URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 1400 },
  });
  const page = await browser.newPage();
  await page.goto(PAGE_URL, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  await wait(300);

  await page.screenshot({ path: path.join(OUT_DIR, "home-hero-check.png") });

  await page.evaluate(() => {
    document.getElementById("proof").scrollIntoView({ block: "start" });
  });
  await wait(2200);
  await page.screenshot({ path: path.join(OUT_DIR, "home-proof-check.png") });

  await page.setViewport({ width: 420, height: 1600 });
  await page.evaluate(() => {
    document.getElementById("proof").scrollIntoView({ block: "start" });
  });
  await wait(2200);
  await page.screenshot({ path: path.join(OUT_DIR, "home-proof-mobile-check.png") });

  await browser.close();
  console.log("done");
})();
