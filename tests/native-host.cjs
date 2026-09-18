// Run with Electron; exercises actual MPV, a real child HWND, and synthetic video.
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const assert = require("node:assert/strict");
const fs = require("node:fs");
app.commandLine.appendSwitch("force-device-scale-factor", process.env.ROUNDHOUSE_TEST_SCALE || "1");
let child, ipc, host, window;
app.whenReady().then(async () => {
  try {
    const { MpvIPC } = await import(pathToFileURL(path.resolve("src/main/services/mpv-ipc.mjs")).href);
    window = new BrowserWindow({ width: 1100, height: 700, show: false, webPreferences: { sandbox: true } });
    await window.loadURL(
      'data:text/html,<body style="background:%230b1610;color:white">Native player integration test</body>',
    );
    host = require("../native/build/Release/roundhouse_host.node");
    const hwnd = host.create(window.getNativeWindowHandle());
    assert.ok(hwnd > 0);
    host.bounds(20, 30, 640, 360, true);
    const fullGeometry = host.geometry();
    host.bounds(20, 30, 640, 360, true, 40, 48);
    const overlayGeometry = host.geometry();
    assert.equal(overlayGeometry.width, fullGeometry.width);
    assert.equal(overlayGeometry.height, fullGeometry.height);
    const scale = fullGeometry.width / 640;
    assert.equal(overlayGeometry.top, Math.floor(40 * scale));
    assert.equal(overlayGeometry.bottom, fullGeometry.height - Math.floor(48 * scale));
    host.bounds(20, 30, 640, 360, true, 0, 0);
    assert.equal(host.geometry().top, 0);
    assert.equal(host.geometry().bottom, fullGeometry.height);
    const pipe = `\\\\.\\pipe\\roundhouse-test-${process.pid}`;
    child = spawn(
      path.resolve("resources/mpv/mpv.exe"),
      [
        `--wid=${hwnd}`,
        `--input-ipc-server=${pipe}`,
        "--idle=yes",
        "--force-window=yes",
        "--no-config",
        "--no-terminal",
        "--osc=no",
        "--input-cursor-passthrough=yes",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    ipc = new MpvIPC();
    await ipc.connect(pipe);
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MPV never loaded the synthetic source")), 10000);
      ipc.onEvent = (e) => {
        if (e.event === "file-loaded") {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    await ipc.command(["loadfile", "av://lavfi:testsrc=size=640x360:rate=30", "replace"]);
    await loaded;
    assert.equal(await ipc.command(["get_property", "width"]), 640);
    await ipc.command(["set_property", "pause", true]);
    assert.equal(await ipc.command(["get_property", "pause"]), true);
    await ipc.command(["set_property", "volume", 37]);
    assert.equal(await ipc.command(["get_property", "volume"]), 37);
    await ipc.command(["set_property", "mute", true]);
    assert.equal(await ipc.command(["get_property", "mute"]), true);
    for (const rect of [
      [20, 30, 800, 450],
      [0, 0, 420, 240],
      [0, 0, 1100, 650],
    ]) {
      host.bounds(...rect, true);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    host.bounds(0, 0, 1100, 650, false);
    host.bounds(20, 30, 640, 360, true);
    const screenshot = path.resolve(`.cache/mpv-test-${process.env.ROUNDHOUSE_TEST_SCALE || "1"}.png`);
    await ipc.command(["screenshot-to-file", screenshot, "video"]);
    assert.ok(fs.statSync(screenshot).size > 1000);
    console.log(
      `PASS: native HWND embedding, overlay regions without video resize, resize, visibility, MPV video frame, pause, volume, mute; display scale ${process.env.ROUNDHOUSE_TEST_SCALE || "1"}`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (ipc) {
      await ipc.command(["quit"]).catch(() => {});
      ipc.close();
    }
    child?.kill();
    host?.destroy();
    window?.destroy();
    app.exit(process.exitCode || 0);
  }
});
