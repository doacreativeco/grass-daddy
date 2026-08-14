const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PAGE_URL = "file:///" + path
  .resolve(__dirname, "..", "logo-animations.html")
  .replace(/\\/g, "/");
const OUT_DIR = path.resolve(__dirname, "..", "assets");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function restartCard(page, selector) {
  await page.evaluate((sel) => {
    const cardEl = document.querySelector(sel);
    const stage = cardEl.querySelector(".card__stage");
    const els = [stage, ...stage.querySelectorAll("*")];
    els.forEach((node) => {
      const anim = getComputedStyle(node).animationName;
      if (anim && anim !== "none") {
        const prev = node.style.animation;
        node.style.animation = "none";
        node.offsetHeight;
        node.style.animation = prev || "";
      }
    });
  }, selector);
}

// Each entry: [selector, [ [captureDelayMs, fileNameSuffix], ... ], { hover, noRestart } ]
const PLAN = [
  { sel: '[data-card="mower"]', shots: [[650, "mid"], [1350, "end"]] },
  { sel: '[data-card="grow"]', shots: [[850, "mid"], [1100, "end"]] },
  { sel: '[data-card="stamp"]', shots: [[480, "mid"], [1300, "end"]] },
  {
    sel: '[data-card="sweep"]',
    shots: [[0, "idle"], [420, "mid"]],
    hoverBeforeShotIndex: 1,
  },
  { sel: '[data-card="glow"]', shots: [[0, "a"], [1600, "b"]], noRestart: true },
  { sel: '[data-card="trim"]', shots: [[550, "mid"], [1300, "end"]] },
  { sel: '[data-card="loader"]', shots: [[0, "a"], [1050, "b"]], noRestart: true },
  { sel: '[data-card="dock"]', shots: [[650, "start"], [1900, "hold"], [3300, "docked"]] },
];

const NAME_MAP = {
  mower: "01-mower-reveal",
  grow: "02-grow-in",
  stamp: "03-stamp-spin",
  sweep: "04-stripe-sweep",
  glow: "05-pulse-glow",
  trim: "06-trim-line",
  loader: "07-loader-loop",
  dock: "08-dock-to-nav",
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1300, height: 1400 },
  });

  const page = await browser.newPage();
  await page.goto(PAGE_URL, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  await wait(800);

  for (const item of PLAN) {
    const key = item.sel.match(/"([a-z]+)"/)[1];
    const el = await page.$(item.sel);
    if (!el) {
      console.log("MISSING:", item.sel);
      continue;
    }
    await el.scrollIntoView();
    await wait(200);

    if (!item.noRestart) {
      await restartCard(page, item.sel);
    }

    let elapsed = 0;
    let clockResetAt = 0; // shots array delays are measured from this reference point
    for (let i = 0; i < item.shots.length; i++) {
      const [delay, suffix] = item.shots[i];

      if (item.hoverBeforeShotIndex === i) {
        const plate = await el.$(".plate--hover");
        if (plate) await plate.hover();
        clockResetAt = elapsed; // restart the delay clock: this shot's delay is relative to hover, not card-arrival
      }

      const target = clockResetAt + delay;
      const gap = target - elapsed;
      if (gap > 0) await wait(gap);
      elapsed = target;

      const filename = `live-${NAME_MAP[key]}-${suffix}.png`;
      await el.screenshot({ path: path.join(OUT_DIR, filename) });
      console.log("captured:", filename);
    }
  }

  await browser.close();
})();
