const { Jimp, JimpMime } = require("jimp");
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "assets", "bg");

(async () => {
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".jpg")) continue;
    const full = path.join(DIR, f);
    const before = fs.statSync(full).size;
    const img = await Jimp.read(full);
    img.resize({ h: 960 });
    await img.write(full, { quality: 72, mime: JimpMime.jpeg });
    const after = fs.statSync(full).size;
    console.log(f, Math.round(before / 1024) + "KB ->", Math.round(after / 1024) + "KB");
  }
})();
