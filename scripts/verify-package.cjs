const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const archive = path.resolve("dist/win-unpacked/resources/app.asar");
const files = asar.listPackage(archive);
// License/third-party notices are extraResources, so builder excludes their
// duplicate app.asar entries. Verify those readable copies below.
for (const name of ["README.md"])
  assert.ok(
    files.some((file) => file === `/${name}` || file === `\\${name}`),
    `Missing packaged documentation: ${name}`,
  );
assert.ok(!files.some((file) => /(^|[/\\])\.env($|\.)/.test(file)), "Environment file included in archive");
assert.ok(
  !files.some((file) => /(^|[/\\])(?:tests|\.cache|\.git)([/\\]|$)/.test(file)),
  "Development data included in archive",
);
const secrets = fs.existsSync(".env")
  ? Object.values(require("dotenv").parse(fs.readFileSync(".env"))).filter((value) => value.length > 8)
  : [];
const bytes = fs.readFileSync(archive);
for (const value of secrets)
  assert.ok(!bytes.includes(Buffer.from(value)), "Private environment value found in archive");
for (const file of [
  "mpv/mpv.exe",
  "native/roundhouse_host.node",
  "player/ambient.lua",
  "app.asar.unpacked/resources/icons/win/Roundhouse.ico",
  "licenses/Roundhouse-GPL-3.0.txt",
  "licenses/THIRD_PARTY_NOTICES.md",
  "licenses/upstream/Inter-OFL-1.1.txt",
  "licenses/upstream/mpv-Copyright.txt",
  "licenses/generated/NPM_NOTICES.md",
  "licenses/generated/Electron-LICENSE.txt",
])
  assert.ok(fs.existsSync(path.resolve("dist/win-unpacked/resources", file)), `Missing packaged resource: ${file}`);
assert.ok(fs.existsSync(path.resolve("dist/win-unpacked/LICENSES.chromium.html")), "Missing Chromium license notices");
assert.ok(fs.existsSync(path.resolve("dist/win-unpacked/LICENSE.electron.txt")), "Missing Electron license");
console.log(
  "PASS: required player resources included; no environment files, private environment values, Git history, test fixtures, or cache in the archive.",
);
