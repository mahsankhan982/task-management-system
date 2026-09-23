const fs = require("fs");
const path = require("path");

const webRoot = "apps/web";
const scriptsDir = path.join(webRoot, "scripts");
const versionScript = path.join(scriptsDir, "bump-sw-version.js");
const packageFile = path.join(webRoot, "package.json");

fs.mkdirSync(scriptsDir, { recursive: true });

fs.writeFileSync(
  versionScript,
`const fs = require("fs");
const path = require("path");

const swFile = path.join(__dirname, "..", "public", "sw.js");
let sw = fs.readFileSync(swFile, "utf8");

const version =
  "build-" +
  new Date()
    .toISOString()
    .replace(/[^0-9]/g, "");

const versionLine =
  \`const APP_VERSION = "\${version}";\`;

if (/const APP_VERSION = "[^"]*";/.test(sw)) {
  sw = sw.replace(
    /const APP_VERSION = "[^"]*";/,
    versionLine,
  );
} else {
  sw = versionLine + "\\n\\n" + sw;
}

fs.writeFileSync(swFile, sw, "utf8");

console.log("Service worker version:", version);
`,
  "utf8"
);

const pkg = JSON.parse(
  fs.readFileSync(packageFile, "utf8")
);

pkg.scripts = pkg.scripts || {};
pkg.scripts.prebuild =
  "node scripts/bump-sw-version.js";

fs.writeFileSync(
  packageFile,
  JSON.stringify(pkg, null, 2) + "\n",
  "utf8"
);

console.log("Automatic software versioning configured");