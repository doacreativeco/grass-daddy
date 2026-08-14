const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const INDEX_URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");
const outName = process.argv[2] || "check-hero.png";
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  await page.goto(INDEX_URL, { waitUntil: "networkidle0" });
  await wait(600);
  await page.screenshot({ path: path.join(OUT_DIR, outName) });
  await browser.close();
  console.log("done", outName);
})();
