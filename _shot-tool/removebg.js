const { Jimp, intToRGBA } = require("jimp");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "assets", "logo.png");
const OUT = path.resolve(__dirname, "..", "assets", "logo-transparent.png");

// Threshold tuning: distance from the sampled background color.
// Below INNER -> fully transparent. Above OUTER -> fully opaque. Between -> soft edge.
const INNER = 18;
const OUTER = 55;

(async () => {
  const img = await Jimp.read(SRC);
  const { width, height } = img.bitmap;

  // Sample background color from the four corners and average them.
  const corners = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ];
  let br = 0, bg = 0, bb = 0;
  corners.forEach(([x, y]) => {
    const { r, g, b } = intToRGBA(img.getPixelColor(x, y));
    br += r; bg += g; bb += b;
  });
  br /= corners.length; bg /= corners.length; bb /= corners.length;
  console.log("Detected background color:", Math.round(br), Math.round(bg), Math.round(bb));

  img.scan(0, 0, width, height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    const dist = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);

    let alpha;
    if (dist <= INNER) alpha = 0;
    else if (dist >= OUTER) alpha = 255;
    else alpha = Math.round(((dist - INNER) / (OUTER - INNER)) * 255);

    this.bitmap.data[idx + 3] = alpha;
  });

  await img.write(OUT);
  console.log("Wrote:", OUT);
})();
