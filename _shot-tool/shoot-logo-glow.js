const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const INDEX_URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 900, height: 900 } });
  const page = await browser.newPage();
  await page.goto(INDEX_URL, { waitUntil: "networkidle0" });

  // capture right after entrance animation finishes but before glow pulse delay (should show base glow, no pop)
  await wait(1200);
  await page.screenshot({ path: path.join(OUT_DIR, "check-logo-glow-early.png"), clip: { x: 200, y: 100, width: 500, height: 420 } });

  // capture mid-pulse (brightest point of the glow animation)
  await wait(1900); // ~1.4s delay + ~1.6s into the 3.2s cycle -> near 50% keyframe
  await page.screenshot({ path: path.join(OUT_DIR, "check-logo-glow-peak.png"), clip: { x: 200, y: 100, width: 500, height: 420 } });

  await browser.close();
  console.log("done");
})();
