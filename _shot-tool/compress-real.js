const { Jimp, JimpMime } = require("jimp");
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "assets", "real");

(async () => {
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".jpg")) continue;
    const full = path.join(DIR, f);
    const before = fs.statSync(full).size;
    const img = await Jimp.read(full);
    // Cap the longer dimension so marquee + gallery stay lightweight.
    if (img.width > img.height && img.width > 1600) {
      img.resize({ w: 1600 });
    } else if (img.height >= img.width && img.height > 1600) {
      img.resize({ h: 1600 });
    }
    await img.write(full, { quality: 74, mime: JimpMime.jpeg });
    const after = fs.statSync(full).size;
    console.log(f, Math.round(before / 1024) + "KB ->", Math.round(after / 1024) + "KB");
  }
})();
