const fs = require("fs");

const file = "apps/web/src/components/pwa-register.tsx";

let s = fs.readFileSync(file, "utf8");

const oldText = "    let registrationRef = null;";
const newText =
  "    let registrationRef: ServiceWorkerRegistration | null = null;";

if (!s.includes(oldText)) {
  throw new Error("registrationRef line not found - no changes made");
}

s = s.replace(oldText, newText);

fs.writeFileSync(file, s, "utf8");

console.log("Service worker TypeScript typing fixed");