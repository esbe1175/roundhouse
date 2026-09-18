const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const archive = path.resolve("dist/win-unpacked/resources/app.asar");
const files = asar.listPackage(archive);
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
  "app.asar.unpacked/resources/icons/win/KickTalk_v1.ico",
])
  assert.ok(fs.existsSync(path.resolve("dist/win-unpacked/resources", file)), `Missing packaged resource: ${file}`);
console.log(
  "PASS: required player resources included; no environment files, private environment values, Git history, test fixtures, or cache in the archive.",
);
