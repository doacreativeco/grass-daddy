const { Jimp } = require("jimp");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "assets", "logo-transparent.png");
const OUT_DIR = path.resolve(__dirname, "..", "assets");

async function makeSquareIcon(size, filename, bgHex) {
  const logo = await Jimp.read(SRC);
  const canvas = new Jimp({ width: size, height: size, color: bgHex });
  const pad = Math.round(size * 0.14);
  const target = size - pad * 2;
  logo.resize({ w: target, h: target });
  canvas.composite(logo, Math.round((size - logo.bitmap.width) / 2), Math.round((size - logo.bitmap.height) / 2));
  await canvas.write(path.join(OUT_DIR, filename));
  console.log("wrote", filename);
}

(async () => {
  // apple-touch-icon needs an opaque background (iOS doesn't respect transparency well)
  await makeSquareIcon(180, "apple-touch-icon.png", 0x0a0b09ff);
  await makeSquareIcon(192, "icon-192.png", 0x0a0b09ff);
  await makeSquareIcon(512, "icon-512.png", 0x0a0b09ff);
  await makeSquareIcon(32, "favicon-32.png", 0x0a0b09ff);
  await makeSquareIcon(16, "favicon-16.png", 0x0a0b09ff);
  console.log("done");
})();
