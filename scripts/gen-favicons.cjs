/**
 * Raster favicons from favicon.svg → favicon.ico (16+32), favicon-32.png, apple-touch-icon.png
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "favicon.svg");

async function main() {
  const svg = fs.readFileSync(svgPath);
  const png16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const png180 = await sharp(svg).resize(180, 180).png().toBuffer();

  fs.writeFileSync(path.join(root, "favicon-32.png"), png32);
  fs.writeFileSync(path.join(root, "apple-touch-icon.png"), png180);

  const icoBuf = await toIco([png16, png32]);
  fs.writeFileSync(path.join(root, "favicon.ico"), icoBuf);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
