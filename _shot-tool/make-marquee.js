const { Jimp, JimpMime } = require("jimp");
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "assets", "real");
const OUT = path.resolve(__dirname, "..", "assets", "bg");

(async () => {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".jpg"));
  let i = 1;
  for (const f of files) {
    const img = await Jimp.read(path.join(SRC, f));
    img.resize({ h: 760 });
    const outName = `real-marquee-${String(i).padStart(2, "0")}.jpg`;
    await img.write(path.join(OUT, outName), { quality: 68, mime: JimpMime.jpeg });
    const size = fs.statSync(path.join(OUT, outName)).size;
    console.log(outName, Math.round(size / 1024) + "KB");
    i++;
  }
})();
