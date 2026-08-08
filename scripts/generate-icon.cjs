const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svgPath = path.join(__dirname, "..", "public", "icon.svg");
const pngPath = path.join(__dirname, "..", "public", "icon.png");

async function generateIcon() {
  const svgBuffer = fs.readFileSync(svgPath);
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(pngPath);
  console.log("Icon generated:", pngPath);
}

generateIcon().catch(console.error);
