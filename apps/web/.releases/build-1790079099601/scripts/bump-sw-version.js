const fs = require("fs");
const path = require("path");

const swFile = path.join(__dirname, "..", "public", "sw.js");
let sw = fs.readFileSync(swFile, "utf8");

const version =
  "build-" +
  new Date()
    .toISOString()
    .replace(/[^0-9]/g, "");

const versionLine =
  `const APP_VERSION = "${version}";`;

if (/const APP_VERSION = "[^"]*";/.test(sw)) {
  sw = sw.replace(
    /const APP_VERSION = "[^"]*";/,
    versionLine,
  );
} else {
  sw = versionLine + "\n\n" + sw;
}

fs.writeFileSync(swFile, sw, "utf8");

console.log("Service worker version:", version);
