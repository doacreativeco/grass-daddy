const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const INDEX_URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.goto(INDEX_URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.scrollTo(0, 1600));
  await wait(400);
  await page.screenshot({ path: path.join(OUT_DIR, "check-back-to-top.png") });
  await browser.close();
  console.log("done");
})();
