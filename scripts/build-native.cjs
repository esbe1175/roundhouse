const { spawnSync } = require("node:child_process");
const path = require("node:path");
if (process.platform !== "win32") throw new Error("Roundhouse currently supports Windows only.");
const version = require("electron/package.json").version;
const result = spawnSync(
  process.execPath,
  [
    require.resolve("node-gyp/bin/node-gyp.js"),
    "rebuild",
    "--directory",
    path.resolve("native"),
    `--target=${version}`,
    "--arch=x64",
    "--dist-url=https://electronjs.org/headers",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
