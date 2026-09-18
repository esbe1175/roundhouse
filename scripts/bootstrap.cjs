// Intentionally uses only Node built-ins: this must run before npm ci.
const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function run(file, args) {
  const result = spawnSync(file, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(file)} failed (exit ${result.status}). See the output above.`);
}

try {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) if (!["--installer", "--run"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Use Windows x64 with the x64 build of Node.js 24 LTS.");
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Install Node.js 24 LTS (x64), then run npm run setup again.");
  const vswhere = path.join(
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  const vs =
    fs.existsSync(vswhere) &&
    spawnSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ],
      { encoding: "utf8" },
    );
  if (!vs || vs.status !== 0 || !vs.stdout.trim())
    throw new Error(
      'Install Visual Studio 2022 Build Tools with "Desktop development with C++" and a Windows SDK. See README.md → Prerequisites.',
    );
  const python = [
    [process.env.npm_config_python || process.env.PYTHON || "python", []],
    ["py", ["-3"]],
  ].some(
    ([file, args]) =>
      spawnSync(file, [...args, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], {
        stdio: "ignore",
      }).status === 0,
  );
  if (!python) throw new Error("Install Python 3.10 or newer (3.13 tested), then reopen PowerShell. See README.md.");
  const npm = process.env.npm_execpath;
  if (!npm || !fs.existsSync(npm)) throw new Error("Run this script through npm run setup.");

  console.log("Installing the locked dependencies…");
  run(process.execPath, [npm, "ci", "--include=dev", "--no-audit", "--no-fund"]);
  // Electron 44 has an explicit binary installer. Do not rely on lifecycle defaults.
  run(process.execPath, [path.join(root, "node_modules/electron/install.js")]);
  run(process.execPath, [path.join(root, "scripts/package.cjs"), flags.has("--installer") ? "nsis" : "dir"]);
  run(process.execPath, [path.join(root, "scripts/verify-package.cjs")]);
  const executable = path.join(root, "dist/win-unpacked/Roundhouse.exe");
  console.log(`\nReady: ${executable}\nDevelopment: npm run dev\nInstaller: npm run build:win`);
  if (flags.has("--run")) {
    const child = spawn(executable, [], { cwd: root, detached: true, stdio: "ignore" });
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.unref();
  }
} catch (error) {
  console.error(
    `\nSetup stopped: ${error.message}\nAfter fixing the issue, rerun npm run setup. No account credentials are needed for the build.`,
  );
  process.exitCode = 1;
}
