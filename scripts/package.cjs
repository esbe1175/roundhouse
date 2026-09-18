const { spawnSync } = require("node:child_process");
function run(file, args) {
  const result = spawnSync(file, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/setup-mpv.ps1"]);
run(process.execPath, ["scripts/build-native.cjs"]);
run(process.execPath, [
  require("node:path").join(require.resolve("electron-vite/package.json"), "../bin/electron-vite.js"),
  "build",
]);
run(process.execPath, [
  require.resolve("electron-builder/cli.js"),
  process.argv[2] === "dir" ? "--dir" : "--win",
  "--publish",
  "never",
]);
