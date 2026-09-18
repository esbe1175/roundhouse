const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const output = path.join(root, ".cache/notices");
const sections = [
  "# Installed npm dependency notices\n\nGenerated from package-lock.json and installed packages. Includes runtime/transitive dependencies and some Electron installation dependencies. Electron/Chromium notices accompany the executable separately.\n",
];
const missing = [];
const seen = new Set();
for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!location || entry.dev) continue;
  const folder = path.join(root, location);
  if (!fs.existsSync(path.join(folder, "package.json"))) {
    if (entry.optional) continue;
    throw new Error(`Missing installed dependency ${location}. Run npm ci first.`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"));
  if (pkg.version !== entry.version)
    throw new Error(`Installed ${pkg.name} differs from package-lock.json. Run npm ci.`);
  // Electron's native archive installer is not shipped in electron-builder output.
  if (pkg.name === "@electron-internal/extract-zip") continue;
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const source = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  const license = typeof pkg.license === "object" ? pkg.license.type : pkg.license || entry.license;
  const texts = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((file) => file.isFile() && /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => `### ${file.name}\n\n${fs.readFileSync(path.join(folder, file.name), "utf8").trim()}`);
  if (!texts.length) {
    const fallback =
      pkg.name.startsWith("@radix-ui/") && license === "MIT"
        ? "Radix-MIT.txt"
        : {
            "react-remove-scroll-bar@2.3.8": "react-remove-scroll-bar-MIT.txt",
            "agent-base@6.0.2": "agent-base-6-MIT.txt",
            "https-proxy-agent@5.0.1": "https-proxy-agent-5-MIT.txt",
          }[id];
    if (fallback)
      texts.push(
        `### Upstream license (${fallback})\n\n${fs.readFileSync(path.join(root, "resources/licenses", fallback), "utf8").trim()}`,
      );
    else missing.push(id);
  }
  sections.push(
    `## ${id}\n\nDeclared license: ${license || "See license text"}\n\nSource: ${source || pkg.homepage || entry.resolved}\n\n${texts.join("\n\n")}\n`,
  );
}
if (missing.length)
  throw new Error(`License text missing for: ${missing.join(", ")}. Add a verified upstream license before packaging.`);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "NPM_NOTICES.md"), sections.join("\n---\n\n"));
const electron = path.dirname(require.resolve("electron/package.json"));
fs.copyFileSync(path.join(electron, "LICENSE"), path.join(output, "Electron-LICENSE.txt"));
console.log(`Generated notices for ${seen.size} locked npm packages.`);
